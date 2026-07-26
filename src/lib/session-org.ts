import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export async function requireSessionOrg() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.organizationId) {
    redirect("/login");
  }
  return {
    session,
    organizationId: session.organizationId,
    userId: session.user.id,
    role: session.role,
  };
}
