"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";

const PATH = "/dashboard/settings/user-management";

export async function getUserManagementData() {
  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, clientId: true, client: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);

  return { users, clients };
}

export async function updateUserRole(formData: FormData) {
  try {
    const userId = String(formData.get("userId") || "");
    const role = String(formData.get("role") || "VIEWER");
    const clientId = String(formData.get("clientId") || "") || null;

    if (!userId) return { success: false, error: "User tidak valid." };

    await prisma.user.update({ where: { id: userId }, data: { role: role as never, clientId } });
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("Update user role error:", error);
    return { success: false, error: "Gagal memperbarui role user." };
  }
}
