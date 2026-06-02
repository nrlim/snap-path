/**
 * Seed script for Mitra Keluarga Bekasi Timur 2026 Tariff Data
 * Run: npx ts-node --project tsconfig.json prisma/seed-mitra-keluarga.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.join(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PROVIDER_CODE = "MITRA_KELUARGA_BEKASI_TIMUR";
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

// Helper: build priceTiersJson from tier fields
function buildTiers(item: any) {
  const tiers: Record<string, number | null> = {};
  if ("rj" in item) tiers.rj = item.rj ?? null;
  if ("suite" in item) tiers.suite = item.suite ?? null;
  if ("eksekutif_vip" in item) tiers.eksekutif_vip = item.eksekutif_vip ?? null;
  if ("kelas_i_r_khusus" in item) tiers.kelas_i = item.kelas_i_r_khusus ?? null;
  if ("kelas_i_r" in item) tiers.kelas_i_r = item.kelas_i_r ?? null;
  if ("kelas_i_isolasi" in item) tiers.kelas_i_isolasi = item.kelas_i_isolasi ?? null;
  if ("kelas_ii" in item) tiers.kelas_ii = item.kelas_ii ?? null;
  if ("kelas_iii" in item) tiers.kelas_iii = item.kelas_iii ?? null;
  if ("isolasi" in item) tiers.isolasi = item.isolasi ?? null;
  if ("nicu" in item) tiers.nicu = item.nicu ?? null;
  if ("perina" in item) tiers.perina = item.perina ?? null;
  if ("icu_iccu" in item) tiers.icu_iccu = item.icu_iccu ?? null;
  
  // Also handle alternate naming
  if (Object.keys(tiers).length === 0) {
    if ("tarif" in item) tiers.standard = item.tarif ?? null;
    else if ("tariff" in item) tiers.standard = item.tariff ?? null;
    else if ("fee" in item) tiers.standard = item.fee ?? null;
    else if ("biaya" in item) tiers.standard = item.biaya ?? null;
  }
  return Object.keys(tiers).length > 0 ? tiers : null;
}

// Helper: extract service code
function getServiceCode(item: any): string | null {
  return (
    item.service_code ||
    item.service ||
    item.serviceCode ||
    null
  );
}

// Helper: get name
function getName(item: any): string {
  return (
    item.nama_layanan ||
    item.nama_layan ||
    item.nama ||
    item.procedureName ||
    item.room_type ||
    item.jenis_kamar ||
    item.name ||
    item.service_name ||
    item.description ||
    item.deskripsi ||
    "Unnamed"
  );
}

async function main() {
  console.log("🏥 Starting Mitra Keluarga Bekasi Timur 2026 seed...");

  // 1. Ensure Provider exists
  const existingProvider = await prisma.provider.findFirst({
    where: { clientId: null, code: PROVIDER_CODE },
  });
  const provider = existingProvider
    ? await prisma.provider.update({
        where: { id: existingProvider.id },
        data: { name: "Mitra Keluarga Bekasi Timur", isActive: true },
      })
    : await prisma.provider.create({
        data: {
          code: PROVIDER_CODE,
          name: "Mitra Keluarga Bekasi Timur",
          isActive: true,
        },
      });
  console.log(`✅ Provider: ${provider.name} (${provider.id})`);

  // Read JSON
  const legacyJsonPath = path.join(__dirname, "../sample-data/buku-tarif-mitra-keluarga.json");
  const jsonPath = fs.existsSync(legacyJsonPath)
    ? legacyJsonPath
    : path.join(__dirname, "../sample-data/master-data-docs/buku-tarif-mitra-keluarga.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);

  const entries: any[] = [];
  let skipped = 0;

  // Helper: push entry after validation
  function pushEntry(
    procedureCode: string,
    procedureName: string,
    category: string,
    subcategory: string | null,
    serviceCode: string | null,
    unit: string,
    tiers: Record<string, number | null> | null,
    overridePrice?: number,
    notes?: string
  ) {
    const priceValues = tiers
      ? Object.values(tiers).filter((v): v is number => v != null && v > 0)
      : [];
    if (overridePrice) priceValues.push(overridePrice);

    const { basePrice, maxPrice } =
      priceValues.length > 0
        ? { basePrice: Math.min(...priceValues), maxPrice: Math.max(...priceValues) }
        : { basePrice: 0, maxPrice: 0 };

    // Skip entries with no meaningful name or price
    if (!procedureName || procedureName === "Unnamed") { skipped++; return; }
    if (procedureName === "Total Biaya") { skipped++; return; }
    if (basePrice === 0 && maxPrice === 0 && !tiers) { skipped++; return; }

    entries.push({
      providerId: provider.id,
      procedureCode: procedureCode || serviceCode || `MK-${category}-${entries.length + 1}`,
      procedureName,
      category,
      subcategory,
      serviceCode: serviceCode || null,
      unit,
      regionCode: "BKS",
      basePrice,
      maxPrice,
      priceTiersJson: tiers && Object.keys(tiers).length > 0 ? tiers : undefined,
      currency: "IDR",
      notes: notes || null,
      effectiveFrom: EFFECTIVE_FROM,
      isActive: true,
    });
  }

  // ==========================================
  // 2. KAMAR - room_rates, room_fees, room_tariffs
  // ==========================================
  const allRooms = [
    ...(data.room_rates || []),
    ...(data.room_fees || []),
    ...(data.room_tariffs || []),
  ];
  for (const room of allRooms) {
    const name = room.jenis_kamar || room.room_type || "Kamar Rawat";
    const svc = room.service || room.service_code || null;
    const price = room.tarif || room.tariff || null;
    if (!price && !svc) continue;
    pushEntry(
      svc || `KAMAR-${entries.length + 1}`,
      name,
      "KAMAR",
      name.split(" - ")[0] || "Ruang Rawat",
      svc,
      "per_hari",
      price ? { standard: price } : null,
      price || undefined,
      room.fasilitas || room.facilities || null
    );
  }
  console.log(`📦 Rooms processed: ${entries.length}`);

  // ==========================================
  // 3. ADMINISTRASI - fees (rawat_jalan / rawat_inap)
  // ==========================================
  const adminEntries = (data.fees || []).filter(
    (f: any) => f.nama_layan && (f.category === "rawat_jalan" || f.category === "rawat_inap")
  );
  for (const f of adminEntries) {
    const price = f.rj || 0;
    pushEntry(
      f.service || `ADM-${entries.length + 1}`,
      f.nama_layan,
      f.category === "rawat_jalan" ? "RAWAT_JALAN" : "RAWAT_INAP",
      "Administrasi",
      f.service || null,
      "per_kunjungan",
      null,
      price,
      typeof f.kelas_i_r_khusus === "string" ? f.kelas_i_r_khusus : null
    );
  }

  // ==========================================
  // 4. IGD & TINDAKAN - fees array (main bulk)
  // ==========================================
  const actionFees = (data.fees || []).filter(
    (f: any) => (f.nama_layanan || f.service_code) && !f.category
  );
  for (const f of actionFees) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = f.service_code || null;
    const tiers = buildTiers(f);
    const priceVals = [f.rj, f.suite, f.eksekutif_vip, f.kelas_i_r_khusus, f.kelas_ii, f.kelas_iii];
    const { basePrice, maxPrice } = calcPrices(priceVals);

    // Determine category by service code prefix or fallback
    const cat = svc?.startsWith("IGD") ? "IGD" : "TINDAKAN";

    pushEntry(svc || name, name, cat, null, svc, "per_tindakan", tiers);
  }

  // items array (more tindakan)
  for (const f of data.items || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", f.category || null, svc, "per_tindakan", tiers);
  }

  // medical_fees
  for (const f of data.medical_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Tindakan Medis", svc, "per_tindakan", tiers);
  }

  // nursing_fees
  for (const f of data.nursing_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Keperawatan", svc, "per_tindakan", tiers);
  }

  // medical_services
  for (const f of data.medical_services || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Layanan Medis", svc, "per_tindakan", tiers);
  }

  // endoscopy_fees
  for (const f of data.endoscopy_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Endoskopi", svc, "per_tindakan", tiers);
  }

  // hemodialysis_fees
  for (const f of data.hemodialysis_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Hemodialisa", svc, "per_tindakan", tiers);
  }

  // delivery_fees (persalinan)
  for (const f of data.delivery_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Persalinan", svc, "per_paket", tiers);
  }

  // consultation_fees
  for (const f of data.consultation_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "RAWAT_JALAN", "Konsultasi Dokter", svc, "per_kunjungan", tiers);
  }

  // vaccine_fees
  for (const f of data.vaccine_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "TINDAKAN", "Vaksin", svc, "per_tindakan", tiers);
  }

  // homecare
  for (const arr of [data.homecare_dokter, data.homecare_keperawatan, data.homecare_rehabilitasi_medik]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      pushEntry(svc || name, name, "TINDAKAN", "Homecare", svc, "per_kunjungan", tiers);
    }
  }

  // ==========================================
  // 5. LAB
  // ==========================================
  for (const arr of [data.laboratory_services, data.laboratory_fees, data.mikrobiologi_fees, data.patologi_anatomi, data.laboratory_packages]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      const price = f.tarif || f.harga || f.price || null;
      pushEntry(svc || name, name, "LAB", "Laboratorium", svc, "per_tindakan", tiers, price || undefined);
    }
  }

  // electromyography_fees
  for (const f of data.electromyography_fees || []) {
    const name = getName(f);
    if (name === "Unnamed") continue;
    const svc = getServiceCode(f);
    const tiers = buildTiers(f);
    pushEntry(svc || name, name, "LAB", "EMG", svc, "per_tindakan", tiers);
  }

  // ==========================================
  // 6. RADIOLOGI
  // ==========================================
  for (const arr of [data.radiology_fees, data.radiology_services, data.mammografi_kontras_fees, data.msct_scan_fees]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      const price = f.tarif || f.harga || f.price || null;
      pushEntry(svc || name, name, "RADIOLOGI", "Radiologi", svc, "per_tindakan", tiers, price || undefined);
    }
  }

  // radiotherapy_fees, nuklir_fees
  for (const arr of [data.radiotherapy_fees, data.nuklir_fees]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      pushEntry(svc || name, name, "RADIOLOGI", "Radioterapi / Nuklir", svc, "per_tindakan", tiers);
    }
  }

  // ==========================================
  // 7. OPERASI
  // ==========================================
  for (const arr of [
    data.surgical_procedures, data.services, data.surgical_services, data.urology_services,
    data.urology_surgery_services, data.orthopedic_surgery_services, data.surgery_services,
    data.surgery_list, data.eye_surgery_list, data.endoscopy_services,
    data.urology_fees, data.orthopedic_surgery_fees, data.plastic_surgery_fees, data.tht_fees,
  ]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      const price = f.tarif || f.harga || f.price || null;
      pushEntry(svc || name, name, "OPERASI", f.spesialisasi || f.category || "Operasi", svc, "per_tindakan", tiers, price || undefined);
    }
  }

  // angiography_fees
  for (const arr of [data.angiography_fees, data.angiografi_fees]) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      pushEntry(svc || name, name, "OPERASI", "Angiografi", svc, "per_tindakan", tiers);
    }
  }

  // ==========================================
  // 8. TINDAKAN SPESIALIS LAINNYA
  // ==========================================
  const spesialisMappings = [
    { arr: data.gigi_umum, sub: "Gigi Umum" },
    { arr: data.spesialis_konservasi_gigi, sub: "Konservasi Gigi" },
    { arr: data.dental_services, sub: "Dental" },
    { arr: data.oral_surgery_services, sub: "Bedah Mulut" },
    { arr: data.pediatric_dentistry_services, sub: "Gigi Anak" },
    { arr: data.orthodontic_fees, sub: "Ortodonti" },
    { arr: data.periodontic_fees, sub: "Periodonti" },
    { arr: data.prosthodontic_fees, sub: "Prostodonti" },
    { arr: data.dental_fees, sub: "Gigi" },
    { arr: data.lain_lain_gigi, sub: "Gigi Lain-Lain" },
    { arr: data.lactation_fees, sub: "Laktasi" },
    { arr: data.psikiatri_fees, sub: "Psikiatri" },
    { arr: data.psychology_fees, sub: "Psikologi" },
    { arr: data.exercise, sub: "Rehabilitasi - Exercise" },
    { arr: data.terapi_wicara, sub: "Rehabilitasi - Terapi Wicara" },
    { arr: data.okupasi_terapi, sub: "Rehabilitasi - Okupasi" },
    { arr: data.modalitas_fisioterapi, sub: "Rehabilitasi - Fisioterapi" },
    { arr: data.tindakan_dokter_rehabilitasi_medik, sub: "Rehabilitasi Medik" },
    { arr: data.tumbuh_kembang_fees, sub: "Tumbuh Kembang" },
    { arr: data.kuretase_fees, sub: "Kuretase" },
  ];

  for (const { arr, sub } of spesialisMappings) {
    for (const f of arr || []) {
      const name = getName(f);
    if (name === "Unnamed") continue;
      const svc = getServiceCode(f);
      const tiers = buildTiers(f);
      const price = f.tarif || f.harga || f.price || null;
      pushEntry(svc || name, name, "TINDAKAN", sub, svc, "per_tindakan", tiers, price || undefined);
    }
  }

  console.log(`📦 Total entries prepared: ${entries.length} (skipped: ${skipped})`);

  // ==========================================
  // 9. Deduplicate by procedureCode + providerId
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
  // 9.5 Fetch existing and filter out duplicates
  // ==========================================
  const existingEntries = await prisma.tariffEntry.findMany({
    where: { providerId: provider.id },
    select: { procedureCode: true }
  });
  const existingCodes = new Set(existingEntries.map(e => e.procedureCode));
  
  const finalEntries = uniqueEntries.filter(e => !existingCodes.has(e.procedureCode));
  console.log(`📦 New entries to insert: ${finalEntries.length} (Skipped ${uniqueEntries.length - finalEntries.length} already in DB)`);

  // ==========================================
  // 10. Batch insert in chunks of 500
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
