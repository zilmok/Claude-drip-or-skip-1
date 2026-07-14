import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence, useDragControls } from "framer-motion";
import { Flame, X, ExternalLink, BadgeCheck, Heart, Share2, MessageCircle } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { FeedPost } from "@/lib/posts";
import { isPostSaved, savePost, unsavePost } from "@/lib/posts";
import { useAuth } from "@/lib/auth";
import { VerifyGateModal } from "./VerifyGateModal";
import { VoteResult } from "./VoteResult";
import { hapticDrip, hapticSkip } from "@/lib/haptics";
import { sharePost } from "@/lib/share";

interface SwipeCardProps {
  post: FeedPost;
  canVote: boolean;
  onVote: (vote: "drip" | "skip") => Promise<void> | void;
  onNext: () => void;
  onPrev?: () => void;
}

export function SwipeCard({ post, canVote, onVote, onNext, onPrev }: SwipeCardProps) {
  const { user, isEmailVerified } = useAuth();
  const navigate = useNavigate();
  const initialVote = post.user_vote;
  const [vote, setVote] = useState<"drip" | "skip" | null>(initialVote);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const lastTapRef = useRef<number>(0);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const dripOpacity = useTransform(x, [-180, -40, 0], [1, 0.4, 0]);
  const skipOpacity = useTransform(x, [0, 40, 180], [0, 0.4, 1]);

  useEffect(() => {
    if (!user) return;
    isPostSaved(post.id, user.id).then(setSaved).catch(() => {});
  }, [user, post.id]);

  async function handleDoubleTap() {
    if (!user) return;
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
    if (saved) return;
    setSaved(true);
    try {
      await savePost(post.id, user.id);
    } catch {
      setSaved(false);
    }
  }

  async function toggleSave() {
    if (!user) return;
    if (!isEmailVerified) {
      setShowVerify(true);
      return;
    }
    const next = !saved;
    setSaved(next);
    try {
      if (next) await savePost(post.id, user.id);
      else await unsavePost(post.id, user.id);
    } catch {
      setSaved(!next);
    }
  }

  function handleImageTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      handleDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }

  // Native pointer-up double-tap detector — more reliable than framer-motion onTap
  // inside iframes / mobile Safari.
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragStartedRef = useRef(false);
  const SWIPE_THRESHOLD = 15;
  function isInteractiveElement(el: EventTarget | null) {
    if (!(el instanceof Element)) return false;
    return !!el.closest("button, a, [role='button'], input, textarea, select");
  }

  function handleGesturePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isInteractiveElement(e.target)) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    dragStartedRef.current = false;
  }

  function handleGesturePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (vote) return;
    const start = pointerDownRef.current;
    if (!start || dragStartedRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    // Cancel gesture if vertical movement dominates.
    if (ady > adx && ady > SWIPE_THRESHOLD) {
      pointerDownRef.current = null;
      return;
    }
    // Start the drag once horizontal movement passes the threshold.
    if (adx > SWIPE_THRESHOLD && adx >= ady) {
      dragStartedRef.current = true;
      dragControls.start(e);
    }
  }

  function handleGesturePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isInteractiveElement(e.target)) return;
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    const wasDragging = dragStartedRef.current;
    dragStartedRef.current = false;
    if (!start || wasDragging) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    const dt = Date.now() - start.t;
    // Treat as a tap only if it didn't move much and was quick.
    if (dx < 10 && dy < 10 && dt < 300) handleImageTap();
  }

  async function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number } }
  ) {
    const { x: dx, y: dy } = info.offset;
    if (vote || submitting) return;
    if (dx < -110) {
      if (!canVote) {
        if (user && !isEmailVerified) setShowVerify(true);
        return;
      }
      hapticDrip();
      setSubmitting(true);
      setVote("drip");
      try {
        await onVote("drip");
      } finally {
        setSubmitting(false);
      }
    } else if (dx > 110) {
      if (!canVote) {
        if (user && !isEmailVerified) setShowVerify(true);
        return;
      }
      hapticSkip();
      setSubmitting(true);
      setVote("skip");
      try {
        await onVote("skip");
      } finally {
        setSubmitting(false);
      }
    } else if (dy < -110) {
      onNext();
    } else if (dy > 110 && onPrev) {
      onPrev();
    }
  }

  async function handleShare() {
    console.log("share button clicked", { postId: post.id });
    const result = await sharePost({ id: post.id, title: post.title, brand: post.brand });
    console.log("[share] handleShare returned:", result);
  }

  // Per-action click guard — prevents double execution from rapid taps,
  // synthetic re-fires, or pointer/click duplication on mobile.
  const lastActionAtRef = useRef<Record<string, number>>({});
  function runOnce(key: string, fn: () => void | Promise<void>) {
    const now = Date.now();
    const last = lastActionAtRef.current[key] ?? 0;
    if (now - last < 400) return;
    lastActionAtRef.current[key] = now;
    void fn();
  }

  const dripVotes = post.drip_count + (vote === "drip" && !initialVote ? 1 : 0);
  const skipVotes = post.skip_count + (vote === "skip" && !initialVote ? 1 : 0);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      {/* Draggable visual layer — image + swipe stamps only */}
      <motion.div
        drag={!vote}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        style={{ x, y, rotate }}
        className="absolute inset-0 select-none"
      >
        <div aria-hidden className="absolute inset-0 bg-surface" />
        <img
          src={post.image_url}
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        <motion.div
          style={{ opacity: dripOpacity }}
          className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 -rotate-12"
        >
          <div className="flex items-center gap-2 rounded-2xl border-4 border-drip bg-drip/10 px-5 py-2 backdrop-blur-sm">
            <Flame className="h-7 w-7 text-drip" />
            <span className="font-display text-4xl font-bold text-drip text-glow-drip">DRIP</span>
          </div>
        </motion.div>

        <motion.div
          style={{ opacity: skipOpacity }}
          className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rotate-12"
        >
          <div className="flex items-center gap-2 rounded-2xl border-4 border-skip bg-skip/10 px-5 py-2 backdrop-blur-sm">
            <X className="h-7 w-7 text-skip" strokeWidth={3} />
            <span className="font-display text-4xl font-bold text-skip text-glow-skip">SKIP</span>
          </div>
        </motion.div>
      </motion.div>

      <div
        className="absolute inset-x-0 top-0 bottom-32 z-[5] touch-none"
        onPointerDown={handleGesturePointerDown}
        onPointerMove={handleGesturePointerMove}
        onPointerUp={handleGesturePointerUp}
        aria-hidden="true"
      />

      {/* Interactive overlay — sibling of drag layer so taps are NOT intercepted by drag listeners */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-none absolute left-4 right-4 top-20 flex items-center justify-between">
          <Link
            to="/u/$handle"
            params={{ handle: post.uploader.handle }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/40 px-2.5 py-1 backdrop-blur-md"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {post.uploader.display_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-semibold">@{post.uploader.handle}</span>
            {post.uploader.is_verified && (
              <BadgeCheck className="h-3 w-3 text-accent" fill="currentColor" />
            )}
          </Link>
          <span className="pointer-events-auto rounded-full bg-background/40 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest backdrop-blur-md">
            {post.category}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-28 px-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                  {post.brand}
                </span>
              </div>
              <h2 className="font-display text-lg font-bold leading-tight line-clamp-2 drop-shadow-lg">
                {post.title}
              </h2>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  runOnce("comments", () => navigate({ to: "/p/$postId", params: { postId: post.id } }));
                }}
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-background/60 backdrop-blur-md transition-transform active:scale-90"
                aria-label="View comments"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log("[SHARE] clicked");
                  runOnce("share", handleShare);
                }}
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-background/60 backdrop-blur-md transition-transform active:scale-90"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {post.product_link && (
                <a
                  href={post.product_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const now = Date.now();
                    const last = lastActionAtRef.current["shop"] ?? 0;
                    if (now - last < 400) {
                      e.preventDefault();
                      return;
                    }
                    lastActionAtRef.current["shop"] = now;
                  }}
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
                  aria-label="Shop now"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
          <p className="mt-5 text-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            {canVote ? "← Drip · Skip →" : "Sign in to vote"}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <Heart className="h-32 w-32 text-drip drop-shadow-2xl" fill="currentColor" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {vote && (
          <VoteResult
            dripVotes={dripVotes}
            skipVotes={skipVotes}
            userVote={vote}
            onNext={() => {
              setVote(null);
              x.set(0);
              y.set(0);
              onNext();
            }}
          />
        )}
      </AnimatePresence>
      <VerifyGateModal open={showVerify} onClose={() => setShowVerify(false)} action="save & vote" />
    </div>
  );
}
