import { supabase } from "@/integrations/supabase/client";

export type Category = "Sneakers" | "Hoodie" | "Denim" | "Outfit" | "Accessory" | "Tee";

export interface FeedPost {
  id: string;
  image_url: string;
  title: string;
  brand: string;
  category: Category;
  product_link: string | null;
  drip_count: number;
  skip_count: number;
  comment_count: number;
  is_fit_check: boolean;
  created_at: string;
  user_id: string;
  uploader: {
    id: string;
    handle: string;
    display_name: string;
    account_type: "user" | "brand";
    is_verified: boolean;
  };
  user_vote: "drip" | "skip" | null;
  user_vote_id: string | null;
}

export const BRANDS = ["All", "Nike", "Supreme", "Stüssy", "Corteiz", "Acronym", "Travis Scott × Nike"];
export const CATEGORIES: Category[] = ["Sneakers", "Hoodie", "Outfit", "Tee", "Denim", "Accessory"];

const POST_SELECT = `
  id, image_url, title, brand, category, product_link,
  drip_count, skip_count, comment_count, is_fit_check, created_at, user_id,
  uploader:profiles!posts_user_id_fkey(id, handle, display_name, account_type, is_verified)
`;

async function getBlockedIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", userId);
  return new Set((data ?? []).map((b) => b.blocked_id));
}

export async function fetchFeed(currentUserId: string | null, options?: { excludeVoted?: boolean }): Promise<FeedPost[]> {
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(80);

  // hide own posts in swipe feed (cannot vote on them anyway)
  if (currentUserId) query = query.neq("user_id", currentUserId);

  const { data: posts, error } = await query;
  if (error) throw error;
  if (!posts) return [];

  const blocked = await getBlockedIds(currentUserId);
  const filteredByBlocks = posts.filter((p) => !blocked.has(p.user_id));

  let voteMap = new Map<string, { vote: "drip" | "skip"; id: string }>();
  if (currentUserId && filteredByBlocks.length) {
    const { data: votes } = await supabase
      .from("votes")
      .select("id, post_id, vote")
      .eq("user_id", currentUserId)
      .in("post_id", filteredByBlocks.map((p) => p.id));
    if (votes) voteMap = new Map(votes.map((v) => [v.post_id, { vote: v.vote, id: v.id }]));
  }

  let result = filteredByBlocks.map((p) => {
    const v = voteMap.get(p.id);
    return {
      ...p,
      category: p.category as Category,
      uploader: Array.isArray(p.uploader) ? p.uploader[0] : p.uploader,
      user_vote: v?.vote ?? null,
      user_vote_id: v?.id ?? null,
    };
  }) as FeedPost[];

  if (options?.excludeVoted) result = result.filter((p) => p.user_vote === null);
  return result.slice(0, 50);
}

/**
 * Cast a vote. Safe against duplicate submissions thanks to the
 * UNIQUE(user_id, post_id) constraint on `votes`.
 *
 * Behavior:
 * - First vote for this (user, post) → inserts and returns the new vote id.
 * - Same vote already exists → no-op, returns the existing vote id.
 * - Opposite vote already exists → updates the row (trigger swaps counts) and
 *   returns the same vote id.
 */
export async function castVote(
  postId: string,
  userId: string,
  vote: "drip" | "skip"
): Promise<string | null> {
  const { data, error } = await supabase
    .from("votes")
    .insert({ post_id: postId, user_id: userId, vote })
    .select("id")
    .maybeSingle();

  if (!error) return data?.id ?? null;

  // Postgres unique_violation — a vote already exists for this (user, post).
  // Reconcile by reading the existing row and updating it if the choice changed.
  const isUniqueViolation =
    (error as { code?: string }).code === "23505" ||
    /duplicate|unique/i.test(error.message);

  if (!isUniqueViolation) throw error;

  const { data: existing, error: readErr } = await supabase
    .from("votes")
    .select("id, vote")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return null;

  if (existing.vote === vote) return existing.id;

  const { error: updateErr } = await supabase
    .from("votes")
    .update({ vote })
    .eq("id", existing.id);
  if (updateErr) throw updateErr;

  return existing.id;
}

/**
 * Remove a previously cast vote (undo). The DB trigger adjusts counts.
 */
export async function removeVote(voteId: string): Promise<void> {
  const { error } = await supabase.from("votes").delete().eq("id", voteId);
  if (error) throw error;
}

export async function fetchPostStats(postId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("drip_count, skip_count")
    .eq("id", postId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchUploadsRemaining(): Promise<number> {
  const { data, error } = await (supabase as any).rpc("uploads_remaining_today");
  if (error) {
    console.error("[uploads_remaining]", error);
    return 5;
  }
  return typeof data === "number" ? data : 5;
}

/**
 * Fallback feed for when the user has voted on every fresh post.
 * Returns trending posts the user has NOT uploaded, with a recency boost.
 */
export async function fetchFallbackFeed(currentUserId: string | null): Promise<FeedPost[]> {
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("drip_count", { ascending: false })
    .limit(60);
  if (currentUserId) query = query.neq("user_id", currentUserId);
  const { data, error } = await query;
  if (error) throw error;
  const blocked = await getBlockedIds(currentUserId);
  return (data ?? [])
    .filter((p) => !blocked.has(p.user_id))
    .map((p) => ({
      ...p,
      category: p.category as Category,
      uploader: Array.isArray(p.uploader) ? p.uploader[0] : p.uploader,
      user_vote: null,
      user_vote_id: null,
    })) as FeedPost[];
}

export async function fetchTrending(
  brandFilter?: string,
  categoryFilter?: string,
): Promise<FeedPost[]> {
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("drip_count", { ascending: false })
    .limit(30);
  if (brandFilter && brandFilter !== "All") query = query.ilike("brand", `%${brandFilter}%`);
  if (categoryFilter && categoryFilter !== "All")
    query = query.eq("category", categoryFilter as Category);
  const { data, error } = await query;
  if (error) throw error;

  const { data: userRes } = await supabase.auth.getUser();
  const blocked = await getBlockedIds(userRes.user?.id ?? null);

  return (data ?? [])
    .filter((p) => !blocked.has(p.user_id))
    .map((p) => ({
      ...p,
      category: p.category as Category,
      uploader: Array.isArray(p.uploader) ? p.uploader[0] : p.uploader,
      user_vote: null,
      user_vote_id: null,
    })) as FeedPost[];
}

// ---------- Saves (bookmark / like) ----------
export async function isPostSaved(postId: string, userId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("saves")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function savePost(postId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("saves")
    .insert({ post_id: postId, user_id: userId });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function unsavePost(postId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("saves")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ---------- Lightweight post lookups for chat sharing ----------
export interface SharedPostPreview {
  id: string;
  image_url: string;
  title: string;
  brand: string;
  user_id: string;
  uploader_handle: string;
}

export async function fetchMyPostsForShare(userId: string): Promise<SharedPostPreview[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, image_url, title, brand, user_id, uploader:profiles!posts_user_id_fkey(handle)")
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    image_url: p.image_url,
    title: p.title,
    brand: p.brand,
    user_id: p.user_id,
    uploader_handle: Array.isArray(p.uploader) ? p.uploader[0]?.handle : p.uploader?.handle,
  }));
}

export async function fetchPostsByIds(ids: string[]): Promise<SharedPostPreview[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("posts")
    .select("id, image_url, title, brand, user_id, uploader:profiles!posts_user_id_fkey(handle)")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    image_url: p.image_url,
    title: p.title,
    brand: p.brand,
    user_id: p.user_id,
    uploader_handle: Array.isArray(p.uploader) ? p.uploader[0]?.handle : p.uploader?.handle,
  }));
}

