export const REQUIRED_CLAIM_DOCUMENTS = [
  'LMA',
  'KTP',
  'KARTU ASURANSI',
  'SK KAMAR',
  'FORM KRONOLOGIS KECELAKAAN',
  'SURAT PERNYATAAN RAWAT INAP',
] as const;

export type RequiredClaimDocument = (typeof REQUIRED_CLAIM_DOCUMENTS)[number];

const DOCUMENT_ALIASES: Record<RequiredClaimDocument, string[]> = {
  LMA: ['LMA'],
  KTP: ['KTP', 'KARTU TANDA PENDUDUK'],
  'KARTU ASURANSI': ['KARTU ASURANSI', 'ASURANSI', 'INSURANCE CARD', 'KARTU BPJS', 'BPJS'],
  'SK KAMAR': ['SK KAMAR', 'SURAT KETERANGAN KAMAR', 'KETERANGAN KAMAR'],
  'FORM KRONOLOGIS KECELAKAAN': [
    'FORM KRONOLOGIS KECELAKAAN',
    'KRONOLOGIS KECELAKAAN',
    'FORM KRONOLOGIS',
  ],
  'SURAT PERNYATAAN RAWAT INAP': [
    'SURAT PERNYATAAN RAWAT INAP',
    'PERNYATAAN RAWAT INAP',
    'SP RAWAT INAP',
  ],
};

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
