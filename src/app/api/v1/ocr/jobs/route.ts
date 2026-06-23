import { NextResponse } from "next/server";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }

    const whereClause = isPlatformAdminRole(user.role) ? {} : { clientId: user.clientId };

    const jobs = await prisma.ocrJob.findMany({
      where: whereClause,
      select: {
        id: true,
        status: true,
        snaptextStatus: true,
        matchScore: true,
        createdAt: true,
        errorMessage: true,
        provider: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500, // Reasonable limit for client-side pagination
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[ocr/jobs/GET]", error);
    return NextResponse.json({ error: "Gagal mengambil riwayat OCR." }, { status: 500 });
  }
}
