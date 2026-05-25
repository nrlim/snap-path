import {
  getMissingRequiredClaimDocuments,
  REQUIRED_CLAIM_DOCUMENTS,
  resolveRequiredClaimDocument,
} from '@/lib/claim-documents';
import { ClaimValidationInput, ClaimValidationOutput } from '../types';

export async function validateDocumentCompleteness(
  input: ClaimValidationInput,
  _jobId: string,
): Promise<ClaimValidationOutput['documentValidation']> {
  const rawProvidedDocuments = input.documents?.map((document) => document.type).filter(Boolean) || [];
  const providedRequiredDocuments = Array.from(
    new Set(
      rawProvidedDocuments
        .map((documentType) => resolveRequiredClaimDocument(documentType))
        .filter((documentType): documentType is (typeof REQUIRED_CLAIM_DOCUMENTS)[number] => Boolean(documentType)),
    ),
  );
  const missingRequiredDocuments = getMissingRequiredClaimDocuments(rawProvidedDocuments);
  const score = Math.round((providedRequiredDocuments.length / REQUIRED_CLAIM_DOCUMENTS.length) * 100);

  return {
    isValid: missingRequiredDocuments.length === 0,
    score,
    details: {
      providedDocuments: providedRequiredDocuments,
      missingRequiredDocuments,
      notes: missingRequiredDocuments.length === 0
        ? 'Seluruh dokumen wajib klaim rawat inap sudah tersedia.'
        : `Dokumen wajib belum lengkap. Dokumen yang belum tersedia: ${missingRequiredDocuments.join(', ')}.`,
    },
  };
}
