import { redirect } from "next/navigation";
import { getCurrentUserPermission } from "@/lib/rbac";
import UserManagementClient from "./UserManagementClient";
import { getUserManagementData } from "./actions";

export default async function UserManagementPage() {
  const user = await getCurrentUserPermission("USER_MANAGEMENT");
  if (!user) {
    redirect("/dashboard");
  }

  const data = await getUserManagementData();
  return <UserManagementClient users={data.users} clients={data.clients} scope={user.role === "CLIENT_ADMIN" ? "client" : "platform"} />;
}
