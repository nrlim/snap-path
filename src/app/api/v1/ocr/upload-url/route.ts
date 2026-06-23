import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/rbac";
import { createSignedUploadUrl } from "@/lib/supabase-storage";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_TXT_SIZE = 2 * 1024 * 1024;

interface UploadUrlRequest {
  pdfName: string;
  pdfSize: number;
  txtName: string;
  txtSize: number;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "_");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || typeof session.sub !== "string") {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 401 });
    }

    const body = await req.json() as Partial<UploadUrlRequest>;
    const { pdfName, pdfSize, txtName, txtSize } = body;

    if (!pdfName || typeof pdfSize !== "number" || !txtName || typeof txtSize !== "number") {
      return NextResponse.json({ error: "Parameter pdfName, pdfSize, txtName, dan txtSize wajib diisi." }, { status: 400 });
    }

    if (pdfSize > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "Ukuran PDF melebihi batas 20MB." }, { status: 400 });
    }

    if (txtSize > MAX_TXT_SIZE) {
      return NextResponse.json({ error: "Ukuran TXT melebihi batas 2MB." }, { status: 400 });
    }

    const clientId = user.clientId;
    const timestamp = Date.now();
    const clientSegment = clientId ?? "global";
    
    const pdfPath = `ocr/${clientSegment}/${timestamp}_${sanitizeFilename(pdfName)}`;
    const txtPath = `ocr/${clientSegment}/${timestamp}_${sanitizeFilename(txtName)}`;

    const [pdfUpload, txtUpload] = await Promise.all([
      createSignedUploadUrl(pdfPath),
      createSignedUploadUrl(txtPath),
    ]);

    return NextResponse.json({
      success: true,
      pdf: {
        path: pdfUpload.path,
        uploadUrl: pdfUpload.signedUrl,
      },
      txt: {
        path: txtUpload.path,
        uploadUrl: txtUpload.signedUrl,
      },
    });
  } catch (error: unknown) {
    console.error("[ocr/upload-url]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat URL unggahan." },
      { status: 500 },
    );
  }
}
