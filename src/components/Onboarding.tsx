import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, X, Heart, Upload, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const KEY = "dripskip:onboarded:v1";

const SLIDES = [
  {
    icon: Flame,
    title: "Drip or Skip",
    desc: "Swipe LEFT for Drip 🔥 — RIGHT for Skip ❌. Rate every fit in seconds.",
    accent: "text-primary",
  },
  {
    icon: Heart,
    title: "Double-tap to save",
    desc: "Love a fit? Double-tap the image to save it to your collection.",
    accent: "text-drip",
  },
  {
    icon: Upload,
    title: "Drop your own drip",
    desc: "Upload your fits and let the community vote. Climb the trending feed.",
    accent: "text-accent",
  },
];

export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(KEY);
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);

  async function finish() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {}
    if (user) {
      // best-effort persist
      supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => refreshProfile().catch(() => {}));
    }
    onClose();
  }

  const slide = SLIDES[step];
  const Icon = slide.icon;
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl px-6">
      <button
        onClick={finish}
        className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        Skip <X className="h-3 w-3" />
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className="flex max-w-sm flex-col items-center text-center"
        >
          <div className={`flex h-24 w-24 items-center justify-center rounded-3xl bg-surface ${slide.accent}`}>
            <Icon className="h-12 w-12" strokeWidth={1.8} fill="currentColor" />
          </div>
          <h2 className="mt-8 font-display text-3xl font-bold leading-tight">{slide.title}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{slide.desc}</p>
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex gap-2">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-6 bg-primary" : "w-1.5 bg-secondary"
            }`}
          />
        ))}
      </div>

      <button
        onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
        className="mt-8 flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-primary py-4 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground glow-drip"
      >
        {isLast ? "Start swiping" : "Next"} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
