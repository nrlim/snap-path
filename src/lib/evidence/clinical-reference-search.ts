export interface ClinicalReferenceSource {
  sourceType: 'PUBMED' | 'REFERENCE_SOURCE_POLICY';
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

interface PubMedSearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface PubMedSummaryItem {
  uid?: string;
  title?: string;
  fulljournalname?: string;
  pubdate?: string;
  elocationid?: string;
  articleids?: Array<{
    idtype?: string;
    value?: string;
  }>;
}

interface PubMedSummaryResponse {
  result?: Record<string, PubMedSummaryItem | string[]>;
}

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const FETCH_TIMEOUT_MS = 4500;
const MAX_DIAGNOSES = 4;
const MAX_TERMS_PER_DIAGNOSIS = 5;

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

async function fetchJsonWithTimeout<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

function extractYear(pubdate: string | undefined): string | null {
  const match = stringValue(pubdate).match(/\b(19|20)\d{2}\b/);
  return match?.[0] || null;
}

function extractDoi(item: PubMedSummaryItem): string | null {
  const doi = item.articleids?.find((articleId) => articleId.idtype === 'doi')?.value;
  if (doi) return doi;
  const location = stringValue(item.elocationid);
  const match = location.match(/10\.\S+/);
  return match?.[0] || null;
}

async function searchPubMedForDiagnosis(diagnosis: DiagnosisSearchInput, procedures: ProcedureSearchInput[], medications: MedicationSearchInput[]): Promise<ClinicalReferenceQueryResult> {
  const diagnosisCode = stringValue(diagnosis.code) || 'UNSPECIFIED';
  const diagnosisName = stringValue(diagnosis.name) || diagnosisCode;
  const query = buildPubMedQuery(diagnosis, procedures, medications);
  if (!query) return { diagnosisCode, diagnosisName, query: '', sources: [] };

  const searchUrl = `${PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&retmode=json&retmax=4&sort=relevance&term=${encodeURIComponent(query)}`;
  const search = await fetchJsonWithTimeout<PubMedSearchResponse>(searchUrl);
  const ids = search?.esearchresult?.idlist || [];
  if (ids.length === 0) return { diagnosisCode, diagnosisName, query, sources: [] };

  const summaryUrl = `${PUBMED_BASE_URL}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(','))}`;
  const summary = await fetchJsonWithTimeout<PubMedSummaryResponse>(summaryUrl);
  const result = summary?.result || {};
  const sources = ids.map((id): ClinicalReferenceSource | null => {
    const item = result[id];
    if (!item || Array.isArray(item)) return null;
    const title = stringValue(item.title);
    if (!title) return null;
    const doi = extractDoi(item);
    return {
      sourceType: 'PUBMED',
      title,
      organization: stringValue(item.fulljournalname) || null,
      year: extractYear(item.pubdate),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      identifier: doi ? `PMID:${id}; DOI:${doi}` : `PMID:${id}`,
      snippet: `PubMed indexed article related to ${diagnosisName} and claimed clinical items. Use as supporting reference, not as automatic denial basis.`,
      strength: title.toLowerCase().includes('guideline') || title.toLowerCase().includes('systematic review') ? 'HIGH' : 'MEDIUM',
    };
  }).filter((source): source is ClinicalReferenceSource => Boolean(source));

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
  const queries = await Promise.all(diagnoses.map((diagnosis) => searchPubMedForDiagnosis(diagnosis, procedures, medications)));

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
      'MCP servers and Google Scholar scraping are not used by CONSUL runtime.',
    ],
  };
}
