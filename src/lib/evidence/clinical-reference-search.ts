import { searchPubMedWithAbstracts, searchFdaDrugLabels, searchRxNormDrug, searchWhoIndicator } from './medical-sources';

export interface ClinicalReferenceSource {
  sourceType: 'PUBMED' | 'REFERENCE_SOURCE_POLICY' | 'FDA' | 'RXNORM' | 'WHO_GUIDELINE' | 'OTHER';
  title: string;
  organization: string | null;
  year: string | null;
  url: string | null;
  identifier: string | null;
  snippet: string;
  strength: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ClinicalReferenceQueryResult {
  diagnosisCode: string;
  diagnosisName: string;
  query: string;
  sources: ClinicalReferenceSource[];
}

export interface ClinicalReferenceSearchContext {
  sourcePolicy: 'DIAGNOSIS_PROCEDURE_EXTERNAL_EVIDENCE_ONLY';
  searchedAt: string;
  allowedUse: string;
  sourceHierarchy: string[];
  queries: ClinicalReferenceQueryResult[];
  limitations: string[];
}

interface DiagnosisSearchInput {
  code?: string | null;
  name?: string | null;
}

interface ProcedureSearchInput {
  code?: string | null;
  name?: string | null;
}

interface MedicationSearchInput {
  name?: string | null;
  genericName?: string | null;
}

export interface ClinicalReferenceSearchInput {
  diagnoses: DiagnosisSearchInput[];
  procedures: ProcedureSearchInput[];
  medications?: MedicationSearchInput[];
}

const MAX_DIAGNOSES = 4;
const MAX_TERMS_PER_DIAGNOSIS = 3;
const MAX_MEDICATION_EVIDENCE_TERMS = 3;
const MAX_SOURCES_PER_DIAGNOSIS = 8;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeQueryTerm(value: unknown): string {
  return stringValue(value)
    .replace(/[()\[\]{}<>"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function buildPubMedQuery(diagnosis: DiagnosisSearchInput, procedures: ProcedureSearchInput[], medications: MedicationSearchInput[]): string {
  const diagnosisTerms = unique([
    normalizeQueryTerm(diagnosis.name),
    normalizeQueryTerm(diagnosis.code),
  ]).filter(Boolean);
  const procedureTerms = unique(procedures.map((procedure) => normalizeQueryTerm(procedure.name || procedure.code))).slice(0, MAX_TERMS_PER_DIAGNOSIS);
  const medicationTerms = unique(medications.map((medication) => normalizeQueryTerm(medication.genericName || medication.name))).slice(0, 2);

  const condition = diagnosisTerms.length > 0 ? `(${diagnosisTerms.map((term) => `${term}[Title/Abstract]`).join(' OR ')})` : '';
  const clinicalTerms = [...procedureTerms, ...medicationTerms];
  const clinicalClause = clinicalTerms.length > 0
    ? ` AND (${clinicalTerms.map((term) => `${term}[Title/Abstract]`).join(' OR ')})`
    : '';
  const evidenceFilter = ' AND (guideline[Publication Type] OR practice guideline[Publication Type] OR review[Publication Type] OR systematic review[Title/Abstract] OR consensus[Title/Abstract] OR treatment[Title/Abstract] OR diagnosis[Title/Abstract])';
  return `${condition}${clinicalClause}${evidenceFilter}`.trim();
}

async function fetchSourcesForDiagnosis(diagnosis: DiagnosisSearchInput, procedures: ProcedureSearchInput[], medications: MedicationSearchInput[]): Promise<ClinicalReferenceQueryResult> {
  const diagnosisCode = stringValue(diagnosis.code) || 'UNSPECIFIED';
  const diagnosisName = stringValue(diagnosis.name) || diagnosisCode;
  const evidenceMedications = unique(medications.map((medication) => stringValue(medication.genericName || medication.name)))
    .slice(0, MAX_MEDICATION_EVIDENCE_TERMS);
  const query = buildPubMedQuery(
    diagnosis,
    procedures,
    evidenceMedications.map((name) => ({ name })),
  );

  const [pubMedSources, whoSource, medicationSourceGroups] = await Promise.all([
    query ? searchPubMedWithAbstracts(query, 3) : Promise.resolve([]),
    searchWhoIndicator(diagnosisName),
    Promise.all(evidenceMedications.map(async (medName) => {
      const [rxNormSource, fdaSource] = await Promise.all([
        searchRxNormDrug(medName),
        searchFdaDrugLabels(medName),
      ]);
      return [rxNormSource, fdaSource].filter((source): source is ClinicalReferenceSource => Boolean(source));
    })),
  ]);

  const sources = [
    ...pubMedSources,
    ...(whoSource ? [whoSource] : []),
    ...medicationSourceGroups.flat(),
  ].slice(0, MAX_SOURCES_PER_DIAGNOSIS);

  return { diagnosisCode, diagnosisName, query, sources };
}

function buildSourcePolicyReference(): ClinicalReferenceSource {
  return {
    sourceType: 'REFERENCE_SOURCE_POLICY',
    title: 'CONSUL clinical evidence source hierarchy inspired by medical-mcp source families',
    organization: 'CONSUL',
    year: null,
    url: null,
    identifier: null,
    snippet: 'Prefer Indonesian Kemenkes/PNPK and internal clinical pathway references; then WHO/specialty guidelines, Cochrane, PubMed, ClinicalTrials.gov, FDA/RxNorm for drug nomenclature/safety, AAP for pediatric cases, and top medical journals. Google Scholar is discovery-only and not a sole adjudication source.',
    strength: 'HIGH',
  };
}

export async function buildClinicalReferenceSearchContext(input: ClinicalReferenceSearchInput): Promise<ClinicalReferenceSearchContext> {
  const diagnoses = input.diagnoses.slice(0, MAX_DIAGNOSES);
  const procedures = input.procedures;
  const medications = input.medications || [];
  
  // Fetch for all diagnoses concurrently
  const queries = await Promise.all(diagnoses.map((diagnosis) => fetchSourcesForDiagnosis(diagnosis, procedures, medications)));

  return {
    sourcePolicy: 'DIAGNOSIS_PROCEDURE_EXTERNAL_EVIDENCE_ONLY',
    searchedAt: new Date().toISOString(),
    allowedUse: 'External medical references are allowed only to support AI clinical reasoning for diagnosis-procedure and diagnosis-medication relevance. They must not drive tariff, pricing, policy, FWA, payable, or automatic denial logic.',
    sourceHierarchy: [
      'Indonesia: Kemenkes/PNPK/Formularium Nasional/internal clinical pathway when available',
      'WHO and specialty society clinical guidelines',
      'Cochrane/systematic reviews and PubMed indexed guidelines/reviews/studies',
      'ClinicalTrials.gov for trial context only',
      'FDA/RxNorm for medication nomenclature and safety only',
      'AAP for pediatric claims',
      'NEJM/JAMA/Lancet/BMJ/Nature Medicine and other reputable journals',
      'Google Scholar discovery only; not a primary or sole adjudication source',
    ],
    queries: queries.map((queryResult, index) => ({
      ...queryResult,
      sources: index === 0 ? [buildSourcePolicyReference(), ...queryResult.sources] : queryResult.sources,
    })),
    limitations: [
      'PubMed search uses diagnosis/procedure/medication terms only and never includes patient identifiers.',
      'Search results are evidence context for AI reasoning and human review, not deterministic claim denial rules.',
      'Absence of search results does not prove that a procedure is inappropriate.',
      'MCP servers and Google Scholar scraping are not used by CONSUL runtime. Direct APIs are used instead.',
    ],
  };
}
