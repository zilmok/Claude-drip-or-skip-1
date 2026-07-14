import { useEffect, useRef, useState } from "react";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { VerifyGateModal } from "@/components/VerifyGateModal";

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  author: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const MAX_LEN = 280;

export function PostComments({ postId }: { postId: string }) {
  const { user, isEmailVerified } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, content, created_at, user_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (error) {
        console.error("[comments] load", error);
        setComments([]);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as Omit<CommentRow, "author">[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let profiles: Record<string, CommentRow["author"]> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url")
          .in("id", ids);
        for (const p of profs ?? []) {
          profiles[p.id] = {
            handle: p.handle,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          };
        }
      }
      if (cancelled) return;
      setComments(rows.map((r) => ({ ...r, author: profiles[r.user_id] ?? null })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || submittingRef.current) return;
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    const content = text.trim();
    if (content.length < 1 || content.length > MAX_LEN) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const { data, error: insErr } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: user.id, content })
      .select("id, content, created_at, user_id")
      .single();

    if (insErr || !data) {
      console.error("[comments] insert", insErr);
      setError("Could not post comment. Try again.");
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("handle, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setComments((prev) => [
      {
        ...(data as Omit<CommentRow, "author">),
        author: profile ?? { handle: "you", display_name: "You", avatar_url: null },
      },
      ...prev,
    ]);
    setText("");
    setSubmitting(false);
    submittingRef.current = false;
  }

  return (
    <section className="flex flex-col border-t border-border/60">
      <div className="flex items-center gap-2 px-5 pt-5">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider">
          Comments
        </h2>
        <span className="text-xs text-muted-foreground">({comments.length})</span>
      </div>

      <div className="flex-1 px-5 py-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
            No comments yet. Start the conversation.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                {c.author?.avatar_url ? (
                  <img
                    src={c.author.avatar_url}
                    alt=""
                    className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {(c.author?.display_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">
                      @{c.author?.handle ?? "user"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-sm leading-snug">{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border/60 bg-background/90 px-3 py-3 backdrop-blur-md"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder={user ? "Add a comment…" : "Sign in to comment"}
          disabled={!user || submitting}
          maxLength={MAX_LEN}
          className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!user || submitting || text.trim().length === 0}
          aria-label="Send comment"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
      {error && (
        <p className="px-5 pb-2 text-center text-xs text-skip">{error}</p>
      )}
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="comment" />
    </section>
  );
}
