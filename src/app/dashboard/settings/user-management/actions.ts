"use server";

import prisma from "@/lib/db";
import { getCurrentUserPermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

const PATH = "/dashboard/settings/user-management";

function isPlatformRole(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function getUserManagementData() {
  const user = await getCurrentUserPermission("USER_MANAGEMENT");
  if (!user) return { users: [], clients: [] };

  const clientScope = isPlatformRole(user.role) ? undefined : user.clientId || "__none__";

  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      where: clientScope ? { clientId: clientScope } : undefined,
      select: { id: true, email: true, name: true, role: true, clientId: true, client: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ where: clientScope ? { id: clientScope } : undefined, orderBy: { name: "asc" } }),
  ]);

  return { users, clients };
}

export async function updateUserRole(formData: FormData) {
  const currentUser = await getCurrentUserPermission("USER_MANAGEMENT");
  if (!currentUser) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah role user." };
  }

  try {
    const userId = String(formData.get("userId") || "");
    const role = String(formData.get("role") || "VIEWER");
    const clientId = String(formData.get("clientId") || "") || null;

    if (!userId) return { success: false, error: "User tidak valid." };

    if (!isPlatformRole(currentUser.role)) {
      if (!currentUser.clientId) return { success: false, error: "Akun Anda belum terhubung ke client." };
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { clientId: true, role: true } });
      if (!target || target.clientId !== currentUser.clientId) return { success: false, error: "User tidak ditemukan dalam client Anda." };
      if (!["CLIENT_USER", "VIEWER"].includes(role)) return { success: false, error: "Client admin hanya dapat mengatur role CLIENT_USER atau VIEWER." };
      if (clientId !== currentUser.clientId) return { success: false, error: "Client admin tidak dapat memindahkan user ke client lain." };
    }

    await prisma.user.update({ where: { id: userId }, data: { role: role as never, clientId } });
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("Update user role error:", error);
    return { success: false, error: "Gagal memperbarui role user." };
  }
}
