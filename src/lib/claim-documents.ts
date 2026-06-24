export const REQUIRED_CLAIM_DOCUMENTS = [
  'LMA',
  'KTP',
  'KARTU ASURANSI',
  'SK KAMAR',
  'FORM KRONOLOGIS KECELAKAAN',
  'SURAT PERNYATAAN RAWAT INAP',
] as const;

export type RequiredClaimDocument = (typeof REQUIRED_CLAIM_DOCUMENTS)[number];

export interface RequiredClaimDocumentAvailabilitySpec {
  type: RequiredClaimDocument;
  flagKey: string;
  aliases: readonly string[];
  conclusion: string;
}

export const REQUIRED_CLAIM_DOCUMENT_AVAILABILITY = [
  {
    type: 'LMA',
    flagKey: 'has_lembar_medis_awal',
    aliases: ['LMA', 'LEMBAR MEDIS AWAL', 'LAPORAN MEDIS AWAL'],
    conclusion: 'Laporan Medis Awal: demam 3 hari, nyeri kepala dan mialgia, NS1 dengue positif, trombosit dan hematokrit dimonitor serial, tidak ada tanda perdarahan aktif. Rawat inap untuk monitoring cairan, tanda vital, dan edukasi tanda bahaya.',
  },
  {
    type: 'KTP',
    flagKey: 'has_ktp',
    aliases: ['KTP', 'KARTU TANDA PENDUDUK'],
    conclusion: 'Identitas sesuai KTP.',
  },
  {
    type: 'KARTU ASURANSI',
    flagKey: 'has_kartu_asuransi',
    aliases: ['KARTU ASURANSI', 'ASURANSI', 'INSURANCE CARD', 'KARTU BPJS', 'BPJS'],
    conclusion: 'Kartu Asuransi aktif.',
  },
  {
    type: 'SK KAMAR',
    flagKey: 'has_sk_kamar',
    aliases: ['SK KAMAR', 'SURAT KETERANGAN KAMAR', 'KETERANGAN KAMAR'],
    conclusion: 'Sesuai hak kelas rawat.',
  },
  {
    type: 'FORM KRONOLOGIS KECELAKAAN',
    flagKey: 'has_form_kronologis_kecelakaan',
    aliases: ['FORM KRONOLOGIS KECELAKAAN', 'KRONOLOGIS KECELAKAAN', 'FORM KRONOLOGIS'],
    conclusion: 'Kronologi jelas; kasus bukan kecelakaan.',
  },
  {
    type: 'SURAT PERNYATAAN RAWAT INAP',
    flagKey: 'has_surat_pernyataan_rawat_inap',
    aliases: ['SURAT PERNYATAAN RAWAT INAP', 'PERNYATAAN RAWAT INAP', 'SP RAWAT INAP'],
    conclusion: 'Persetujuan rawat inap ditandatangani.',
  },
] as const satisfies readonly RequiredClaimDocumentAvailabilitySpec[];

function buildDocumentAliasMap(): Record<RequiredClaimDocument, readonly string[]> {
  const aliases: Record<RequiredClaimDocument, readonly string[]> = {
    LMA: [],
    KTP: [],
    'KARTU ASURANSI': [],
    'SK KAMAR': [],
    'FORM KRONOLOGIS KECELAKAAN': [],
    'SURAT PERNYATAAN RAWAT INAP': [],
  };

  for (const document of REQUIRED_CLAIM_DOCUMENT_AVAILABILITY) {
    aliases[document.type] = document.aliases;
  }

  return aliases;
}

const DOCUMENT_ALIASES = buildDocumentAliasMap();

function normalizeDocumentName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveRequiredClaimDocument(value: string): RequiredClaimDocument | null {
  const normalized = normalizeDocumentName(value);

  for (const requiredDocument of REQUIRED_CLAIM_DOCUMENTS) {
    const aliases = DOCUMENT_ALIASES[requiredDocument];
    if (aliases.some((alias) => normalizeDocumentName(alias) === normalized)) {
      return requiredDocument;
    }
  }

  return null;
}

export function getMissingRequiredClaimDocuments(documentTypes: string[]): RequiredClaimDocument[] {
  const provided = new Set(
    documentTypes
      .map((documentType) => resolveRequiredClaimDocument(documentType))
      .filter((documentType): documentType is RequiredClaimDocument => Boolean(documentType)),
  );

  return REQUIRED_CLAIM_DOCUMENTS.filter((requiredDocument) => !provided.has(requiredDocument));
}
