import { PageHeader, Card } from "@/components/ui/card";
import { JoinForm } from "@/components/session/join-form";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Join a session" />
      <Card><JoinForm initialCode={(code ?? "").slice(0, 8)} scanner /></Card>
    </div>
  );
}
