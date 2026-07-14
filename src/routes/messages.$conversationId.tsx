import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, BadgeCheck, Loader2, ImagePlus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMessages,
  getConversationOther,
  markConversationRead,
  sendMessage,
  type ChatMessage,
  type ConversationSummary,
} from "@/lib/messages";
import {
  fetchMyPostsForShare,
  fetchPostsByIds,
  type SharedPostPreview,
} from "@/lib/posts";

export const Route = createFileRoute("/messages/$conversationId")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Chat — DripOrSkip" }] }),
});

const POST_TOKEN = /^\[post:([0-9a-f-]{36})\]$/i;

function extractPostId(content: string): string | null {
  const m = content.trim().match(POST_TOKEN);
  return m ? m[1] : null;
}

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<ConversationSummary["other"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [postCache, setPostCache] = useState<Record<string, SharedPostPreview>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMessages(conversationId), getConversationOther(conversationId, user.id)])
      .then(([msgs, o]) => {
        if (cancelled) return;
        setMessages(msgs);
        setOther(o);
        markConversationRead(conversationId, user.id).catch(() => {});
      })
      .catch((e) => console.error("[chat] load", e))
      .finally(() => !cancelled && setLoading(false));

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== user.id) {
            markConversationRead(conversationId, user.id).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

  // Fetch previews for any post-token messages we haven't loaded yet
  const missingPostIds = useMemo(() => {
    const ids = new Set<string>();
    messages.forEach((m) => {
      const id = extractPostId(m.content);
      if (id && !postCache[id]) ids.add(id);
    });
    return Array.from(ids);
  }, [messages, postCache]);

  useEffect(() => {
    if (missingPostIds.length === 0) return;
    let cancelled = false;
    fetchPostsByIds(missingPostIds)
      .then((posts) => {
        if (cancelled) return;
        setPostCache((prev) => {
          const next = { ...prev };
          posts.forEach((p) => (next[p.id] = p));
          return next;
        });
      })
      .catch((e) => console.error("[chat] post previews", e));
    return () => {
      cancelled = true;
    };
  }, [missingPostIds.join(",")]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(content?: string) {
    if (!user || sending) return;
    const body = (content ?? text).trim();
    if (!body) return;
    setSending(true);
    if (!content) setText("");
    try {
      const m = await sendMessage(conversationId, user.id, body);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e) {
      console.error("[chat] send", e);
      if (!content) setText(body);
    } finally {
      setSending(false);
    }
  }

  async function handleSharePost(post: SharedPostPreview) {
    setPostCache((prev) => ({ ...prev, [post.id]: post }));
    setPickerOpen(false);
    await handleSend(`[post:${post.id}]`);
  }

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-8 text-center">
        {!user ? (
          <>
            <h2 className="font-display text-xl font-bold">Sign in to chat</h2>
            <Link
              to="/auth"
              className="rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground"
            >
              Sign in
            </Link>
          </>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/85 px-3 pb-3 backdrop-blur-xl pt-safe-sm">
        <button
          type="button"
          onClick={() => navigate({ to: "/messages" })}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {other ? (
          <Link
            to="/u/$handle"
            params={{ handle: other.handle }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {other.avatar_url ? (
              <img
                src={other.avatar_url}
                alt={other.display_name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {other.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-semibold">{other.display_name}</span>
                {other.is_verified && (
                  <BadgeCheck className="h-3.5 w-3.5 text-accent" fill="currentColor" />
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">@{other.handle}</p>
            </div>
          </Link>
        ) : (
          <div className="h-9 flex-1" />
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Say hi to start the conversation 👋
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {messages.map((m, i) => {
              const mine = m.sender_id === user!.id;
              const prev = messages[i - 1];
              const showTimeBreak =
                !prev ||
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
              const postId = extractPostId(m.content);
              const post = postId ? postCache[postId] : undefined;
              return (
                <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {showTimeBreak && (
                    <span className="my-2 self-center text-[10px] uppercase tracking-wider text-muted-foreground">
                      {new Date(m.created_at).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {postId ? (
                    <SharedPostBubble
                      mine={mine}
                      postId={postId}
                      preview={post}
                      onOpen={() =>
                        navigate({ to: "/p/$postId", params: { postId } })
                      }
                    />
                  ) : (
                    <div
                      className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary text-foreground rounded-bl-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="sticky bottom-0 z-20 flex items-end gap-2 border-t border-border/40 bg-background/90 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-foreground transition-colors hover:bg-secondary"
          aria-label="Share a post"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Message..."
          rows={1}
          maxLength={2000}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      {pickerOpen && user && (
        <PostPickerSheet
          userId={user.id}
          onClose={() => setPickerOpen(false)}
          onPick={handleSharePost}
        />
      )}
    </div>
  );
}

function SharedPostBubble({
  mine,
  postId,
  preview,
  onOpen,
}: {
  mine: boolean;
  postId: string;
  preview: SharedPostPreview | undefined;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group max-w-[78%] overflow-hidden rounded-2xl border border-border/60 bg-card text-left transition-transform active:scale-[0.98] ${
        mine ? "rounded-br-sm" : "rounded-bl-sm"
      }`}
    >
      <div className="aspect-square w-56 max-w-full bg-muted">
        {preview ? (
          <img
            src={preview.image_url}
            alt={preview.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-xs font-semibold">
          {preview?.title ?? "Shared post"}
        </p>
        {preview?.brand && (
          <p className="truncate text-[11px] text-muted-foreground">{preview.brand}</p>
        )}
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          View post →
        </p>
      </div>
    </button>
  );
}

function PostPickerSheet({
  userId,
  onClose,
  onPick,
}: {
  userId: string;
  onClose: () => void;
  onPick: (post: SharedPostPreview) => void;
}) {
  const [posts, setPosts] = useState<SharedPostPreview[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyPostsForShare(userId)
      .then((d) => !cancelled && setPosts(d))
      .catch((e) => {
        console.error("[chat] my posts", e);
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-border/40 bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <h2 className="font-display text-base font-bold">Share a post</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {posts === null ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : posts.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              You haven't posted anything yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-muted transition-transform active:scale-95"
                >
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
