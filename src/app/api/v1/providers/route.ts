import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateApiKey } from "@/lib/api-key";

// POST /api/v1/providers
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { code, name } = payload;

    if (!code || !name) {
      return NextResponse.json({ error: "Provider 'code' and 'name' are required" }, { status: 400 });
    }

    const provider = await prisma.provider.create({
      data: { code, name }
    });

    // Automatically generate an API key for this provider
    const { key, hash } = generateApiKey();

    await prisma.apiKey.create({
      data: {
        keyHash: hash,
        name: `Default Key for ${name}`,
        providerId: provider.id,
      }
    });

    return NextResponse.json({
      success: true,
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name
      },
      apiKey: key, // ONLY SHOWN ONCE
      message: "Provider created. Please save the apiKey securely."
    }, { status: 201 });

  } catch (error) {
    console.error("Failed to create provider:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
