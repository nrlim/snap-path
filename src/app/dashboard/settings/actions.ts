"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateSystemConfig(formData: FormData) {
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
      aiProvider: aiProvider || "sumopod",
      aiGatewayUrl: aiGatewayUrl || (aiProvider === "vercel-ai-sdk" ? "https://ai-gateway.vercel.sh/v1" : "https://api.sumopod.com/v1"),
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
