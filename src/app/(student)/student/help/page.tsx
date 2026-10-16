import { StudentRequests } from "@/components/help/student-requests";
import { requireRole } from "@/lib/auth/session";

export default async function HelpPage() {
  const user = await requireRole("student");
  return <StudentRequests userId={user.id} />;
}
