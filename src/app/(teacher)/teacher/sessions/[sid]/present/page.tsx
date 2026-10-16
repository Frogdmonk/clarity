import { PresenterView } from "@/components/teacher/presenter-view";

export default async function Page({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  return <PresenterView sessionId={sid} />;
}
