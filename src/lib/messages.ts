import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  last_message_at: string;
  other: {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  last_message: { content: string; created_at: string; sender_id: string } | null;
  unread: boolean;
}

export async function getOrCreateDM(otherUserId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("get_or_create_dm", {
    other_user: otherUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  // Get my participations
  const { data: parts, error: pErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  if (pErr) throw pErr;
  if (!parts || parts.length === 0) return [];

  const convIds = parts.map((p) => p.conversation_id);
  const lastReadMap = new Map(parts.map((p) => [p.conversation_id, p.last_read_at]));

  // Fetch conversations + other participants + last messages in parallel
  const [{ data: convs }, { data: otherParts }, { data: msgs }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at").in("id", convIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", userId),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
  ]);

  const otherIds = Array.from(new Set((otherParts ?? []).map((o) => o.user_id)));
  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, is_verified")
        .in("id", otherIds)
    : { data: [] as any[] };

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const otherByConv = new Map<string, any>();
  (otherParts ?? []).forEach((o) => {
    if (!otherByConv.has(o.conversation_id)) {
      const prof = profileMap.get(o.user_id);
      if (prof) otherByConv.set(o.conversation_id, prof);
    }
  });

  const lastMsgByConv = new Map<string, any>();
  (msgs ?? []).forEach((m) => {
    if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m);
  });

  const result: ConversationSummary[] = (convs ?? [])
    .map((c) => {
      const other = otherByConv.get(c.id);
      if (!other) return null;
      const last = lastMsgByConv.get(c.id) ?? null;
      const lastRead = lastReadMap.get(c.id);
      const unread =
        !!last &&
        last.sender_id !== userId &&
        (!lastRead || new Date(last.created_at) > new Date(lastRead));
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        other,
        last_message: last
          ? { content: last.content, created_at: last.created_at, sender_id: last.sender_id }
          : null,
        unread,
      } as ConversationSummary;
    })
    .filter(Boolean) as ConversationSummary[];

  result.sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
  return result;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<ChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Empty message");
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, content: trimmed })
    .select("id, conversation_id, sender_id, content, created_at")
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function getConversationOther(
  conversationId: string,
  userId: string
): Promise<ConversationSummary["other"] | null> {
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", userId);
  const otherId = parts?.[0]?.user_id;
  if (!otherId) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, is_verified")
    .eq("id", otherId)
    .maybeSingle();
  return (prof as any) ?? null;
}

export async function searchProfilesByHandle(query: string, excludeUserId: string) {
  const q = query.replace(/^@/, "").trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, is_verified")
    .ilike("handle", `${q}%`)
    .neq("id", excludeUserId)
    .limit(15);
  if (error) throw error;
  return data ?? [];
}
