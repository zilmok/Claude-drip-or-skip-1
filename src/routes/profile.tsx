import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, BadgeCheck, Flame, Grid3x3, BarChart3, LogOut, Loader2, Heart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({
  component: Profile,
});

interface UserPost {
  id: string;
  image_url: string;
  title: string;
  drip_count: number;
  skip_count: number;
  view_count: number;
  comment_count: number;
}

interface Badge {
  badge: string;
}

const BADGE_LABELS: Record<string, { label: string; color: string }> = {
  taste_maker: { label: "Taste Maker", color: "bg-primary text-primary-foreground" },
  drip_expert: { label: "Drip Expert", color: "bg-accent text-accent-foreground" },
  streetwear_scout: { label: "Streetwear Scout", color: "bg-foreground text-background" },
  early_adopter: { label: "Early Adopter", color: "bg-drip text-background" },
};

function Profile() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState<"posts" | "saved" | "analytics">("posts");
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [saved, setSaved] = useState<UserPost[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, title, drip_count, skip_count, view_count, comment_count")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("badges").select("badge").eq("user_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase
        .from("saves")
        .select("created_at, post:posts!saves_post_id_fkey(id, image_url, title, drip_count, skip_count, view_count, comment_count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])
      .then(([postsRes, badgesRes, followersRes, followingRes, savedRes]) => {
        if (cancelled) return;
        setPosts(postsRes.data ?? []);
        setBadges(badgesRes.data ?? []);
        setFollowers(followersRes.count ?? 0);
        setFollowing(followingRes.count ?? 0);
        const savedPosts = ((savedRes.data ?? []) as Array<{ post: UserPost | UserPost[] | null }>)
          .map((s) => (Array.isArray(s.post) ? s.post[0] : s.post))
          .filter((p): p is UserPost => !!p);
        setSaved(savedPosts);
      })
      .catch((e) => console.error("[profile]", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="font-display text-2xl font-bold">Sign in to view your profile</h2>
        <p className="mt-2 text-sm text-muted-foreground">Track your drips, posts and badges.</p>
        <Link
          to="/auth"
          className="mt-6 rounded-full bg-primary px-8 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // Aggregate analytics for brand accounts
  const totalDrips = posts.reduce((s, p) => s + p.drip_count, 0);
  const totalVotes = posts.reduce((s, p) => s + p.drip_count + p.skip_count, 0);
  const dripRate = totalVotes > 0 ? Math.round((totalDrips / totalVotes) * 100) : 0;
  const totalComments = posts.reduce((s, p) => s + p.comment_count, 0);
  const isBrand = profile.account_type === "brand";

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative h-32 bg-gradient-to-br from-primary/30 via-accent/20 to-skip/20">
        <button
          onClick={() => signOut()}
          className="top-safe absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <button
          className="top-safe absolute right-16 flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5">
        <div className="-mt-12 flex items-end justify-between">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-background bg-primary font-display text-3xl font-bold text-primary-foreground">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-bold">{profile.display_name}</h1>
          {profile.is_verified && <BadgeCheck className="h-5 w-5 text-accent" fill="currentColor" />}
          {isBrand && (
            <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">
              Brand
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}

        {badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.map((b) => {
              const info = BADGE_LABELS[b.badge];
              if (!info) return null;
              return (
                <span
                  key={b.badge}
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${info.color}`}
                >
                  {info.label}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-surface p-4">
          <Stat value={posts.length.toString()} label="Posts" />
          <Stat value={formatNum(followers)} label="Followers" accent />
          <Stat value={formatNum(following)} label="Following" />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-primary">Drip Score</p>
            <p className="font-display text-3xl font-bold">{profile.drip_score}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary glow-drip">
            <Flame className="h-6 w-6 text-primary-foreground" fill="currentColor" />
          </div>
        </div>

        <div className="mt-6 flex border-b border-border">
          <TabBtn
            active={tab === "posts"}
            onClick={() => setTab("posts")}
            icon={<Grid3x3 className="h-4 w-4" />}
            label="Posts"
          />
          <TabBtn
            active={tab === "saved"}
            onClick={() => setTab("saved")}
            icon={<Heart className="h-4 w-4" />}
            label="Saved"
          />
          {isBrand && (
            <TabBtn
              active={tab === "analytics"}
              onClick={() => setTab("analytics")}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Analytics"
            />
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : tab === "posts" ? (
          posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No posts yet. <Link to="/upload" className="text-primary font-bold">Upload your first fit</Link>
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-1 pb-6">
              {posts.map((p) => {
                const total = p.drip_count + p.skip_count;
                const rate = total > 0 ? Math.round((p.drip_count / total) * 100) : 0;
                return (
                  <Link
                    key={p.id}
                    to="/p/$postId"
                    params={{ postId: p.id }}
                    className="relative aspect-square overflow-hidden rounded-md bg-surface transition-opacity hover:opacity-90"
                  >
                    <img src={p.image_url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                    <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-md">
                      <Flame className="h-2.5 w-2.5 text-primary" fill="currentColor" />
                      {rate}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : tab === "saved" ? (
          saved.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No saved posts yet. Tap the heart on a post to save it.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-1 pb-6">
              {saved.map((p) => {
                const total = p.drip_count + p.skip_count;
                const rate = total > 0 ? Math.round((p.drip_count / total) * 100) : 0;
                return (
                  <Link
                    key={p.id}
                    to="/p/$postId"
                    params={{ postId: p.id }}
                    className="relative aspect-square overflow-hidden rounded-md bg-surface transition-opacity hover:opacity-90"
                  >
                    <img src={p.image_url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                    <div className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/70 backdrop-blur-md">
                      <Heart className="h-2.5 w-2.5 text-drip" fill="currentColor" />
                    </div>
                    <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-md">
                      <Flame className="h-2.5 w-2.5 text-primary" fill="currentColor" />
                      {rate}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : (
          <div className="mt-4 space-y-3 pb-6">
            <div className="grid grid-cols-2 gap-3">
              <AnalyticsCard label="Total Drips" value={formatNum(totalDrips)} highlight />
              <AnalyticsCard label="Drip Rate" value={`${dripRate}%`} />
              <AnalyticsCard label="Total Votes" value={formatNum(totalVotes)} />
              <AnalyticsCard label="Comments" value={formatNum(totalComments)} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Top performing posts
              </p>
              <div className="mt-3 space-y-2">
                {[...posts]
                  .sort((a, b) => b.drip_count - a.drip_count)
                  .slice(0, 5)
                  .map((p) => {
                    const total = p.drip_count + p.skip_count;
                    const rate = total > 0 ? Math.round((p.drip_count / total) * 100) : 0;
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{p.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatNum(p.drip_count)} drips · {rate}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                {posts.length === 0 && (
                  <p className="text-xs text-muted-foreground">Upload posts to see analytics.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toString();
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`font-display text-xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function AnalyticsCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-surface"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
        active ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {icon}
      {label}
      {active && <span className="absolute inset-x-6 -bottom-px h-0.5 bg-primary" />}
    </button>
  );
}
