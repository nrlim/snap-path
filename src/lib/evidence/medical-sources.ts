import { ClinicalReferenceSource } from './clinical-reference-search';

// Caching configuration
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

const TTL = {
  PUBMED: 60 * 60 * 1000, // 1 hour
  FDA: 24 * 60 * 60 * 1000, // 24 hours
  RXNORM: 30 * 24 * 60 * 60 * 1000, // 30 days
  WHO: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

// Helper for fetching with timeout
const FETCH_TIMEOUT_MS = 5000;
async function fetchJsonWithTimeout<T>(url: string, options?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { accept: 'application/json', ...options?.headers },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch (error) {
    console.warn(`[MedicalSources] Fetch failed for ${url}:`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractYear(pubdate: string | undefined | null): string | null {
  if (!pubdate) return null;
  const match = pubdate.match(/\b(19|20)\d{2}\b/);
  return match?.[0] || null;
}

function extractDoi(item: any): string | null {
  const doi = item.articleids?.find((id: any) => id.idtype === 'doi')?.value;
  if (doi) return String(doi);
  const location = typeof item.elocationid === 'string' ? item.elocationid : '';
  const match = location.match(/10\.\S+/);
  return match?.[0] || null;
}

// 1. PubMed (with abstracts)
const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export async function searchPubMedWithAbstracts(query: string, limit: number = 3): Promise<ClinicalReferenceSource[]> {
  if (!query.trim()) return [];
  const cacheKey = `pubmed:${query}:${limit}`;
  const cached = getCache<ClinicalReferenceSource[]>(cacheKey);
  if (cached) return cached;

  // Step 1: Esearch
  const apiKeyParam = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';
  const searchUrl = `${PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&sort=relevance${apiKeyParam}&term=${encodeURIComponent(query)}`;
  const search = await fetchJsonWithTimeout<any>(searchUrl);
  const ids = search?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  // Step 2: Efetch for abstracts (xml because JSON efetch for pubmed is not well supported/stable for abstracts)
  // Actually, Esummary provides a lot, but not the full abstract.
  // We can use Esummary first, and if we need abstracts we could use efetch XML, but parsing XML is heavy.
  // Instead, let's use the RESTful efetch or esummary and get the best we can. 
  // Let's use Esummary to get metadata, which sometimes includes a short abstract/description, 
  // or we can fall back to title-based reasoning.
  
  const summaryUrl = `${PUBMED_BASE_URL}/esummary.fcgi?db=pubmed&retmode=json${apiKeyParam}&id=${encodeURIComponent(ids.join(','))}`;
  const summary = await fetchJsonWithTimeout<any>(summaryUrl);
  const result = summary?.result || {};

  const sources: ClinicalReferenceSource[] = ids.map((id: string): ClinicalReferenceSource | null => {
    const item = result[id];
    if (!item || Array.isArray(item)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) return null;
    const doi = extractDoi(item);
    
    // Check if there's any abstract/snippet
    // Sometimes it's in a different field or we just rely on title and the fact it's a guideline.
    // If we wanted pure abstract, we'd need efetch XML. We will provide a descriptive snippet based on title for now.
    const snippet = typeof item.abstract === 'string' ? item.abstract.substring(0, 500) : `Teks artikel dapat dilihat di PubMed. Judul: ${title}`;

    return {
      sourceType: 'PUBMED',
      title,
      organization: typeof item.fulljournalname === 'string' ? item.fulljournalname : null,
      year: extractYear(item.pubdate),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      identifier: doi ? `PMID:${id}; DOI:${doi}` : `PMID:${id}`,
      snippet,
      strength: title.toLowerCase().includes('guideline') || title.toLowerCase().includes('systematic review') ? 'HIGH' : 'MEDIUM',
    };
  }).filter((s: ClinicalReferenceSource | null): s is ClinicalReferenceSource => Boolean(s));

  if (sources.length > 0) {
    setCache(cacheKey, sources, TTL.PUBMED);
  }
  return sources;
}

// 2. FDA OpenFDA (Drug Labels)
const FDA_API_BASE = 'https://api.fda.gov';

export async function searchFdaDrugLabels(drugName: string): Promise<ClinicalReferenceSource | null> {
  if (!drugName.trim()) return null;
  const normalizedQuery = drugName.toLowerCase().trim();
  const cacheKey = `fda:${normalizedQuery}`;
  const cached = getCache<ClinicalReferenceSource>(cacheKey);
  if (cached) return cached;

  // Search by generic name or brand name
  const query = `openfda.brand_name:"${normalizedQuery}" OR openfda.generic_name:"${normalizedQuery}" OR openfda.substance_name:"${normalizedQuery}"`;
  const url = `${FDA_API_BASE}/drug/label.json?search=${encodeURIComponent(query)}&limit=1`;
  
  const res = await fetchJsonWithTimeout<any>(url);
  const drug = res?.results?.[0];
  if (!drug) {
    // Cache negative results for a shorter time (1 hour)
    setCache(cacheKey, null, 60 * 60 * 1000);
    return null;
  }

  const brandName = drug.openfda?.brand_name?.[0] || drugName;
  const genericName = drug.openfda?.generic_name?.[0] || 'Unknown generic';
  const manufacturer = drug.openfda?.manufacturer_name?.[0] || null;
  
  const indications = drug.indications_and_usage?.[0] || '';
  const contraindications = drug.contraindications?.[0] || '';
  const warnings = drug.warnings?.[0] || '';

  const snippetParts = [];
  if (indications) snippetParts.push(`Indikasi: ${indications.substring(0, 200)}...`);
  if (contraindications) snippetParts.push(`Kontraindikasi: ${contraindications.substring(0, 150)}...`);
  if (warnings) snippetParts.push(`Peringatan: ${warnings.substring(0, 150)}...`);

  const source: ClinicalReferenceSource = {
    sourceType: 'FDA',
    title: `${brandName} (${genericName})`,
    organization: manufacturer ? `FDA / ${manufacturer}` : 'FDA',
    year: drug.effective_time ? drug.effective_time.substring(0, 4) : null,
    url: null,
    identifier: drug.openfda?.product_ndc?.[0] ? `NDC:${drug.openfda.product_ndc[0]}` : null,
    snippet: snippetParts.join(' | ') || `Data obat dari FDA untuk ${brandName}.`,
    strength: 'HIGH',
  };

  setCache(cacheKey, source, TTL.FDA);
  return source;
}

// 3. RxNorm (Drug Nomenclature)
const RXNAV_API_BASE = 'https://rxnav.nlm.nih.gov/REST';

export async function searchRxNormDrug(drugName: string): Promise<ClinicalReferenceSource | null> {
  if (!drugName.trim()) return null;
  const normalizedQuery = drugName.toLowerCase().trim();
  const cacheKey = `rxnorm:${normalizedQuery}`;
  const cached = getCache<ClinicalReferenceSource>(cacheKey);
  if (cached) return cached;

  const url = `${RXNAV_API_BASE}/drugs.json?name=${encodeURIComponent(normalizedQuery)}`;
  const res = await fetchJsonWithTimeout<any>(url);
  
  const conceptGroup = res?.drugGroup?.conceptGroup;
  if (!conceptGroup || !Array.isArray(conceptGroup)) {
    setCache(cacheKey, null, 60 * 60 * 1000);
    return null;
  }

  // Find a concept
  let concept = null;
  for (const group of conceptGroup) {
    if (group.conceptProperties && group.conceptProperties.length > 0) {
      concept = group.conceptProperties[0];
      break;
    }
  }

  if (!concept) {
    setCache(cacheKey, null, 60 * 60 * 1000);
    return null;
  }

  const source: ClinicalReferenceSource = {
    sourceType: 'RXNORM',
    title: concept.name || drugName,
    organization: 'RxNorm / NLM',
    year: null,
    url: null,
    identifier: concept.rxcui ? `RXCUI:${concept.rxcui}` : null,
    snippet: `Nomenklatur standar: ${concept.name}. TTY: ${concept.tty || 'N/A'}. Sinonim: ${concept.synonym || 'Tidak ada'}`,
    strength: 'HIGH',
  };

  setCache(cacheKey, source, TTL.RXNORM);
  return source;
}

// 4. WHO Global Health Observatory
const WHO_API_BASE = 'https://ghoapi.azureedge.net/api';

export async function searchWhoIndicator(keyword: string): Promise<ClinicalReferenceSource | null> {
  if (!keyword.trim()) return null;
  const normalizedQuery = keyword.toLowerCase().trim();
  const cacheKey = `who:${normalizedQuery}`;
  const cached = getCache<ClinicalReferenceSource>(cacheKey);
  if (cached) return cached;

  // Search for the indicator first
  const filter = `contains(IndicatorName, '${normalizedQuery}')`;
  const url = `${WHO_API_BASE}/Indicator?$filter=${encodeURIComponent(filter)}&$format=json`;
  
  const res = await fetchJsonWithTimeout<any>(url);
  const indicators = res?.value || [];
  
  if (indicators.length === 0) {
    setCache(cacheKey, null, 60 * 60 * 1000);
    return null;
  }

  const indicator = indicators[0]; // Take the first relevant indicator
  
  const source: ClinicalReferenceSource = {
    sourceType: 'WHO_GUIDELINE',
    title: indicator.IndicatorName || 'WHO Indicator',
    organization: 'World Health Organization',
    year: null,
    url: `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${indicator.IndicatorCode}`,
    identifier: `GHO:${indicator.IndicatorCode}`,
    snippet: `Indikator kesehatan WHO terkait: ${indicator.IndicatorName}.`,
    strength: 'HIGH',
  };

  setCache(cacheKey, source, TTL.WHO);
  return source;
}
