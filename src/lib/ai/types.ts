// ==========================================
//  CLAIM VALIDATION (Diagnosis-Treatment)
// ==========================================

export interface ClaimValidationInput {
  providerId: string;
  claimId?: string;
  patient: {
    id: string;
    name: string;
    dateOfBirth: string; // ISO 8601
    gender: "M" | "F";
  };
  encounter: {
    type: "RAWAT_INAP" | "RAWAT_JALAN" | "IGD";
    admissionDate: string;
    dischargeDate?: string;
    facility: {
      id: string;
      name: string;
      type: string; // "RS_TIPE_A" | "RS_TIPE_B" | "KLINIK"
    };
  };
  diagnoses: Array<{
    code: string;       // ICD-10
    description: string;
    type: "PRIMARY" | "SECONDARY" | "COMPLICATION";
    sequence: number;
  }>;
  procedures: Array<{
    code: string;       // CPT / INA-CBG
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    performedDate: string;
    performedBy?: string;
  }>;
  medications: Array<{
    name: string;
    genericName?: string;
    dosage?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    frequency?: string;
    duration?: string;
  }>;
  totalClaimAmount: number;
  currency?: string;
  notes?: string;
  documents?: Array<{
    type: string;       // "KTP" | "RESUME_MEDIS" | "HASIL_LAB" | "SURAT_RUJUKAN" dll
    url?: string;
    description?: string;
  }>;
}

export interface ClaimValidationOutput {
  jobId: string;
  status: "VALID" | "INVALID" | "WARNING" | "REVIEW_NEEDED";
  overallScore: number; // 0-100
  summary: string;
  diagnosisValidation: {
    isValid: boolean;
    score: number;
    details: Array<{
      diagnosisCode: string;
      diagnosisName?: string;
      clinicalSummary?: string;
      matchedProcedures: string[];
      unmatchedProcedures: string[];
      missingRequiredProcedures: string[];
      suggestedProcedures?: Array<{
        code: string;
        name: string;
        rationale: string;
      }>;
      notes: string;
    }>;
  };
  tariffValidation: {
    isValid: boolean;
    score: number;
    totalExpected: number;
    totalClaimed: number;
    variance: number;
    variancePct: number;
    thresholdPct: number;
    details: Array<{
      code: string;
      description: string;
      claimedPrice: number;
      expectedMinPrice: number;
      expectedMaxPrice: number;
      status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" | "NOT_FOUND";
      variancePct: number;
    }>;
  };
  drugPriceValidation: {
    isValid: boolean;
    score: number;
    details: Array<{
      drugName: string;
      claimedPrice: number;
      marketPriceMax: number;
      marketPriceMaxWithThreshold: number;
      status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "NOT_FOUND";
      variancePct: number;
      sources: string[];
    }>;
  };
  documentValidation: {
    isValid: boolean;
    score: number;
    details: {
      providedDocuments: string[];
      missingRequiredDocuments: string[];
      notes: string;
    };
  };
  clinicalPathway?: {
    diagnosisCode: string;
    adherenceScore: number;
    recommendedPathway: ClinicalPathwayPhase[];
    deviations: string[];
  };
  processingTime: {
    total: number;
    preProcessing: number;
    mainProcessing: number;
    postProcessing: number;
  };
  auditTrail: Array<{
    step: string;
    timestamp: string;
    status: string;
    details?: string;
  }>;
}

// ==========================================
//  TARIFF VALIDATION
// ==========================================

export interface TariffValidationInput {
  providerId: string;
  procedures: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    category?: string;
    regionCode?: string;
  }>;
  encounterType: "RAWAT_INAP" | "RAWAT_JALAN" | "IGD";
}

export interface TariffValidationOutput {
  jobId: string;
  status: "VALID" | "INVALID" | "WARNING";
  totalExpected: number;
  totalClaimed: number;
  variance: number;
  variancePct: number;
  thresholdConfig: {
    thresholdPct: number;
    maxAbsoluteIdr: number | null;
  };
  items: Array<{
    code: string;
    description: string;
    quantity: number;
    claimedUnitPrice: number;
    claimedTotal: number;
    masterBasePrice: number;
    masterMaxPrice: number;
    expectedTotal: number;
    status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" | "NOT_FOUND";
    variancePct: number;
    notes: string;
  }>;
}

// ==========================================
//  DRUG PRICE CHECK
// ==========================================

export interface DrugPriceCheckInput {
  providerId: string;
  medications: Array<{
    name: string;
    genericName?: string;
    dosage?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

export interface DrugPriceCheckOutput {
  jobId: string;
  status: "VALID" | "INVALID" | "WARNING";
  items: Array<{
    name: string;
    genericName: string | null;
    quantity: number;
    claimedUnitPrice: number;
    claimedTotal: number;
    marketPriceMax: number;
    marketPriceMaxWithThreshold: number;
    expectedTotal: number;
    status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "NOT_FOUND" | "CACHE_HIT";
    variancePct: number;
    sources: string[];
    cachedAt: string | null;
  }>;
  thresholdConfig: {
    thresholdPct: number;
  };
}

// ==========================================
//  CLINICAL PATHWAY GENERATION
// ==========================================

export interface ClinicalPathwayInput {
  diagnosisCode: string;    // ICD-10
  diagnosisName?: string;
  encounterType: "RAWAT_INAP" | "RAWAT_JALAN" | "IGD";
  providerType?: string;    // "BPJS" | "PRIVATE"
  patientProfile?: {
    age: number;
    gender: "M" | "F";
    comorbidities?: string[];
  };
  includeCosting?: boolean;
  providerId?: string;
}

export interface ClinicalPathwayOutput {
  jobId: string;
  diagnosisCode: string;
  diagnosisName: string;
  pathwayVersion: string;
  estimatedLos: number; // Length of stay in days
  phases: ClinicalPathwayPhase[];
  totalEstimatedCost: number | null;
  generatedBy: "AI" | "TEMPLATE" | "HYBRID";
  confidence: number;
}

export interface ClinicalPathwayPhase {
  phaseId: string;
  phaseName: string; // "IGD/Admisi" | "Hari 1-2" | "Hari 3-5" | "Discharge"
  dayRange: string;  // "Day 0" | "Day 1-2" | "Day 3-5"
  objectives: string[];
  assessments: Array<{
    name: string;
    code?: string;
    frequency: string;
    mandatory: boolean;
  }>;
  treatments: Array<{
    name: string;
    code?: string;
    dosage?: string;
    frequency?: string;
    route?: string;       // "IV" | "ORAL" | "IM"
    duration?: string;
    mandatory: boolean;
  }>;
  medications: Array<{
    name: string;
    genericName?: string;
    dosage: string;
    frequency: string;
    route: string;
    duration: string;
    mandatory: boolean;
    estimatedCost?: number;
  }>;
  nursing: Array<{
    activity: string;
    frequency: string;
  }>;
  nutrition: {
    diet: string;
    restrictions?: string[];
  };
  education: string[];
  dischargeGate?: {
    criteria: string[];
    mustMeetAll: boolean;
  };
  estimatedCost?: number;
}

// ==========================================
//  JOB STATUS
// ==========================================

export interface JobStatusResponse {
  jobId: string;
  jobType: string;
  status: "QUEUED" | "PRE_PROCESSING" | "PROCESSING" | "POST_PROCESSING" | "COMPLETED" | "FAILED";
  progress?: number; // 0-100
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  result?: any;
}
