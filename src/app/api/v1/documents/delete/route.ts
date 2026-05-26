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

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { storagePath } = await req.json();

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ error: 'storagePath wajib disertakan' }, { status: 400 });
    }

    const userId = sanitizePathSegment(String(session.sub || session.email || 'user'));
    
    // Ownership validation: verify the storagePath includes the user's ID directory
    // Expected structure: claims/[claimId]/[userId]/[filename]
    if (!storagePath.includes(`/${userId}/`)) {
       return NextResponse.json({ error: 'Forbidden. You do not have permission to delete this document.' }, { status: 403 });
    }

    const success = await deleteClaimDocumentFromSupabaseStorage(storagePath);
    if (!success) {
      return NextResponse.json({ error: 'Gagal menghapus dari storage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Dokumen berhasil dihapus dari storage' });
  } catch (error: any) {
    console.error('[document-delete] Error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat menghapus dokumen. Silakan coba lagi.' },
      { status: 500 },
    );
  }
}
