# Clinical Pathway Data Contract

This document is the canonical contract for Clinical Pathway, Claim Validation, Fees & Drugs, scoring, AI usage, API docs, and result UI.

## 1. Canonical input only

The product is not released yet, so consumers and producers must use one canonical shape. Do not add or preserve legacy duplicate keys.

### Procedure

```ts
{
  code?: string | null;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
```

Forbidden aliases: `procedureName`, `description`, `price`, `claimedUnitPrice`, `claimedTotal`, `claimedPrice`, `procedureCode`, `serviceCode`.

### Medication / Farmalkes

```ts
{
  code?: string | null;
  name: string;
  genericName?: string;
  dosage?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  frequency?: string;
  duration?: string;
}
```

Forbidden aliases: `medicationName`, `price`, `claimedUnitPrice`, `claimedTotal`, `drugName`, `drugGenericName`.

### Diagnosis

```ts
{
  code: string;
  name: string;
  type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION';
  sequence: number;
}
```

`description` is not an input alias for diagnosis name.

### Supporting document

```ts
{
  type: 'LMA' | 'KTP' | 'KARTU ASURANSI' | 'SK KAMAR' | 'FORM KRONOLOGIS KECELAKAAN' | 'SURAT PERNYATAAN RAWAT INAP' | string;
  date?: string;
  conclusion?: string;
  url?: string;
  description?: string;
}
```

SnapText OCR document availability uses top-level `documents[]` entries. `document_metadata` is reserved for technical OCR metadata only. A required document is considered provided only when `documents[].type` resolves to the required type. Do not infer required document availability from unrelated invoice text.

## 2. Producers and consumers

Keep these files aligned whenever the contract changes:

- `src/lib/ai/types.ts`
- `src/app/dashboard/clinical-pathway/components/PathwayWizard.tsx`
- `src/app/dashboard/clinical-pathway/components/PathwayImportModal.tsx`
- `src/app/dashboard/clinical-pathway/components/PathwayResultViewer.tsx`
- `src/app/api/v1/claims/map-json/route.ts`
- `src/lib/ocr-claim-payload.ts`
- `src/lib/snaptext/schema.json`
- `src/lib/snaptext/clean-result.ts`
- `src/lib/ai/drivers/openai-compatible.ts`
- `src/lib/ai/validators/tariff.ts`
- `src/lib/ai/validators/drug-price.ts`
- `src/lib/policy/validator.ts`
- `src/lib/fwa/triage.ts`
- `src/lib/evidence/gateway.ts`
- `src/lib/evidence/types.ts`
- `src/lib/evidence/clinical-reference-search.ts`
- `src/lib/hitl.ts`
- `src/app/dashboard/clinical-pathway/components/AdjudicationPanel.tsx`
- `src/workflows/claim-validation/steps.ts`
- `public/swagger.json`
- sample payloads under `sample-data/clinical-pathway-score-demo/`

## 3. Tariff validation

Tariff validation uses local master fee schedule data only.

Resolution order:
1. If `procedure.code` is provided, match active tariff by exact `procedureCode` or `serviceCode` for the selected provider.
2. If code is absent, match exact procedure name against the provider's active master tariff.
3. If no match is found, emit `NOT_FOUND` and let scoring count it under master-data readiness.

Price fields:
- claimed unit price = `unitPrice`
- claimed total = `totalPrice` or `unitPrice * quantity` if total is omitted internally
- expected total = master max price × quantity

## 4. Medication / Farmalkes validation

Medication pricing must use local `MedicalItemPriceMaster` / master Farmalkes rows.

AI is allowed only as a local master-data matcher/resolver:
- input: claimed medication, diagnosis context, and local candidates
- output: selected local candidate id + confidence + reason
- AI must not estimate prices, search the internet, invent products, or provide market prices

Reference price selection uses the best meaningful local value:
1. `maxReferencePrice`
2. `hetPrice`
3. `marketPriceMax`
4. `fixPrice`

A meaningful price is `>= 100`.

## 5. Diagnosis validation behavior

Diagnosis-treatment validation must support multiple diagnoses in one claim episode:
- output includes one validation detail per claimed diagnosis
- procedure and medication review uses the full episode context, including primary, secondary, and complication diagnoses
- a procedure/medication should not be counted as an episode-level clinical mismatch if it is appropriate for at least one diagnosis in the episode
- clinical pathway generation uses the primary diagnosis as the pathway driver while secondary/complication diagnoses inform monitoring, supportive care, risk review, and discharge criteria
- when local diagnosis-procedure mapping is absent or incomplete, AI clinical reasoning may use external medical references for this diagnosis/procedure analysis only; it must expose `clinicalEvidenceSummary`, `evidenceReferences`, and `evidenceRetrievalStatus`, and it must not affect tariff, drug pricing, policy, or FWA source rules

## 6. Policy & benefit validation

`outputResult.policyValidation` is the canonical policy engine result. It is deterministic and HITL-oriented.

```ts
{
  isValid: boolean;
  status: 'PASS' | 'WARNING' | 'REVIEW_NEEDED' | 'REJECT_RECOMMENDED';
  score: number;
  summary: string;
  findings: Array<{
    ruleCode: string;
    ruleName: string;
    ruleType: 'EXCLUSION' | 'LIMIT' | 'DEDUCTIBLE' | 'COPAY' | 'WAITING_PERIOD' | 'PRE_AUTH' | 'ROOM_ENTITLEMENT' | string;
    targetType?: string | null;
    targetCode?: string | null;
    severity: 'INFO' | 'WARNING' | 'REVIEW_NEEDED' | 'REJECT_RECOMMENDED';
    message: string;
    recommendation: string;
    evidence: Array<{ type: string; label: string; value: string }>;
    calculation?: {
      claimAmount: number;
      coveredAmount: number;
      excessAmount: number;
      deductibleAmount?: number;
      copayAmount?: number;
      limitAmount?: number;
    };
  }>;
  totals: {
    claimAmount: number;
    coveredAmount: number;
    excessAmount: number;
  };
  evaluatedRuleCount: number;
}
```

Rules may come from active `PolicyRule` master data for the client or from canonical integration payload `policyRules` for POC runs. Policy findings currently act as a non-deductive HITL gate in score breakdown: they can move final claim status to `WARNING` or `REVIEW_NEEDED`, but they do not reduce clinical/financial score points until product scoring governance is approved.

## 7. FWA risk triage

`outputResult.fwaRisk` is the canonical deterministic Fraud, Waste, Abuse risk result. It is a triage layer, not an automatic rejection engine.

```ts
{
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number; // 0-100
  summary: string;
  signals: Array<{
    code: string;
    label: string;
    category: 'DUPLICATE' | 'UTILIZATION' | 'FINANCIAL' | 'CLINICAL' | 'DOCUMENT' | 'POLICY' | 'PROVIDER_PATTERN';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    scoreImpact: number;
    evidence: string;
    recommendation: string;
  }>;
  evidenceSummary: {
    similarClaimCount: number;
    patientRecentClaimCount: number;
    providerAverageClaimAmount: number | null;
    providerMedianClaimAmount: number | null;
    providerHighRiskClaimCount: number;
  };
  isReviewRecommended: boolean;
}
```

FWA signals are deterministic and explainable. They may use current validation output plus scoped historical claim snapshots for duplicate/similar claim count, patient frequency, provider claim benchmark, and provider high-risk pattern. `HIGH` and `CRITICAL` FWA results can move final claim status to `REVIEW_NEEDED`; `MEDIUM` can move a previously valid claim to `WARNING`.

## 8. Local medical evidence packet

`outputResult.evidencePacket` is the canonical evidence snapshot for claim review. Default evidence remains local-only, but there is one explicit exception: diagnosis-procedure/diagnosis-medication clinical reasoning may include external medical references when local diagnosis mapping is absent or too shallow. CONSUL must not connect to MCP servers or scrape Google Scholar; references are produced by the configured AI model's medical reasoning/search capability and should cite authoritative source families honestly.

```ts
{
  generatedAt: string;
  sourcePolicy: 'LOCAL_ONLY' | 'LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE';
  summary: {
    totalEvidence: number;
    highConfidenceCount: number;
    categories: Array<'FWA' | 'POLICY' | 'TARIFF' | 'DRUG_PRICE' | 'DOCUMENT' | 'LOS' | 'DIAGNOSIS' | 'PATHWAY'>;
  };
  items: Array<{
    id: string;
    topic: string;
    category: string;
    source: 'FWA_ENGINE' | 'POLICY_RULE' | 'LOCAL_TARIFF_MASTER' | 'LOCAL_DRUG_MASTER' | 'CLAIM_DOCUMENT' | 'LOS_VALIDATOR' | 'DIAGNOSIS_VALIDATOR' | 'AI_MEDICAL_REASONING' | 'INTERNAL_PATHWAY';
    title: string;
    summary: string;
    evidenceText: string;
    recommendation: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    accessedAt: string;
    relatedCode?: string | null;
    amount?: number | null;
    references?: Array<{
      sourceType: 'INDONESIA_GUIDELINE' | 'WHO_GUIDELINE' | 'SPECIALTY_SOCIETY_GUIDELINE' | 'PUBMED' | 'COCHRANE' | 'CLINICAL_TRIALS' | 'FDA' | 'RXNORM' | 'AAP' | 'TOP_MEDICAL_JOURNAL' | 'GOOGLE_SCHOLAR' | 'OTHER';
      title: string;
      organization?: string | null;
      year?: string | null;
      url?: string | null;
      identifier?: string | null;
      relevance: string;
      strength: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }>;
}
```

Evidence packet generation is non-adjudicative: it supports reviewer explainability and auditability, but does not change score by itself. External references are allowed only for clinical diagnosis-procedure reasoning. CONSUL pre-fetches PubMed context using diagnosis/procedure/medication terms only and never includes patient identifiers. Preferred sources follow the medical-mcp source pattern without adopting MCP as a dependency: Indonesian Kemenkes/PNPK first when available, WHO/specialty guidelines, Cochrane, PubMed, ClinicalTrials.gov, FDA/RxNorm for medication nomenclature/safety, AAP for pediatric claims, and top journals such as NEJM/JAMA/Lancet/BMJ/Nature Medicine. Google Scholar is discovery-only and must not be the sole adjudication source. The HITL packet stores this evidence snapshot with reviewer decisions.

## 9. HITL review and adjudication

Reviewer decisions are stored separately from AI validation output in `snp_claim_review_decision`. Do not mutate `inputPayload` or `outputResult` to represent manual adjudication.

Canonical review decision record:

```ts
{
  jobId: string;
  decision: 'APPROVE' | 'APPROVE_WITH_ADJUSTMENT' | 'REJECT' | 'REQUEST_DOCUMENTS' | 'ESCALATE_MEDICAL_ADVISOR';
  reviewStatus: 'IN_REVIEW' | 'DECIDED' | 'WAITING_DOCUMENTS' | 'ESCALATED';
  payableAmount?: number | null;
  excessAmount?: number | null;
  reasonCode?: string | null;
  note?: string | null;
  previousReviewStatus?: string | null;
  nextReviewStatus: string;
  hitlPacket?: {
    recommendedAction: string;
    summary: string;
    findings: Array<{ category: string; severity: string; message: string; recommendation: string; amount?: number }>;
    counts: Record<string, number>; // includes fwa, policy, tariff, drugPrice, document, los, diagnosis
    financialImpact: {
      claimAmount: number;
      policyExcessAmount: number;
      tariffVarianceAmount: number;
      drugVarianceAmount: number;
      recommendedPayableAmount: number;
    };
    evidencePacket: MedicalEvidencePacket;
  };
}
```

HITL queue eligibility is derived from completed claim validation jobs with validation status `WARNING`/`REVIEW_NEEDED`, non-`PASS` policy status, or generated HITL findings. The latest `ClaimReviewDecision` controls the displayed review status.

## 10. Scoring

Scoring starts at 100 and deducts proportionally by validation aspect.

Master-data readiness must be fair:
- total master-data denominator = number of claimed procedures + claimed medications
- missing ratio = missing procedure references + missing medication references / denominator
- deduction = master-data weight × missing ratio

Do not deduct the full master-data readiness weight for a single missing item unless it is the only procedure/medication item.

Items without master references are not mixed into price-compliance deductions. They are counted under master-data readiness.

## 11. LOS behavior

LOS validation compares actual LOS from encounter dates with expected LOS from the pathway/LOS estimator. LOS is a separate scoring dimension and only deducts when actual LOS exceeds the expected standard beyond configured tolerance.

## 12. Timeline behavior

Result UI should group pathway phases by canonical phase/day fields from pathway output. Do not infer grouping from provider-specific labels.

## 13. Safe-change checklist

Latest contract update: supporting document availability from SnapText OCR is represented directly by canonical top-level `documents[]` entries with `type`, `date`, and `conclusion`; `document_metadata` is technical metadata only.

Before changing this contract:
1. Update all producers/consumers listed above.
2. Update API docs and samples.
3. Run `npx prisma generate` if schema/client types changed.
4. Run `npx tsc --noEmit --pretty false`.
5. Run `npm run build`.
