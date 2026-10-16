import { NotebookView } from "@/components/notebook/notebook-view";
import { requireRole } from "@/lib/auth/session";

export default async function NotebookPage() {
  const user = await requireRole("student");
  return <NotebookView userId={user.id} />;
}
