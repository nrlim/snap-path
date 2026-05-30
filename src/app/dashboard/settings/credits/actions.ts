"use server";

import prisma from "@/lib/db";
import { getAuthenticatedUser, hasPermission, isPlatformAdminRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

const PATH = "/dashboard/settings/credits";

export async function getCreditData() {
  const user = await getAuthenticatedUser();
  if (!user || !hasPermission(user.role, "CLIENT_CREDITS")) return null;

  const isPlatformAdmin = isPlatformAdminRole(user.role);
  const clients = await prisma.client.findMany({
    where: isPlatformAdmin ? undefined : { id: user.clientId || "__none__" },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      creditBalance: true,
      creditLedgers: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
    orderBy: { name: "asc" },
  });

  return { clients, canTopUp: isPlatformAdmin };
}

export async function topUpClientCredit(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user || !isPlatformAdminRole(user.role)) {
    return { success: false, error: "Hanya admin platform yang dapat menambahkan credit." };
  }

  const clientId = String(formData.get("clientId") || "");
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") || "Top up manual via admin").trim();

  if (!clientId || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Client dan jumlah credit wajib diisi dengan benar." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.update({
        where: { id: clientId },
        data: { creditBalance: { increment: amount } },
        select: { creditBalance: true },
      });

      await tx.creditLedger.create({
        data: {
          clientId,
          amount,
          balanceAfter: client.creditBalance,
          type: "TOPUP",
          description: description || "Top up manual via admin",
          createdByUserId: user.id,
        },
      });
    });

    revalidatePath(PATH);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Top up credit error:", error);
    return { success: false, error: "Gagal menambahkan credit." };
  }
}
