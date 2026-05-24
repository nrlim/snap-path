import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUserPermission } from "@/lib/rbac";
import { DEFAULT_PATHWAY_LIMITS } from "@/lib/pathway-limits";
import PathwayLimitsForm from "./PathwayLimitsForm";

export default async function PathwayLimitsPage() {
  if (!(await getCurrentUserPermission("PATHWAY_LIMITS"))) {
    redirect("/dashboard");
  }

  const config = await prisma.systemConfig.findUnique({ where: { id: "GLOBAL_CONFIG" } });

  return (
    <div className="w-full pb-10">
      <PathwayLimitsForm
        config={{
          pathwayDailyLimitViewer: config?.pathwayDailyLimitViewer ?? DEFAULT_PATHWAY_LIMITS.VIEWER,
          pathwayDailyLimitClientUser: config?.pathwayDailyLimitClientUser ?? DEFAULT_PATHWAY_LIMITS.CLIENT_USER,
          pathwayDailyLimitClientAdmin: config?.pathwayDailyLimitClientAdmin ?? DEFAULT_PATHWAY_LIMITS.CLIENT_ADMIN,
          pathwayDailyLimitAdmin: config?.pathwayDailyLimitAdmin ?? DEFAULT_PATHWAY_LIMITS.ADMIN,
          pathwayDailyLimitSuperAdmin: config?.pathwayDailyLimitSuperAdmin ?? DEFAULT_PATHWAY_LIMITS.SUPER_ADMIN,
        }}
      />
    </div>
  );
}
