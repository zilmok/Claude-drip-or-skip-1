import { supabase } from "@/integrations/supabase/client";

export type NotificationType = "drip" | "comment" | "follow" | "trending" | "badge" | "mod_action";

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  actor?: { handle: string; display_name: string; is_verified: boolean } | null;
  post?: { id: string; title: string; image_url: string } | null;
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id, user_id, actor_id, type, post_id, comment_id, metadata, read_at, created_at,
      actor:profiles!notifications_actor_id_fkey(handle, display_name, is_verified),
      post:posts!notifications_post_id_fkey(id, title, image_url)
    `)
    .eq("user_id", userRes.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map((n) => ({
    ...n,
    actor: Array.isArray(n.actor) ? n.actor[0] : n.actor,
    post: Array.isArray(n.post) ? n.post[0] : n.post,
  })) as NotificationRow[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userRes.user.id)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllRead() {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userRes.user.id)
    .is("read_at", null);
}

export async function markRead(id: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}
