import { ActivitiesManager } from "@/components/teacher/activities-manager";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  const user = await requireRole("teacher");
  return <ActivitiesManager userId={user.id} />;
}
