import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.verification === "verified") redirect(homeFor(user.role));
  const blocked = user.verification === "disabled" || user.verification === "rejected";
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">{blocked ? "Your account isn't active" : "We're checking your details"}</h1>
      <p className="text-sm text-text-2">
        {blocked
          ? "Please contact your department office."
          : "Your name and UG number are being matched against the class roster. This usually takes a short while. You can close this page and come back."}
      </p>
      <form action={logoutAction}><Button variant="secondary" type="submit">Sign out</Button></form>
    </main>
  );
}
