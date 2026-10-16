import { TeacherConsole } from "@/components/teacher/teacher-console";

export default async function Page({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  return <TeacherConsole sessionId={sid} />;
}
