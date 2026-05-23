"use server";

import prisma from "@/lib/db";
import { decryptCredential, generateApiCredential } from "@/lib/api-key";
import { revalidatePath } from "next/cache";

const PATH = "/dashboard/settings/client-api-keys";

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

function nullableNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getClientApiKeyData() {
  const clients = await prisma.client.findMany({
    include: {
      apiKeys: { orderBy: { createdAt: "desc" } },
      providers: { orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return clients.map((client) => ({
    ...client,
    apiKeys: client.apiKeys.map((key) => ({
      ...key,
      keyHash: undefined,
      secretHash: undefined,
      apiKey: decryptCredential(key.keyCipher),
      apiSecret: decryptCredential(key.secretCipher),
      keyCipher: undefined,
      secretCipher: undefined,
    })),
  }));
}

export async function upsertClient(formData: FormData) {
  try {
    const id = nullableString(formData.get("id"));
    const code = String(formData.get("code") || "").trim().toUpperCase();
    const name = String(formData.get("name") || "").trim();

    if (!code || !name) return { success: false, error: "Kode dan nama client wajib diisi." };

    const data = {
      code,
      name,
      isActive: formData.get("isActive") === "on",
      aiProvider: nullableString(formData.get("aiProvider")),
      aiGatewayUrl: nullableString(formData.get("aiGatewayUrl")),
      aiModel: nullableString(formData.get("aiModel")),
      aiMaxTokens: nullableNumber(formData.get("aiMaxTokens")),
      aiTemperature: nullableNumber(formData.get("aiTemperature")),
      monthlyTokenLimit: nullableNumber(formData.get("monthlyTokenLimit")),
    };

    if (id) await prisma.client.update({ where: { id }, data });
    else await prisma.client.create({ data });

    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("Client upsert error:", error);
    return { success: false, error: "Gagal menyimpan client." };
  }
}

export async function createClientApiCredential(formData: FormData) {
  try {
    const clientId = String(formData.get("clientId") || "");
    const name = String(formData.get("name") || "").trim();
    const expiresAt = nullableString(formData.get("expiresAt"));

    if (!clientId || !name) return { success: false, error: "Client dan nama credential wajib diisi." };

    const credential = generateApiCredential();
    await prisma.apiKey.create({
      data: {
        clientId,
        name,
        keyHash: credential.keyHash,
        secretHash: credential.secretHash,
        keyCipher: credential.keyCipher,
        secretCipher: credential.secretCipher,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    revalidatePath(PATH);
    return { success: true, key: credential.key, secret: credential.secret };
  } catch (error) {
    console.error("Create client credential error:", error);
    return { success: false, error: "Gagal membuat API key dan secret." };
  }
}

export async function setClientApiKeyStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const isActive = formData.get("isActive") === "true";
  if (!id) return { success: false, error: "API key tidak valid." };

  await prisma.apiKey.update({ where: { id }, data: { isActive } });
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteClient(formData: FormData) {
  try {
    const id = String(formData.get("id") || "");
    if (!id) return { success: false, error: "Client tidak valid." };

    await prisma.$transaction([
      prisma.user.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.provider.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.claimJob.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.apiUsageLog.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      prisma.apiKey.updateMany({ where: { clientId: id }, data: { clientId: null, isActive: false } }),
      prisma.client.delete({ where: { id } }),
    ]);

    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("Delete client error:", error);
    return { success: false, error: "Gagal menghapus client." };
  }
}
