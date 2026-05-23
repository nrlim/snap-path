import { getAIGateway } from "../gateway";
import { ClaimValidationInput, ClaimValidationOutput } from "../types";

export async function validateDocumentCompleteness(input: ClaimValidationInput, jobId: string): Promise<ClaimValidationOutput['documentValidation']> {
  const gateway = await getAIGateway({ clientId: input.clientId, providerId: input.providerId, jobId });
  
  // Create a focused payload for the AI to analyze
  const aiPayload = {
    encounterType: input.encounter.type,
    diagnoses: input.diagnoses.map(d => d.description),
    procedures: input.procedures.map(p => p.description),
    providedDocuments: input.documents?.map(d => d.type) || []
  };

  const { data } = await gateway.validateDocumentCompleteness(aiPayload);

  return data;
}
