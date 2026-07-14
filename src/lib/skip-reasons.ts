import { supabase } from "@/integrations/supabase/client";

export type SkipReason = "price" | "style" | "quality" | "fit" | "colorway" | "overhyped" | "other";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  price: "Too expensive",
  style: "Not my style",
  quality: "Looks low quality",
  fit: "Bad fit",
  colorway: "Wrong colorway",
  overhyped: "Overhyped",
  other: "Other",
};

export async function recordSkipReason(args: {
  voteId: string;
  postId: string;
  reason: SkipReason;
  note?: string;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return;
  await supabase.from("skip_reasons").insert({
    vote_id: args.voteId,
    post_id: args.postId,
    user_id: userRes.user.id,
    reason: args.reason,
    note: args.note?.slice(0, 200) || null,
  });
}

export async function fetchSkipReasonStats(postId: string) {
  const { data } = await supabase
    .from("skip_reasons")
    .select("reason")
    .eq("post_id", postId);
  const counts: Record<SkipReason, number> = {
    price: 0, style: 0, quality: 0, fit: 0, colorway: 0, overhyped: 0, other: 0,
  };
  (data ?? []).forEach((r) => { counts[r.reason as SkipReason]++; });
  return counts;
}
