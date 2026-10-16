import { ProfileForm } from "@/components/profile/profile-form";
import { requireRole } from "@/lib/auth/session";

export default async function ProfilePage() {
  const user = await requireRole("student");
  return <ProfileForm userId={user.id} initialName={user.fullName} ugNumber={user.ugNumber ?? null} />;
}
