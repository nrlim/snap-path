export type FwaRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FwaSignalSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FwaSignalCategory = 'DUPLICATE' | 'UTILIZATION' | 'FINANCIAL' | 'CLINICAL' | 'DOCUMENT' | 'POLICY' | 'PROVIDER_PATTERN';

export interface FwaRiskSignal {
  code: string;
  label: string;
  category: FwaSignalCategory;
  severity: FwaSignalSeverity;
  scoreImpact: number;
  evidence: string;
  recommendation: string;
}

export interface FwaRiskOutput {
  level: FwaRiskLevel;
  score: number;
  summary: string;
  signals: FwaRiskSignal[];
  evidenceSummary: {
    similarClaimCount: number;
    patientRecentClaimCount: number;
    providerAverageClaimAmount: number | null;
    providerMedianClaimAmount: number | null;
    providerHighRiskClaimCount: number;
  };
  isReviewRecommended: boolean;
}

export interface HistoricalClaimSnapshot {
  inputPayload: unknown;
  outputResult?: unknown | null;
  createdAt: Date | string;
}

export interface FwaHistoryContext {
  similarClaimCount: number;
  patientRecentClaimCount: number;
  providerAverageClaimAmount: number | null;
  providerMedianClaimAmount: number | null;
  providerHighRiskClaimCount: number;
}

export interface FwaRiskInput {
  payload: unknown;
  outputResult: unknown;
  history?: FwaHistoryContext;
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

function normalizeText(value: unknown): string {
  return stringValue(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function getPatientKey(payload: unknown): string {
  const input = asRecord(payload);
  const patient = asRecord(input.patient);
  const extra = asRecord(input.extra);
  const identifier = asArray(patient.identifier)
    .map((item) => stringValue(asRecord(item).value))
    .find(Boolean);

  const insuranceNumber = stringValue(extra.insuranceNumber);
  const birthDate = stringValue(patient.birthDate);
  const name = normalizeText(patient.name);

  if (identifier && !identifier.includes('REDACTED')) return `id:${identifier}`;
  if (insuranceNumber && !insuranceNumber.includes('REDACTED')) return `ins:${insuranceNumber}`;
  if (name && birthDate) return `demo:${name}:${birthDate}`;
  return '';
}

function getDiagnosisCodes(payload: unknown): Set<string> {
  return new Set(asArray(asRecord(payload).diagnoses)
    .map((item) => stringValue(asRecord(item).code).toUpperCase())
    .filter(Boolean));
}

function getClaimAmount(payload: unknown, outputResult?: unknown | null): number {
  const input = asRecord(payload);
  const output = asRecord(outputResult);
  const policyTotals = asRecord(asRecord(output.policyValidation).totals);
  const explicitTotal = numberOrZero(input.totalClaimAmount) || numberOrZero(policyTotals.claimAmount);
  if (explicitTotal > 0) return explicitTotal;

  const procedureTotal = asArray(input.procedures).reduce<number>((total, item) => total + numberOrZero(asRecord(item).totalPrice), 0);
  const medicationTotal = asArray(input.medications).reduce<number>((total, item) => total + numberOrZero(asRecord(item).totalPrice), 0);
  return procedureTotal + medicationTotal;
}

function countItemsByStatus(items: unknown[], statuses: string[]): number {
  return items.filter((item) => statuses.includes(stringValue(asRecord(item).status))).length;
}

function getVarianceAmount(items: unknown[]): number {
  return items.reduce<number>((total, item) => {
    const record = asRecord(item);
    const claimedTotal = numberOrZero(record.claimedTotal || record.claimedPrice || record.totalPrice);
    const expectedTotal = numberOrZero(record.expectedTotal);
    return total + Math.max(0, claimedTotal - expectedTotal);
  }, 0);
}

function getPolicyExcess(outputResult: unknown): number {
  return numberOrZero(asRecord(asRecord(asRecord(outputResult).policyValidation).totals).excessAmount);
}

function getLosVariance(outputResult: unknown): number {
  const losValidation = asRecord(asRecord(outputResult).losValidation);
  return Math.abs(numberOrZero(losValidation.varianceDays));
}

function getMissingDocumentCount(outputResult: unknown): number {
  const details = asRecord(asRecord(asRecord(outputResult).documentValidation).details);
  return asArray(details.missingRequiredDocuments).length;
}

function countDiagnosisFindings(outputResult: unknown): number {
  const output = asRecord(outputResult);
  const details = asArray(asRecord(output.diagnosisValidation).details || output.diagnosisValidations);
  return details.reduce<number>((total, detail) => {
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

function resolveLevel(score: number): FwaRiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

function resolveSeverity(scoreImpact: number): FwaSignalSeverity {
  if (scoreImpact >= 30) return 'CRITICAL';
  if (scoreImpact >= 20) return 'HIGH';
  if (scoreImpact >= 10) return 'MEDIUM';
  return 'LOW';
}

function addSignal(signals: FwaRiskSignal[], signal: Omit<FwaRiskSignal, 'severity'>): void {
  signals.push({ ...signal, severity: resolveSeverity(signal.scoreImpact) });
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((first, second) => first - second);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return Math.round(sorted[middle]);
}

function hasOverlappingDiagnosis(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) return false;
  for (const code of first) if (second.has(code)) return true;
  return false;
}

export function buildFwaHistoryContext(payload: unknown, historicalClaims: HistoricalClaimSnapshot[]): FwaHistoryContext {
  const patientKey = getPatientKey(payload);
  const currentDiagnoses = getDiagnosisCodes(payload);
  const currentAmount = getClaimAmount(payload);
  const now = new Date();
  const providerAmounts = historicalClaims.map((claim) => getClaimAmount(claim.inputPayload, claim.outputResult)).filter((amount) => amount > 0);

  let similarClaimCount = 0;
  let patientRecentClaimCount = 0;
  let providerHighRiskClaimCount = 0;

  for (const claim of historicalClaims) {
    const claimDate = new Date(claim.createdAt);
    const ageDays = Math.max(0, Math.floor((now.getTime() - claimDate.getTime()) / 86_400_000));
    const samePatient = patientKey !== '' && getPatientKey(claim.inputPayload) === patientKey;
    if (samePatient && ageDays <= 90) patientRecentClaimCount += 1;

    const claimAmount = getClaimAmount(claim.inputPayload, claim.outputResult);
    const amountDelta = currentAmount > 0 ? Math.abs(claimAmount - currentAmount) / currentAmount : 1;
    if (samePatient && ageDays <= 30 && amountDelta <= 0.15 && hasOverlappingDiagnosis(currentDiagnoses, getDiagnosisCodes(claim.inputPayload))) {
      similarClaimCount += 1;
    }

    const riskLevel = stringValue(asRecord(asRecord(claim.outputResult).fwaRisk).level);
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') providerHighRiskClaimCount += 1;
  }

  const totalAmount = providerAmounts.reduce((total, amount) => total + amount, 0);
  return {
    similarClaimCount,
    patientRecentClaimCount,
    providerAverageClaimAmount: providerAmounts.length > 0 ? Math.round(totalAmount / providerAmounts.length) : null,
    providerMedianClaimAmount: median(providerAmounts),
    providerHighRiskClaimCount,
  };
}

export function evaluateFwaRisk(input: FwaRiskInput): FwaRiskOutput {
  const output = asRecord(input.outputResult);
  const tariffItems = asArray(asRecord(output.tariffValidation).items);
  const drugItems = asArray(asRecord(output.drugPriceValidation).items);
  const claimAmount = getClaimAmount(input.payload, input.outputResult);
  const history = input.history || {
    similarClaimCount: 0,
    patientRecentClaimCount: 0,
    providerAverageClaimAmount: null,
    providerMedianClaimAmount: null,
    providerHighRiskClaimCount: 0,
  };
  const signals: FwaRiskSignal[] = [];

  if (history.similarClaimCount > 0) {
    addSignal(signals, {
      code: 'DUPLICATE_SIMILAR_CLAIM',
      label: 'Klaim mirip berulang',
      category: 'DUPLICATE',
      scoreImpact: Math.min(35, 22 + history.similarClaimCount * 6),
      evidence: `${history.similarClaimCount} klaim mirip ditemukan dalam 30 hari untuk pasien/diagnosis/amount yang serupa.`,
      recommendation: 'Bandingkan episode, tanggal layanan, dan bukti dokumen untuk menghindari duplicate reimbursement.',
    });
  }

  if (history.patientRecentClaimCount >= 3) {
    addSignal(signals, {
      code: 'PATIENT_FREQUENT_CLAIMS',
      label: 'Frekuensi klaim pasien tinggi',
      category: 'UTILIZATION',
      scoreImpact: Math.min(24, 10 + history.patientRecentClaimCount * 3),
      evidence: `${history.patientRecentClaimCount} klaim pasien terdeteksi dalam 90 hari terakhir.`,
      recommendation: 'Review pola utilisasi pasien dan cek apakah episode terkait kondisi kronis atau klaim berulang tidak wajar.',
    });
  }

  const benchmark = history.providerMedianClaimAmount || history.providerAverageClaimAmount;
  if (benchmark && claimAmount > benchmark * 1.8) {
    const ratio = claimAmount / benchmark;
    addSignal(signals, {
      code: 'HIGH_AMOUNT_PROVIDER_BENCHMARK',
      label: 'Nilai klaim di atas benchmark provider',
      category: 'FINANCIAL',
      scoreImpact: ratio >= 3 ? 28 : 18,
      evidence: `Total klaim ${Math.round(ratio * 10) / 10}x di atas median/rata-rata historis provider.`,
      recommendation: 'Prioritaskan review biaya terbesar, komponen kamar/tindakan, dan koreksi payable bila ada variance.',
    });
  } else if (claimAmount >= 15_000_000) {
    addSignal(signals, {
      code: 'HIGH_ABSOLUTE_CLAIM_AMOUNT',
      label: 'Nilai klaim besar',
      category: 'FINANCIAL',
      scoreImpact: claimAmount >= 30_000_000 ? 22 : 12,
      evidence: `Total klaim mencapai Rp ${new Intl.NumberFormat('id-ID').format(claimAmount)}.`,
      recommendation: 'Lakukan sampling review mendalam untuk klaim bernilai besar sebelum approval final.',
    });
  }

  const tariffIssueCount = countItemsByStatus(tariffItems, ['OVER_THRESHOLD', 'UNDER_PRICED', 'NOT_FOUND']);
  const tariffVariance = getVarianceAmount(tariffItems.filter((item) => ['OVER_THRESHOLD', 'UNDER_PRICED'].includes(stringValue(asRecord(item).status))));
  if (tariffIssueCount >= 2 || tariffVariance > 1_000_000) {
    addSignal(signals, {
      code: 'TARIFF_VARIANCE_CLUSTER',
      label: 'Cluster variance tarif',
      category: 'FINANCIAL',
      scoreImpact: tariffVariance > 3_000_000 ? 24 : 14,
      evidence: `${tariffIssueCount} item tarif bermasalah dengan estimasi variance Rp ${new Intl.NumberFormat('id-ID').format(tariffVariance)}.`,
      recommendation: 'Review item tindakan berbiaya tinggi dan bandingkan dengan fee schedule provider.',
    });
  }

  const drugIssueCount = countItemsByStatus(drugItems, ['OVER_THRESHOLD', 'OVER_PRICED', 'UNDER_PRICED', 'NOT_FOUND']);
  const drugVariance = getVarianceAmount(drugItems.filter((item) => ['OVER_THRESHOLD', 'OVER_PRICED', 'UNDER_PRICED'].includes(stringValue(asRecord(item).status))));
  if (drugIssueCount >= 2 || drugVariance > 750_000) {
    addSignal(signals, {
      code: 'DRUG_PRICE_VARIANCE_CLUSTER',
      label: 'Cluster variance obat/farmalkes',
      category: 'FINANCIAL',
      scoreImpact: drugVariance > 2_000_000 ? 22 : 12,
      evidence: `${drugIssueCount} item obat/farmalkes bermasalah dengan estimasi variance Rp ${new Intl.NumberFormat('id-ID').format(drugVariance)}.`,
      recommendation: 'Cek obat/farmalkes high-cost, substitusi, dan kemungkinan markup terhadap master referensi.',
    });
  }

  const policyExcess = getPolicyExcess(input.outputResult);
  if (policyExcess > 0 && claimAmount > 0) {
    const ratio = policyExcess / claimAmount;
    addSignal(signals, {
      code: 'BENEFIT_EXCESS_RATIO',
      label: 'Proporsi excess benefit tinggi',
      category: 'POLICY',
      scoreImpact: ratio >= 0.25 ? 24 : 12,
      evidence: `Estimasi excess policy ${Math.round(ratio * 100)}% dari total klaim.`,
      recommendation: 'Pastikan rule limit, deductible, co-pay, dan entitlement diterapkan sebelum pembayaran.',
    });
  }

  const missingDocumentCount = getMissingDocumentCount(input.outputResult);
  if (missingDocumentCount > 0) {
    addSignal(signals, {
      code: 'MISSING_MANDATORY_DOCUMENTS',
      label: 'Dokumen wajib tidak lengkap',
      category: 'DOCUMENT',
      scoreImpact: Math.min(22, 8 + missingDocumentCount * 4),
      evidence: `${missingDocumentCount} dokumen wajib belum tersedia.`,
      recommendation: 'Tahan approval atau minta dokumen tambahan untuk mengurangi risiko klaim tidak terverifikasi.',
    });
  }

  const losVariance = getLosVariance(input.outputResult);
  if (losVariance >= 2) {
    addSignal(signals, {
      code: 'LOS_OUTLIER',
      label: 'LOS outlier',
      category: 'CLINICAL',
      scoreImpact: losVariance >= 4 ? 22 : 12,
      evidence: `LOS berbeda ${losVariance} hari dari standar/estimasi pathway.`,
      recommendation: 'Review justifikasi klinis, komplikasi, dan progress note sebelum keputusan akhir.',
    });
  }

  const diagnosisFindingCount = countDiagnosisFindings(input.outputResult);
  if (diagnosisFindingCount > 0) {
    addSignal(signals, {
      code: 'CLINICAL_RELEVANCE_FINDINGS',
      label: 'Temuan relevansi klinis',
      category: 'CLINICAL',
      scoreImpact: Math.min(26, 10 + diagnosisFindingCount * 3),
      evidence: `${diagnosisFindingCount} temuan diagnosis/tindakan/obat membutuhkan review medis.`,
      recommendation: 'Eskalasi ke medical reviewer bila tindakan atau obat tidak jelas relevansinya terhadap episode klinis.',
    });
  }

  if (history.providerHighRiskClaimCount >= 3) {
    addSignal(signals, {
      code: 'PROVIDER_RECENT_HIGH_RISK_PATTERN',
      label: 'Pola risiko provider',
      category: 'PROVIDER_PATTERN',
      scoreImpact: Math.min(22, 8 + history.providerHighRiskClaimCount * 3),
      evidence: `${history.providerHighRiskClaimCount} klaim high-risk/critical historis ditemukan pada provider ini.`,
      recommendation: 'Pertimbangkan provider-level audit sampling untuk pola billing dan coding.',
    });
  }

  const score = Math.min(100, signals.reduce((total, signal) => total + signal.scoreImpact, 0));
  const level = resolveLevel(score);
  const sortedSignals = signals.sort((first, second) => second.scoreImpact - first.scoreImpact);

  return {
    level,
    score,
    summary: sortedSignals.length > 0
      ? `${sortedSignals.length} sinyal FWA terdeteksi. Level risiko ${level} dengan skor ${score}/100.`
      : 'Tidak ada sinyal FWA signifikan berdasarkan rule deterministic saat ini.',
    signals: sortedSignals,
    evidenceSummary: history,
    isReviewRecommended: level === 'HIGH' || level === 'CRITICAL',
  };
}
