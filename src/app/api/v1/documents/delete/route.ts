import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteClaimDocumentFromSupabaseStorage } from '@/lib/supabase-storage';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { storagePath } = await req.json();

    if (!storagePath) {
      return NextResponse.json({ error: 'storagePath wajib disertakan' }, { status: 400 });
    }

    const success = await deleteClaimDocumentFromSupabaseStorage(storagePath);
    if (!success) {
      return NextResponse.json({ error: 'Gagal menghapus dari storage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Dokumen berhasil dihapus dari storage' });
  } catch (error: any) {
    console.error('[document-delete] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan saat menghapus dokumen' },
      { status: 500 },
    );
  }
}
