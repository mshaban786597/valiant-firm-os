import type { Metadata } from "next";
import { authSecret } from "@/lib/auth-secret";
import { readUnsubscribeToken } from "@/lib/email/campaign";
import { recipientForUnsubscribe } from "@/lib/email/campaign-run";
import { UnsubscribeButton } from "./unsubscribe-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/** Public page a recipient lands on from the unsubscribe link in an email. */
export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const recipientId = readUnsubscribeToken(token, authSecret());
  const recipient = recipientId ? await recipientForUnsubscribe(recipientId) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 text-center">
        {!recipient ? (
          <>
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="mt-2 text-sm text-muted">Reply to the email you received and ask to be removed.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Unsubscribe</h1>
            <p className="mt-2 break-words text-sm text-muted">{recipient.email}</p>
            <UnsubscribeButton token={token} done={recipient.done} />
          </>
        )}
      </div>
    </main>
  );
}
