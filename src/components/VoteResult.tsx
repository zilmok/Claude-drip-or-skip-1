import { Flame, X, ChevronUp } from "lucide-react";
import { motion, useMotionValue } from "framer-motion";

interface VoteResultProps {
  dripVotes: number;
  skipVotes: number;
  userVote: "drip" | "skip";
  commentCount?: number;
  onNext: () => void;
  onOpenComments?: () => void;
}

export function VoteResult({ dripVotes, skipVotes, userVote, onNext }: VoteResultProps) {
  const total = Math.max(1, dripVotes + skipVotes);
  const dripPct = Math.round((dripVotes / total) * 100);
  const skipPct = 100 - dripPct;

  const y = useMotionValue(0);

  function handleDragEnd(_: unknown, info: { offset: { y: number }; velocity: { y: number } }) {
    if (info.offset.y < -70 || info.velocity.y < -500) onNext();
  }

  return (
    <>
      {/* Bottom-corner percentages — drip left, skip right */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="pointer-events-none absolute bottom-20 left-4 z-30"
      >
        <div
          className={`flex items-center gap-2 rounded-full bg-background/70 px-3 py-2 backdrop-blur-xl ${
            userVote === "drip" ? "ring-2 ring-drip glow-drip" : ""
          }`}
        >
          <Flame
            className="h-5 w-5 text-drip"
            fill={userVote === "drip" ? "currentColor" : "none"}
          />
          <span className="font-display text-xl font-bold text-drip text-glow-drip">
            {dripPct}%
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="pointer-events-none absolute bottom-20 right-4 z-30"
      >
        <div
          className={`flex items-center gap-2 rounded-full bg-background/70 px-3 py-2 backdrop-blur-xl ${
            userVote === "skip" ? "ring-2 ring-skip glow-skip" : ""
          }`}
        >
          <span className="font-display text-xl font-bold text-skip text-glow-skip">
            {skipPct}%
          </span>
          <X className="h-5 w-5 text-skip" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Swipe up / tap to next */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.6, bottom: 0 }}
        onDragEnd={handleDragEnd}
        style={{ y }}
        onClick={onNext}
        className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 cursor-pointer touch-none px-6 py-3"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-0.5 text-muted-foreground"
        >
          <div className="flex items-center gap-1">
            <ChevronUp className="h-4 w-4 animate-bounce" />
            <span className="text-[9px] uppercase tracking-[0.3em]">Swipe up · Next</span>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
