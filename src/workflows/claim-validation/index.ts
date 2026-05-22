import {
  initAndValidateDocStep,
  validateDiagnosisStep,
  validateTariffStep,
  checkDrugPricesStep,
  generatePathwayStep,
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
 *   5. generatePathwayStep      — Generate clinical pathway (AI or template)
 *   6. aggregateAndSaveStep     — Aggregate scores and persist to DB
 *
 * Called via `start()` from the API route (fire-and-forget).
 * The client polls `/api/v1/claims/status?runId=...` to check progress.
 */
export async function claimValidationWorkflow(input: ClaimValidationPayload): Promise<void> {
  'use workflow';

  // Step 1: Init + Document validation
  const docRes = await initAndValidateDocStep(input);

  // Step 2: Diagnosis + treatment validation
  const diagRes = await validateDiagnosisStep(input);

  // Step 3: Tariff price validation (DB-only)
  const tariffRes = await validateTariffStep(input);

  // Step 4: Drug price check (AI + cache)
  const drugRes = await checkDrugPricesStep(input);

  // Step 5: Clinical pathway generation
  const pathRes = await generatePathwayStep(input);

  // Step 6: Aggregate and save final result
  await aggregateAndSaveStep(input, docRes, diagRes, tariffRes, drugRes, pathRes);
}
