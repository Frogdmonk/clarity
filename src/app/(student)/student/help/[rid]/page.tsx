import { RequestThread } from "@/components/help/request-thread";
import { requireRole } from "@/lib/auth/session";

export default async function ThreadPage({ params }: { params: Promise<{ rid: string }> }) {
  const [{ rid }, user] = await Promise.all([params, requireRole("student")]);
  return <RequestThread requestId={rid} userId={user.id} />;
}
