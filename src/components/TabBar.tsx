import { Link, useLocation } from "@tanstack/react-router";
import { Home, Compass, PlusSquare, User, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/upload", label: "Upload", icon: PlusSquare },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/85 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 safe-bottom pt-2">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          const isUpload = to === "/upload";
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] uppercase tracking-wider transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isUpload ? (
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition-all",
                      active
                        ? "bg-primary text-primary-foreground glow-drip"
                        : "bg-foreground text-background"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon className={cn("h-6 w-6", active && "fill-primary/20")} strokeWidth={2} />
                )}
                <span className="font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
