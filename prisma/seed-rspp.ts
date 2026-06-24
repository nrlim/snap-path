/**
 * Seed script for RS Pertamina Pusat (RSPP) Tariff Data
 *
 * Source: sample-data/master-data-docs/buku-tarif-rspp.json
 * Structure:
 *   - tariffs[]: { item_name, item_category, item_rates: [{rate_type, rate_value}] }
 *   - nail_pedicure_and_lash_pricing: { nails[], lashes[], single_lash_led[] }
 *
 * Strategy:
 *   - Process ALL items that have a positive numeric rate_value
 *   - Items with rate_type "persentase" or "minimal/maksimal" are stored as-is
 *     with basePrice = minimal/fixed and maxPrice = maksimal/fixed
 *   - Items with rate_type "fixed" or numeric-only are straightforward
 *   - Deduplicate by (item_name + item_category) normalized lowercase
 *   - Upsert using skipDuplicates after wipe+recreate provider
 *
 * Run: npx ts-node --project tsconfig.json prisma/seed-rspp.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PROVIDER_CODE = "RS_PERTAMINA_PUSAT";
const PROVIDER_NAME = "RS Pertamina Pusat";
const EFFECTIVE_FROM = new Date("2025-01-01");

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface RsppRate {
  rate_type: string;
  rate_value: number;
}

interface RsppTariff {
  item_name: string;
  item_category: string | null;
  item_rates: RsppRate[] | RsppRate | null;
}

interface NailItem {
  name: string;
  price: number;
  category: string;
}

// ----------------------------------------------------------------
// Category → DB category label
// ----------------------------------------------------------------
function inferDbCategory(itemCategory: string | null): string {
  if (!itemCategory) return "TINDAKAN";
  const c = itemCategory.toUpperCase();

  if (c.includes("KONSULTASI") || c.includes("CONSULTATION")) return "RAWAT_JALAN";
  if (c.includes("VISITE")) return "RAWAT_INAP";
  if (c.includes("ADMINISTRASI") || c.includes("ADMIN")) return "ADMINISTRASI";
  if (c.includes("FARMASI") || c.includes("MATERIAL") || c.includes("OBAT")) return "FARMASI";
  if (c.includes("LABORATORIUM") || c.includes("LAB") || c.includes("HEMATOLOGI") ||
      c.includes("KIMIA KLINIK") || c.includes("MIKROBIOLOGI") || c.includes("HISTOPATOLOGI") ||
      c.includes("SEROLOGI") || c.includes("ANDROLOGI") || c.includes("TIROID") ||
      c.includes("URINE") || c.includes("TINJA") || c.includes("BANK DARAH") ||
      c.includes("HEMOSTASIS") || c.includes("SITOLOGI") || c.includes("IMUNOHISTOKIMIA") ||
      c.includes("SPUTUM") || c.includes("SARS") || c.includes("BIOPSI JARUM")) return "LAB";
  if (c.includes("CT SCAN") || c.includes("MRI") || c.includes("DIAGNOSTIK KONVENSIONAL") ||
      c.includes("RADIOLOGI") || c.includes("X_RAY") || c.includes("USG") ||
      c.includes("GAMMA KAMERA") || c.includes("PET SCAN")) return "RADIOLOGI";
  if (c.includes("OPERASI") || c.includes("BEDAH") || c.includes("PERSALINAN") ||
      c.includes("SCTP") || c.includes("ESWL") || c.includes("ODONTECTOMY") ||
      c.includes("CATHLAB") || c.includes("PTCA") || c.includes("TINDAKAN MEDIS OPERATIF")) return "OPERASI";
  if (c.includes("ANESTESI") || c.includes("NARKOSE")) return "ANESTESI";
  if (c.includes("KAMAR") || c.includes("SEWA RUANGAN") || c.includes("INAP")) return "KAMAR";
  if (c.includes("FISIOTERAPI") || c.includes("REHABILITASI")) return "REHABILITASI";
  if (c.includes("PAKET") || c.includes("CARE_PACKAGE")) return "PAKET";
  if (c.includes("GIGI") || c.includes("MULUT") || c.includes("PROSTHODONTI") ||
      c.includes("ENDODONTI")) return "GIGI";
  if (c.includes("VAKSINASI")) return "TINDAKAN";
  if (c.includes("AKUPUNKTUR") || c.includes("OZON") || c.includes("PSIKO") ||
      c.includes("HIPNO") || c.includes("FACIAL") || c.includes("PEELING") ||
      c.includes("SCAR") || c.includes("ANTIAGING") || c.includes("MELASMA") ||
      c.includes("PRO YELLOW") || c.includes("NAIL") || c.includes("LASH") ||
      c.includes("INJECTION") || c.includes("HOMECARE") || c.includes("FACIAL")) return "TINDAKAN";
  if (c.includes("HOME") || c.includes("HOMECARE")) return "RAWAT_JALAN";
  if (c.includes("CHECKUP") || c.includes("MEDICAL CHECK UP")) return "RAWAT_JALAN";

  return "TINDAKAN";
}

// ----------------------------------------------------------------
// Unit inference
// ----------------------------------------------------------------
function inferUnit(itemCategory: string | null): string {
  if (!itemCategory) return "per_tindakan";
  const c = itemCategory.toUpperCase();
  if (c.includes("KAMAR") || c.includes("INAP") || c.includes("SEWA RUANGAN")) return "per_hari";
  if (c.includes("KONSULTASI") || c.includes("VISITE") || c.includes("HOMECARE")) return "per_kunjungan";
  if (c.includes("PAKET")) return "per_paket";
  return "per_tindakan";
}

// ----------------------------------------------------------------
// Clean strings from unnecessary special characters
// ----------------------------------------------------------------
function cleanString(str: string): string {
  if (!str || typeof str !== 'string') return "";
  return str
    .replace(/^[^a-zA-Z0-9(]+/, '') // Hapus non-alphanumeric di awal
    .replace(/[^a-zA-Z0-9)]+$/, '') // Hapus non-alphanumeric di akhir
    .replace(/\s+/g, ' ') // Spasi multiple jadi single
    .trim();
}

// ----------------------------------------------------------------
// Safely normalize item_rates to array
// ----------------------------------------------------------------
function normalizeRates(raw: RsppRate[] | RsppRate | null): RsppRate[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Single object
  if (typeof raw === "object" && "rate_value" in raw) return [raw];
  return [];
}

// ----------------------------------------------------------------
// Extract prices from rates array
// Returns { basePrice, maxPrice, priceTiersJson } or null if no valid price
// ----------------------------------------------------------------
function extractPrices(
  rates: RsppRate[]
): { basePrice: number; maxPrice: number; priceTiersJson: Record<string, number> } | null {
  if (rates.length === 0) return null;

  const tiers: Record<string, number> = {};
  let hasValidPrice = false;

  // Look for dedicated minimal/maksimal/fixed rates
  const fixedRate = rates.find((r) => r.rate_type === "fixed");
  const minimalRate = rates.find((r) => r.rate_type === "minimal");
  const maksimalRate = rates.find((r) => r.rate_type === "maksimal");

  // Process all rates that have a positive numeric value
  for (const rate of rates) {
    const val = typeof rate.rate_value === "number" ? rate.rate_value : null;
    if (val === null || val <= 0) continue;

    // Rate types that represent absolute prices (not percentages)
    const rateTypeLower = (rate.rate_type || "").toLowerCase();
    const isPercentage = rateTypeLower === "persentase";
    const isAbsolutePrice =
      rateTypeLower === "fixed" ||
      rateTypeLower === "minimal" ||
      rateTypeLower === "maksimal" ||
      rateTypeLower === "-" ||
      // INA-CBG and billing codes (e.g. "Q3 D00014 Z")
      /^[a-z0-9 _-]+$/i.test(rateTypeLower);

    if (!isPercentage && isAbsolutePrice) {
      const tierKey = rateTypeLower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      tiers[tierKey || "standard"] = val;
      hasValidPrice = true;
    }
  }

  if (!hasValidPrice) return null;

  const prices = Object.values(tiers);
  let basePrice: number;
  let maxPrice: number;

  if (fixedRate && fixedRate.rate_value > 0) {
    basePrice = fixedRate.rate_value;
    maxPrice = fixedRate.rate_value;
  } else if (minimalRate || maksimalRate) {
    basePrice = minimalRate?.rate_value ?? maksimalRate?.rate_value ?? Math.min(...prices);
    maxPrice = maksimalRate?.rate_value ?? minimalRate?.rate_value ?? Math.max(...prices);
  } else {
    basePrice = Math.min(...prices);
    maxPrice = Math.max(...prices);
  }

  return { basePrice, maxPrice, priceTiersJson: tiers };
}

// ----------------------------------------------------------------
// Build normalized procedure code
// ----------------------------------------------------------------
function buildProcedureCode(idx: number, category: string): string {
  const catSlug = (category || "UMUM")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .slice(0, 30);
  return `RSPP-${catSlug}-${String(idx).padStart(5, "0")}`;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------
async function main() {
  console.log("🏥 Starting RS Pertamina Pusat (RSPP) seed (full reindex)...");

  // ── 1. Wipe old RSPP data ────────────────────────────────────
  console.log("🧹 Cleaning up old RSPP data...");
  const oldProviders = await prisma.provider.findMany({
    where: {
      OR: [
        { code: PROVIDER_CODE },
        { name: { contains: "Pertamina", mode: "insensitive" } },
        { name: { contains: "RSPP", mode: "insensitive" } },
      ],
    },
  });
  for (const p of oldProviders) {
    await prisma.tariffEntry.deleteMany({ where: { providerId: p.id } });
    await prisma.provider.delete({ where: { id: p.id } });
    console.log(`  🗑️  Deleted provider: ${p.name} (${p.id})`);
  }

  // ── 2. Create fresh provider ──────────────────────────────────
  const provider = await prisma.provider.create({
    data: {
      code: PROVIDER_CODE,
      name: PROVIDER_NAME,
      isActive: true,
    },
  });
  console.log(`✅ Provider created: ${provider.name} (${provider.id})`);

  // ── 3. Load JSON ──────────────────────────────────────────────
  const jsonPath = path.join(
    __dirname,
    "../sample-data/master-data-docs/buku-tarif-rspp.json"
  );
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;

  // ── 4. Process main tariffs[] array ──────────────────────────
  const rawTariffs = (data.tariffs as RsppTariff[]) ?? [];
  console.log(`\n📂 Main tariffs[]: ${rawTariffs.length} items`);

  const allEntries: Array<Record<string, unknown>> = [];
  let seqIndex = 0;

  for (const tariff of rawTariffs) {
    const rawName = (tariff.item_name || "");
    const name = cleanString(rawName);
    if (!name) continue;

    const rates = normalizeRates(tariff.item_rates as RsppRate[] | RsppRate | null);
    const priceData = extractPrices(rates);
    if (!priceData) continue; // no valid absolute price → skip

    seqIndex++;
    const category = tariff.item_category || "Tindakan";
    const procedureCode = buildProcedureCode(seqIndex, category);

    allEntries.push({
      providerId: provider.id,
      procedureCode,
      procedureName: name,
      category: inferDbCategory(tariff.item_category),
      subcategory: category,
      serviceCode: null,
      unit: inferUnit(tariff.item_category),
      regionCode: "JKT",
      basePrice: priceData.basePrice,
      maxPrice: priceData.maxPrice,
      priceTiersJson: priceData.priceTiersJson,
      currency: "IDR",
      effectiveFrom: EFFECTIVE_FROM,
      isActive: true,
    });
  }

  // ── 5. Process nail_pedicure_and_lash_pricing (nested sub-arrays) ──
  const nailSection = data["nail_pedicure_and_lash_pricing"] as
    | Record<string, NailItem[]>
    | undefined;
  if (nailSection) {
    const nailSections = ["nails", "lashes", "single_lash_led"] as const;
    for (const sectionKey of nailSections) {
      const items = nailSection[sectionKey];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const rawName = (item.name || "");
        const name = cleanString(rawName);
        const price = typeof item.price === "number" ? item.price : null;
        if (!name || !price || price <= 0) continue;

        seqIndex++;
        allEntries.push({
          providerId: provider.id,
          procedureCode: buildProcedureCode(seqIndex, item.category || "WELLNESS"),
          procedureName: name,
          category: "TINDAKAN",
          subcategory: item.category || "Wellness",
          serviceCode: null,
          unit: "per_tindakan",
          regionCode: "JKT",
          basePrice: price,
          maxPrice: price,
          priceTiersJson: { standard: price },
          currency: "IDR",
          effectiveFrom: EFFECTIVE_FROM,
          isActive: true,
        });
      }
    }
  }

  console.log(`\n📦 Total raw entries before dedup: ${allEntries.length}`);

  // ── 6. Deduplicate by normalized procedureName + subcategory ──
  // Keep the entry with highest maxPrice when collision occurs
  const byNameCat = new Map<string, Record<string, unknown>>();
  for (const e of allEntries) {
    const key = `${(e.procedureName as string).toLowerCase().trim()}||${(e.subcategory as string).toLowerCase().trim()}`;
    const existing = byNameCat.get(key);
    if (!existing || (e.maxPrice as number) > (existing.maxPrice as number)) {
      byNameCat.set(key, e);
    }
  }

  const uniqueEntries = Array.from(byNameCat.values());

  // Re-assign procedureCodes sequentially after dedup to avoid gaps
  uniqueEntries.forEach((e, i) => {
    e.procedureCode = buildProcedureCode(i + 1, e.subcategory as string);
  });

  console.log(`📦 After deduplication: ${uniqueEntries.length} unique entries`);

  // ── 7. Batch insert in chunks of 500 ─────────────────────────
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < uniqueEntries.length; i += CHUNK_SIZE) {
    const chunk = uniqueEntries.slice(i, i + CHUNK_SIZE);
    const result = await prisma.tariffEntry.createMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: chunk as any,
      skipDuplicates: true,
    });
    inserted += result.count;
    console.log(`  ✅ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: +${result.count} rows`);
  }

  console.log(`\n🎉 Done! Inserted ${inserted} tariff entries for ${PROVIDER_NAME}.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
