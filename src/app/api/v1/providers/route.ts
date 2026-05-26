import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/rbac";

// POST /api/v1/providers
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || !isPlatformAdminRole(user.role)) {
      return NextResponse.json({ error: "Forbidden. Only platform admins can create providers." }, { status: 403 });
    }

    const payload = await request.json();
    const { code, name } = payload;

    if (!code || typeof code !== 'string' || !name || typeof name !== 'string') {
      return NextResponse.json({ error: "Provider 'code' and 'name' are required and must be strings" }, { status: 400 });
    }

    const sanitizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(sanitizedCode)) {
      return NextResponse.json({ error: "Provider 'code' must contain only uppercase letters, numbers, underscores, or hyphens." }, { status: 400 });
    }

    let clientId = payload.clientId || null;
    if (clientId) {
       const clientExists = await prisma.client.findUnique({ where: { id: clientId }});
       if (!clientExists) {
         return NextResponse.json({ error: "Invalid clientId provided." }, { status: 400 });
       }
    }

    const provider = await prisma.provider.create({
      data: {
        code: sanitizedCode,
        name: name.trim(),
        clientId: clientId,
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
