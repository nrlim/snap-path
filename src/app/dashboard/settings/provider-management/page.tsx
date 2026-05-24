import { redirect } from "next/navigation";
import { getCurrentUserPermission } from "@/lib/rbac";

export default async function ProviderManagementRedirect() {
  if (!(await getCurrentUserPermission("CLIENT_API_KEYS"))) {
    redirect("/dashboard");
  }

  redirect("/dashboard/settings/client-api-keys");
}
