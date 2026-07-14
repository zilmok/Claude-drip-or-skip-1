import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, Flame, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { VerifyGateModal } from "@/components/VerifyGateModal";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$handle")({
  component: PublicProfile,
});

interface ProfileData {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type: "user" | "brand";
  is_verified: boolean;
  drip_score: number;
}

interface PostThumb {
  id: string;
  image_url: string;
  title: string;
  drip_count: number;
  skip_count: number;
}

function PublicProfile() {
  const { handle } = Route.useParams();
  const { user, isEmailVerified } = useAuth();
  const [showVerify, setShowVerify] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<PostThumb[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, account_type, is_verified, drip_score")
        .eq("handle", handle)
        .maybeSingle();
      if (cancelled) return;
      if (!prof) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(prof);
      const [postsRes, followersRes, followingRes, isFollowingRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_url, title, drip_count, skip_count")
          .eq("user_id", prof.id)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("id").eq("following_id", prof.id),
        supabase.from("follows").select("id").eq("follower_id", prof.id),
        user
          ? supabase
              .from("follows")
              .select("id")
              .eq("follower_id", user.id)
              .eq("following_id", prof.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setPosts(postsRes.data ?? []);
      setFollowers(followersRes.data?.length ?? 0);
      setFollowing(followingRes.data?.length ?? 0);
      setIsFollowing(!!isFollowingRes.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, user?.id]);

  async function toggleFollow() {
    if (!user || !profile) {
      toast.error("Sign in to follow");
      return;
    }
    if (user.id === profile.id) return;
    if (!isFollowing && !isEmailVerified) {
      setShowVerify(true);
      return;
    }
    setBusy(true);
    if (isFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", profile.id);
      if (error) toast.error(error.message);
      else {
        setIsFollowing(false);
        setFollowers((f) => Math.max(0, f - 1));
      }
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: profile.id });
      if (error) toast.error(error.message);
      else {
        setIsFollowing(true);
        setFollowers((f) => f + 1);
      }
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="font-display text-2xl font-bold">User not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">@{handle} doesn't exist.</p>
        <Link to="/" className="mt-6 rounded-full bg-primary px-8 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground">
          Back home
        </Link>
      </div>
    );
  }

  const isMe = user?.id === profile.id;

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative h-32 bg-gradient-to-br from-primary/30 via-accent/20 to-skip/20">
        <Link
          to="/"
          className="top-safe absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      <div className="px-5">
        <div className="-mt-12 flex items-end justify-between">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-background bg-primary font-display text-3xl font-bold text-primary-foreground">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
          {!isMe && (
            <button
              onClick={toggleFollow}
              disabled={busy}
              className={`mb-1 rounded-full px-6 py-2 text-xs font-bold uppercase tracking-wider transition ${
                isFollowing
                  ? "border border-border bg-surface text-foreground"
                  : "bg-primary text-primary-foreground glow-drip"
              } disabled:opacity-50`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-bold">{profile.display_name}</h1>
          {profile.is_verified && <BadgeCheck className="h-5 w-5 text-accent" fill="currentColor" />}
          {profile.account_type === "brand" && (
            <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">
              Brand
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}

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

        {posts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No posts yet.</p>
            <Link to="/discover" className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-primary">
              Explore trending →
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-1 pb-6">
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
        )}
      </div>
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="follow" />
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
