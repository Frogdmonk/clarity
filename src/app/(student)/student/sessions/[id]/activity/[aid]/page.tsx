import { notFound } from "next/navigation";
import { ActivityWorkspace } from "@/components/code/activity-workspace";
import { requireRole } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ActivityPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  if (!UUID.test(id) || !UUID.test(aid)) notFound();
  const user = await requireRole("student");
  return <ActivityWorkspace sessionId={id} activityId={aid} userId={user.id} />;
}
