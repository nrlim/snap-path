import type { MedicalEvidenceCategory, MedicalEvidenceConfidence, MedicalEvidenceItem, MedicalEvidencePacket, MedicalEvidenceSource, MedicalSourceReference } from './types';

interface EvidenceDraft {
  topic: string;
  category: MedicalEvidenceCategory;
  source: MedicalEvidenceSource;
  title: string;
  summary: string;
  evidenceText: string;
  recommendation: string;
  confidence: MedicalEvidenceConfidence;
  relatedCode?: string | null;
  amount?: number | null;
  accessedAt?: string | null;
  references?: MedicalSourceReference[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function confidenceFromSeverity(value: unknown): MedicalEvidenceConfidence {
  const severity = stringValue(value).toUpperCase();
  if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'REJECT_RECOMMENDED') return 'HIGH';
  if (severity === 'MEDIUM' || severity === 'REVIEW_NEEDED' || severity === 'WARNING') return 'MEDIUM';
  return 'LOW';
}

function normalizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'evidence';
}

function addEvidence(items: EvidenceDraft[], draft: EvidenceDraft): void {
  const hasText = draft.title || draft.summary || draft.evidenceText;
  if (!hasText) return;
  items.push(draft);
}

function getEvidenceReferences(value: unknown): MedicalSourceReference[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const record = asRecord(item);
    const sourceType = stringValue(record.sourceType) as MedicalSourceReference['sourceType'];
    const strength: MedicalSourceReference['strength'] = record.strength === 'HIGH' ? 'HIGH' : record.strength === 'LOW' ? 'LOW' : 'MEDIUM';
    return {
      sourceType: sourceType || 'OTHER',
      title: stringValue(record.title) || 'Referensi medis',
      organization: stringValue(record.organization) || null,
      year: stringValue(record.year) || null,
      url: stringValue(record.url) || null,
      identifier: stringValue(record.identifier) || null,
      relevance: stringValue(record.relevance) || 'Mendukung reasoning klinis diagnosis-tindakan.',
      strength,
    };
  }).filter((reference) => reference.title.length > 0 && reference.relevance.length > 0);
}

function formatEvidenceReferences(references: MedicalSourceReference[]): string {
  if (references.length === 0) return '';
  return references.map((reference) => {
    const metadata = [reference.organization, reference.year, reference.identifier, reference.url].filter(Boolean).join(' · ');
    return `${reference.sourceType}: ${reference.title}${metadata ? ` (${metadata})` : ''} — ${reference.relevance}`;
  }).join(' | ');
}

function getTariffEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const tariffItems = asArray(asRecord(output.tariffValidation).items);
  for (const item of tariffItems) {
    const record = asRecord(item);
    const status = stringValue(record.status);
    if (!['OVER_THRESHOLD', 'UNDER_PRICED', 'NOT_FOUND'].includes(status)) continue;

    const name = stringValue(record.description || record.procedureName || record.name || record.code) || 'Tindakan';
    const code = stringValue(record.code || record.procedureCode);
    const claimedTotal = numberOrZero(record.claimedTotal || record.claimedPrice || record.totalPrice);
    const expectedTotal = numberOrZero(record.expectedTotal);
    const varianceAmount = Math.max(0, claimedTotal - expectedTotal);
    const referenceText = status === 'NOT_FOUND'
      ? 'Tidak ada referensi aktif pada master fee schedule lokal untuk provider terkait.'
      : `Klaim ${formatRupiah(claimedTotal)} dibanding referensi maksimal lokal ${formatRupiah(expectedTotal)}.`;

    addEvidence(items, {
      topic: 'Validasi tarif tindakan',
      category: 'TARIFF',
      source: 'LOCAL_TARIFF_MASTER',
      title: `${name}${code ? ` (${code})` : ''}`,
      summary: status === 'NOT_FOUND' ? 'Item tindakan belum memiliki referensi master tarif lokal.' : `Status tarif ${status} terhadap master provider lokal.`,
      evidenceText: `${referenceText} Catatan validator: ${stringValue(record.notes) || '-'}`,
      recommendation: status === 'NOT_FOUND' ? 'Lengkapi atau verifikasi master tarif sebelum adjudikasi final.' : 'Gunakan batas master fee schedule lokal untuk koreksi payable bila diperlukan.',
      confidence: status === 'NOT_FOUND' ? 'MEDIUM' : 'HIGH',
      relatedCode: code || null,
      amount: varianceAmount > 0 ? varianceAmount : null,
    });
  }
}

function getDrugEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const drugItems = asArray(asRecord(output.drugPriceValidation).items);
  for (const item of drugItems) {
    const record = asRecord(item);
    const status = stringValue(record.status);
    if (!['OVER_THRESHOLD', 'OVER_PRICED', 'UNDER_PRICED', 'NOT_FOUND'].includes(status)) continue;

    const name = stringValue(record.name || record.medicationName) || 'Obat/farmalkes';
    const resolvedProduct = stringValue(record.resolvedProductName);
    const claimedTotal = numberOrZero(record.claimedTotal || record.totalPrice);
    const expectedTotal = numberOrZero(record.expectedTotal);
    const varianceAmount = Math.max(0, claimedTotal - expectedTotal);
    const sourceList = asArray(record.sources).map((source) => stringValue(source)).filter(Boolean);
    const referencedAt = stringValue(record.referencedAt);
    const referenceText = status === 'NOT_FOUND'
      ? 'Tidak ada referensi harga aktif pada master obat/farmalkes lokal.'
      : `Klaim ${formatRupiah(claimedTotal)} dibanding referensi lokal ${formatRupiah(expectedTotal)}. Produk referensi: ${resolvedProduct || name}.`;

    addEvidence(items, {
      topic: 'Validasi harga obat/farmalkes',
      category: 'DRUG_PRICE',
      source: 'LOCAL_DRUG_MASTER',
      title: name,
      summary: status === 'NOT_FOUND' ? 'Item obat/farmalkes belum memiliki referensi harga lokal.' : `Status harga ${status} terhadap master referensi lokal.`,
      evidenceText: `${referenceText} Sumber master: ${sourceList.length > 0 ? sourceList.join(', ') : '-'}.`,
      recommendation: status === 'NOT_FOUND' ? 'Review manual item yang belum memiliki referensi sebelum pembayaran.' : 'Gunakan referensi harga master lokal untuk menentukan koreksi payable.',
      confidence: status === 'NOT_FOUND' ? 'MEDIUM' : 'HIGH',
      relatedCode: stringValue(record.genericName) || null,
      amount: varianceAmount > 0 ? varianceAmount : null,
      accessedAt: referencedAt || null,
    });
  }
}

function getPolicyEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const policyFindings = asArray(asRecord(output.policyValidation).findings);
  for (const finding of policyFindings) {
    const record = asRecord(finding);
    const calculation = asRecord(record.calculation);
    const evidenceText = asArray(record.evidence)
      .map((evidence) => {
        const evidenceRecord = asRecord(evidence);
        const label = stringValue(evidenceRecord.label);
        const value = stringValue(evidenceRecord.value);
        return label || value ? `${label}: ${value}` : '';
      })
      .filter(Boolean)
      .join('; ');

    addEvidence(items, {
      topic: 'Ketentuan polis dan benefit',
      category: 'POLICY',
      source: 'POLICY_RULE',
      title: stringValue(record.ruleName) || stringValue(record.ruleCode) || 'Rule polis',
      summary: stringValue(record.message) || 'Temuan policy membutuhkan review.',
      evidenceText: evidenceText || 'Rule policy dievaluasi dari konfigurasi lokal CONSUL.',
      recommendation: stringValue(record.recommendation) || 'Terapkan ketentuan polis sebelum keputusan final.',
      confidence: confidenceFromSeverity(record.severity),
      relatedCode: stringValue(record.ruleCode) || null,
      amount: numberOrZero(calculation.excessAmount) || null,
    });
  }
}

function getFwaEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const signals = asArray(asRecord(output.fwaRisk).signals);
  for (const signal of signals) {
    const record = asRecord(signal);
    addEvidence(items, {
      topic: 'FWA risk triage',
      category: 'FWA',
      source: 'FWA_ENGINE',
      title: stringValue(record.label) || stringValue(record.code) || 'Sinyal FWA',
      summary: `Sinyal deterministic ${stringValue(record.severity) || 'LOW'} dengan impact ${numberOrZero(record.scoreImpact)}/100.`,
      evidenceText: stringValue(record.evidence) || 'Evidence FWA berasal dari output validasi klaim dan histori lokal.',
      recommendation: stringValue(record.recommendation) || 'Prioritaskan review risiko sebelum approval final.',
      confidence: confidenceFromSeverity(record.severity),
      relatedCode: stringValue(record.code) || null,
    });
  }
}

function getDocumentEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const details = asRecord(asRecord(output.documentValidation).details);
  const missingDocuments = asArray(details.missingRequiredDocuments).map((item) => stringValue(item)).filter(Boolean);
  if (missingDocuments.length === 0) return;

  addEvidence(items, {
    topic: 'Kelengkapan dokumen klaim',
    category: 'DOCUMENT',
    source: 'CLAIM_DOCUMENT',
    title: 'Dokumen wajib belum lengkap',
    summary: `${missingDocuments.length} dokumen wajib belum tersedia pada payload klaim.`,
    evidenceText: missingDocuments.join(', '),
    recommendation: 'Minta dokumen tambahan sebelum klaim disetujui.',
    confidence: 'HIGH',
  });
}

function getLosEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const losValidation = asRecord(output.losValidation);
  const status = stringValue(losValidation.status);
  if (!['OVERSTAY', 'UNDERSTAY', 'MISSING_ACTUAL'].includes(status)) return;

  const actualLos = numberOrZero(losValidation.actualLos);
  const expectedLos = numberOrZero(losValidation.expectedLos);
  addEvidence(items, {
    topic: 'Length of stay',
    category: 'LOS',
    source: 'LOS_VALIDATOR',
    title: `Status LOS ${status}`,
    summary: stringValue(losValidation.reason) || 'LOS membutuhkan review terhadap standar pathway lokal.',
    evidenceText: `LOS aktual ${actualLos} hari; LOS referensi ${expectedLos} hari; variance ${numberOrZero(losValidation.varianceDays)} hari.`,
    recommendation: 'Cek justifikasi klinis, komplikasi, dan progress note sebelum keputusan final.',
    confidence: 'MEDIUM',
  });
}

function getDiagnosisEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const details = asArray(asRecord(output.diagnosisValidation).details || output.diagnosisValidations);
  for (const detail of details) {
    const record = asRecord(detail);
    const diagnosisCode = stringValue(record.diagnosisCode);
    const diagnosisName = stringValue(record.diagnosisName);
    const missing = asArray(record.missingRequiredProcedures).map((item) => stringValue(item)).filter(Boolean);
    const irrelevant = asArray(record.irrelevantProcedures).map((item) => {
      const itemRecord = asRecord(item);
      return stringValue(itemRecord.procedureName || itemRecord.procedureCode || item);
    }).filter(Boolean);
    const unmatched = asArray(record.unmatchedProcedures).map((item) => stringValue(item)).filter(Boolean);
    const medicationFindings = asArray(record.medicationFindings)
      .map((item) => asRecord(item))
      .filter((item) => ['REVIEW_NEEDED', 'INAPPROPRIATE'].includes(stringValue(item.status)));
    const procedureFindings = asArray(record.procedureFindings).map((item) => asRecord(item));
    const diagnosisReferences = getEvidenceReferences(record.evidenceReferences);
    const findingReferences = [
      ...procedureFindings.flatMap((finding) => getEvidenceReferences(finding.evidenceReferences)),
      ...medicationFindings.flatMap((finding) => getEvidenceReferences(finding.evidenceReferences)),
    ];
    const references = Array.from(new Map([...diagnosisReferences, ...findingReferences].map((reference) => [
      `${reference.sourceType}:${reference.title}:${reference.identifier || reference.url || ''}`,
      reference,
    ])).values()).slice(0, 8);
    const referenceText = formatEvidenceReferences(references);
    const clinicalEvidenceSummary = stringValue(record.clinicalEvidenceSummary);
    const evidenceRetrievalStatus = stringValue(record.evidenceRetrievalStatus);

    const findingParts = [
      missing.length > 0 ? `${missing.length} tindakan wajib belum ditemukan` : '',
      irrelevant.length > 0 ? `${irrelevant.length} tindakan perlu review relevansi` : '',
      unmatched.length > 0 ? `${unmatched.length} tindakan tidak match pathway` : '',
      medicationFindings.length > 0 ? `${medicationFindings.length} obat perlu review klinis` : '',
    ].filter(Boolean);
    if (findingParts.length === 0) continue;

    const medicationText = medicationFindings
      .map((item) => `${stringValue(item.medicationName || item.genericName)}: ${stringValue(item.reason)}`)
      .filter(Boolean);

    addEvidence(items, {
      topic: 'Relevansi klinis diagnosis',
      category: 'DIAGNOSIS',
      source: references.length > 0 ? 'AI_MEDICAL_REASONING' : 'DIAGNOSIS_VALIDATOR',
      title: `${diagnosisCode || 'Diagnosis'}${diagnosisName ? ` — ${diagnosisName}` : ''}`,
      summary: findingParts.join('; '),
      evidenceText: [
        missing.length > 0 ? `Missing required: ${missing.join(', ')}` : '',
        irrelevant.length > 0 ? `Irrelevant: ${irrelevant.join(', ')}` : '',
        unmatched.length > 0 ? `Unmatched: ${unmatched.join(', ')}` : '',
        medicationText.length > 0 ? `Obat: ${medicationText.join('; ')}` : '',
        clinicalEvidenceSummary ? `Ringkasan evidence: ${clinicalEvidenceSummary}` : '',
        evidenceRetrievalStatus ? `Status evidence: ${evidenceRetrievalStatus}` : '',
        referenceText ? `Referensi: ${referenceText}` : '',
      ].filter(Boolean).join(' | '),
      recommendation: 'Medical reviewer perlu memeriksa relevansi klinis episode terhadap diagnosis dan pathway internal.',
      confidence: references.some((reference) => reference.strength === 'HIGH') ? 'HIGH' : 'MEDIUM',
      relatedCode: diagnosisCode || null,
      references,
    });
  }
}

function getPathwayEvidence(output: Record<string, unknown>, items: EvidenceDraft[]): void {
  const pathway = asRecord(output.clinicalPathway);
  const diagnosisCode = stringValue(pathway.diagnosisCode);
  if (!diagnosisCode) return;

  addEvidence(items, {
    topic: 'Clinical pathway internal',
    category: 'PATHWAY',
    source: 'INTERNAL_PATHWAY',
    title: `Pathway ${diagnosisCode}`,
    summary: `Pathway versi ${stringValue(pathway.pathwayVersion) || '-'} dengan estimasi LOS ${numberOrZero(pathway.estimatedLos)} hari.`,
    evidenceText: `Generated by ${stringValue(pathway.generatedBy) || '-'}; confidence ${numberOrZero(pathway.confidence)}; sumber evidence adalah pathway internal hasil validasi CONSUL.`,
    recommendation: 'Gunakan pathway internal sebagai pembanding klinis, bukan sebagai dasar tunggal penolakan otomatis.',
    confidence: numberOrZero(pathway.confidence) >= 0.8 ? 'HIGH' : 'MEDIUM',
    relatedCode: diagnosisCode,
  });
}

function isExistingEvidencePacket(value: unknown): value is MedicalEvidencePacket {
  const record = asRecord(value);
  return (record.sourcePolicy === 'LOCAL_ONLY' || record.sourcePolicy === 'LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE') && Array.isArray(record.items);
}

export function buildMedicalEvidencePacket(inputPayload: unknown, outputResult: unknown): MedicalEvidencePacket {
  const existingOutput = asRecord(outputResult);
  if (isExistingEvidencePacket(existingOutput.evidencePacket)) return existingOutput.evidencePacket;

  const generatedAt = new Date().toISOString();
  const output = asRecord(outputResult);
  const drafts: EvidenceDraft[] = [];
  void inputPayload;

  getFwaEvidence(output, drafts);
  getPolicyEvidence(output, drafts);
  getTariffEvidence(output, drafts);
  getDrugEvidence(output, drafts);
  getDocumentEvidence(output, drafts);
  getLosEvidence(output, drafts);
  getDiagnosisEvidence(output, drafts);
  getPathwayEvidence(output, drafts);

  const items: MedicalEvidenceItem[] = drafts.map((draft, index) => ({
    id: `${normalizeIdPart(draft.category)}-${normalizeIdPart(draft.relatedCode || draft.title)}-${index + 1}`,
    topic: draft.topic,
    category: draft.category,
    source: draft.source,
    title: draft.title,
    summary: draft.summary,
    evidenceText: draft.evidenceText,
    recommendation: draft.recommendation,
    confidence: draft.confidence,
    accessedAt: draft.accessedAt || generatedAt,
    relatedCode: draft.relatedCode ?? null,
    amount: draft.amount ?? null,
    references: draft.references,
  }));
  const categories = Array.from(new Set(items.map((item) => item.category)));
  const hasDiagnosisExternalEvidence = items.some((item) => item.category === 'DIAGNOSIS' && item.references && item.references.length > 0);

  return {
    generatedAt,
    sourcePolicy: hasDiagnosisExternalEvidence ? 'LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE' : 'LOCAL_ONLY',
    summary: {
      totalEvidence: items.length,
      highConfidenceCount: items.filter((item) => item.confidence === 'HIGH').length,
      categories,
    },
    items,
  };
}
