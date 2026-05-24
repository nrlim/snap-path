export const CANONICAL_TARIFF_CATEGORIES = [
  'KAMAR',
  'RAWAT_INAP',
  'RAWAT_JALAN',
  'IGD',
  'TINDAKAN',
  'OBAT',
  'LAB',
  'RADIOLOGI',
  'OPERASI',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  KAMAR: 'Kamar',
  RAWAT_INAP: 'Rawat Inap',
  RAWAT_JALAN: 'Rawat Jalan',
  IGD: 'IGD',
  TINDAKAN: 'Tindakan',
  OBAT: 'Obat / Farmasi',
  LAB: 'Laboratorium',
  RADIOLOGI: 'Radiologi',
  OPERASI: 'Operasi',
}

export type TariffCategoryOption = {
  value: string
  label: string
}

export function formatTariffCategory(category: string | null | undefined): string {
  if (!category) return 'Tidak terkategori'
  return CATEGORY_LABELS[category] || category.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

export function buildTariffCategoryOptions(categories: Array<string | null | undefined>): TariffCategoryOption[] {
  const values = new Set<string>(CANONICAL_TARIFF_CATEGORIES)
  for (const category of categories) {
    const normalized = String(category || '').trim()
    if (normalized) values.add(normalized)
  }

  return Array.from(values)
    .sort((a, b) => formatTariffCategory(a).localeCompare(formatTariffCategory(b), 'id-ID'))
    .map((value) => ({ value, label: formatTariffCategory(value) }))
}
