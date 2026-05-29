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

function buildQueryVariants(drug: { name: string; genericName?: string | null; dosage?: string | null }) {
  const baseNames = Array.from(new Set([
    drug.name,
    drug.genericName || '',
    [drug.genericName, drug.dosage].filter(Boolean).join(' '),
    [drug.name, drug.dosage].filter(Boolean).join(' '),
  ].map((value) => value.trim()).filter(Boolean)));

  return Array.from(new Set(baseNames.flatMap((name) => [
    `${name} harga obat Indonesia`,
    `${name} beli obat online`,
    `${name} apotek online`,
    `${name} Halodoc K24 Farmaku`,
  ])));
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

export async function crawlIndonesianDrugPrice(drug: { name: string; genericName?: string | null; dosage?: string | null }): Promise<DrugWebPriceResult> {
  const queryVariants = buildQueryVariants(drug);
  const directUrls = queryVariants.slice(0, 3).flatMap(buildDirectSearchUrls);
  const discoveredUrls = (await Promise.allSettled(queryVariants.slice(0, 4).map(searchTrustedDrugUrls)))
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
  }).slice(0, 18);

  const candidates: Array<{ price: number; source: string }> = [];

  const crawlResults = await Promise.allSettled(uniqueResults.slice(0, 12).map(async (result) => {
    const snippetPrices = extractPrices(stripHtml(result.snippet || ''));
    const pageText = await fetchPageText(result.url);
    const pagePrices = extractPrices(pageText);
    return { result, prices: [...snippetPrices, ...pagePrices].filter((price, index, array) => array.indexOf(price) === index) };
  }));

  for (const crawled of crawlResults) {
    if (crawled.status !== 'fulfilled') continue;
    const { result, prices } = crawled.value;
    for (const price of prices.slice(0, 5)) {
      candidates.push({
        price,
        source: `${sourceNameFromUrl(result.url)} | ${result.title || drug.name} | internet crawl | listed price Rp ${price.toLocaleString('id-ID')} | unit conversion not available, treated as displayed unit price | Rp ${price.toLocaleString('id-ID')} | ${result.url}`,
      });
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
    resolvedProductName: drug.genericName || drug.name,
    dosageForm: inferred.dosageForm,
    unitBasis: inferred.unitBasis,
  };
}
