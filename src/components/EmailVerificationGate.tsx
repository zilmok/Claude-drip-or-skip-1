import { useState } from "react";
import { MailCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Inline gate shown when an authenticated but UNVERIFIED user tries
 * to perform a gated action (vote, upload, comment, etc.).
 *
 * Variant:
 *  - "card"   → full block, used on the upload screen
 *  - "toast"  → compact pill, used floating over the swipe feed
 */
export function EmailVerificationGate({ variant = "card" }: { variant?: "card" | "toast" }) {
  const { user, resendVerificationEmail } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onResend() {
    setSending(true);
    setError(null);
    const { error } = await resendVerificationEmail();
    setSending(false);
    if (error) setError(error);
    else setSent(true);
  }

  if (variant === "toast") {
    return (
      <div className="pointer-events-auto mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-background/90 px-4 py-3 backdrop-blur-md">
        <MailCheck className="h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 text-[11px] leading-tight">
          <p className="font-bold uppercase tracking-wider">Verify your email</p>
          <p className="text-muted-foreground">Confirm {user?.email} to vote.</p>
        </div>
        <button
          onClick={onResend}
          disabled={sending || sent}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : sent ? "Sent" : "Resend"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <MailCheck className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-display text-lg font-bold">Verify your email first</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        We sent a confirmation link to <span className="font-medium text-foreground">{user?.email}</span>.
        Confirm it to upload fits and vote.
      </p>
      {error && <p className="mt-3 text-xs text-skip">{error}</p>}
      {sent && !error && <p className="mt-3 text-xs text-primary">Email sent — check your inbox.</p>}
      <button
        onClick={onResend}
        disabled={sending || sent}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip disabled:opacity-60"
      >
        {sending && <Loader2 className="h-3 w-3 animate-spin" />}
        {sent ? "Email sent" : "Resend verification email"}
      </button>
    </div>
  );
}
