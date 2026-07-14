import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MessageCircle, BadgeCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchConversations,
  getOrCreateDM,
  searchProfilesByHandle,
  type ConversationSummary,
} from "@/lib/messages";

export const Route = createFileRoute("/messages")({
  component: MessagesPage,
  head: () => ({ meta: [{ title: "Messages — DripOrSkip" }] }),
});

function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Load conversations + realtime refresh on new messages
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchConversations(user.id)
      .then((d) => !cancelled && setConvs(d))
      .catch((e) => console.error("[messages] load", e))
      .finally(() => !cancelled && setLoading(false));

    const channel = supabase
      .channel(`messages-list:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          fetchConversations(user.id).then((d) => !cancelled && setConvs(d)).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Debounced @handle search
  useEffect(() => {
    if (!user) return;
    const q = query.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await searchProfilesByHandle(q, user.id);
        setResults(r);
      } catch (e) {
        console.error("[messages] search", e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, user?.id]);

  async function openChatWith(otherId: string) {
    try {
      const convId = await getOrCreateDM(otherId);
      navigate({ to: "/messages/$conversationId", params: { conversationId: convId } });
    } catch (e) {
      console.error("[messages] open", e);
    }
  }

  const showSearch = query.trim().length > 0;

  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <MessageCircle className="h-10 w-10 text-primary" />
        <h2 className="font-display text-xl font-bold">Sign in to chat</h2>
        <Link
          to="/auth"
          className="rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-background/85 px-5 pb-3 backdrop-blur-xl pt-safe">
        <h1 className="font-display text-2xl font-bold">Messages</h1>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @handle to start a chat"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
      </header>

      <div className="flex-1 px-2">
        {showSearch ? (
          <SearchResults
            results={results}
            loading={searching}
            onPick={(id) => openChatWith(id)}
          />
        ) : loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : convs.length === 0 ? (
          <EmptyConversations />
        ) : (
          <ConversationList items={convs} currentUserId={user.id} />
        )}
      </div>
    </div>
  );
}

function SearchResults({
  results,
  loading,
  onPick,
}: {
  results: any[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">No accounts found.</p>
    );
  }
  return (
    <ul className="divide-y divide-border/40">
      {results.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick(p.id)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/40"
          >
            <Avatar profile={p} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-semibold">{p.display_name}</span>
                {p.is_verified && (
                  <BadgeCheck className="h-3.5 w-3.5 text-accent" fill="currentColor" />
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">@{p.handle}</p>
            </div>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              Message
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversationList({
  items,
  currentUserId,
}: {
  items: ConversationSummary[];
  currentUserId: string;
}) {
  return (
    <ul className="divide-y divide-border/40">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            to="/messages/$conversationId"
            params={{ conversationId: c.id }}
            className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40"
          >
            <Avatar profile={c.other} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-sm font-semibold">{c.other.display_name}</span>
                  {c.other.is_verified && (
                    <BadgeCheck className="h-3.5 w-3.5 text-accent" fill="currentColor" />
                  )}
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {formatTime(c.last_message_at)}
                </span>
              </div>
              <p
                className={`truncate text-xs ${
                  c.unread ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {c.last_message
                  ? `${c.last_message.sender_id === currentUserId ? "You: " : ""}${c.last_message.content}`
                  : "Start the conversation"}
              </p>
            </div>
            {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Avatar({ profile }: { profile: { display_name: string; avatar_url: string | null } }) {
  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt={profile.display_name}
      className="h-12 w-12 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
      {profile.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

function EmptyConversations() {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center gap-3 px-10 text-center">
      <MessageCircle className="h-10 w-10 text-primary" />
      <h2 className="font-display text-lg font-bold">No messages yet</h2>
      <p className="text-xs text-muted-foreground">
        Search a @handle above to start a new chat.
      </p>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString();
}
