import { notFound } from "next/navigation";
import { StudentSessionView } from "@/components/session/student-session";
import { requireRole } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireRole("student");
  return <StudentSessionView sessionId={id} userId={user.id} />;
}
