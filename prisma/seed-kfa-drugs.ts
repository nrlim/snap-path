/**
 * Seed KFA master drug prices from sample-data/master-data-docs/daftar-kfa-master-obat.json.
 *
 * This uses the existing DrugPriceCache table as the local Master Obat reference.
 * KFA-seeded rows are tagged with `master_data_kfa` in sources and given a long expiry.
 *
 * Run:
 *   npx tsx prisma/seed-kfa-drugs.ts
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Prisma } from '../src/generated/prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_JSON_PATH = path.join(__dirname, '../sample-data/master-data-docs/daftar-kfa-master-obat.json');
const SOURCE_TAG = 'master_data_kfa';
const CHUNK_SIZE = 1000;
const MASTER_DATA_TTL_YEARS = 10;

const PHARMACY_GROUPS = new Set(['farmasi']);
const PHARMACY_CODES = new Set(['medicine', 'supplement', 'herbal', 'kuasi', 'vaccine', 'paket_obat']);

type KfaRow = Record<string, unknown>;

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => item && typeof item === 'object' && !Array.isArray(item));
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => item && typeof item === 'object' && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text;
}

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getFarmalkesType(row: KfaRow) {
  return parseJsonObject(row.farmalkes_type);
}

function isPharmacyProduct(row: KfaRow): boolean {
  const farmalkesType = getFarmalkesType(row);
  const code = cleanString(farmalkesType?.code)?.toLowerCase();
  const group = cleanString(farmalkesType?.group)?.toLowerCase();
  return Boolean((group && PHARMACY_GROUPS.has(group)) || (code && PHARMACY_CODES.has(code)));
}

function getGenericName(row: KfaRow): string | null {
  const normalizedGeneric = cleanString(row.generic_name);
  if (normalizedGeneric) return normalizedGeneric;

  const explicitGeneric = cleanString(row.generik);
  if (explicitGeneric) return explicitGeneric;

  const ingredients = parseJsonArray(row.active_ingredients)
    .map((ingredient) => cleanString(ingredient.zat_aktif) || cleanString(ingredient.name))
    .filter((value): value is string => Boolean(value));

  if (ingredients.length > 0) return Array.from(new Set(ingredients)).join(', ');

  const template = parseJsonObject(row.product_template);
  return cleanString(template?.display_name) || cleanString(template?.name);
}

function getDosageForm(row: KfaRow): string | null {
  const dosageForm = parseJsonObject(row.dosage_form);
  return cleanString(dosageForm?.name) || cleanString(dosageForm?.code);
}

function buildSource(row: KfaRow, marketPriceMax: number): string {
  const parts = [
    SOURCE_TAG,
    `kfa_code:${cleanString(row.kfa_code) || '-'}`,
    `id:${cleanString(row.id) || '-'}`,
    `nie:${cleanString(row.nie) || '-'}`,
    `dosage_form:${getDosageForm(row) || '-'}`,
    `unit:${cleanString(row.satuan) || cleanString(row.uom_name) || '-'}`,
    `het_price:${numberValue(row.het_price) || 0}`,
    `fix_price:${numberValue(row.fix_price) || 0}`,
    `per_unit_IDR:${marketPriceMax}`,
  ];
  return parts.join(' | ');
}

function toDrugCacheCreate(row: KfaRow, now: Date, expiresAt: Date): Prisma.DrugPriceCacheCreateManyInput | null {
  if (!isPharmacyProduct(row)) return null;
  if (row.active === false || cleanString(row.active) === '0') return null;

  const drugName = cleanString(row.name) || cleanString(row.nama_dagang);
  if (!drugName) return null;

  const hetPrice = numberValue(row.het_price);
  const fixPrice = numberValue(row.fix_price);
  const marketPriceMax = numberValue(row.max_reference_price) || hetPrice || fixPrice;
  if (!marketPriceMax) return null;

  return {
    drugName: normalizeName(drugName),
    drugGenericName: getGenericName(row),
    marketPriceMax,
    marketPriceAvg: fixPrice || hetPrice || null,
    sources: [cleanString(row.seed_source) || buildSource(row, marketPriceMax)],
    currency: 'IDR',
    fetchedAt: now,
    expiresAt,
  };
}

function dedupeByNameAndPrice(entries: Prisma.DrugPriceCacheCreateManyInput[]) {
  const map = new Map<string, Prisma.DrugPriceCacheCreateManyInput>();
  for (const entry of entries) {
    const key = `${entry.drugName}`.toLowerCase();
    const existing = map.get(key);
    if (!existing || Number(entry.marketPriceMax) > Number(existing.marketPriceMax)) {
      map.set(key, entry);
    }
  }
  return Array.from(map.values());
}

async function main() {
  const jsonPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_JSON_PATH;
  console.log(`[seed-kfa-drugs] Reading ${jsonPath}`);

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { products?: KfaRow[] };
  const rows = Array.isArray(payload.products) ? payload.products : [];
  if (rows.length === 0) throw new Error('JSON file does not contain a non-empty products array.');
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + MASTER_DATA_TTL_YEARS);

  const entries = dedupeByNameAndPrice(
    rows
      .map((row) => toDrugCacheCreate(row, now, expiresAt))
      .filter((entry): entry is Prisma.DrugPriceCacheCreateManyInput => Boolean(entry)),
  );

  console.log(`[seed-kfa-drugs] Parsed ${rows.length} rows; ${entries.length} priced pharmacy products ready to seed.`);

  await prisma.$executeRawUnsafe(`DELETE FROM "DrugPriceCache" WHERE "sources"::text LIKE '%${SOURCE_TAG}%'`);

  let created = 0;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const result = await prisma.drugPriceCache.createMany({ data: chunk });
    created += result.count;
    console.log(`[seed-kfa-drugs] Inserted ${created}/${entries.length}`);
  }

  console.log(`[seed-kfa-drugs] Done. Inserted ${created} KFA master drug rows.`);
}

main()
  .catch((error) => {
    console.error('[seed-kfa-drugs] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
