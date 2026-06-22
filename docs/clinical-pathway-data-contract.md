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

## 2. Producers and consumers

Keep these files aligned whenever the contract changes:

- `src/lib/ai/types.ts`
- `src/app/dashboard/clinical-pathway/components/PathwayWizard.tsx`
- `src/app/dashboard/clinical-pathway/components/PathwayImportModal.tsx`
- `src/app/dashboard/clinical-pathway/components/PathwayResultViewer.tsx`
- `src/app/api/v1/claims/map-json/route.ts`
- `src/lib/ai/drivers/openai-compatible.ts`
- `src/lib/ai/validators/tariff.ts`
- `src/lib/ai/validators/drug-price.ts`
- `src/lib/policy/validator.ts`
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

## 7. HITL review and adjudication

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
    counts: Record<string, number>;
    financialImpact: {
      claimAmount: number;
      policyExcessAmount: number;
      tariffVarianceAmount: number;
      drugVarianceAmount: number;
      recommendedPayableAmount: number;
    };
  };
}
```

HITL queue eligibility is derived from completed claim validation jobs with validation status `WARNING`/`REVIEW_NEEDED`, non-`PASS` policy status, or generated HITL findings. The latest `ClaimReviewDecision` controls the displayed review status.

## 8. Scoring

Scoring starts at 100 and deducts proportionally by validation aspect.

Master-data readiness must be fair:
- total master-data denominator = number of claimed procedures + claimed medications
- missing ratio = missing procedure references + missing medication references / denominator
- deduction = master-data weight × missing ratio

Do not deduct the full master-data readiness weight for a single missing item unless it is the only procedure/medication item.

Items without master references are not mixed into price-compliance deductions. They are counted under master-data readiness.

## 9. LOS behavior

LOS validation compares actual LOS from encounter dates with expected LOS from the pathway/LOS estimator. LOS is a separate scoring dimension and only deducts when actual LOS exceeds the expected standard beyond configured tolerance.

## 10. Timeline behavior

Result UI should group pathway phases by canonical phase/day fields from pathway output. Do not infer grouping from provider-specific labels.

## 11. Safe-change checklist

Before changing this contract:
1. Update all producers/consumers listed above.
2. Update API docs and samples.
3. Run `npx prisma generate` if schema/client types changed.
4. Run `npx tsc --noEmit --pretty false`.
5. Run `npm run build`.
