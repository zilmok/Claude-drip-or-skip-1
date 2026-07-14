import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Loader2, Sparkles, Bell } from "lucide-react";
import { SwipeCard } from "@/components/SwipeCard";
import { useAuth } from "@/lib/auth";
import { fetchFeed, fetchFallbackFeed, castVote, type FeedPost } from "@/lib/posts";
import { VerifyGateModal } from "@/components/VerifyGateModal";
import { Onboarding, shouldShowOnboarding } from "@/components/Onboarding";
import { fetchUnreadCount } from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: HomeFeed,
});

function HomeFeed() {
  const { user, isEmailVerified, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [index, setIndex] = useState(0);
  const [drips, setDrips] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [nextPreloadIdx, setNextPreloadIdx] = useState(0);
  const [unread, setUnread] = useState(0);

  // Unread notifications count + realtime
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    fetchUnreadCount().then((c) => !cancelled && setUnread(c)).catch(() => {});
    const channel = supabase
      .channel(`notif-count:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          fetchUnreadCount().then((c) => !cancelled && setUnread(c)).catch(() => {});
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Onboarding: show once on first launch
  useEffect(() => {
    if (!authLoading && shouldShowOnboarding()) setShowOnboarding(true);
  }, [authLoading]);

  // Initial feed load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIndex(0);
    setFallback(false);
    fetchFeed(user?.id ?? null, { excludeVoted: true })
      .then(async (data) => {
        if (cancelled) return;
        if (data.length === 0) {
          // No fresh posts → trending fallback
          const trend = await fetchFallbackFeed(user?.id ?? null);
          if (cancelled) return;
          setPosts(trend);
          setFallback(true);
        } else {
          setPosts(data);
          setFallback(false);
        }
        setDrips(data.filter((p) => p.user_vote === "drip").length);
      })
      .catch((e) => console.error("[feed] load error", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // When the user runs out of unseen posts mid-session, swap to fallback
  useEffect(() => {
    if (loading || fallback) return;
    if (posts.length > 0 && index >= posts.length) {
      (async () => {
        const trend = await fetchFallbackFeed(user?.id ?? null);
        setPosts(trend);
        setIndex(0);
        setFallback(true);
      })().catch((e) => console.error("[feed] fallback", e));
    }
  }, [index, posts.length, loading, fallback, user?.id]);

  const post = posts.length > 0 && index < posts.length ? posts[index] : null;
  const nextPost =
    posts.length > 0 && index + 1 < posts.length ? posts[index + 1] : null;

  // Image preloading for next card
  useEffect(() => {
    if (!nextPost || nextPost.image_url === undefined) return;
    if (nextPreloadIdx === index) return;
    const img = new Image();
    img.src = nextPost.image_url;
    setNextPreloadIdx(index);
  }, [nextPost, index, nextPreloadIdx]);

  return (
    <div className="relative flex flex-1 flex-col -mb-24">
      <div className="relative h-[calc(100dvh-5rem)] w-full">
        {loading || authLoading ? (
          <FeedSkeleton />
        ) : !post ? (
          <EmptyFeed />
        ) : (
          <SwipeCard
            key={post.id + index + (fallback ? "f" : "n")}
            post={post}
            canVote={!!user && isEmailVerified}
            onVote={async (v) => {
              if (!user) return;
              if (!isEmailVerified) {
                setShowVerify(true);
                return;
              }
              try {
                const voteId = await castVote(post.id, user.id, v);
                if (v === "drip") setDrips((d) => d + 1);
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === post.id
                      ? {
                          ...p,
                          user_vote: v,
                          user_vote_id: voteId,
                          drip_count: p.drip_count + (v === "drip" ? 1 : 0),
                          skip_count: p.skip_count + (v === "skip" ? 1 : 0),
                        }
                      : p
                  )
                );
              } catch (e) {
                console.error("[vote] failed", e);
              }
            }}
            onNext={() => setIndex((i) => i + 1)}
            onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          />
        )}

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-safe">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/40 px-3 py-1.5 backdrop-blur-md">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary glow-drip">
              <Flame className="h-3 w-3 text-primary-foreground" fill="currentColor" />
            </div>
            <h1 className="font-display text-sm font-bold tracking-tight">
              drip<span className="text-primary">or</span>skip
            </h1>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {user ? (
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-background/40 backdrop-blur-md transition-colors hover:bg-background/60"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            ) : (
              <Link
                to="/auth"
                className="rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

      </div>

      <VerifyGateModal
        open={showVerify}
        onClose={() => setShowVerify(false)}
        action="vote"
      />
      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface via-secondary/30 to-surface" />
      <Loader2 className="relative h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-surface px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary glow-drip">
        <Flame className="h-7 w-7 text-primary-foreground" fill="currentColor" />
      </div>
      <h2 className="font-display text-2xl font-bold">The feed is empty</h2>
      <p className="text-sm text-muted-foreground">
        Be the first to drop a fit and let the community rate it.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Link
          to="/upload"
          className="rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip"
        >
          Upload your fit
        </Link>
        <Link
          to="/discover"
          className="rounded-full border border-border bg-background px-6 py-3 text-xs font-bold uppercase tracking-wider"
        >
          Browse trending
        </Link>
      </div>
    </div>
  );
}
