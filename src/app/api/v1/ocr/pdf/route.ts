import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/db";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

interface ProblemResponse {
  error: string;
}

const OcrPdfQuerySchema = z.object({
  ocrJobId: z.string().trim().min(1),
});

function jsonError(message: string, status: number): NextResponse<ProblemResponse> {
  return NextResponse.json({ error: message }, { status });
}

function getPdfFileName(storagePath: string | null): string {
  const fileName = storagePath?.split("/").filter(Boolean).at(-1) ?? "invoice.pdf";
  return fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError("Sesi tidak valid. Silakan masuk kembali.", 401);
    }

    const { searchParams } = new URL(req.url);
    const parseResult = OcrPdfQuerySchema.safeParse({
      ocrJobId: searchParams.get("ocrJobId"),
    });

    if (!parseResult.success) {
      return jsonError("ocrJobId wajib dikirim.", 400);
    }

    const ocrJob = await prisma.ocrJob.findUnique({
      where: { id: parseResult.data.ocrJobId },
      select: {
        id: true,
        clientId: true,
        pdfUrl: true,
        pdfStoragePath: true,
      },
    });

    if (!ocrJob) {
      return jsonError("Job OCR tidak ditemukan.", 404);
    }

    if (!isPlatformAdminRole(user.role) && ocrJob.clientId !== user.clientId) {
      return jsonError("Anda tidak memiliki akses ke PDF OCR ini.", 403);
    }

    if (!ocrJob.pdfUrl) {
      return jsonError("File PDF tidak tersedia.", 404);
    }

    const upstreamHeaders = new Headers();
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      upstreamHeaders.set("Range", rangeHeader);
    }

    const upstreamResponse = await fetch(ocrJob.pdfUrl, {
      headers: upstreamHeaders,
      cache: "no-store",
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return jsonError("PDF sumber tidak dapat dimuat dari penyimpanan.", upstreamResponse.status || 502);
    }

    const fileName = getPdfFileName(ocrJob.pdfStoragePath);
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/pdf");
    responseHeaders.set("Content-Disposition", `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Frame-Options", "SAMEORIGIN");
    responseHeaders.set("Content-Security-Policy", "default-src 'self' blob: data:; frame-ancestors 'self'");
    responseHeaders.set("Accept-Ranges", upstreamResponse.headers.get("accept-ranges") || "bytes");

    const passthroughHeaders = ["content-length", "content-range", "etag", "last-modified"];
    for (const headerName of passthroughHeaders) {
      const headerValue = upstreamResponse.headers.get(headerName);
      if (headerValue) {
        responseHeaders.set(headerName, headerValue);
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    console.error("[ocr/pdf]", error);
    return jsonError(error instanceof Error ? error.message : "Gagal memuat PDF sumber.", 500);
  }
}
