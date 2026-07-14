import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, X, BadgeCheck, Loader2, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { VerifyGateModal } from "@/components/VerifyGateModal";
import { toast } from "sonner";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search creators & brands — DripOrSkip" },
      {
        name: "description",
        content: "Find creators and brands on DripOrSkip. Follow your favorite drip curators.",
      },
    ],
  }),
  component: SearchPage,
});

interface ProfileHit {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type: "user" | "brand";
  is_verified: boolean;
  drip_score: number;
}

interface EnrichedHit extends ProfileHit {
  followers: number;
  is_following: boolean;
}

const RESULT_LIMIT = 25;

function SearchPage() {
  const { user, isEmailVerified } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<EnrichedHit[] | null>(null);
  const [suggested, setSuggested] = useState<EnrichedHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Load suggested users (top by drip_score) on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, account_type, is_verified, drip_score")
        .order("drip_score", { ascending: false })
        .limit(15);
      if (cancelled) return;
      if (error) {
        console.error("[search-suggested]", error);
        setLoadingSuggested(false);
        return;
      }
      const enriched = await enrich((data ?? []) as ProfileHit[], user?.id);
      if (!cancelled) {
        setSuggested(enriched);
        setLoadingSuggested(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Run search when debounced query changes
  useEffect(() => {
    const q = debounced;
    if (q.length < 1) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const cleaned = q.replace(/^@/, "").replace(/[%,]/g, "");
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, account_type, is_verified, drip_score")
        .or(`handle.ilike.%${cleaned}%,display_name.ilike.%${cleaned}%`)
        .order("drip_score", { ascending: false })
        .limit(RESULT_LIMIT);
      if (cancelled) return;
      if (error) {
        console.error("[search]", error);
        setResults([]);
        setLoading(false);
        return;
      }
      const enriched = await enrich((data ?? []) as ProfileHit[], user?.id);
      if (!cancelled) {
        setResults(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, user?.id]);

  async function toggleFollow(target: EnrichedHit) {
    if (!user) {
      toast.error("Sign in to follow");
      return;
    }
    if (target.id === user.id) return;
    if (!target.is_following && !isEmailVerified) {
      setShowVerify(true);
      return;
    }
    setBusyId(target.id);
    const optimistic = (list: EnrichedHit[]) =>
      list.map((u) =>
        u.id === target.id
          ? {
              ...u,
              is_following: !target.is_following,
              followers: Math.max(0, u.followers + (target.is_following ? -1 : 1)),
            }
          : u,
      );
    setResults((prev) => (prev ? optimistic(prev) : prev));
    setSuggested((prev) => optimistic(prev));

    const { error } = target.is_following
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", target.id)
      : await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: target.id });

    if (error) {
      toast.error(error.message);
      // revert
      setResults((prev) => (prev ? optimistic(prev) : prev));
      setSuggested((prev) => optimistic(prev));
    }
    setBusyId(null);
  }

  const showingSuggested = debounced.length === 0;
  const list = showingSuggested ? suggested : results ?? [];
  const isLoading = showingSuggested ? loadingSuggested : loading;

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-3 pt-safe-lg">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Search</p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-none">
          Find your <span className="text-primary">drip squad</span>
        </h1>
      </header>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-full bg-secondary px-4 py-3">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators, brands, @handles…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          {showingSuggested ? "Suggested for you" : `Results${list.length ? ` · ${list.length}` : ""}`}
        </p>

        {isLoading ? (
          <SkeletonList />
        ) : list.length === 0 ? (
          <EmptyState query={debounced} />
        ) : (
          <ul className="space-y-2">
            {list.map((u) => (
              <li key={u.id}>
                <ResultCard
                  user={u}
                  isMe={user?.id === u.id}
                  busy={busyId === u.id}
                  onToggleFollow={() => toggleFollow(u)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="follow" />
    </div>
  );
}

function ResultCard({
  user,
  isMe,
  busy,
  onToggleFollow,
}: {
  user: EnrichedHit;
  isMe: boolean;
  busy: boolean;
  onToggleFollow: () => void;
}) {
  return (
    <Link
      to="/u/$handle"
      params={{ handle: user.handle }}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-secondary active:bg-secondary"
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.display_name}
          loading="lazy"
          className="h-14 w-14 flex-shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary font-display text-xl font-bold text-primary-foreground">
          {user.display_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-sm font-semibold">{user.display_name}</p>
          {user.is_verified && (
            <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-accent" fill="currentColor" />
          )}
          {user.account_type === "brand" && (
            <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-accent">
              Brand
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">@{user.handle}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">{formatNum(user.followers)}</span>
          <span>followers</span>
          {user.drip_score > 0 && (
            <span className="flex items-center gap-0.5 text-primary">
              <Flame className="h-2.5 w-2.5" fill="currentColor" />
              {formatNum(user.drip_score)}
            </span>
          )}
        </div>
        {user.bio && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{user.bio}</p>
        )}
      </div>
      {!isMe && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFollow();
          }}
          disabled={busy}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-50 ${
            user.is_following
              ? "border border-border bg-transparent text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {user.is_following ? "Following" : "Follow"}
        </button>
      )}
    </Link>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
          <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-2xl bg-secondary" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-secondary" />
            <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-secondary" />
            <div className="h-2 w-2/3 animate-pulse rounded-full bg-secondary" />
          </div>
          <div className="h-7 w-16 flex-shrink-0 animate-pulse rounded-full bg-secondary" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        <SearchIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      {query ? (
        <>
          <p className="text-sm font-semibold">No one matched "{query}"</p>
          <p className="text-xs text-muted-foreground">
            Try a different handle, brand, or display name.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No suggestions yet. Be the first to drop a fit.
        </p>
      )}
    </div>
  );
}

async function enrich(profiles: ProfileHit[], viewerId: string | undefined): Promise<EnrichedHit[]> {
  if (profiles.length === 0) return [];
  const ids = profiles.map((p) => p.id);

  const followersPromise = supabase
    .from("follows")
    .select("following_id")
    .in("following_id", ids);

  const myFollowsPromise = viewerId
    ? supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in("following_id", ids)
    : Promise.resolve({ data: [] as { following_id: string }[], error: null });

  const [followersRes, myRes] = await Promise.all([followersPromise, myFollowsPromise]);

  const counts = new Map<string, number>();
  for (const row of followersRes.data ?? []) {
    counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1);
  }
  const followingSet = new Set((myRes.data ?? []).map((r) => r.following_id));

  return profiles.map((p) => ({
    ...p,
    followers: counts.get(p.id) ?? 0,
    is_following: followingSet.has(p.id),
  }));
}

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toString();
}
