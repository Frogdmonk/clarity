import { CoursePage } from "@/components/teacher/course-page";

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return <CoursePage courseId={cid} />;
}
