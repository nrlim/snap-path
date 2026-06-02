"use server";

import prisma from "@/lib/db";
import { decryptCredential, generateApiCredential } from "@/lib/api-key";
import { getCurrentUserPermission } from "@/lib/rbac";
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

function isPlatformRole(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function getClientApiKeyData() {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user) return [];

  const clients = await prisma.client.findMany({
    where: isPlatformRole(user.role) ? undefined : { id: user.clientId || "__none__" },
    include: {
      apiKeys: { orderBy: { createdAt: "desc" } },
      providers: { orderBy: { name: "asc" }, include: { _count: { select: { tariffBook: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return clients.map((client) => ({
    ...client,
    aiProvider: isPlatformRole(user.role) ? client.aiProvider : null,
    aiGatewayUrl: null,
    aiModel: isPlatformRole(user.role) ? client.aiModel : null,
    aiMaxTokens: isPlatformRole(user.role) ? client.aiMaxTokens : null,
    aiTemperature: isPlatformRole(user.role) ? client.aiTemperature : null,
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

export async function getAssignableTariffProviders() {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user || !isPlatformRole(user.role)) return [];

  return prisma.provider.findMany({
    orderBy: [{ clientId: "asc" }, { name: "asc" }],
    include: {
      client: { select: { id: true, name: true, code: true } },
      _count: { select: { tariffBook: true } },
    },
  });
}

export async function assignTariffProviderToClient(formData: FormData) {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user || !isPlatformRole(user.role)) {
    return { success: false, error: "Hanya admin platform yang dapat mengatur provider buku tarif client." };
  }

  try {
    const providerId = String(formData.get("providerId") || "");
    const clientId = nullableString(formData.get("clientId"));

    if (!providerId) return { success: false, error: "Provider buku tarif wajib dipilih." };

    const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) return { success: false, error: "Provider buku tarif tidak ditemukan." };

    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!client) return { success: false, error: "Client tidak ditemukan." };
    }

    await prisma.provider.update({ where: { id: providerId }, data: { clientId } });
    revalidatePath(PATH);
    revalidatePath("/dashboard/master-data/buku-tarif");
    return { success: true };
  } catch (error) {
    console.error("Assign tariff provider error:", error);
    return { success: false, error: "Gagal mengatur provider buku tarif client." };
  }
}

export async function upsertClient(formData: FormData) {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user || !isPlatformRole(user.role)) {
    return { success: false, error: "Hanya admin platform yang dapat membuat atau mengubah client." };
  }

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
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user) {
    return { success: false, error: "Anda tidak memiliki akses untuk membuat API key." };
  }

  try {
    const clientId = String(formData.get("clientId") || "");
    if (!isPlatformRole(user.role) && clientId !== user.clientId) {
      return { success: false, error: "Anda hanya dapat membuat API key untuk client sendiri." };
    }
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
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah status API key." };
  }

  const id = String(formData.get("id") || "");
  const isActive = formData.get("isActive") === "true";
  if (!id) return { success: false, error: "API key tidak valid." };

  const apiKey = await prisma.apiKey.findUnique({ where: { id }, select: { clientId: true } });
  if (!apiKey || (!isPlatformRole(user.role) && apiKey.clientId !== user.clientId)) {
    return { success: false, error: "API key tidak ditemukan untuk client Anda." };
  }

  await prisma.apiKey.update({ where: { id }, data: { isActive } });
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteClient(formData: FormData) {
  const user = await getCurrentUserPermission("CLIENT_API_KEYS");
  if (!user || !isPlatformRole(user.role)) {
    return { success: false, error: "Hanya admin platform yang dapat menghapus client." };
  }

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
