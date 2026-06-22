import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.join(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PROVIDER_CODE = "RS_SILOAM_SEMANGGI";
const EFFECTIVE_FROM = new Date("2026-01-01");

// Helper: pick first non-null price as basePrice, max as maxPrice
function calcPrices(
  prices: (number | null | undefined)[]
): { basePrice: number; maxPrice: number } {
  const valid = prices.filter((p): p is number => p != null && p > 0);
  if (valid.length === 0) return { basePrice: 0, maxPrice: 0 };
  return {
    basePrice: Math.min(...valid),
    maxPrice: Math.max(...valid),
  };
}

async function main() {
  console.log("🏥 Starting RS Siloam Semanggi 2026 seed...");

  // 1. Delete existing Siloam providers and their tariffs
  console.log("🧹 Cleaning up old Siloam data...");
  const oldProviders = await prisma.provider.findMany({
    where: {
      OR: [
        { code: PROVIDER_CODE },
        { name: { contains: "Siloam", mode: "insensitive" } }
      ]
    }
  });

  if (oldProviders.length > 0) {
    for (const p of oldProviders) {
      await prisma.tariffEntry.deleteMany({ where: { providerId: p.id } });
      await prisma.provider.delete({ where: { id: p.id } });
      console.log(`  🗑️ Deleted provider: ${p.name}`);
    }
  }

  // 2. Create a fresh Provider
  const provider = await prisma.provider.create({
    data: {
      code: PROVIDER_CODE,
      name: "RS Siloam Semanggi",
      isActive: true,
    },
  });
  console.log(`✅ Fresh Provider created: ${provider.name} (${provider.id})`);

  // Read JSON
  const jsonPath = path.join(__dirname, "../sample-data/master-data-docs/buku-tarif-siloam.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);

  const entries: any[] = [];
  let skipped = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    if (key === "contacts") continue;

    const category = key.toUpperCase();

    for (const item of value) {
      const name = item.item || item.name || item.procedureName || item.service || item.procedure || item.test_name || item.description || item.nama_tindakan || "Unnamed";
      if (name === "Unnamed") { skipped++; continue; }

      const tiers: Record<string, number> = {};
      const priceVals: number[] = [];

      for (const [k, v] of Object.entries(item)) {
        if (k === "item" || k === "name" || k === "service" || k === "code" || k === "service_code" || k === "procedure" || k === "test_name" || k === "description" || k === "nama_tindakan" || k === "keterangan" || k === "klasifikasi") continue;
        if (typeof v === "number" && v > 0) {
          tiers[k] = v;
          priceVals.push(v);
        }
      }

      const { basePrice, maxPrice } = calcPrices(priceVals);
      
      // Skip empty prices unless it's a known category that might be package based
      if (basePrice === 0 && maxPrice === 0) { skipped++; continue; }

      let unit = "per_tindakan";
      if (category.includes("BED_RENTAL") || category.includes("KAMAR")) unit = "per_hari";
      if (category.includes("CONSULTATION")) unit = "per_kunjungan";

      entries.push({
        providerId: provider.id,
        procedureCode: item.code || item.service_code || `SILOAM-${category}-${entries.length + 1}`,
        procedureName: name,
        category: category,
        unit: unit,
        regionCode: "JKT",
        basePrice,
        maxPrice,
        priceTiersJson: Object.keys(tiers).length > 0 ? tiers : undefined,
        currency: "IDR",
        effectiveFrom: EFFECTIVE_FROM,
        isActive: true,
      });
    }
  }

  console.log(`📦 Total entries prepared: ${entries.length} (skipped: ${skipped})`);

  // ==========================================
  // Deduplicate by procedureCode + providerId
  // ==========================================
  const uniqueMap = new Map<string, any>();
  for (const e of entries) {
    const key = `${e.providerId}:${e.procedureCode}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, e);
    }
  }
  const uniqueEntries = Array.from(uniqueMap.values());
  console.log(`📦 Unique entries after deduplication: ${uniqueEntries.length}`);

  // ==========================================
  // Fetch existing and filter out duplicates
  // ==========================================
  const existingEntries = await prisma.tariffEntry.findMany({
    where: { providerId: provider.id },
    select: { procedureCode: true }
  });
  const existingCodes = new Set(existingEntries.map(e => e.procedureCode));
  
  const finalEntries = uniqueEntries.filter(e => !existingCodes.has(e.procedureCode));
  console.log(`📦 New entries to insert: ${finalEntries.length} (Skipped ${uniqueEntries.length - finalEntries.length} already in DB)`);

  // ==========================================
  // Batch insert in chunks of 500
  // ==========================================
  const CHUNK_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < finalEntries.length; i += CHUNK_SIZE) {
    const chunk = finalEntries.slice(i, i + CHUNK_SIZE);
    const result = await prisma.tariffEntry.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result.count;
    console.log(`  ✅ Inserted chunk ${Math.floor(i / CHUNK_SIZE) + 1}: +${result.count} rows`);
  }

  console.log(`\n🎉 Done! Total inserted: ${inserted} tariff entries.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
