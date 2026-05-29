import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteClaimDocumentFromSupabaseStorage } from '@/lib/supabase-storage';

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'user';
}

/**
 * Validates that a storage path is safe and belongs to the authenticated user.
 * Prevents path traversal attacks (e.g., `../`, `..\\`, encoded variants).
 */
function validateStoragePath(storagePath: string, userId: string): boolean {
  // Reject any path traversal sequences
  if (
    storagePath.includes('..') ||
    storagePath.includes('\\') ||
    storagePath.includes('%2e') ||
    storagePath.includes('%2f') ||
    storagePath.includes('%5c') ||
    storagePath.startsWith('/')
  ) {
    return false;
  }

  // Normalize and split into segments
  const segments = storagePath.split('/').filter(Boolean);

  // Expected structure: claims/[claimId]/[userId]/[filename]
  if (segments.length < 4 || segments[0] !== 'claims') {
    return false;
  }

  // Verify ownership: third segment must be the sanitized user ID
  if (segments[2] !== userId) {
    return false;
  }

  // Verify filename segment has no directory characters
  const filename = segments[segments.length - 1];
  if (filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || typeof session.sub !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { storagePath } = body;

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ error: 'storagePath wajib disertakan' }, { status: 400 });
    }

    const userId = sanitizePathSegment(session.sub);

    // Validate path safety and ownership
    if (!validateStoragePath(storagePath, userId)) {
      return NextResponse.json(
        { error: 'Forbidden. Invalid path or insufficient permissions.' },
        { status: 403 },
      );
    }

    const success = await deleteClaimDocumentFromSupabaseStorage(storagePath);
    if (!success) {
      return NextResponse.json({ error: 'Gagal menghapus dari storage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Dokumen berhasil dihapus dari storage' });
  } catch (error) {
    console.error('[document-delete]', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat menghapus dokumen. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
