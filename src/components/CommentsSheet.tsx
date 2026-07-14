import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { VerifyGateModal } from "@/components/VerifyGateModal";

interface CommentsSheetProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  author: {
    handle: string;
    display_name: string;
  } | null;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsSheet({ postId, open, onClose, onCountChange }: CommentsSheetProps) {
  const { user, isEmailVerified } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showVerify, setShowVerify] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("comments")
      .select("id, content, created_at, user_id, author:profiles!comments_user_id_fkey(handle, display_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("[comments] load", error);
        const rows = (data ?? []).map((c: any) => ({
          ...c,
          author: Array.isArray(c.author) ? c.author[0] : c.author,
        })) as CommentRow[];
        setComments(rows);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || submitting) return;
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    const content = text.trim();
    if (content.length < 1 || content.length > 500) return;

    setSubmitting(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: user.id, content })
      .select("id, content, created_at, user_id")
      .single();

    if (error) {
      console.error("[comments] insert", error);
      setSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", user.id)
      .maybeSingle();

    setComments((prev) => [
      { ...(data as any), author: profile ?? { handle: "you", display_name: "You" } },
      ...prev,
    ]);
    setText("");
    setSubmitting(false);
    onCountChange?.(1);
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
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[75dvh] flex-col rounded-t-3xl border-t border-border/60 bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                  Comments
                </h3>
                <span className="text-xs text-muted-foreground">({comments.length})</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close comments"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-background/40 hover:bg-background/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <p className="mt-10 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Be the first to comment
                </p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {(c.author?.display_name ?? "?").charAt(0).toUpperCase()}
                      </div>
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
              className="flex items-center gap-2 border-t border-border/60 bg-background/50 px-3 py-3 backdrop-blur-md"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={user ? "Add a comment…" : "Sign in to comment"}
                disabled={!user || submitting}
                maxLength={500}
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
          </motion.div>
        </>
      )}
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="comment" />
    </AnimatePresence>
  );
}
