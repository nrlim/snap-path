const DEFAULT_DOCUMENT_BUCKET = 'claim-documents';

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
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    bucket,
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

async function ensureBucket(): Promise<ReturnType<typeof getSupabaseStorageConfig>> {
  const config = getSupabaseStorageConfig();
  const bucketUrl = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const getBucket = await fetch(bucketUrl, {
    headers: storageHeaders(config.serviceRoleKey),
    cache: 'no-store',
  });

  if (getBucket.ok) return config;

  const bucketErrorText = await getBucket.text();
  const bucketNotFound = getBucket.status === 404 || bucketErrorText.includes('Bucket not found') || bucketErrorText.includes('"statusCode":"404"');

  if (!bucketNotFound) {
    throw new Error(`Gagal mengecek bucket Supabase Storage: ${bucketErrorText}`);
  }

  const createBucket = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey, 'application/json'),
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    }),
  });

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
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...storageHeaders(config.serviceRoleKey, file.type || 'application/octet-stream'),
      'x-upsert': 'true',
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

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

async function createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string | null> {
  const config = getSupabaseStorageConfig();
  const signUrl = `${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
  const response = await fetch(signUrl, {
    method: 'POST',
    headers: storageHeaders(config.serviceRoleKey, 'application/json'),
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) return null;

  const data = await response.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) return null;

  return signedPath.startsWith('http') ? signedPath : `${config.supabaseUrl}/storage/v1${signedPath}`;
}
