"use server";

import prisma from "@/lib/db";
import { getAuthenticatedUser, getCurrentUserPermission, hasPermission, isSuperAdminRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

function formLimit(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export async function updateSystemConfig(formData: FormData) {
  if (!(await getCurrentUserPermission("AI_ENGINE_CONFIG"))) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah konfigurasi AI." };
  }

  try {
    const aiProvider = formData.get("primaryProvider") as string;
    const aiGatewayUrl = formData.get("gatewayUrl") as string;
    const aiModel = formData.get("aiModel") as string;
    const aiMaxTokens = parseInt(formData.get("maxTokens") as string, 10);
    const aiTemperature = parseFloat(formData.get("temperature") as string);
    
    // Thresholds
    const thresholdObatPct = parseFloat(formData.get("thresholdObatPct") as string);
    const thresholdTindakanPct = parseFloat(formData.get("thresholdTindakanPct") as string);
    const thresholdLosDays = parseInt(formData.get("thresholdLosDays") as string, 10);

    const updateData = {
      aiProvider: aiProvider || "vercel-ai-gateway",
      aiGatewayUrl: aiGatewayUrl || "",
      aiModel: aiModel || "gpt-4o-mini",
      aiMaxTokens: isNaN(aiMaxTokens) ? 1500 : aiMaxTokens,
      aiTemperature: isNaN(aiTemperature) ? 0.7 : aiTemperature,
      thresholdObatPct: isNaN(thresholdObatPct) ? 10.0 : thresholdObatPct,
      thresholdTindakanPct: isNaN(thresholdTindakanPct) ? 10.0 : thresholdTindakanPct,
      thresholdLosDays: isNaN(thresholdLosDays) ? 1 : thresholdLosDays,
    };

    await prisma.systemConfig.upsert({
      where: { id: "GLOBAL_CONFIG" },
      update: updateData,
      create: {
        id: "GLOBAL_CONFIG",
        ...updateData
      }
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to update system config:", error);
    return { success: false, error: "Failed to update configuration" };
  }
}

export async function updateThresholdConfig(formData: FormData) {
  if (!(await getCurrentUserPermission("CLINICAL_THRESHOLDS"))) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah threshold Clinical Pathway." };
  }

  try {
    const data = {
      thresholdObatPct: Number.isFinite(Number(formData.get("thresholdObatPct"))) ? Number(formData.get("thresholdObatPct")) : 10.0,
      thresholdTindakanPct: Number.isFinite(Number(formData.get("thresholdTindakanPct"))) ? Number(formData.get("thresholdTindakanPct")) : 10.0,
      thresholdLosDays: formLimit(formData, "thresholdLosDays", 1),
    };

    await prisma.systemConfig.upsert({
      where: { id: "GLOBAL_CONFIG" },
      update: data,
      create: {
        id: "GLOBAL_CONFIG",
        ...data,
      },
    });

    revalidatePath("/dashboard/settings/threshold");
    return { success: true };
  } catch (error) {
    console.error("Failed to update threshold config:", error);
    return { success: false, error: "Gagal menyimpan threshold Clinical Pathway." };
  }
}

export async function updatePathwayLimitConfig(formData: FormData) {
  if (!(await getCurrentUserPermission("PATHWAY_LIMITS"))) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah limit Clinical Pathway." };
  }

  try {
    const data = {
      pathwayDailyLimitViewer: formLimit(formData, "pathwayDailyLimitViewer", 3),
      pathwayDailyLimitClientUser: formLimit(formData, "pathwayDailyLimitClientUser", 10),
      pathwayDailyLimitClientAdmin: formLimit(formData, "pathwayDailyLimitClientAdmin", 25),
      pathwayDailyLimitAdmin: formLimit(formData, "pathwayDailyLimitAdmin", 0),
      pathwayDailyLimitSuperAdmin: formLimit(formData, "pathwayDailyLimitSuperAdmin", 0),
    };

    await prisma.systemConfig.upsert({
      where: { id: "GLOBAL_CONFIG" },
      update: data,
      create: {
        id: "GLOBAL_CONFIG",
        ...data,
      },
    });

    revalidatePath("/dashboard/settings/pathway-limits");
    return { success: true };
  } catch (error) {
    console.error("Failed to update pathway limits:", error);
    return { success: false, error: "Gagal menyimpan limit Clinical Pathway." };
  }
}

export async function updatePrivacyConfig(redactPatterns: string[], safeContexts: string[]) {
  const user = await getAuthenticatedUser();
  if (!user || (!hasPermission(user.role, "AI_ENGINE_CONFIG") && !hasPermission(user.role, "PRIVACY_CONFIG"))) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah konfigurasi privasi." };
  }

  try {
    const data = {
      piiRedactPatterns: redactPatterns,
      piiSafeContexts: safeContexts,
    };

    if (isSuperAdminRole(user.role)) {
      await prisma.systemConfig.upsert({
        where: { id: "GLOBAL_CONFIG" },
        update: data,
        create: {
          id: "GLOBAL_CONFIG",
          ...data,
        },
      });
    } else {
      if (!user.clientId) return { success: false, error: "User belum terhubung ke client." };
      await prisma.client.update({
        where: { id: user.clientId },
        data,
      });
    }

    revalidatePath("/dashboard/settings/privacy-config");
    return { success: true };
  } catch (error) {
    console.error("Failed to update privacy config:", error);
    return { success: false, error: "Gagal menyimpan konfigurasi privasi & PII." };
  }
}

export async function updateAIUsageMarkupConfig(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user || !isSuperAdminRole(user.role)) {
    return { success: false, error: "Anda tidak memiliki akses untuk mengubah markup usage." };
  }

  try {
    const rawMarkup = Number(formData.get("aiUsageMarkupPct"));
    const aiUsageMarkupPct = Number.isFinite(rawMarkup) && rawMarkup >= 0 ? rawMarkup : 100;

    await prisma.systemConfig.upsert({
      where: { id: "GLOBAL_CONFIG" },
      update: { aiUsageMarkupPct },
      create: {
        id: "GLOBAL_CONFIG",
        aiUsageMarkupPct,
      },
    });

    revalidatePath("/dashboard/settings/ai-usage-logs");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to update AI usage markup:", error);
    return { success: false, error: "Gagal menyimpan markup usage." };
  }
}
