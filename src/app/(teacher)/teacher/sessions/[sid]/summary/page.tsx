import { SessionSummary } from "@/components/teacher/session-summary";

export default async function Page({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  return <SessionSummary sessionId={sid} />;
}
