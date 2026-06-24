import { buildMedicalEvidencePacket } from '@/lib/evidence/gateway';
import type { MedicalEvidencePacket } from '@/lib/evidence/types';

export type ReviewDecisionValue = 'APPROVE' | 'APPROVE_WITH_ADJUSTMENT' | 'REJECT' | 'REQUEST_DOCUMENTS' | 'ESCALATE_MEDICAL_ADVISOR';
export type ReviewStatusValue = 'OPEN' | 'IN_REVIEW' | 'DECIDED' | 'WAITING_DOCUMENTS' | 'ESCALATED';
export type HitlSeverity = 'INFO' | 'WARNING' | 'REVIEW_NEEDED' | 'REJECT_RECOMMENDED';

export interface HitlFinding {
  category: 'FWA' | 'POLICY' | 'TARIFF' | 'DRUG_PRICE' | 'DOCUMENT' | 'LOS' | 'DIAGNOSIS';
  severity: HitlSeverity;
  message: string;
  recommendation: string;
  amount?: number;
  details?: unknown[];
}

export interface DecisionGuidance {
  recommendedDecision: ReviewDecisionValue;
  reasonCode: string;
  title: string;
  reason: string;
  fwaLevel: string;
  fwaScore: number;
  evidenceConfidenceLabel: string;
  supportingReasons: string[];
  reviewerNextSteps: string[];
  recommendedReviewerNote: string;
}

export interface HitlPacket {
  recommendedAction: ReviewDecisionValue;
  summary: string;
  findings: HitlFinding[];
  counts: {
    fwa: number;
    policy: number;
    tariff: number;
    drugPrice: number;
    document: number;
    los: number;
    diagnosis: number;
  };
  financialImpact: {
    claimAmount: number;
    policyExcessAmount: number;
    tariffVarianceAmount: number;
    drugVarianceAmount: number;
    recommendedPayableAmount: number;
  };
  evidencePacket: MedicalEvidencePacket;
}

export interface ReviewDecisionRecord {
  id: string;
  decision: ReviewDecisionValue | string;
  reviewStatus: ReviewStatusValue | string;
  payableAmount: number | null;
  excessAmount: number | null;
  reasonCode: string | null;
  note: string | null;
  previousReviewStatus: string | null;
  nextReviewStatus: ReviewStatusValue | string;
  createdAt: string;
  reviewer?: {
    name: string | null;
    email: string;
  } | null;
}

export const REVIEW_DECISION_LABELS: Record<ReviewDecisionValue, string> = {
  APPROVE: 'Setujui',
  APPROVE_WITH_ADJUSTMENT: 'Setujui dengan koreksi',
  REJECT: 'Tolak klaim',
  REQUEST_DOCUMENTS: 'Minta dokumen tambahan',
  ESCALATE_MEDICAL_ADVISOR: 'Eskalasi medical advisor',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatusValue, string> = {
  OPEN: 'Menunggu review',
  IN_REVIEW: 'Sedang direview',
  DECIDED: 'Sudah diputuskan',
  WAITING_DOCUMENTS: 'Menunggu dokumen',
  ESCALATED: 'Eskalasi',
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getClaimAmount(inputPayload: unknown, outputResult: unknown): number {
  const input = asRecord(inputPayload);
  const output = asRecord(outputResult);
  const policyValidation = asRecord(output.policyValidation);
  const policyTotals = asRecord(policyValidation.totals);
  const directClaim = numberOrZero(input.totalClaimAmount) || numberOrZero(policyTotals.claimAmount);
  if (directClaim > 0) return directClaim;

  const procedureTotal = asArray(input.procedures).reduce((total: number, item) => total + numberOrZero(asRecord(item).totalPrice), 0);
  const medicationTotal = asArray(input.medications).reduce((total: number, item) => total + numberOrZero(asRecord(item).totalPrice), 0);
  return procedureTotal + medicationTotal;
}

function getTariffVarianceAmount(items: unknown[]): number {
  return items.reduce((total: number, item) => {
    const record = asRecord(item);
    const status = stringValue(record.status);
    if (status !== 'OVER_THRESHOLD' && status !== 'UNDER_PRICED') return total;
    const claimedTotal = numberOrZero(record.claimedTotal || record.claimedPrice || record.totalPrice);
    const expectedTotal = numberOrZero(record.expectedTotal);
    return total + Math.max(0, claimedTotal - expectedTotal);
  }, 0);
}

function getDrugVarianceAmount(items: unknown[]): number {
  return items.reduce((total: number, item) => {
    const record = asRecord(item);
    const status = stringValue(record.status);
    if (status !== 'OVER_THRESHOLD' && status !== 'OVER_PRICED' && status !== 'UNDER_PRICED') return total;
    const claimedTotal = numberOrZero(record.claimedTotal || record.totalPrice);
    const expectedTotal = numberOrZero(record.expectedTotal);
    return total + Math.max(0, claimedTotal - expectedTotal);
  }, 0);
}

function countDiagnosisFindings(outputResult: unknown): number {
  const output = asRecord(outputResult);
  const diagnosisValidation = asRecord(output.diagnosisValidation);
  const details = asArray(diagnosisValidation.details || output.diagnosisValidations);

  return details.reduce((total: number, detail) => {
    const record = asRecord(detail);
    const medicationFindings = asArray(record.medicationFindings).filter((item) => {
      const status = stringValue(asRecord(item).status);
      return status === 'REVIEW_NEEDED' || status === 'INAPPROPRIATE';
    }).length;

    return total
      + asArray(record.missingRequiredProcedures).length
      + asArray(record.irrelevantProcedures).length
      + asArray(record.unmatchedProcedures).length
      + medicationFindings;
  }, 0);
}

export function getReviewStatusFromDecision(decision: ReviewDecisionValue): ReviewStatusValue {
  switch (decision) {
    case 'REQUEST_DOCUMENTS':
      return 'WAITING_DOCUMENTS';
    case 'ESCALATE_MEDICAL_ADVISOR':
      return 'ESCALATED';
    case 'APPROVE':
    case 'APPROVE_WITH_ADJUSTMENT':
    case 'REJECT':
    default:
      return 'DECIDED';
  }
}

export function maskPatientName(name: unknown): string {
  const text = stringValue(name).trim();
  if (!text) return 'Pasien tidak diketahui';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return `${parts[0].charAt(0)}***`;
  return `${parts[0]} ${parts.slice(1).map((part) => `${part.charAt(0)}.`).join(' ')}`;
}

export function buildDecisionGuidance(inputPayload: unknown, outputResult: unknown, packet: HitlPacket): DecisionGuidance {
  const output = asRecord(outputResult);
  const fwaRisk = asRecord(output.fwaRisk);
  const policyValidation = asRecord(output.policyValidation);
  const policyFindings = asArray(policyValidation.findings);
  const documentValidation = asRecord(output.documentValidation);
  const documentDetails = asRecord(documentValidation.details);
  const losValidation = asRecord(output.losValidation);
  const fwaSignals = asArray(fwaRisk.signals);
  const fwaLevel = stringValue(fwaRisk.level) || 'LOW';
  const fwaScore = numberOrZero(fwaRisk.score);
  const hasRejectPolicy = policyFindings.some((finding) => stringValue(asRecord(finding).severity) === 'REJECT_RECOMMENDED');
  const documentMissingCount = asArray(documentDetails.missingRequiredDocuments).length;
  const losStatus = stringValue(losValidation.status);
  const losCount = ['OVERSTAY', 'UNDERSTAY', 'MISSING_ACTUAL'].includes(losStatus) ? 1 : 0;
  const diagnosisCount = countDiagnosisFindings(outputResult);
  const totalExcess = Math.max(0, packet.financialImpact.claimAmount - packet.financialImpact.recommendedPayableAmount);
  const highFwa = fwaLevel === 'CRITICAL' || fwaLevel === 'HIGH' || fwaScore >= 70;
  const mediumFwa = !highFwa && (fwaLevel === 'MEDIUM' || fwaScore >= 40);
  const lowFwa = !highFwa && !mediumFwa;

  const recommendedDecision: ReviewDecisionValue = hasRejectPolicy
    ? 'REJECT'
    : highFwa
      ? 'ESCALATE_MEDICAL_ADVISOR'
      : documentMissingCount > 0
        ? 'REQUEST_DOCUMENTS'
        : diagnosisCount > 0 || losCount > 0
          ? 'ESCALATE_MEDICAL_ADVISOR'
          : totalExcess > 0
            ? 'APPROVE_WITH_ADJUSTMENT'
            : 'APPROVE';

  const reasonCode = hasRejectPolicy
    ? 'POLICY_REJECT'
    : highFwa
      ? 'FWA_INVESTIGATION'
      : documentMissingCount > 0
        ? 'MISSING_DOCUMENT'
        : diagnosisCount > 0 || losCount > 0
          ? 'MEDICAL_REVIEW'
          : totalExcess > 0
            ? 'FINANCIAL_ADJUSTMENT'
            : lowFwa
              ? 'FWA_LOW_RISK'
              : 'CLEAN_CLAIM';

  const title = highFwa
    ? 'Tahan klaim dan eskalasi investigasi FWA'
    : mediumFwa
      ? 'Lanjutkan adjudikasi dengan kontrol reviewer'
      : 'Risiko FWA rendah, klaim dapat diproses normal';

  const reason = hasRejectPolicy
    ? 'Policy engine memberi rekomendasi reject. Keputusan final sebaiknya menolak klaim kecuali reviewer menemukan koreksi data polis yang valid.'
    : highFwa
      ? `Skor FWA ${fwaLevel} (${fwaScore}/100) menunjukkan klaim perlu ditahan dari persetujuan otomatis. Karena FWA adalah lapisan triage, keputusan final sebaiknya eskalasi untuk investigasi/medical advisor sebelum approve, koreksi, atau reject.`
      : documentMissingCount > 0
        ? `Risiko FWA ${fwaLevel} (${fwaScore}/100), tetapi ${documentMissingCount} dokumen wajib belum lengkap. Keputusan yang paling aman adalah meminta dokumen tambahan sebelum menentukan payable final.`
        : diagnosisCount > 0 || losCount > 0
          ? `Risiko FWA ${fwaLevel} (${fwaScore}/100), namun ada temuan klinis/LOS yang membutuhkan pertimbangan medis. Klaim sebaiknya dieskalasi sebelum keputusan finansial final.`
          : totalExcess > 0
            ? `Risiko FWA ${fwaLevel} (${fwaScore}/100) tidak mengharuskan eskalasi, tetapi terdapat koreksi finansial ${formatRupiah(totalExcess)}. Klaim dapat disetujui dengan adjustment sesuai evidence.`
            : `Risiko FWA ${fwaLevel} (${fwaScore}/100) rendah dan tidak ada temuan mayor yang mengurangi payable. Klaim dapat disetujui setelah reviewer memastikan dokumen pendukung konsisten.`;

  const topSignalLabels = fwaSignals
    .map((signal) => stringValue(asRecord(signal).label) || stringValue(asRecord(signal).evidence))
    .filter(Boolean)
    .slice(0, 3);
  const supportingReasons = [
    `FWA: ${fwaLevel} dengan skor ${fwaScore}/100${topSignalLabels.length > 0 ? `; sinyal utama: ${topSignalLabels.join('; ')}` : '.'}`,
    `Evidence tersedia: ${packet.evidencePacket.summary.totalEvidence} bukti (${packet.evidencePacket.summary.highConfidenceCount} high-confidence), policy sumber ${packet.evidencePacket.sourcePolicy}.`,
    packet.financialImpact.policyExcessAmount > 0 ? `Policy excess terdeteksi ${formatRupiah(packet.financialImpact.policyExcessAmount)}.` : 'Tidak ada policy excess material dari policy engine.',
    packet.financialImpact.tariffVarianceAmount + packet.financialImpact.drugVarianceAmount > 0 ? `Variance tarif/obat terdeteksi ${formatRupiah(packet.financialImpact.tariffVarianceAmount + packet.financialImpact.drugVarianceAmount)}.` : 'Tidak ada variance tarif/obat material yang mengurangi payable.',
    documentMissingCount > 0 ? `${documentMissingCount} dokumen wajib belum lengkap.` : 'Dokumen wajib tidak menunjukkan gap mayor.',
    diagnosisCount > 0 || losCount > 0 ? `${diagnosisCount} temuan klinis dan ${losCount} temuan LOS perlu review.` : 'Tidak ada temuan klinis/LOS mayor.',
  ];

  const reviewerNextSteps: string[] = recommendedDecision === 'ESCALATE_MEDICAL_ADVISOR'
    ? [
        'Jangan approve otomatis sebelum sinyal FWA/klinis ditutup oleh reviewer berwenang.',
        'Bandingkan sinyal FWA dengan evidence packet dan riwayat klaim/provider.',
        'Catat keputusan akhir: approve, koreksi payable, reject, atau minta dokumen setelah investigasi selesai.',
      ]
    : recommendedDecision === 'REQUEST_DOCUMENTS'
      ? [
          'Kirim permintaan dokumen yang belum lengkap kepada provider/peserta.',
          'Tahan payable final sampai dokumen diterima dan diverifikasi.',
          'Gunakan evidence packet untuk menentukan apakah dokumen baru menyelesaikan temuan.',
        ]
      : recommendedDecision === 'APPROVE_WITH_ADJUSTMENT'
        ? [
            'Terapkan koreksi payable sesuai policy excess dan variance tarif/obat.',
            'Pastikan item adjustment memiliki evidence lokal atau aturan polis yang jelas.',
            'Simpan reason code dan catatan reviewer untuk audit trail.',
          ]
        : recommendedDecision === 'REJECT'
          ? [
              'Pastikan alasan reject didukung aturan polis/evidence yang eksplisit.',
              'Catat pasal, rule, atau sinyal utama yang menjadi dasar penolakan.',
              'Siapkan komunikasi keputusan yang dapat diaudit.',
            ]
          : [
              'Setujui klaim bila dokumen pendukung konsisten dengan input klaim.',
              'Pastikan tidak ada evidence baru yang mengubah risiko FWA rendah.',
              'Simpan catatan singkat bahwa klaim disetujui karena tidak ada temuan mayor.',
            ];

  const recommendedReviewerNote = [
    `Rekomendasi sistem: ${REVIEW_DECISION_LABELS[recommendedDecision]}.`,
    reason,
    `Dasar: ${supportingReasons.join(' ')}`,
  ].join('\n\n');

  return {
    recommendedDecision,
    reasonCode,
    title,
    reason,
    fwaLevel,
    fwaScore,
    evidenceConfidenceLabel: `${packet.evidencePacket.summary.highConfidenceCount}/${packet.evidencePacket.summary.totalEvidence} high-confidence`,
    supportingReasons,
    reviewerNextSteps,
    recommendedReviewerNote,
  };
}

export function buildHitlPacket(inputPayload: unknown, outputResult: unknown): HitlPacket {
  const output = asRecord(outputResult);
  const fwaRisk = asRecord(output.fwaRisk);
  const policyValidation = asRecord(output.policyValidation);
  const policyTotals = asRecord(policyValidation.totals);
  const policyFindings = asArray(policyValidation.findings);
  const fwaSignals = asArray(fwaRisk.signals);
  const tariffItems = asArray(asRecord(output.tariffValidation).items);
  const drugItems = asArray(asRecord(output.drugPriceValidation).items);
  const documentValidation = asRecord(output.documentValidation);
  const documentDetails = asRecord(documentValidation.details);
  const losValidation = asRecord(output.losValidation);
  const claimAmount = getClaimAmount(inputPayload, outputResult);
  const policyExcessAmount = numberOrZero(policyTotals.excessAmount);
  const tariffVarianceAmount = getTariffVarianceAmount(tariffItems);
  const drugVarianceAmount = getDrugVarianceAmount(drugItems);
  const documentMissingCount = asArray(documentDetails.missingRequiredDocuments).length;
  const diagnosisCount = countDiagnosisFindings(outputResult);
  const losStatus = stringValue(losValidation.status);
  const losCount = ['OVERSTAY', 'UNDERSTAY', 'MISSING_ACTUAL'].includes(losStatus) ? 1 : 0;
  const problemTariffs = tariffItems.filter((item) => ['OVER_THRESHOLD', 'UNDER_PRICED', 'NOT_FOUND'].includes(stringValue(asRecord(item).status)));
  const problemDrugs = drugItems.filter((item) => ['OVER_THRESHOLD', 'OVER_PRICED', 'UNDER_PRICED', 'NOT_FOUND'].includes(stringValue(asRecord(item).status)));
  const tariffIssueCount = problemTariffs.length;
  const drugIssueCount = problemDrugs.length;
  const findings: HitlFinding[] = [];

  for (const signal of fwaSignals) {
    const record = asRecord(signal);
    const severity = stringValue(record.severity);
    findings.push({
      category: 'FWA',
      severity: severity === 'CRITICAL' ? 'REJECT_RECOMMENDED' : severity === 'HIGH' ? 'REVIEW_NEEDED' : severity === 'MEDIUM' ? 'WARNING' : 'INFO',
      message: stringValue(record.label) || 'Sinyal FWA terdeteksi.',
      recommendation: stringValue(record.recommendation) || 'Prioritaskan investigasi risiko sebelum adjudikasi final.',
      details: [stringValue(record.evidence)].filter(Boolean),
    });
  }

  for (const finding of policyFindings) {
    const record = asRecord(finding);
    const calculation = asRecord(record.calculation);
    findings.push({
      category: 'POLICY',
      severity: stringValue(record.severity) as HitlSeverity || 'WARNING',
      message: stringValue(record.message) || stringValue(record.ruleName) || 'Temuan policy membutuhkan review.',
      recommendation: stringValue(record.recommendation) || 'Review ketentuan polis sebelum keputusan final.',
      amount: numberOrZero(calculation.excessAmount),
      details: record.evidence ? asArray(record.evidence).map(e => `${asRecord(e).label}: ${asRecord(e).value}`) : undefined,
    });
  }

  if (tariffIssueCount > 0) {
    findings.push({
      category: 'TARIFF',
      severity: 'WARNING',
      message: `${tariffIssueCount} item tindakan memiliki isu tarif atau belum ada master data.`,
      recommendation: 'Validasi ulang tarif terhadap master fee schedule dan koreksi nilai payable bila perlu.',
      amount: tariffVarianceAmount,
      details: problemTariffs.map((item) => {
        const record = asRecord(item);
        const name = stringValue(record.procedureName || record.procedureCode || record.description || record.name);
        const code = stringValue(record.procedureCode || record.code);
        const status = stringValue(record.status);
        const qty = numberOrZero(record.quantity) || 1;
        const claimedUnit = numberOrZero(record.claimedUnitPrice || record.unitPrice);
        const claimedTotal = numberOrZero(record.claimedTotal || record.claimedPrice || record.totalPrice);
        const expectedUnit = numberOrZero(record.masterMaxPrice || record.expectedMaxPrice || (numberOrZero(record.expectedTotal) / qty));
        const expectedTotal = numberOrZero(record.expectedTotal || expectedUnit * qty);
        const variancePct = numberOrZero(record.variancePct);
        const varianceAmount = claimedTotal - expectedTotal;
        return {
          type: 'TARIFF',
          name,
          code,
          qty,
          status,
          claimedUnit,
          claimedTotal,
          expectedUnit,
          expectedTotal,
          variancePct,
          varianceAmount
        };
      }),
    });
  }

  if (drugIssueCount > 0) {
    findings.push({
      category: 'DRUG_PRICE',
      severity: 'WARNING',
      message: `${drugIssueCount} item obat/farmalkes memiliki isu harga atau referensi.`,
      recommendation: 'Validasi item obat/farmalkes terhadap master referensi lokal sebelum adjudikasi final.',
      amount: drugVarianceAmount,
      details: problemDrugs.map((item) => {
        const record = asRecord(item);
        const name = stringValue(record.medicationName || record.name);
        const code = stringValue(record.medicationCode || record.code);
        const status = stringValue(record.status);
        const qty = numberOrZero(record.quantity) || 1;
        const claimedUnit = numberOrZero(record.claimedUnitPrice || record.unitPrice);
        const claimedTotal = numberOrZero(record.claimedTotal || record.totalPrice);
        const expectedUnit = numberOrZero(record.marketPriceMax || record.maxReferencePrice || (numberOrZero(record.expectedTotal) / qty));
        const expectedTotal = numberOrZero(record.expectedTotal || expectedUnit * qty);
        const variancePct = numberOrZero(record.variancePct);
        const varianceAmount = claimedTotal - expectedTotal;
        return {
          type: 'DRUG',
          name,
          code,
          qty,
          status,
          claimedUnit,
          claimedTotal,
          expectedUnit,
          expectedTotal,
          variancePct,
          varianceAmount
        };
      }),
    });
  }

  if (documentMissingCount > 0) {
    findings.push({
      category: 'DOCUMENT',
      severity: 'REVIEW_NEEDED',
      message: `${documentMissingCount} dokumen wajib belum lengkap.`,
      recommendation: 'Minta dokumen tambahan sebelum klaim disetujui.',
      details: asArray(documentDetails.missingRequiredDocuments).map(d => stringValue(d)),
    });
  }

  if (losCount > 0) {
    findings.push({
      category: 'LOS',
      severity: 'WARNING',
      message: stringValue(losValidation.reason) || `Status LOS: ${losStatus}.`,
      recommendation: 'Reviewer perlu menilai justifikasi LOS terhadap pathway dan dokumen klinis.',
      details: [`Actual LOS: ${numberOrZero(losValidation.actualLos)} hari, Expected LOS: ${numberOrZero(losValidation.expectedLos)} hari`],
    });
  }

  if (diagnosisCount > 0) {
    const diagDetailsArr = asArray(asRecord(output.diagnosisValidation).details || output.diagnosisValidations);
    const diagIssues: string[] = [];

    diagDetailsArr.forEach((detail) => {
      const record = asRecord(detail);
      const diagCode = stringValue(record.diagnosisCode);
      const missing = asArray(record.missingRequiredProcedures);
      if (missing.length > 0) diagIssues.push(`[${diagCode}] ${missing.length} tindakan wajib tidak ditemukan.`);
      const irrelevant = asArray(record.irrelevantProcedures);
      if (irrelevant.length > 0) diagIssues.push(`[${diagCode}] ${irrelevant.length} tindakan tidak relevan dengan pathway.`);
      const unmatched = asArray(record.unmatchedProcedures);
      if (unmatched.length > 0) diagIssues.push(`[${diagCode}] ${unmatched.length} tindakan tidak dapat di-match.`);
      
      const medicationFindings = asArray(record.medicationFindings).filter((item) => {
        const status = stringValue(asRecord(item).status);
        return status === 'REVIEW_NEEDED' || status === 'INAPPROPRIATE';
      });
      if (medicationFindings.length > 0) diagIssues.push(`[${diagCode}] ${medicationFindings.length} obat butuh review medis.`);
    });

    findings.push({
      category: 'DIAGNOSIS',
      severity: 'REVIEW_NEEDED',
      message: `${diagnosisCount} temuan klinis membutuhkan review diagnosis, tindakan, atau obat.`,
      recommendation: 'Medical reviewer perlu memeriksa relevansi klinis episode sebelum keputusan final.',
      details: diagIssues,
    });
  }

  const totalExcess = Math.min(claimAmount, policyExcessAmount + tariffVarianceAmount + drugVarianceAmount);
  const fwaLevel = stringValue(fwaRisk.level);
  const hasRejectPolicy = policyFindings.some((finding) => stringValue(asRecord(finding).severity) === 'REJECT_RECOMMENDED');
  const recommendedAction: ReviewDecisionValue = hasRejectPolicy
    ? 'REJECT'
    : fwaLevel === 'CRITICAL' || fwaLevel === 'HIGH'
      ? 'ESCALATE_MEDICAL_ADVISOR'
      : documentMissingCount > 0
      ? 'REQUEST_DOCUMENTS'
      : diagnosisCount > 0 || losCount > 0
        ? 'ESCALATE_MEDICAL_ADVISOR'
        : totalExcess > 0
          ? 'APPROVE_WITH_ADJUSTMENT'
          : 'APPROVE';

  return {
    recommendedAction,
    summary: findings.length > 0
      ? `${findings.length} kelompok temuan membutuhkan keputusan reviewer.`
      : 'Tidak ada temuan mayor. Klaim dapat dipertimbangkan untuk disetujui.',
    findings,
    counts: {
      fwa: fwaSignals.length,
      policy: policyFindings.length,
      tariff: tariffIssueCount,
      drugPrice: drugIssueCount,
      document: documentMissingCount,
      los: losCount,
      diagnosis: diagnosisCount,
    },
    financialImpact: {
      claimAmount,
      policyExcessAmount,
      tariffVarianceAmount,
      drugVarianceAmount,
      recommendedPayableAmount: Math.max(0, claimAmount - totalExcess),
    },
    evidencePacket: buildMedicalEvidencePacket(inputPayload, outputResult),
  };
}
