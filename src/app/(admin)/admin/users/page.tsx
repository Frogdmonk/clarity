import { UsersTable } from "@/components/admin/users-table";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  const user = await requireRole("admin");
  return <UsersTable selfId={user.id} />;
}
