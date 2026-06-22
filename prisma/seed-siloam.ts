/**
 * Seed script for RS Siloam Semanggi Tariff Data
 * Handles all section formats in buku-tarif-siloam.json:
 *   - Standard (ed/opd/vip/vvip/...)
 *   - Column-based (col1..col11, col_1..col_11)
 *   - Class-based (class_1..class_10)
 *   - Surgical (no/vip/vvip/kelas_1..3/nama_tindakan)
 *   - Price-indexed (price_1..price_11)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PROVIDER_CODE = "RS_SILOAM_SEMANGGI";
const EFFECTIVE_FROM = new Date("2026-01-01");

// ----------------------------------------------------------------
// Non-price keys that should NEVER be treated as a price field
// ----------------------------------------------------------------
const NON_PRICE_KEYS = new Set([
  "item", "name", "service", "code", "service_code",
  "procedure", "test_name", "description", "nama_tindakan",
  "keterangan", "klasifikasi", "sales_item_type", "cito",
  "elektif", "no", "email", "phone", "presidential_suite_str",
]);

// ----------------------------------------------------------------
// Category → unit mapping
// ----------------------------------------------------------------
function inferUnit(category: string): string {
  if (category.includes("BED_RENTAL")) return "per_hari";
  if (category.includes("CONSULTATION")) return "per_kunjungan";
  if (category.includes("CARE_PACKAGE")) return "per_paket";
  return "per_tindakan";
}

// ----------------------------------------------------------------
// Category → DB category label
// ----------------------------------------------------------------
function inferCategory(key: string): string {
  const k = key.toUpperCase();
  if (k.includes("LAB") || k.includes("TEST") || k.includes("FEE_SCHEDULE")) return "LAB";
  if (k.includes("RADIOL") || k.includes("X_RAY")) return "RADIOLOGI";
  if (k.includes("SURGICAL") || k.includes("PROCEDURE") || k.includes("MEDICAL_PROCEDURE")) return "OPERASI";
  if (k.includes("CONSULT")) return "RAWAT_JALAN";
  if (k.includes("BED")) return "KAMAR";
  if (k.includes("ADMIN")) return "ADMINISTRASI";
  if (k.includes("ANEST")) return "ANESTESI";
  if (k.includes("CARE_PACKAGE")) return "TINDAKAN";
  if (k.includes("OTHER_SERVICE")) return "TINDAKAN";
  if (k.includes("PROCEDURE_ROOM")) return "TINDAKAN";
  return "TINDAKAN";
}

// ----------------------------------------------------------------
// Safely parse a price value (string or number)
// ----------------------------------------------------------------
function parsePrice(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  if (typeof v === "string") {
    // Handle cases like "39000000, 39000000" – take first number
    const firstNum = v.split(",")[0].trim().replace(/\s/g, "");
    const n = parseFloat(firstNum);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

// ----------------------------------------------------------------
// Extract name from an item
// ----------------------------------------------------------------
function extractName(item: Record<string, unknown>): string {
  return (
    (item.item as string) ||
    (item.name as string) ||
    (item.procedure as string) ||
    (item.test_name as string) ||
    (item.description as string) ||
    (item.nama_tindakan as string) ||
    (item.service as string) ||
    ""
  );
}

// ----------------------------------------------------------------
// Extract price tiers from an item
// ----------------------------------------------------------------
function extractTiers(item: Record<string, unknown>): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (const [k, v] of Object.entries(item)) {
    if (NON_PRICE_KEYS.has(k)) continue;
    const price = parsePrice(v);
    if (price !== null) tiers[k] = price;
  }
  return tiers;
}

// ----------------------------------------------------------------
// Build entries from an array section
// ----------------------------------------------------------------
function buildEntries(
  providerId: string,
  key: string,
  items: Record<string, unknown>[],
  globalIndex: { count: number }
): Array<Record<string, unknown>> {
  const dbCategory = inferCategory(key);
  const unit = inferUnit(key);
  const result: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const name = extractName(item);
    if (!name) continue;

    const tiers = extractTiers(item);
    const prices = Object.values(tiers);
    if (prices.length === 0) continue;

    const basePrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    globalIndex.count++;
    const procedureCode =
      (item.code as string) ||
      (item.service_code as string) ||
      `SILOAM-${key.toUpperCase()}-${globalIndex.count}`;

    result.push({
      providerId,
      procedureCode,
      procedureName: name,
      category: dbCategory,
      subcategory: key
        .replace(/_/g, " ")
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      serviceCode: (item.service_code as string) || null,
      unit,
      regionCode: "JKT",
      basePrice,
      maxPrice,
      priceTiersJson: tiers,
      currency: "IDR",
      effectiveFrom: EFFECTIVE_FROM,
      isActive: true,
    });
  }

  return result;
}

// ----------------------------------------------------------------
// Non-array sections to completely skip (metadata)
// ----------------------------------------------------------------
const SKIP_KEYS = new Set([
  "year", "issuer", "document_type", "document_metadata", "date",
  "subject", "contacts", "signatory", "document_id", "effective_date",
  "page_number", "policy_notes", "has_signature",
  "surcharge_table", // policy table, not actionable tariff data
]);

async function main() {
  console.log("🏥 Starting RS Siloam Semanggi 2026 seed (full reindex)...");

  // ── 1. Wipe old Siloam data ───────────────────────────────────
  console.log("🧹 Cleaning up old Siloam data...");
  const oldProviders = await prisma.provider.findMany({
    where: {
      OR: [
        { code: PROVIDER_CODE },
        { name: { contains: "Siloam", mode: "insensitive" } },
      ],
    },
  });
  for (const p of oldProviders) {
    await prisma.tariffEntry.deleteMany({ where: { providerId: p.id } });
    await prisma.provider.delete({ where: { id: p.id } });
    console.log(`  🗑️  Deleted provider: ${p.name} (${p.id})`);
  }

  // ── 2. Create fresh provider ─────────────────────────────────
  const provider = await prisma.provider.create({
    data: {
      code: PROVIDER_CODE,
      name: "RS Siloam Semanggi",
      isActive: true,
    },
  });
  console.log(`✅ Provider created: ${provider.name} (${provider.id})`);

  // ── 3. Load JSON ─────────────────────────────────────────────
  const jsonPath = path.join(
    __dirname,
    "../sample-data/master-data-docs/buku-tarif-siloam.json"
  );
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Record<
    string,
    unknown
  >;

  // ── 4. Build entries from every array section ─────────────────
  const allEntries: Array<Record<string, unknown>> = [];
  const globalIndex = { count: 0 };
  let sectionCount = 0;

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    if (!Array.isArray(value)) continue;
    if (value.length === 0) continue;

    const sectionEntries = buildEntries(
      provider.id,
      key,
      value as Record<string, unknown>[],
      globalIndex
    );
    console.log(`  📂 ${key}: ${sectionEntries.length} / ${value.length} entries`);
    allEntries.push(...sectionEntries);
    sectionCount++;
  }

  console.log(`\n📦 Total raw entries: ${allEntries.length} from ${sectionCount} sections`);

  // ── 5. Deduplicate by procedureName (case-insensitive) ────────
  // Primary dedup by procedureCode
  const byCode = new Map<string, Record<string, unknown>>();
  for (const e of allEntries) {
    const codeKey = (e.procedureCode as string).toLowerCase();
    if (!byCode.has(codeKey)) byCode.set(codeKey, e);
  }

  // Secondary dedup by normalized procedureName across the entire dataset
  // Keep the entry with higher maxPrice if same name appears in multiple sections
  const byName = new Map<string, Record<string, unknown>>();
  for (const e of byCode.values()) {
    const nameKey = (e.procedureName as string).toLowerCase().trim();
    const existing = byName.get(nameKey);
    if (!existing || (e.maxPrice as number) > (existing.maxPrice as number)) {
      byName.set(nameKey, e);
    }
  }

  const uniqueEntries = Array.from(byName.values());
  console.log(`📦 After deduplication: ${uniqueEntries.length} unique entries`);

  // ── 6. Batch upsert in chunks of 500 ─────────────────────────
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < uniqueEntries.length; i += CHUNK_SIZE) {
    const chunk = uniqueEntries.slice(i, i + CHUNK_SIZE);
    const result = await prisma.tariffEntry.createMany({
      data: chunk as any,
      skipDuplicates: true,
    });
    inserted += result.count;
    console.log(
      `  ✅ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: +${result.count} rows`
    );
  }

  console.log(`\n🎉 Done! Total inserted: ${inserted} tariff entries for RS Siloam Semanggi.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
