import prisma from '@/lib/db';
import type { PolicyValidationOutput } from '@/lib/ai/types';

interface ClaimDiagnosis {
  code?: string | null;
  name?: string | null;
  type?: string | null;
}

interface ClaimMedication {
  name?: string | null;
  genericName?: string | null;
  dosage?: string | null;
  category?: string | null;
  itemType?: string | null;
  totalPrice?: number | null;
}

interface ClaimProcedure {
  code?: string | null;
  name?: string | null;
  category?: string | null;
  totalPrice?: number | null;
}

interface ClaimPayload {
  clientId?: string | null;
  policyProductCode?: string | null;
  policy?: {
    productCode?: string | null;
    planCode?: string | null;
  } | null;
  diagnoses?: ClaimDiagnosis[];
  medications?: ClaimMedication[];
  procedures?: ClaimProcedure[];
  totalClaimAmount?: number | null;
  policyRules?: PolicyRuleInput[];
}

interface PolicyRuleInput {
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  targetType?: string | null;
  targetCode?: string | null;
  targetPattern?: string | null;
  conditionJson?: unknown;
  actionJson?: unknown;
  severity?: string | null;
  recommendation?: string | null;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  status?: string | null;
}

interface NormalizedPolicyRule extends Required<Pick<PolicyRuleInput, 'ruleCode' | 'ruleName' | 'ruleType'>> {
  targetType: string | null;
  targetCode: string | null;
  targetPattern: string | null;
  conditionJson: unknown;
  actionJson: unknown;
  severity: PolicyValidationOutput['findings'][number]['severity'];
  recommendation: string;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function isActiveRule(rule: PolicyRuleInput, now: Date): boolean {
  if (rule.status && rule.status !== 'ACTIVE') return false;
  const effectiveFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom) : null;
  const effectiveTo = rule.effectiveTo ? new Date(rule.effectiveTo) : null;
  if (effectiveFrom && effectiveFrom > now) return false;
  if (effectiveTo && effectiveTo < now) return false;
  return true;
}

function normalizeSeverity(value: unknown): PolicyValidationOutput['findings'][number]['severity'] {
  const normalized = normalizeCode(value);
  if (normalized === 'REJECT_RECOMMENDED') return 'REJECT_RECOMMENDED';
  if (normalized === 'REVIEW_NEEDED') return 'REVIEW_NEEDED';
  if (normalized === 'INFO') return 'INFO';
  return 'WARNING';
}

function asAmount(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function matchesPattern(value: unknown, pattern: string | null): boolean {
  if (!pattern) return false;
  const text = normalizeText(value);
  const terms = pattern.split('|').map((item) => normalizeText(item)).filter(Boolean);
  return terms.some((term) => text.includes(term));
}

function getMedicationTypeText(medication: ClaimMedication): string {
  return [medication.category, medication.itemType, medication.dosage, medication.name, medication.genericName]
    .filter(Boolean)
    .map(String)
    .join(' ');
}

function getClaimAmount(payload: ClaimPayload): number {
  const explicitTotal = asAmount(payload.totalClaimAmount);
  if (explicitTotal > 0) return explicitTotal;

  const procedureTotal = (payload.procedures || []).reduce((total, item) => total + asAmount(item.totalPrice), 0);
  const medicationTotal = (payload.medications || []).reduce((total, item) => total + asAmount(item.totalPrice), 0);
  return procedureTotal + medicationTotal;
}

function normalizeRule(rule: PolicyRuleInput): NormalizedPolicyRule {
  return {
    ruleCode: rule.ruleCode,
    ruleName: rule.ruleName,
    ruleType: normalizeCode(rule.ruleType),
    targetType: rule.targetType ? normalizeCode(rule.targetType) : null,
    targetCode: rule.targetCode ? normalizeCode(rule.targetCode) : null,
    targetPattern: rule.targetPattern || null,
    conditionJson: rule.conditionJson ?? null,
    actionJson: rule.actionJson ?? null,
    severity: normalizeSeverity(rule.severity),
    recommendation: rule.recommendation || 'Perlu review sesuai ketentuan polis dan manfaat.',
  };
}

function isMissingPolicyRuleTableError(error: unknown): boolean {
  const errorRecord = asRecord(error);
  const metaRecord = asRecord(errorRecord.meta);
  const message = String(errorRecord.message || '');
  const tableName = String(metaRecord.table || metaRecord.modelName || '');

  return errorRecord.code === 'P2021'
    || (message.includes('snp_policy_rule') && message.includes('does not exist'))
    || tableName.includes('snp_policy_rule');
}

async function getPolicyRules(payload: ClaimPayload): Promise<NormalizedPolicyRule[]> {
  const now = new Date();
  const inlineRules = Array.isArray(payload.policyRules)
    ? payload.policyRules.filter((rule) => isActiveRule(rule, now)).map(normalizeRule)
    : [];

  const clientId = payload.clientId || null;
  if (!clientId) return inlineRules;

  const productCode = payload.policyProductCode || payload.policy?.productCode || payload.policy?.planCode || null;

  try {
    const dbRules = await prisma.policyRule.findMany({
      where: {
        clientId,
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          ...(productCode ? [{ OR: [{ policyProductCode: productCode }, { policyProductCode: null }] }] : []),
        ],
      },
      orderBy: [{ ruleType: 'asc' }, { ruleCode: 'asc' }],
    });

    return [
      ...dbRules.map((rule) => normalizeRule({
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        ruleType: rule.ruleType,
        targetType: rule.targetType,
        targetCode: rule.targetCode,
        targetPattern: rule.targetPattern,
        conditionJson: rule.conditionJson,
        actionJson: rule.actionJson,
        severity: rule.severity,
        recommendation: rule.recommendation,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        status: rule.status,
      })),
      ...inlineRules,
    ];
  } catch (error) {
    if (isMissingPolicyRuleTableError(error)) {
      console.warn('[policy-validator] snp_policy_rule table is unavailable; using inline policy rules only. Run Prisma migration/deploy for master policy rules.');
      return inlineRules;
    }

    throw error;
  }
}

function buildFinding(
  rule: NormalizedPolicyRule,
  message: string,
  evidence: PolicyValidationOutput['findings'][number]['evidence'],
  calculation?: PolicyValidationOutput['findings'][number]['calculation'],
): PolicyValidationOutput['findings'][number] {
  return {
    ruleCode: rule.ruleCode,
    ruleName: rule.ruleName,
    ruleType: rule.ruleType,
    targetType: rule.targetType,
    targetCode: rule.targetCode,
    severity: rule.severity,
    message,
    recommendation: rule.recommendation,
    evidence,
    ...(calculation ? { calculation } : {}),
  };
}

function evaluateExclusionRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const findings: PolicyValidationOutput['findings'] = [];

  if (rule.targetType === 'DIAGNOSIS') {
    for (const diagnosis of payload.diagnoses || []) {
      const codeMatch = rule.targetCode ? normalizeCode(diagnosis.code) === rule.targetCode : false;
      const patternMatch = matchesPattern(`${diagnosis.code || ''} ${diagnosis.name || ''}`, rule.targetPattern);
      if (!codeMatch && !patternMatch) continue;
      findings.push(buildFinding(
        rule,
        `Diagnosis ${diagnosis.code || '-'} ${diagnosis.name || ''} termasuk dalam ketentuan pengecualian polis.`,
        [{ type: 'DIAGNOSIS', label: diagnosis.name || diagnosis.code || 'Diagnosis', value: diagnosis.code || '-' }],
      ));
    }
  }

  if (rule.targetType === 'MEDICATION_NAME') {
    for (const medication of payload.medications || []) {
      const medicationText = `${medication.name || ''} ${medication.genericName || ''}`;
      const codeMatch = rule.targetCode ? normalizeCode(medication.name) === rule.targetCode || normalizeCode(medication.genericName) === rule.targetCode : false;
      const patternMatch = matchesPattern(medicationText, rule.targetPattern);
      if (!codeMatch && !patternMatch) continue;
      findings.push(buildFinding(
        rule,
        `Item obat ${medication.name || medication.genericName || '-'} termasuk pengecualian polis.`,
        [{ type: 'MEDICATION', label: medication.name || medication.genericName || 'Obat', value: medication.genericName || medication.name || '-' }],
      ));
    }
  }

  if (rule.targetType === 'MEDICATION_TYPE') {
    for (const medication of payload.medications || []) {
      const medicationTypeText = getMedicationTypeText(medication);
      const patternMatch = matchesPattern(medicationTypeText, rule.targetPattern || rule.targetCode);
      if (!patternMatch) continue;
      findings.push(buildFinding(
        rule,
        `Kategori obat ${medication.name || medication.genericName || '-'} memerlukan review benefit polis.`,
        [{ type: 'MEDICATION', label: medication.name || medication.genericName || 'Obat', value: medicationTypeText || '-' }],
      ));
    }
  }

  if (rule.targetType === 'PROCEDURE') {
    for (const procedure of payload.procedures || []) {
      const codeMatch = rule.targetCode ? normalizeCode(procedure.code) === rule.targetCode : false;
      const patternMatch = matchesPattern(`${procedure.code || ''} ${procedure.name || ''} ${procedure.category || ''}`, rule.targetPattern);
      if (!codeMatch && !patternMatch) continue;
      findings.push(buildFinding(
        rule,
        `Tindakan ${procedure.code || '-'} ${procedure.name || ''} termasuk pengecualian atau pembatasan polis.`,
        [{ type: 'PROCEDURE', label: procedure.name || procedure.code || 'Tindakan', value: procedure.code || '-' }],
      ));
    }
  }

  return findings;
}

function evaluateLimitRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const action = asRecord(rule.actionJson);
  const claimAmount = getClaimAmount(payload);
  const limitAmount = asAmount(action.limitAmount ?? action.maxAmount ?? action.amount);
  if (claimAmount <= 0 || limitAmount <= 0 || claimAmount <= limitAmount) return [];

  const excessAmount = claimAmount - limitAmount;
  return [buildFinding(
    rule,
    `Total klaim melebihi limit manfaat sebesar Rp ${excessAmount.toLocaleString('id-ID')}.`,
    [{ type: 'CLAIM', label: 'Total klaim', value: `Rp ${claimAmount.toLocaleString('id-ID')}` }],
    {
      claimAmount,
      coveredAmount: limitAmount,
      excessAmount,
      limitAmount,
    },
  )];
}

function evaluateDeductibleRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const action = asRecord(rule.actionJson);
  const claimAmount = getClaimAmount(payload);
  const deductibleAmount = asAmount(action.deductibleAmount ?? action.amount);
  if (claimAmount <= 0 || deductibleAmount <= 0) return [];

  const excessAmount = Math.min(claimAmount, deductibleAmount);
  return [buildFinding(
    rule,
    `Deductible polis sebesar Rp ${excessAmount.toLocaleString('id-ID')} perlu dibebankan sebagai excess.`,
    [{ type: 'POLICY', label: 'Deductible', value: `Rp ${deductibleAmount.toLocaleString('id-ID')}` }],
    {
      claimAmount,
      coveredAmount: Math.max(0, claimAmount - excessAmount),
      excessAmount,
      deductibleAmount: excessAmount,
    },
  )];
}

function evaluateCopayRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const action = asRecord(rule.actionJson);
  const claimAmount = getClaimAmount(payload);
  const copayPercent = Number(action.copayPercent ?? action.percent ?? 0);
  if (claimAmount <= 0 || !Number.isFinite(copayPercent) || copayPercent <= 0) return [];

  const cappedPercent = Math.min(100, copayPercent);
  const copayAmount = Math.round((claimAmount * cappedPercent) / 100);
  return [buildFinding(
    rule,
    `Co-pay peserta ${cappedPercent}% menghasilkan excess Rp ${copayAmount.toLocaleString('id-ID')}.`,
    [{ type: 'POLICY', label: 'Co-pay', value: `${cappedPercent}%` }],
    {
      claimAmount,
      coveredAmount: Math.max(0, claimAmount - copayAmount),
      excessAmount: copayAmount,
      copayAmount,
    },
  )];
}

function evaluatePreAuthRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const condition = asRecord(rule.conditionJson);
  const thresholdAmount = asAmount(condition.thresholdAmount ?? condition.minimumClaimAmount);
  const claimAmount = getClaimAmount(payload);
  if (thresholdAmount > 0 && claimAmount < thresholdAmount) return [];

  return [buildFinding(
    rule,
    'Klaim memenuhi kriteria yang membutuhkan verifikasi pre-authorisation.',
    [{ type: 'CLAIM', label: 'Total klaim', value: `Rp ${claimAmount.toLocaleString('id-ID')}` }],
  )];
}

function evaluateRoomEntitlementRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  const condition = asRecord(rule.conditionJson);
  const entitledClass = normalizeText(condition.entitledClass ?? condition.roomClass ?? rule.targetCode);
  if (!entitledClass) return [];

  const roomProcedures = (payload.procedures || []).filter((procedure) => {
    const procedureText = normalizeText(`${procedure.name || ''} ${procedure.category || ''}`);
    return procedureText.includes('kamar') || procedureText.includes('room') || procedureText.includes('rawat inap');
  });

  const mismatches = roomProcedures.filter((procedure) => !normalizeText(procedure.name).includes(entitledClass));
  return mismatches.map((procedure) => buildFinding(
    rule,
    `Kelas kamar pada klaim perlu dibandingkan dengan entitlement polis (${entitledClass}).`,
    [{ type: 'PROCEDURE', label: procedure.name || 'Kamar rawat inap', value: procedure.code || '-' }],
  ));
}

function evaluateRule(rule: NormalizedPolicyRule, payload: ClaimPayload): PolicyValidationOutput['findings'] {
  switch (rule.ruleType) {
    case 'EXCLUSION':
      return evaluateExclusionRule(rule, payload);
    case 'LIMIT':
      return evaluateLimitRule(rule, payload);
    case 'DEDUCTIBLE':
      return evaluateDeductibleRule(rule, payload);
    case 'COPAY':
      return evaluateCopayRule(rule, payload);
    case 'PRE_AUTH':
      return evaluatePreAuthRule(rule, payload);
    case 'ROOM_ENTITLEMENT':
      return evaluateRoomEntitlementRule(rule, payload);
    case 'WAITING_PERIOD':
      return evaluatePreAuthRule(rule, payload);
    default:
      return [];
  }
}

function resolveStatus(findings: PolicyValidationOutput['findings']): PolicyValidationOutput['status'] {
  if (findings.some((finding) => finding.severity === 'REJECT_RECOMMENDED')) return 'REJECT_RECOMMENDED';
  if (findings.some((finding) => finding.severity === 'REVIEW_NEEDED')) return 'REVIEW_NEEDED';
  if (findings.some((finding) => finding.severity === 'WARNING')) return 'WARNING';
  return 'PASS';
}

function resolveScore(status: PolicyValidationOutput['status'], findingsCount: number): number {
  if (status === 'REJECT_RECOMMENDED') return 35;
  if (status === 'REVIEW_NEEDED') return 65;
  if (status === 'WARNING') return Math.max(75, 95 - findingsCount * 5);
  return 100;
}

function summarize(status: PolicyValidationOutput['status'], findingsCount: number): string {
  if (findingsCount === 0) return 'Tidak ada pelanggaran polis atau benefit yang terdeteksi berdasarkan rule aktif.';
  if (status === 'REJECT_RECOMMENDED') return `${findingsCount} temuan polis kritikal membutuhkan rekomendasi penolakan atau koreksi benefit.`;
  if (status === 'REVIEW_NEEDED') return `${findingsCount} temuan polis membutuhkan review manual sebelum adjudikasi final.`;
  return `${findingsCount} temuan polis perlu diperhatikan dalam perhitungan benefit.`;
}

export async function validatePolicyBenefits(payload: ClaimPayload): Promise<PolicyValidationOutput> {
  const rules = await getPolicyRules(payload);
  const findings = rules.flatMap((rule) => evaluateRule(rule, payload));
  const claimAmount = getClaimAmount(payload);
  const calculatedExcess = findings.reduce((total, finding) => total + asAmount(finding.calculation?.excessAmount), 0);
  const excessAmount = Math.min(claimAmount, calculatedExcess);
  const status = resolveStatus(findings);

  return {
    isValid: status === 'PASS' || status === 'WARNING',
    status,
    score: resolveScore(status, findings.length),
    summary: summarize(status, findings.length),
    findings,
    totals: {
      claimAmount,
      coveredAmount: Math.max(0, claimAmount - excessAmount),
      excessAmount,
    },
    evaluatedRuleCount: rules.length,
  };
}
