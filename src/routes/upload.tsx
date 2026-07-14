import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Tag, Link2, Sparkles, Loader2, X, Gauge } from "lucide-react";
import { CATEGORIES, type Category, fetchUploadsRemaining } from "@/lib/posts";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { VerifyGateModal } from "@/components/VerifyGateModal";

export const Route = createFileRoute("/upload")({
  component: Upload,
});

function Upload() {
  const { user, isEmailVerified, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [productLink, setProductLink] = useState("");
  const [category, setCategory] = useState<Category>("Sneakers");
  const [fitCheck, setFitCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !isEmailVerified) return;
    fetchUploadsRemaining().then(setRemaining).catch(() => {});
  }, [user?.id, isEmailVerified]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="font-display text-2xl font-bold">Sign in to upload</h2>
        <p className="mt-2 text-sm text-muted-foreground">Create your fit and let the community vote.</p>
        <Link
          to="/auth"
          className="mt-6 rounded-full bg-primary px-8 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip"
        >
          Sign in
        </Link>
      </div>
    );
  }

  function pickFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      setError("Image too large (max 10MB)");
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("File must be an image");
      return;
    }
    setError(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !user) {
      setError("Please pick an image first");
      return;
    }
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    if (remaining !== null && remaining <= 0) {
      setError("Daily upload limit reached (5 per 24h). Try again later.");
      return;
    }
    if (title.trim().length < 2 || title.length > 100) {
      setError("Title must be 2–100 chars");
      return;
    }
    if (brand.trim().length < 1 || brand.length > 50) {
      setError("Brand is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("post-images").upload(path, file);
      if (upErr) throw upErr;
      uploadedPath = path;
      const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);

      // AI moderation — reject NSFW / violence / hate / illegal / spam before insert.
      const { data: mod, error: modErr } = await supabase.functions.invoke("moderate-image", {
        body: { image_url: pub.publicUrl },
      });
      if (modErr) {
        // Fail closed: if moderation can't run, do not publish.
        throw new Error(modErr.message || "Couldn't verify image. Try again.");
      }
      if (mod && mod.allowed === false) {
        throw new Error(
          mod.reason ||
            "This image was flagged by our safety filter and can't be posted."
        );
      }

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: user.id,
        image_url: pub.publicUrl,
        title: title.trim(),
        brand: brand.trim(),
        category,
        product_link: productLink.trim() || null,
        is_fit_check: fitCheck,
      });
      if (insErr) throw insErr;
      uploadedPath = null; // success, don't clean up
      // Refresh remaining quota optimistically
      setRemaining((r) => (r === null ? r : Math.max(0, r - 1)));
      navigate({ to: "/" });
    } catch (e) {
      console.error("[upload]", e);
      // Clean up the orphaned storage object if we uploaded but didn't insert.
      if (uploadedPath) {
        supabase.storage.from("post-images").remove([uploadedPath]).catch(() => {});
      }
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col px-5 pb-5 pt-safe-lg">
      <header>
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Upload</p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-none">
          Drop your <span className="text-primary">drip</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Let the community decide. Be brave.</p>
        {isEmailVerified && remaining !== null && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
            <Gauge className="h-3 w-3 text-primary" />
            <span className={remaining === 0 ? "text-skip" : "text-foreground"}>
              {remaining}
            </span>
            <span className="text-muted-foreground">uploads left today</span>
          </div>
        )}
      </header>
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="upload" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
        }}
      />

      {previewUrl ? (
        <div className="relative mt-6 aspect-[3/4] w-full overflow-hidden rounded-3xl bg-surface">
          <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreviewUrl(null);
            }}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative mt-6 flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-surface transition-colors hover:border-primary hover:bg-primary/5"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
            <Camera className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <p className="mt-4 font-display text-lg font-bold">Tap to upload</p>
          <p className="mt-1 text-xs text-muted-foreground">JPG · PNG · up to 10MB</p>
        </button>
      )}

      <button
        type="button"
        onClick={() => setFitCheck(!fitCheck)}
        className={`mt-4 flex items-center justify-between rounded-2xl border p-4 transition-colors ${
          fitCheck ? "border-primary bg-primary/10" : "border-border bg-surface"
        }`}
      >
        <div className="flex items-center gap-3">
          <Sparkles className={`h-5 w-5 ${fitCheck ? "text-primary" : "text-muted-foreground"}`} />
          <div className="text-left">
            <p className="text-sm font-bold">Fit Check Mode</p>
            <p className="text-xs text-muted-foreground">Vote on full outfits</p>
          </div>
        </div>
        <div className={`h-6 w-11 rounded-full p-0.5 transition-colors ${fitCheck ? "bg-primary" : "bg-secondary"}`}>
          <div
            className={`h-5 w-5 rounded-full bg-foreground transition-transform ${fitCheck ? "translate-x-5" : ""}`}
          />
        </div>
      </button>

      <div className="mt-5 space-y-4">
        <Field label="Title" value={title} onChange={setTitle} placeholder="Air Jordan 1 Triple White" />
        <Field label="Brand" value={brand} onChange={setBrand} placeholder="Nike" icon={<Tag className="h-4 w-4" />} />
        <Field label="Shop link" value={productLink} onChange={setProductLink} placeholder="https://..." icon={<Link2 className="h-4 w-4" />} />

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  category === c ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-skip/40 bg-skip/10 px-4 py-3 text-sm text-skip">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || (remaining !== null && remaining <= 0)}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-display text-base font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] glow-drip disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting
          ? "Checking image…"
          : remaining !== null && remaining <= 0
            ? "Daily limit reached"
            : "Post to feed"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 focus-within:border-primary">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>
    </div>
  );
}
