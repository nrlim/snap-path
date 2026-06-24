import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/rbac";
import { createSignedUploadUrl } from "@/lib/supabase-storage";

const DEFAULT_MAX_PDF_SIZE = 100 * 1024 * 1024;
const MAX_TXT_SIZE = 2 * 1024 * 1024;

const UploadUrlRequestSchema = z.object({
  pdfName: z.string().trim().min(1),
  pdfSize: z.number().int().positive(),
  txtName: z.string().trim().min(1),
  txtSize: z.number().int().positive(),
});

function getMaxPdfSize(): number {
  const rawLimitMb = process.env.OCR_MAX_PDF_UPLOAD_MB ?? process.env.SUPABASE_DOCUMENT_BUCKET_FILE_SIZE_LIMIT_MB;
  if (!rawLimitMb) return DEFAULT_MAX_PDF_SIZE;

  const parsedLimitMb = Number.parseInt(rawLimitMb, 10);
  if (!Number.isFinite(parsedLimitMb) || parsedLimitMb <= 0) return DEFAULT_MAX_PDF_SIZE;

  return parsedLimitMb * 1024 * 1024;
}

function formatMegabytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))}MB`;
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

    const parseResult = UploadUrlRequestSchema.safeParse(await req.json());
    if (!parseResult.success) {
      return NextResponse.json({ error: "Parameter pdfName, pdfSize, txtName, dan txtSize wajib diisi dengan benar." }, { status: 400 });
    }

    const { pdfName, pdfSize, txtName, txtSize } = parseResult.data;
    const maxPdfSize = getMaxPdfSize();

    if (pdfSize > maxPdfSize) {
      return NextResponse.json({ error: `Ukuran PDF melebihi batas ${formatMegabytes(maxPdfSize)}.` }, { status: 400 });
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
