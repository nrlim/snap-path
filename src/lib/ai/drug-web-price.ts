type DrugSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type DrugWebPriceResult = {
  marketPriceMax: number;
  marketPriceAvg: number | null;
  sources: string[];
  resolvedProductName?: string;
  dosageForm?: string;
  unitBasis?: string;
};

const TRUSTED_HOSTS = [
  'halodoc.com',
  'k24klik.com',
  'farmaku.com',
  'goapotik.com',
  'lifepack.id',
  'klikdokter.com',
  'alodokter.com',
  'kimiafarmaapotek.co.id',
  'sehatq.com',
  'blibli.com',
  'tokopedia.com',
  'shopee.co.id',
  'mims.com',
  'satusehat.kemkes.go.id',
  'e-katalog.lkpp.go.id',
];

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePrice(raw: string) {
  const numeric = raw.replace(/[^\d]/g, '');
  const value = Number(numeric);
  if (!Number.isFinite(value)) return 0;
  return value;
}

function extractPrices(text: string) {
  const prices = new Set<number>();
  const pricePattern = /(?:Rp\.?|IDR)\s*([0-9]{1,3}(?:[.\s][0-9]{3})+|[0-9]{4,9})(?:,\d{2})?/gi;
  let match: RegExpExecArray | null;

  while ((match = pricePattern.exec(text)) !== null) {
    const price = normalizePrice(match[1] || '');
    // Filter out tiny admin fees and very large package totals unlikely to be a single drug unit.
    if (price >= 100 && price <= 5_000_000) prices.add(price);
  }

  return Array.from(prices);
}

function buildDrugTerms(drug: { name: string; genericName?: string | null; dosage?: string | null }) {
  const stopWords = new Set([
    'harga', 'obat', 'indonesia', 'beli', 'online', 'apotek', 'tablet', 'tab', 'kapsul', 'capsule', 'cap',
    'sirup', 'syrup', 'injeksi', 'injection', 'inj', 'vial', 'ampul', 'ampoule', 'infus', 'infusion',
    'botol', 'bottle', 'strip', 'dan', 'atau', 'with', 'mg', 'ml', 'gram', 'generic', 'generik',
  ]);
  const raw = [drug.name, drug.genericName || '', drug.dosage || ''].join(' ').toLowerCase();
  return Array.from(new Set(raw
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !stopWords.has(term) && !/^\d+$/.test(term))));
}

function calculateContextSimilarity(context: string, drugTerms: string[]) {
  if (drugTerms.length === 0) return 0;
  const normalizedContext = context.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const matchedTerms = drugTerms.filter((term) => normalizedContext.includes(term));
  const coverage = matchedTerms.length / drugTerms.length;

  // Stronger confidence when strength tokens such as 500mg, 1g, or 5ml match near the price.
  const strengthTerms = drugTerms.filter((term) => /\d/.test(term));
  const strengthCoverage = strengthTerms.length > 0
    ? strengthTerms.filter((term) => normalizedContext.includes(term)).length / strengthTerms.length
    : 1;

  return (coverage * 0.75) + (strengthCoverage * 0.25);
}

function extractMatchedPrices(text: string, drugTerms: string[], minSimilarity = 0.6) {
  if (drugTerms.length === 0) return [];

  const normalizedText = text.toLowerCase();
  if (!drugTerms.some((term) => normalizedText.includes(term))) return [];

  const prices = new Set<number>();
  const pricePattern = /(?:Rp\.?|IDR)\s*([0-9]{1,3}(?:[.\s][0-9]{3})+|[0-9]{4,9})(?:,\d{2})?/gi;
  let match: RegExpExecArray | null;

  while ((match = pricePattern.exec(text)) !== null) {
    const price = normalizePrice(match[1] || '');
    if (price < 100 || price > 5_000_000) continue;

    const contextStart = Math.max(0, match.index - 320);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 320);
    const context = text.slice(contextStart, contextEnd);
    if (calculateContextSimilarity(context, drugTerms) >= minSimilarity) prices.add(price);
  }

  return Array.from(prices);
}

function inferDosageForm(drugName: string) {
  const name = drugName.toLowerCase();
  if (/infus|infusion|ringer|nacl|rl\b/.test(name)) return { dosageForm: 'infusion_bottle', unitBasis: 'per bottle' };
  if (/inj|injeksi|injection|vial/.test(name)) return { dosageForm: 'injection_vial', unitBasis: 'per vial' };
  if (/ampul|ampoule|ampul/.test(name)) return { dosageForm: 'injection_ampoule', unitBasis: 'per ampoule' };
  if (/sirup|syrup|suspensi|drops/.test(name)) return { dosageForm: 'syrup_bottle', unitBasis: 'per bottle' };
  if (/kapsul|capsule|cap\b/.test(name)) return { dosageForm: 'capsule', unitBasis: 'per capsule' };
  if (/tablet|tab\b/.test(name)) return { dosageForm: 'tablet', unitBasis: 'per tablet' };
  return { dosageForm: 'unknown', unitBasis: 'per smallest dispensable unit' };
}

function sourceNameFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || host;
  } catch {
    return 'web';
  }
}

async function fetchPageHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SnapPathDrugPriceBot/1.0; +https://snappath.local)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return '';
    return (await response.text()).slice(0, 600_000);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageText(url: string) {
  return stripHtml(await fetchPageHtml(url));
}

function isTrustedUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return TRUSTED_HOSTS.some((trustedHost) => host === trustedHost || host.endsWith(`.${trustedHost}`));
  } catch {
    return false;
  }
}

type DrugSearchStage = {
  name: 'exact' | 'generic' | 'relaxed';
  queries: string[];
  terms: string[];
  minSimilarity: number;
};

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeSearchPhrase(value: string) {
  return value
    .replace(/\b(tablet|tab|kapsul|capsule|cap|sirup|syrup|injeksi|injection|inj|vial|ampul|ampoule|infus|infusion|botol|bottle|strip)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueriesForName(name: string) {
  return uniqueNonEmpty([
    `"${name}" harga obat Indonesia`,
    `${name} harga obat Indonesia`,
    `${name} beli obat online`,
    `${name} apotek online`,
    `${name} Halodoc K24 Farmaku`,
  ]);
}

function buildSearchStages(drug: { name: string; genericName?: string | null; dosage?: string | null }): DrugSearchStage[] {
  const exactNames = uniqueNonEmpty([
    [drug.name, drug.dosage || ''].filter(Boolean).join(' '),
    drug.name,
  ]);

  const genericNames = uniqueNonEmpty([
    [drug.genericName || '', drug.dosage || ''].filter(Boolean).join(' '),
    drug.genericName || '',
  ]);

  const relaxedNames = uniqueNonEmpty([
    normalizeSearchPhrase([drug.name, drug.dosage || ''].filter(Boolean).join(' ')),
    normalizeSearchPhrase([drug.genericName || '', drug.dosage || ''].filter(Boolean).join(' ')),
  ]).filter((name) => name.length >= 4);

  return [
    {
      name: 'exact' as const,
      queries: exactNames.flatMap(buildQueriesForName).slice(0, 6),
      terms: buildDrugTerms({ name: drug.name, dosage: drug.dosage }),
      minSimilarity: 0.6,
    },
    {
      name: 'generic' as const,
      queries: genericNames.flatMap(buildQueriesForName).slice(0, 5),
      terms: buildDrugTerms({ name: drug.genericName || '', dosage: drug.dosage }),
      minSimilarity: 0.65,
    },
    {
      name: 'relaxed' as const,
      queries: relaxedNames.flatMap(buildQueriesForName).slice(0, 4),
      terms: buildDrugTerms({ name: relaxedNames.join(' '), dosage: drug.dosage }),
      minSimilarity: 0.8,
    },
  ].filter((stage) => stage.queries.length > 0 && stage.terms.length > 0);
}

function buildDirectSearchUrls(query: string) {
  const encoded = encodeURIComponent(query);
  return [
    `https://www.halodoc.com/obat-dan-vitamin/search/${encoded}`,
    `https://www.k24klik.com/search?q=${encoded}`,
    `https://www.farmaku.com/catalogsearch/result/?q=${encoded}`,
    `https://www.goapotik.com/search?keyword=${encoded}`,
    `https://lifepack.id/search?keyword=${encoded}`,
    `https://www.klikdokter.com/search?query=${encoded}`,
    `https://www.alodokter.com/search?s=${encoded}`,
    `https://www.sehatq.com/cari?keyword=${encoded}`,
    `https://www.mims.com/indonesia/drug/search?q=${encoded}`,
    `https://www.mims.com/indonesia/search?q=${encoded}`,
    `https://satusehat.kemkes.go.id/sdmk/search?keyword=${encoded}`,
    `https://satusehat.kemkes.go.id/platform/search?keyword=${encoded}`,
    `https://e-katalog.lkpp.go.id/id/search-produk?keyword=${encoded}`,
  ];
}

function extractUrls(text: string) {
  const urls = new Set<string>();
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(text)) !== null) {
    try {
      const rawUrl = match[0].replace(/&amp;/g, '&');
      const url = new URL(rawUrl);
      const decoded = url.searchParams.get('uddg') || rawUrl;
      if (isTrustedUrl(decoded)) urls.add(decoded);
    } catch {
      // Ignore malformed URLs from search result markup.
    }
  }
  return Array.from(urls);
}

async function searchTrustedDrugUrls(query: string) {
  const encoded = encodeURIComponent(query);
  const searchUrls = [
    `https://duckduckgo.com/html/?q=${encoded}`,
    `https://www.bing.com/search?q=${encoded}`,
  ];

  const responses = await Promise.allSettled(searchUrls.map((url) => fetchPageHtml(url)));
  return responses.flatMap((response) => response.status === 'fulfilled' ? extractUrls(response.value) : []);
}

async function collectCandidatesForStage(
  drug: { name: string; genericName?: string | null; dosage?: string | null },
  stage: DrugSearchStage,
) {
  const directUrls = stage.queries.slice(0, 3).flatMap(buildDirectSearchUrls);
  const discoveredUrls = (await Promise.allSettled(stage.queries.slice(0, 3).map(searchTrustedDrugUrls)))
    .flatMap((result) => result.status === 'fulfilled' ? result.value : []);

  const results: DrugSearchResult[] = [...directUrls, ...discoveredUrls].map((url) => ({
    title: sourceNameFromUrl(url),
    url,
    snippet: '',
  }));

  const seenUrls = new Set<string>();
  const uniqueResults = results.filter((result) => {
    if (!result.url || seenUrls.has(result.url)) return false;
    seenUrls.add(result.url);
    return isTrustedUrl(result.url);
  }).slice(0, 12);

  const crawlResults = await Promise.allSettled(uniqueResults.slice(0, 8).map(async (result) => {
    const snippetPrices = extractMatchedPrices(stripHtml(result.snippet || ''), stage.terms, stage.minSimilarity);
    const pageText = await fetchPageText(result.url);
    const pagePrices = extractMatchedPrices(pageText, stage.terms, stage.minSimilarity);
    return { result, prices: [...snippetPrices, ...pagePrices].filter((price, index, array) => array.indexOf(price) === index) };
  }));

  const candidates: Array<{ price: number; source: string }> = [];
  for (const crawled of crawlResults) {
    if (crawled.status !== 'fulfilled') continue;
    const { result, prices } = crawled.value;
    for (const price of prices.slice(0, 4)) {
      candidates.push({
        price,
        source: `${sourceNameFromUrl(result.url)} | ${result.title || drug.name} | internet crawl verification_v2 retry_stage=${stage.name} | listed price Rp ${price.toLocaleString('id-ID')} | unit conversion not available, treated as displayed unit price | Rp ${price.toLocaleString('id-ID')} | ${result.url}`,
      });
    }
  }

  return candidates;
}

export async function crawlIndonesianDrugPrice(drug: { name: string; genericName?: string | null; dosage?: string | null }): Promise<DrugWebPriceResult> {
  const stages = buildSearchStages(drug).slice(0, 3);
  let candidates: Array<{ price: number; source: string }> = [];
  let resolvedStage: DrugSearchStage['name'] | null = null;

  // Bounded retry strategy: exact brand/name first, generic second, relaxed keyword last.
  // Each stage has finite query/url/fetch limits and fetchPageHtml has its own timeout,
  // so the workflow cannot loop forever or get stuck on one drug.
  for (const stage of stages) {
    const stageCandidates = await collectCandidatesForStage(drug, stage);
    if (stageCandidates.length > 0) {
      candidates = stageCandidates;
      resolvedStage = stage.name;
      break;
    }
  }

  if (candidates.length === 0) {
    return { marketPriceMax: 0, marketPriceAvg: null, sources: [] };
  }

  // Prefer the upper bound among crawled references for conservative claim validation.
  const sorted = candidates.sort((a, b) => a.price - b.price);
  const prices = sorted.map((candidate) => candidate.price);
  const marketPriceMax = prices[prices.length - 1] || 0;
  const marketPriceAvg = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  const inferred = inferDosageForm(`${drug.name} ${drug.dosage || ''}`);

  return {
    marketPriceMax,
    marketPriceAvg: prices.length >= 2 ? marketPriceAvg : null,
    sources: sorted.slice(-5).reverse().map((candidate) => candidate.source),
    resolvedProductName: resolvedStage === 'generic' ? (drug.genericName || drug.name) : drug.name,
    dosageForm: inferred.dosageForm,
    unitBasis: inferred.unitBasis,
  };
}
