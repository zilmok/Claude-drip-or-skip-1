import { supabase } from "@/integrations/supabase/client";

export type ReportReason = "spam" | "inappropriate" | "copyright" | "harassment" | "fake" | "other";
export type ReportTarget = "post" | "user" | "comment";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface ReportWithContext extends Report {
  reporter?: { handle: string; display_name: string };
  post?: { id: string; title: string; image_url: string; brand: string; user_id: string; is_hidden: boolean };
}

export async function createReport(args: {
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  description?: string;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("Must be signed in to report");
  const { error } = await supabase.from("reports").insert({
    reporter_id: userRes.user.id,
    target_type: args.targetType,
    target_id: args.targetId,
    reason: args.reason,
    description: args.description?.slice(0, 1000) || null,
  });
  if (error) throw error;
}

export async function blockUser(blockedId: string) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("Must be signed in");
  if (userRes.user.id === blockedId) throw new Error("Cannot block yourself");
  const { error } = await supabase.from("blocks").insert({
    blocker_id: userRes.user.id,
    blocked_id: blockedId,
  });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function unblockUser(blockedId: string) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return;
  await supabase.from("blocks").delete()
    .eq("blocker_id", userRes.user.id).eq("blocked_id", blockedId);
}

export async function fetchBlockedIds(): Promise<string[]> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];
  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", userRes.user.id);
  return (data ?? []).map((b) => b.blocked_id);
}

export async function fetchPendingReports(): Promise<ReportWithContext[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(`
      id, reporter_id, target_type, target_id, reason, description, status,
      resolved_by, resolved_at, resolution_notes, created_at,
      reporter:profiles!reports_reporter_id_fkey(handle, display_name)
    `)
    .in("status", ["pending", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  // Manually fetch post context for post reports
  const postReports = (data ?? []).filter((r) => r.target_type === "post");
  const postIds = postReports.map((r) => r.target_id);
  let postMap = new Map<string, ReportWithContext["post"]>();
  if (postIds.length) {
    const { data: posts } = await supabase
      .from("posts")
      .select("id, title, image_url, brand, user_id, is_hidden")
      .in("id", postIds);
    postMap = new Map((posts ?? []).map((p) => [p.id, p]));
  }

  return (data ?? []).map((r) => ({
    ...r,
    reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter,
    post: r.target_type === "post" ? postMap.get(r.target_id) : undefined,
  })) as ReportWithContext[];
}

export async function moderatePost(args: {
  postId: string;
  action: "hide" | "restore";
  reportId?: string;
  notes?: string;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("Auth required");

  const hide = args.action === "hide";
  const { error: postErr } = await supabase
    .from("posts")
    .update({ is_hidden: hide, hidden_reason: hide ? args.notes ?? "Moderator action" : null })
    .eq("id", args.postId);
  if (postErr) throw postErr;

  if (args.reportId) {
    await supabase.from("reports")
      .update({
        status: "resolved",
        resolved_by: userRes.user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: args.notes ?? null,
      })
      .eq("id", args.reportId);
  }

  await supabase.from("moderation_actions").insert({
    moderator_id: userRes.user.id,
    target_type: "post",
    target_id: args.postId,
    action: hide ? "hide_post" : "restore_post",
    report_id: args.reportId ?? null,
    notes: args.notes ?? null,
  });
}

export async function dismissReport(reportId: string, notes?: string) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return;
  await supabase.from("reports").update({
    status: "dismissed",
    resolved_by: userRes.user.id,
    resolved_at: new Date().toISOString(),
    resolution_notes: notes ?? null,
  }).eq("id", reportId);
}

// Lightweight client-side automated content check (heuristic)
const BLOCK_PATTERNS = [
  /\b(viagra|cialis|casino|porn|xxx)\b/i,
  /(http|https):\/\/[^\s]+\.(ru|tk|ml|ga|cf)\b/i,
  /\b(buy followers|free crypto|airdrop|click here)\b/i,
];

export function autoCheckContent(text: string): { ok: boolean; reason?: string } {
  for (const p of BLOCK_PATTERNS) {
    if (p.test(text)) return { ok: false, reason: "Content flagged by automated filter" };
  }
  if (text.length > 5 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return { ok: false, reason: "Avoid all-caps spam" };
  }
  return { ok: true };
}
