import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Flame, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"user" | "brand">("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp({ email, password, handle, displayName, accountType });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="flex flex-1 flex-col px-6 pb-8 -mb-24 min-h-[100dvh] pt-safe-xl">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary glow-drip">
          <Flame className="h-4 w-4 text-primary-foreground" fill="currentColor" />
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight">
          drip<span className="text-primary">or</span>skip
        </h1>
      </div>

      <h2 className="font-display text-3xl font-bold leading-tight">
        {mode === "signin" ? (
          <>Welcome back.<br /><span className="text-primary">Rate the fit.</span></>
        ) : (
          <>Join the drip.<br /><span className="text-primary">Find your style.</span></>
        )}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "signin" ? "Sign in to keep voting" : "Create your account in seconds"}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {mode === "signup" && (
          <>
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Alex Drip" required />
            <Field label="Handle" value={handle} onChange={setHandle} placeholder="alex_drip" required />
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Account type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["user", "brand"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setAccountType(t)}
                    className={`rounded-2xl border py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                      accountType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground"
                    }`}
                  >
                    {t === "user" ? "I'm a user" : "I'm a brand"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@drip.com" required />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required />

        {error && (
          <div className="rounded-2xl border border-skip/40 bg-skip/10 px-4 py-3 text-sm text-skip">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-display text-base font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] glow-drip disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="font-bold text-primary"
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>

      <Link to="/" className="mt-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
        ← back to feed
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
      />
    </div>
  );
}
