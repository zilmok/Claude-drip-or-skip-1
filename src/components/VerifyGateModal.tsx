import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MailCheck, X, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface VerifyGateModalProps {
  open: boolean;
  onClose: () => void;
  action?: string; // "vote", "upload", "comment", etc.
}

/**
 * Soft gate: shown the moment an unverified user attempts a restricted
 * action. Lets them resend the email and re-check verification status
 * without leaving the screen.
 */
export function VerifyGateModal({ open, onClose, action = "do that" }: VerifyGateModalProps) {
  const { user, resendVerificationEmail, refreshProfile } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onResend() {
    setSending(true);
    setError(null);
    const { error } = await resendVerificationEmail();
    setSending(false);
    if (error) setError(error);
    else setSent(true);
  }

  async function onRecheck() {
    setChecking(true);
    try {
      // Force a session refresh so email_confirmed_at is up to date.
      const mod = await import("@/integrations/supabase/client");
      await mod.supabase.auth.refreshSession();
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-[61] w-[92%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-surface p-6 shadow-2xl"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/40 hover:bg-background/60"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MailCheck className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-center font-display text-xl font-bold">Verify your email</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              You need a verified email to {action}. We sent a link to{" "}
              <span className="font-medium text-foreground">{user?.email ?? "your inbox"}</span>.
            </p>

            {error && <p className="mt-3 text-center text-xs text-skip">{error}</p>}
            {sent && !error && (
              <p className="mt-3 text-center text-xs text-primary">Email sent — check your inbox.</p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={onResend}
                disabled={sending || sent}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip disabled:opacity-60"
              >
                {sending && <Loader2 className="h-3 w-3 animate-spin" />}
                {sent ? "Email sent" : "Resend verification email"}
              </button>
              <button
                onClick={onRecheck}
                disabled={checking}
                className="flex items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
              >
                {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                I verified — refresh
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
