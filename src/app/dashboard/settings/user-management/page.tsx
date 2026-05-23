import UserManagementClient from "./UserManagementClient";
import { getUserManagementData } from "./actions";

export default async function UserManagementPage() {
  const data = await getUserManagementData();
  return <UserManagementClient users={data.users} clients={data.clients} />;
}
