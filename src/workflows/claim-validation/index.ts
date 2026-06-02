import {
  initAndValidateDocStep,
  validateDiagnosisStep,
  validateTariffStep,
  checkDrugPricesStep,
  generatePathwayStep,
  validateLosStep,
  aggregateAndSaveStep,
  ClaimValidationPayload,
} from './steps';

/**
 * SnapPath Claim Validation Workflow
 *
 * Runs 6 steps in sequence with durability and automatic retry:
 *   1. initAndValidateDocStep   — Initialize job + validate documents
 *   2. validateDiagnosisStep    — AI + rule-based diagnosis validation
 *   3. validateTariffStep       — Master tariff book price check
 *   4. checkDrugPricesStep      — AI-assisted drug market price check
 *   5. validateLosStep          — Validate LOS against Master Data & AI Research
 *   6. generatePathwayStep      — Generate clinical pathway (AI or template)
 *   7. aggregateAndSaveStep     — Aggregate scores and persist to DB
 *
 * Called via `start()` from the API route (fire-and-forget).
 * The client polls `/api/v1/claims/poll?runId=...` to check progress.
 */
async function runClaimValidationSteps(input: ClaimValidationPayload): Promise<void> {
  // Step 1: Init + Document validation
  const docRes = await initAndValidateDocStep(input);

  // Step 2: Diagnosis + treatment validation
  const diagRes = await validateDiagnosisStep(input);

  // Step 3: Tariff price validation (DB-only)
  const tariffRes = await validateTariffStep(input);

  // Step 4: Medical item price check (local master data + controlled AI resolver)
  const drugRes = await checkDrugPricesStep(input);

  // Step 5: LOS validation
  const losRes = await validateLosStep(input);

  // Step 6: Clinical pathway generation
  const pathRes = await generatePathwayStep(input);

  // Step 7: Aggregate and save final result
  await aggregateAndSaveStep(input, docRes, diagRes, tariffRes, drugRes, pathRes, losRes);
}

export async function claimValidationWorkflow(input: ClaimValidationPayload): Promise<void> {
  'use workflow';
  await runClaimValidationSteps(input);
}

/**
 * Local development fallback for Next/Turbopack workflow dispatch stalls.
 * This is intentionally not used in production unless explicitly enabled.
 */
export async function runClaimValidationInline(input: ClaimValidationPayload): Promise<void> {
  await runClaimValidationSteps(input);
}
