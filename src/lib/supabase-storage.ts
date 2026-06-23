const DEFAULT_DOCUMENT_BUCKET = 'claim-documents';
const DOCUMENT_BUCKET_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/octet-stream',
];

export interface SupabaseUploadResult {
  bucket: string;
  path: string;
  signedUrl: string | null;
}

function getSupabaseStorageConfig() {
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

function getNetworkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'unknown network error';
}

async function fetchSupabaseStorage(url: string, init: RequestInit, action: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error: unknown) {
    throw new Error(
      `Gagal menghubungi Supabase Storage saat ${action}. Periksa SUPABASE_URL, DNS/jaringan, dan status project Supabase. Detail: ${getNetworkErrorMessage(error)}`,
    );
  }
}

async function ensureBucket(): Promise<ReturnType<typeof getSupabaseStorageConfig>> {
  const config = getSupabaseStorageConfig();
  const bucketUrl = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const getBucket = await fetchSupabaseStorage(bucketUrl, {
    headers: storageHeaders(config.serviceRoleKey),
    cache: 'no-store',
  }, 'mengecek bucket');

  if (getBucket.ok) return config;

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
      file_size_limit: DOCUMENT_BUCKET_FILE_SIZE_LIMIT,
      allowed_mime_types: DOCUMENT_ALLOWED_MIME_TYPES,
    }),
  }, 'membuat bucket');

  if (!createBucket.ok && createBucket.status !== 409) {
    const errorText = await createBucket.text();
    throw new Error(`Gagal membuat bucket Supabase Storage: ${errorText}`);
  }

  return config;
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
  const config = await ensureBucket();
  const signUrl = `${config.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`;
  const response = await fetchSupabaseStorage(signUrl, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey),
  }, 'membuat signed upload URL');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal membuat upload URL: ${errorText}`);
  }

  const data = await response.json() as { url?: string };
  if (!data.url) {
    throw new Error('Supabase Storage tidak mengembalikan URL upload yang valid.');
  }

  const uploadUrl = data.url.startsWith('http') ? data.url : `${config.supabaseUrl}/storage/v1${data.url}`;

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
