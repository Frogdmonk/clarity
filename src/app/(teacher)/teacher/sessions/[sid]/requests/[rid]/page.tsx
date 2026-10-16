import { RequestDetail } from "@/components/teacher/request-detail";
import { requireRole } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ sid: string; rid: string }> }) {
  const [{ sid, rid }, user] = await Promise.all([params, requireRole("teacher")]);
  return <RequestDetail sessionId={sid} requestId={rid} userId={user.id} />;
}
