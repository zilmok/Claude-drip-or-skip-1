import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Flame, X, ExternalLink, BadgeCheck, Loader2, Share2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sharePost } from "@/lib/share";
import { useAuth } from "@/lib/auth";
import { PostComments } from "@/components/PostComments";
import { castVote, CATEGORIES, type Category } from "@/lib/posts";
import { toast } from "sonner";
import { VerifyGateModal } from "@/components/VerifyGateModal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/p/$postId")({
  component: PostDetail,
});

interface PostDetailData {
  id: string;
  title: string;
  brand: string;
  category: string;
  image_url: string;
  product_link: string | null;
  drip_count: number;
  skip_count: number;
  user_id: string;
  created_at: string;
  uploader: {
    id: string;
    handle: string;
    display_name: string;
    is_verified: boolean;
  } | null;
}

function PostDetail() {
  const { postId } = Route.useParams();
  const router = useRouter();
  const { user, isEmailVerified } = useAuth();
  const [post, setPost] = useState<PostDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userVote, setUserVote] = useState<"drip" | "skip" | null>(null);
  const [voting, setVoting] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("Sneakers");
  const [editLink, setEditLink] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select(
          `id, title, brand, category, image_url, product_link, drip_count, skip_count, created_at, user_id,
           uploader:profiles!posts_user_id_fkey(id, handle, display_name, is_verified)`
        )
        .eq("id", postId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setPost(null);
        setLoading(false);
        return;
      }
      setPost({
        ...data,
        uploader: Array.isArray(data.uploader) ? data.uploader[0] : data.uploader,
      } as PostDetailData);

      if (user) {
        const { data: v } = await supabase
          .from("votes")
          .select("vote")
          .eq("post_id", postId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setUserVote((v?.vote as "drip" | "skip" | null) ?? null);
      } else {
        setUserVote(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, user?.id]);

  async function handleVote(vote: "drip" | "skip") {
    if (!user) {
      router.navigate({ to: "/auth" });
      return;
    }
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    if (!post || voting) return;
    setVoting(true);
    try {
      await castVote(post.id, user.id, vote);
      setUserVote(vote);
      setPost((p) =>
        p
          ? {
              ...p,
              drip_count: p.drip_count + (vote === "drip" ? 1 : 0),
              skip_count: p.skip_count + (vote === "skip" ? 1 : 0),
            }
          : p,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVoting(false);
    }
  }

  function openEdit() {
    if (!post) return;
    setEditTitle(post.title);
    setEditBrand(post.brand);
    setEditCategory(post.category as Category);
    setEditLink(post.product_link ?? "");
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!post) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({
          title: editTitle.trim(),
          brand: editBrand.trim(),
          category: editCategory,
          product_link: editLink.trim() || null,
        })
        .eq("id", post.id);
      if (error) throw error;
      setPost((p) => p ? { ...p, title: editTitle.trim(), brand: editBrand.trim(), category: editCategory, product_link: editLink.trim() || null } : p);
      setEditOpen(false);
      toast.success("Post updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!post) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      router.navigate({ to: "/profile" });
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="font-display text-2xl font-bold">Post not found</h2>
        <Link to="/" className="mt-6 rounded-full bg-primary px-8 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground">
          Go to DripOrSkip home
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === post.user_id;
  const canSeeStats = isOwner || userVote !== null;
  const total = post.drip_count + post.skip_count;
  const dripPct = total > 0 ? Math.round((post.drip_count / total) * 100) : 0;
  const skipPct = total > 0 ? 100 - dripPct : 0;

  return (
    <div className="relative flex flex-1 flex-col bg-surface">
      <div className="relative w-full bg-surface">
        <img
          src={post.image_url}
          alt={post.title}
          className="h-auto w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />

        <button
          onClick={() => router.history.back()}
          className="top-safe absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="top-safe absolute right-4 flex items-center gap-2">
          {isOwner && (
            <>
              <button
                onClick={openEdit}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
                aria-label="Edit post"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
                aria-label="Delete post"
              >
                <Trash2 className="h-4 w-4 text-skip" />
              </button>
            </>
          )}
          {canSeeStats && (
            <button
              onClick={() => sharePost({ id: post.id, title: post.title, brand: post.brand })}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-md"
              aria-label="Share"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}
          <span className="rounded-full bg-background/60 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest backdrop-blur-md">
            {post.category}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5">
        {post.uploader && (
          <Link
            to="/u/$handle"
            params={{ handle: post.uploader.handle }}
            className="flex items-center gap-2 self-start rounded-full bg-background/60 px-2.5 py-1 backdrop-blur-md"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {post.uploader.display_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-semibold">@{post.uploader.handle}</span>
            {post.uploader.is_verified && <BadgeCheck className="h-3 w-3 text-accent" fill="currentColor" />}
          </Link>
        )}

        <div>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
            {post.brand}
          </span>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight">{post.title}</h1>
        </div>

        {canSeeStats ? (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 backdrop-blur-md ${userVote === "drip" ? "ring-2 ring-drip" : ""}`}>
              <Flame className="h-3.5 w-3.5 text-drip" fill="currentColor" />
              <span className="font-display text-sm font-bold text-drip">{dripPct}%</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 backdrop-blur-md ${userVote === "skip" ? "ring-2 ring-skip" : ""}`}>
              <X className="h-3.5 w-3.5 text-skip" strokeWidth={3} />
              <span className="font-display text-sm font-bold text-skip">{skipPct}%</span>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {total.toLocaleString()} votes
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleVote("drip")}
              disabled={voting}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-drip px-5 py-3 text-xs font-bold uppercase tracking-wider text-background glow-drip disabled:opacity-50"
            >
              <Flame className="h-4 w-4" fill="currentColor" /> Drip
            </button>
            <button
              onClick={() => handleVote("skip")}
              disabled={voting}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-skip px-5 py-3 text-xs font-bold uppercase tracking-wider text-background glow-skip disabled:opacity-50"
            >
              <X className="h-4 w-4" strokeWidth={3} /> Skip
            </button>
          </div>
        )}

        {canSeeStats && post.product_link && (
          <a
            href={post.product_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3 text-xs font-bold uppercase tracking-wider text-background"
          >
            <ExternalLink className="h-4 w-4" /> Shop now
          </a>
        )}

        {!user && (
          <Link
            to="/auth"
            className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground"
          >
            Open app to vote
          </Link>
        )}
      </div>

      {canSeeStats && <PostComments postId={post.id} />}
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="vote" />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="ep-title" className="text-xs">Title</Label>
              <Input id="ep-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="ep-brand" className="text-xs">Brand</Label>
              <Input id="ep-brand" value={editBrand} onChange={(e) => setEditBrand(e.target.value)} maxLength={40} />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditCategory(c)}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      editCategory === c ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="ep-link" className="text-xs">Product link (optional)</Label>
              <Input id="ep-link" value={editLink} onChange={(e) => setEditLink(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setEditOpen(false)}
              className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editTitle.trim() || !editBrand.trim()}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Comments and votes will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-skip text-background hover:bg-skip/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
