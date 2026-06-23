export type MedicalEvidenceCategory =
  | 'FWA'
  | 'POLICY'
  | 'TARIFF'
  | 'DRUG_PRICE'
  | 'DOCUMENT'
  | 'LOS'
  | 'DIAGNOSIS'
  | 'PATHWAY';

export type MedicalEvidenceSource =
  | 'FWA_ENGINE'
  | 'POLICY_RULE'
  | 'LOCAL_TARIFF_MASTER'
  | 'LOCAL_DRUG_MASTER'
  | 'CLAIM_DOCUMENT'
  | 'LOS_VALIDATOR'
  | 'DIAGNOSIS_VALIDATOR'
  | 'AI_MEDICAL_REASONING'
  | 'INTERNAL_PATHWAY';

export type MedicalEvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type MedicalEvidenceSourcePolicy = 'LOCAL_ONLY' | 'LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE';

export type MedicalSourceReferenceType =
  | 'INDONESIA_GUIDELINE'
  | 'WHO_GUIDELINE'
  | 'SPECIALTY_SOCIETY_GUIDELINE'
  | 'PUBMED'
  | 'COCHRANE'
  | 'CLINICAL_TRIALS'
  | 'FDA'
  | 'RXNORM'
  | 'AAP'
  | 'TOP_MEDICAL_JOURNAL'
  | 'GOOGLE_SCHOLAR'
  | 'OTHER';

export interface MedicalSourceReference {
  sourceType: MedicalSourceReferenceType;
  title: string;
  organization?: string | null;
  year?: string | null;
  url?: string | null;
  identifier?: string | null;
  relevance: string;
  strength: MedicalEvidenceConfidence;
}

export interface MedicalEvidenceItem {
  id: string;
  topic: string;
  category: MedicalEvidenceCategory;
  source: MedicalEvidenceSource;
  title: string;
  summary: string;
  evidenceText: string;
  recommendation: string;
  confidence: MedicalEvidenceConfidence;
  accessedAt: string;
  relatedCode?: string | null;
  amount?: number | null;
  references?: MedicalSourceReference[];
}

export interface MedicalEvidencePacket {
  generatedAt: string;
  sourcePolicy: MedicalEvidenceSourcePolicy;
  summary: {
    totalEvidence: number;
    highConfidenceCount: number;
    categories: MedicalEvidenceCategory[];
  };
  items: MedicalEvidenceItem[];
}
