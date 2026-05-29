import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { uploadClaimDocumentToSupabaseStorage } from '@/lib/supabase-storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'document';
}

function getExtension(file: File): string {
  const extension = file.name.split('.').pop();
  if (extension && extension.length <= 8) return sanitizePathSegment(extension);

  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';

  return 'bin';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || typeof session.sub !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const documentType = String(formData.get('documentType') || 'document');
    const claimId = String(formData.get('claimId') || 'draft');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File dokumen wajib diunggah.' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Gunakan PDF, JPG, PNG, atau WEBP.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Ukuran file maksimal 10 MB.' },
        { status: 400 },
      );
    }

    const userId = sanitizePathSegment(session.sub);
    const safeClaimId = sanitizePathSegment(claimId);
    const safeDocumentType = sanitizePathSegment(documentType);
    const objectPath = [
      'claims',
      safeClaimId,
      userId,
      `${safeDocumentType}-${crypto.randomUUID()}.${getExtension(file)}`,
    ].join('/');

    const upload = await uploadClaimDocumentToSupabaseStorage(file, objectPath);

    return NextResponse.json({
      success: true,
      document: {
        type: documentType,
        url: upload.signedUrl,
        storageBucket: upload.bucket,
        storagePath: upload.path,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[document-upload]', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Upload dokumen gagal.' },
      { status: 500 },
    );
  }
}
