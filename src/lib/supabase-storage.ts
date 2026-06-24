import https from 'node:https';

const DEFAULT_DOCUMENT_BUCKET = 'claim-documents';
const DEFAULT_DOCUMENT_BUCKET_FILE_SIZE_LIMIT = 100 * 1024 * 1024;
const MIN_DOCUMENT_BUCKET_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/octet-stream',
];

interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  fileSizeLimit: number;
}

interface SupabaseSignedUploadUrlResponse {
  url?: string;
  signedURL?: string;
  signedUrl?: string;
  signed_url?: string;
  token?: string;
}

export interface SupabaseUploadResult {
  bucket: string;
  path: string;
  signedUrl: string | null;
}

let ensureBucketPromise: Promise<SupabaseStorageConfig> | null = null;

function resolveDocumentBucketFileSizeLimit(): number {
  const configuredLimitsMb = [
    process.env.SUPABASE_DOCUMENT_BUCKET_FILE_SIZE_LIMIT_MB,
    process.env.OCR_MAX_PDF_UPLOAD_MB,
  ]
    .map((rawLimitMb) => (rawLimitMb ? Number.parseInt(rawLimitMb, 10) : Number.NaN))
    .filter((limitMb) => Number.isFinite(limitMb) && limitMb > 0);

  if (configuredLimitsMb.length === 0) return DEFAULT_DOCUMENT_BUCKET_FILE_SIZE_LIMIT;

  return Math.max(MIN_DOCUMENT_BUCKET_FILE_SIZE_LIMIT, Math.max(...configuredLimitsMb) * 1024 * 1024);
}

function getSupabaseStorageConfig(): SupabaseStorageConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_DOCUMENT_BUCKET || DEFAULT_DOCUMENT_BUCKET;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Storage env belum lengkap. Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di server env.');
  }

  return {
    supabaseUrl: supabaseUrl.trim().replace(/\/$/, ''),
    serviceRoleKey: serviceRoleKey.trim(),
    bucket: bucket.trim(),
    fileSizeLimit: resolveDocumentBucketFileSizeLimit(),
  };
}

function storageHeaders(serviceRoleKey: string, contentType?: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...(contentType ? { 'content-type': contentType } : {}),
  };
}

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNetworkErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown network error';

  const details: string[] = [];
  if (error.message) details.push(error.message);

  const cause = error.cause;
  if (isRecord(cause)) {
    const code = typeof cause.code === 'string' ? cause.code : undefined;
    const syscall = typeof cause.syscall === 'string' ? cause.syscall : undefined;
    const hostname = typeof cause.hostname === 'string' ? cause.hostname : undefined;
    const causeMessage = typeof cause.message === 'string' ? cause.message : undefined;

    if (code) details.push(`code=${code}`);
    if (syscall) details.push(`syscall=${syscall}`);
    if (hostname) details.push(`host=${hostname}`);
    if (causeMessage && causeMessage !== error.message) details.push(causeMessage);
  }

  return details.length > 0 ? details.join('; ') : 'unknown network error';
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function requestBodyToBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (!body) return undefined;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  return undefined;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSupabaseStorageWithHttpsFallback(url: string, init: RequestInit): Promise<Response> {
  const parsedUrl = new URL(url);
  const body = requestBodyToBuffer(init.body);
  const headers = normalizeHeaders(init.headers);

  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['content-length'] = body.byteLength.toString();
  }

  return await new Promise<Response>((resolve, reject) => {
    const request = https.request(
      parsedUrl,
      {
        method: init.method ?? 'GET',
        headers,
        family: 4,
        timeout: 15000,
      },
      (incomingMessage) => {
        const chunks: Buffer[] = [];

        incomingMessage.on('data', (chunk: Buffer) => chunks.push(chunk));
        incomingMessage.on('end', () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(incomingMessage.headers)) {
            if (typeof value === 'string') responseHeaders.set(key, value);
            if (Array.isArray(value)) responseHeaders.set(key, value.join(', '));
          }

          resolve(new Response(Buffer.concat(chunks), {
            status: incomingMessage.statusCode ?? 500,
            statusText: incomingMessage.statusMessage,
            headers: responseHeaders,
          }));
        });
      },
    );

    request.on('timeout', () => request.destroy(new Error('HTTPS request timeout')));
    request.on('error', reject);

    if (body) request.write(body);
    request.end();
  });
}

async function fetchSupabaseStorage(url: string, init: RequestInit, action: string): Promise<Response> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init, 15000);
    } catch (error: unknown) {
      lastError = error;
      if (attempt < maxAttempts) await wait(400 * attempt);
    }
  }

  try {
    return await fetchSupabaseStorageWithHttpsFallback(url, init);
  } catch (fallbackError: unknown) {
    throw new Error(
      `Gagal menghubungi Supabase Storage saat ${action}. Periksa SUPABASE_URL, DNS/jaringan, dan status project Supabase. Detail: ${getNetworkErrorMessage(lastError)}. Fallback IPv4 juga gagal: ${getNetworkErrorMessage(fallbackError)}`,
    );
  }
}

async function updateBucketConfig(config: SupabaseStorageConfig): Promise<void> {
  const updateBucket = await fetchSupabaseStorage(`${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`, {
    method: 'PUT',
    headers: storageHeaders(config.serviceRoleKey, 'application/json'),
    body: JSON.stringify({
      public: false,
      file_size_limit: config.fileSizeLimit,
      allowed_mime_types: DOCUMENT_ALLOWED_MIME_TYPES,
    }),
  }, 'memperbarui konfigurasi bucket');

  if (!updateBucket.ok) {
    const errorText = await updateBucket.text();
    throw new Error(`Gagal memperbarui konfigurasi bucket Supabase Storage: ${errorText}`);
  }
}

async function ensureBucketInternal(): Promise<SupabaseStorageConfig> {
  const config = getSupabaseStorageConfig();
  const bucketUrl = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const getBucket = await fetchSupabaseStorage(bucketUrl, {
    headers: storageHeaders(config.serviceRoleKey),
    cache: 'no-store',
  }, 'mengecek bucket');

  if (getBucket.ok) {
    await updateBucketConfig(config);
    return config;
  }

  const bucketErrorText = await getBucket.text();
  const bucketNotFound = getBucket.status === 404 || bucketErrorText.includes('Bucket not found') || bucketErrorText.includes('"statusCode":"404"');

  if (!bucketNotFound) {
    throw new Error(`Gagal mengecek bucket Supabase Storage: ${bucketErrorText}`);
  }

  const createBucket = await fetchSupabaseStorage(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey, 'application/json'),
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: false,
      file_size_limit: config.fileSizeLimit,
      allowed_mime_types: DOCUMENT_ALLOWED_MIME_TYPES,
    }),
  }, 'membuat bucket');

  if (!createBucket.ok && createBucket.status !== 409) {
    const errorText = await createBucket.text();
    throw new Error(`Gagal membuat bucket Supabase Storage: ${errorText}`);
  }

  if (createBucket.status === 409) {
    await updateBucketConfig(config);
  }

  return config;
}

async function ensureBucket(): Promise<SupabaseStorageConfig> {
  ensureBucketPromise ??= ensureBucketInternal().catch((error: unknown) => {
    ensureBucketPromise = null;
    throw error;
  });

  return ensureBucketPromise;
}

export async function uploadClaimDocumentToSupabaseStorage(
  file: File,
  path: string,
): Promise<SupabaseUploadResult> {
  const config = await ensureBucket();
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`;
  const upload = await fetchSupabaseStorage(uploadUrl, {
    method: 'POST',
    headers: {
      ...storageHeaders(config.serviceRoleKey, file.type || 'application/octet-stream'),
      'x-upsert': 'true',
    },
    body: Buffer.from(await file.arrayBuffer()),
  }, 'mengunggah dokumen');

  if (!upload.ok) {
    const errorText = await upload.text();
    throw new Error(`Upload dokumen ke Supabase Storage gagal: ${errorText}`);
  }

  const signedUrl = await createSignedUrl(config.bucket, path, 60 * 60 * 24 * 7);

  return {
    bucket: config.bucket,
    path,
    signedUrl,
  };
}

export async function createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string | null> {
  const config = getSupabaseStorageConfig();
  const signUrl = `${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
  const response = await fetchSupabaseStorage(signUrl, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey, 'application/json'),
    body: JSON.stringify({ expiresIn }),
  }, 'membuat signed URL');

  if (!response.ok) return null;

  const data = await response.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) return null;

  return signedPath.startsWith('http') ? signedPath : `${config.supabaseUrl}/storage/v1${signedPath}`;
}

export async function deleteClaimDocumentFromSupabaseStorage(path: string): Promise<boolean> {
  const config = getSupabaseStorageConfig();
  const deleteUrl = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`;
  const response = await fetchSupabaseStorage(deleteUrl, {
    method: 'DELETE',
    headers: storageHeaders(config.serviceRoleKey),
  }, 'menghapus dokumen');
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gagal menghapus dokumen dari Supabase Storage: ${errorText}`);
    return false;
  }
  return true;
}

export async function createSignedUploadUrl(path: string): Promise<{ signedUrl: string; path: string }> {
  const config = getSupabaseStorageConfig();
  const signUrl = `${config.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`;
  const response = await fetchSupabaseStorage(signUrl, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey),
  }, 'membuat signed upload URL');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal membuat upload URL: ${errorText}`);
  }

  const data = await response.json() as SupabaseSignedUploadUrlResponse;
  const signedUploadPath = data.url ?? data.signedURL ?? data.signedUrl ?? data.signed_url
    ?? (data.token ? `/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}?token=${encodeURIComponent(data.token)}` : undefined);

  if (!signedUploadPath) {
    throw new Error('Supabase Storage tidak mengembalikan URL upload yang valid.');
  }

  const uploadPath = signedUploadPath.startsWith('/') ? signedUploadPath : `/${signedUploadPath}`;
  const uploadUrl = signedUploadPath.startsWith('http') ? signedUploadPath : `${config.supabaseUrl}/storage/v1${uploadPath}`;

  return {
    signedUrl: uploadUrl,
    path,
  };
}

export async function downloadClaimDocument(path: string): Promise<ArrayBuffer> {
  const config = getSupabaseStorageConfig();
  const downloadUrl = `${config.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`;
  const response = await fetchSupabaseStorage(downloadUrl, {
    method: 'GET',
    headers: storageHeaders(config.serviceRoleKey),
  }, 'mengunduh dokumen');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mengunduh dokumen dari Supabase: ${errorText}`);
  }

  return response.arrayBuffer();
}
