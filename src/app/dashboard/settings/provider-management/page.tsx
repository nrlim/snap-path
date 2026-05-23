import { redirect } from "next/navigation";

export default function ProviderManagementRedirect() {
  redirect("/dashboard/settings/client-api-keys");
}
