/**
 * Seed KFA master Farmalkes prices from sample-data/master-data-docs/daftar-kfa-master-obat.json.
 *
 * This uses the MedicalItemPriceCache table as the local Master Farmalkes reference.
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

function resolveValidationPrice(fixPrice: number | null, hetPrice: number | null, maxReferencePrice: number | null): number | null {
  const candidates = [maxReferencePrice, hetPrice, fixPrice].filter((price): price is number => typeof price === 'number' && price >= 100);
  if (candidates.length === 0) return null;

  // Some KFA rows have nominal fix_price (e.g. 1.0) while HET/max reference is valid.
  // Use the highest meaningful reference as validation ceiling to avoid false overcharge flags.
  return Math.max(...candidates);
}

function resolveAverageReferencePrice(fixPrice: number | null, hetPrice: number | null, maxReferencePrice: number | null): number | null {
  if (fixPrice && fixPrice >= 100) return fixPrice;
  return hetPrice || maxReferencePrice || null;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getFarmalkesType(row: KfaRow) {
  return parseJsonObject(row.farmalkes_type);
}

function getItemType(row: KfaRow) {
  const farmalkesType = getFarmalkesType(row);
  return {
    code: cleanString(farmalkesType?.code)?.toLowerCase() || null,
    name: cleanString(farmalkesType?.name) || null,
    group: cleanString(farmalkesType?.group)?.toLowerCase() || null,
  };
}

function cleanGenericName(value: unknown): string | null {
  const text = cleanString(value);
  if (!text || text === '0' || text === '1') return null;
  return text;
}

function getGenericName(row: KfaRow): string | null {
  const normalizedGeneric = cleanGenericName(row.generic_name);
  if (normalizedGeneric) return normalizedGeneric;

  const explicitGeneric = cleanGenericName(row.generik);
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
    `display_name:${cleanString(row.name) || '-'}`,
    `brand_name:${cleanString(row.nama_dagang) || '-'}`,
    `generic_name:${getGenericName(row) || '-'}`,
    `item_type_code:${getItemType(row).code || '-'}`,
    `item_type_name:${getItemType(row).name || '-'}`,
    `item_group:${getItemType(row).group || '-'}`,
    `nie:${cleanString(row.nie) || '-'}`,
    `manufacturer:${cleanString(row.manufacturer) || '-'}`,
    `registrar:${cleanString(row.registrar) || '-'}`,
    `dosage_form:${getDosageForm(row) || '-'}`,
    `dose_per_unit:${cleanString(row.dose_per_unit) || '-'}`,
    `unit:${cleanString(row.satuan) || cleanString(row.uom_name) || '-'}`,
    `het_price:${numberValue(row.het_price) || 0}`,
    `fix_price:${numberValue(row.fix_price) || 0}`,
    `per_unit_IDR:${marketPriceMax}`,
  ];
  return parts.join(' | ');
}

function getItemDisplayName(row: KfaRow): string | null {
  return cleanString(row.nama_dagang) || cleanString(row.name);
}

function toMedicalItemCacheCreate(row: KfaRow, now: Date, expiresAt: Date): Prisma.MedicalItemPriceCacheCreateManyInput | null {
  if (row.active === false || cleanString(row.active) === '0') return null;

  const itemName = getItemDisplayName(row);
  if (!itemName) return null;

  const itemType = getItemType(row);

  const hetPrice = numberValue(row.het_price);
  const fixPrice = numberValue(row.fix_price);
  const maxReferencePrice = numberValue(row.max_reference_price);
  const marketPriceMax = resolveValidationPrice(fixPrice, hetPrice, maxReferencePrice);
  if (!marketPriceMax) return null;

  return {
    itemName: normalizeName(itemName),
    itemGenericName: getGenericName(row),
    itemTypeCode: itemType.code,
    itemTypeName: itemType.name,
    itemGroup: itemType.group,
    marketPriceMax,
    marketPriceAvg: resolveAverageReferencePrice(fixPrice, hetPrice, maxReferencePrice),
    fixPrice,
    hetPrice,
    maxReferencePrice: maxReferencePrice || marketPriceMax,
    sources: [buildSource(row, marketPriceMax)],
    currency: 'IDR',
    fetchedAt: now,
    expiresAt,
  };
}

function dedupeByKfaIdentity(entries: Prisma.MedicalItemPriceCacheCreateManyInput[]) {
  const map = new Map<string, Prisma.MedicalItemPriceCacheCreateManyInput>();
  for (const entry of entries) {
    const source = Array.isArray(entry.sources) ? String(entry.sources[0] || '') : '';
    const kfaCode = source.match(/kfa_code:([^|]+)/)?.[1]?.trim();
    const sourceId = source.match(/id:([^|]+)/)?.[1]?.trim();
    const key = `${kfaCode || ''}:${sourceId || ''}:${entry.itemGroup || ''}:${entry.itemTypeCode || ''}:${entry.itemName}:${entry.marketPriceMax}`.toLowerCase();
    if (!map.has(key)) map.set(key, entry);
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

  const entries = dedupeByKfaIdentity(
    rows
      .map((row) => toMedicalItemCacheCreate(row, now, expiresAt))
      .filter((entry): entry is Prisma.MedicalItemPriceCacheCreateManyInput => Boolean(entry)),
  );

  console.log(`[seed-kfa-drugs] Parsed ${rows.length} rows; ${entries.length} priced medical items ready to seed.`);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MedicalItemPriceCache" RESTART IDENTITY');

  let created = 0;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const result = await prisma.medicalItemPriceCache.createMany({ data: chunk });
    created += result.count;
    console.log(`[seed-kfa-drugs] Inserted ${created}/${entries.length}`);
  }

  console.log(`[seed-kfa-drugs] Done. Inserted ${created} KFA master medical item rows.`);
}

main()
  .catch((error) => {
    console.error('[seed-kfa-drugs] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
