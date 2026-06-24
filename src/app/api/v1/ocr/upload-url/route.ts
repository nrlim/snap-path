import { NextRequest, NextResponse } from "next/server";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/rbac";

const DEFAULT_MAX_PDF_SIZE = 100 * 1024 * 1024;
const MAX_TXT_SIZE = 2 * 1024 * 1024;

const UploadUrlRequestSchema = z.object({
  pdfName: z.string().trim().min(1),
  pdfSize: z.number().int().positive(),
  pdfHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
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

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "ocr";
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
      return NextResponse.json({ error: "Parameter pdfName, pdfSize, pdfHash, txtName, dan txtSize wajib diisi dengan benar." }, { status: 400 });
    }

    const { pdfSize, pdfHash, txtSize } = parseResult.data;
    const maxPdfSize = getMaxPdfSize();

    if (pdfSize > maxPdfSize) {
      return NextResponse.json({ error: `Ukuran PDF melebihi batas ${formatMegabytes(maxPdfSize)}.` }, { status: 400 });
    }

    if (txtSize > MAX_TXT_SIZE) {
      return NextResponse.json({ error: "Ukuran TXT melebihi batas 2MB." }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Konfigurasi Blob Storage belum lengkap. Set BLOB_READ_WRITE_TOKEN di environment server." }, { status: 500 });
    }

    const clientSegment = sanitizePathSegment(user.clientId ?? "global");
    const normalizedPdfHash = pdfHash.toLowerCase();
    const pdfPath = `ocr/${clientSegment}/${normalizedPdfHash}.pdf`;
    const token = await generateClientTokenFromReadWriteToken({
      pathname: pdfPath,
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: maxPdfSize,
      addRandomSuffix: false,
      allowOverwrite: true,
      validUntil: Date.now() + 30 * 60 * 1000,
    });

    return NextResponse.json({
      success: true,
      pdf: {
        path: pdfPath,
        token,
      },
    });
  } catch (error: unknown) {
    console.error("[ocr/upload-url]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat token unggahan." },
      { status: 500 },
    );
  }
}
