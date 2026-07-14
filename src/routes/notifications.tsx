import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, MessageCircle, UserPlus, BadgeCheck, Sparkles, Loader2, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchNotifications, markAllRead, type NotificationRow, type NotificationType } from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/notifications")({
  component: Notifications,
});

const ICON: Record<NotificationType, React.ReactNode> = {
  drip: <Flame className="h-4 w-4" fill="currentColor" />,
  comment: <MessageCircle className="h-4 w-4" />,
  follow: <UserPlus className="h-4 w-4" />,
  badge: <Sparkles className="h-4 w-4" />,
  trending: <BadgeCheck className="h-4 w-4" fill="currentColor" />,
  mod_action: <Shield className="h-4 w-4" />,
};

const COLOR: Record<NotificationType, string> = {
  drip: "bg-primary text-primary-foreground",
  comment: "bg-accent text-accent-foreground",
  follow: "bg-foreground text-background",
  badge: "bg-primary text-primary-foreground",
  trending: "bg-skip text-skip-foreground",
  mod_action: "bg-muted text-muted-foreground",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatNotif(n: NotificationRow): { user: string; text: string } {
  const actor = n.actor?.display_name ?? n.actor?.handle ?? "Someone";
  switch (n.type) {
    case "drip":
      return { user: `@${n.actor?.handle ?? actor}`, text: `dripped your ${n.post?.title ?? "post"}` };
    case "comment":
      return { user: `@${n.actor?.handle ?? actor}`, text: `commented on your post` };
    case "follow":
      return { user: `@${n.actor?.handle ?? actor}`, text: "started following you" };
    case "trending": {
      const m = (n.metadata?.milestone as number) ?? 100;
      return { user: "DripOrSkip", text: `Your post hit ${m} drips 🔥 trending now` };
    }
    case "badge":
      return { user: "DripOrSkip", text: "You unlocked a new badge" };
    case "mod_action":
      return { user: "Moderation", text: "An action was taken on your content" };
  }
}

function Notifications() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchNotifications()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => console.error("[notifications]", e))
      .finally(() => !cancelled && setLoading(false));

    // Realtime subscription
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          fetchNotifications().then((data) => {
            if (!cancelled) setItems(data);
          });
        }
      )
      .subscribe();

    // Mark all read on mount
    markAllRead().catch(() => {});

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <div className="flex flex-1 flex-col px-5 pb-5 pt-safe-lg">
      <header>
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Notifications</p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-none">Activity</h1>
      </header>

      {authLoading || loading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !user ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Sign in to see your activity</p>
      ) : items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">No notifications yet — drop a fit and start the wave</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((n) => {
            const f = formatNotif(n);
            return (
              <li
                key={n.id}
                className={`flex items-center gap-3 rounded-2xl p-3 transition-colors ${
                  n.read_at ? "bg-surface" : "bg-surface-elevated ring-1 ring-primary/30"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${COLOR[n.type]}`}>
                  {ICON[n.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-bold">{f.user}</span>{" "}
                    <span className="text-muted-foreground">{f.text}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
