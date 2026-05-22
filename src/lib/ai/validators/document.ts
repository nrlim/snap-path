import { getAIGateway } from "../gateway";
import { ClaimValidationInput, ClaimValidationOutput } from "../types";
import prisma from "@/lib/db";

export async function validateDocumentCompleteness(input: ClaimValidationInput, jobId: string): Promise<ClaimValidationOutput['documentValidation']> {
  const gateway = await getAIGateway();
  
  // Create a focused payload for the AI to analyze
  const aiPayload = {
    encounterType: input.encounter.type,
    diagnoses: input.diagnoses.map(d => d.description),
    procedures: input.procedures.map(p => p.description),
    providedDocuments: input.documents?.map(d => d.type) || []
  };

  const { data, usage } = await gateway.validateDocumentCompleteness(aiPayload);

  // We could log usage to job metadata here if needed in the future


  return data;
}
