import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/v1/providers
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await request.json();
    const { code, name } = payload;

    if (!code || !name) {
      return NextResponse.json({ error: "Provider 'code' and 'name' are required" }, { status: 400 });
    }

    const provider = await prisma.provider.create({
      data: {
        code,
        name,
        clientId: payload.clientId || null,
      }
    });

    return NextResponse.json({
      success: true,
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name
      },
      message: "Provider created."
    }, { status: 201 });

  } catch (error) {
    console.error("Failed to create provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
