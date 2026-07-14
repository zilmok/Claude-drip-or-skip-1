import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Flame,
  TrendingUp,
  Loader2,
  Search,
  X,
  ExternalLink,
  BadgeCheck,
  Footprints,
  Shirt,
  Layers,
  Sparkles,
  Watch,
  Scissors,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { fetchTrending, BRANDS, CATEGORIES, type FeedPost, type Category } from "@/lib/posts";
import { supabase } from "@/integrations/supabase/client";

const CATEGORY_ICONS: Record<Category | "All", LucideIcon> = {
  All: LayoutGrid,
  Sneakers: Footprints,
  Hoodie: Shirt,
  Denim: Scissors,
  Outfit: Layers,
  Accessory: Watch,
  Tee: Sparkles,
};

const CATEGORY_FILTERS: Array<Category | "All"> = ["All", ...CATEGORIES];

export const Route = createFileRoute("/discover")({
  component: Discover,
});

function Discover() {
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState<Category | "All">("All");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrending(filter, categoryFilter)
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .catch((e) => console.error("[discover]", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, categoryFilter]);

  const top = posts[0];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-safe-lg">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Discover</p>
          <h1 className="mt-1 font-display text-3xl font-bold leading-none">
            Most dripped<br />
            <span className="text-primary">this week</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search posts"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-secondary/70"
        >
          <Search className="h-4 w-4" />
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none">
        {BRANDS.map((b) => (
          <button
            key={b}
            onClick={() => setFilter(b)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              filter === b
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 pb-4 scrollbar-none">
        {CATEGORY_FILTERS.map((c) => {
          const Icon = CATEGORY_ICONS[c];
          const active = categoryFilter === c;
          return (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              {c}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nothing trending here yet. Try a different filter — or be the first.
          </p>
          <Link
            to="/upload"
            className="rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground glow-drip"
          >
            Upload your fit
          </Link>
        </div>
      ) : (
        <>
          {top && (
            <div className="px-5">
              <Link
                to="/p/$postId"
                params={{ postId: top.id }}
                className="relative block overflow-hidden rounded-3xl bg-surface transition-opacity hover:opacity-95"
              >
                <img
                  src={top.image_url}
                  alt={top.title}
                  loading="lazy"
                  className="aspect-[4/5] w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      <TrendingUp className="h-3 w-3" /> #1 trending
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold">{top.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {top.brand} · by{" "}
                    <Link
                      to="/u/$handle"
                      params={{ handle: top.uploader.handle }}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer font-semibold text-foreground hover:text-primary"
                    >
                      @{top.uploader.handle}
                    </Link>
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-sm font-bold text-primary">
                    <Flame className="h-4 w-4" fill="currentColor" />
                    {pct(top.drip_count, top.skip_count)}% Drip
                  </div>
                </div>
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 px-5 py-5">
            {posts.slice(1).map((p, i) => (
              <Link
                key={p.id}
                to="/p/$postId"
                params={{ postId: p.id }}
                className="relative block overflow-hidden rounded-2xl bg-surface transition-opacity hover:opacity-90"
              >
                <img
                  src={p.image_url}
                  alt={p.title}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                  <p className="font-display text-sm font-bold leading-tight line-clamp-2">{p.title}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">#{i + 2}</span>
                    <span className="flex items-center gap-1 font-bold text-primary">
                      <Flame className="h-3 w-3" fill="currentColor" />
                      {pct(p.drip_count, p.skip_count)}%
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function pct(d: number, s: number) {
  if (d + s === 0) return 0;
  return Math.round((d / (d + s)) * 100);
}

interface SearchHit {
  id: string;
  title: string;
  brand: string;
  category: string;
  image_url: string;
  product_link: string | null;
}

interface UserHit {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  account_type: "user" | "brand";
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounced(query, 250);

  const isUserSearch = debounced.trim().startsWith("@");

  useEffect(() => {
    const raw = debounced.trim();
    const userMode = raw.startsWith("@");
    const q = userMode ? raw.slice(1).trim() : raw;
    if (q.length < 2) {
      setResults([]);
      setUsers([]);
      return;
    }
    let cancelled = false;
    setSearching(true);

    const userPromise = supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, is_verified, account_type")
      .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
      .order("drip_score", { ascending: false })
      .limit(30);

    const postPromise = userMode
      ? Promise.resolve({ data: [] as SearchHit[], error: null })
      : supabase
          .from("posts")
          .select("id, title, brand, category, image_url, product_link")
          .or(`title.ilike.%${q}%,brand.ilike.%${q}%`)
          .order("drip_count", { ascending: false })
          .limit(40);

    Promise.all([userPromise, postPromise]).then(([uRes, pRes]) => {
      if (cancelled) return;
      if (uRes.error) console.error("[search-users]", uRes.error);
      if (pRes.error) console.error("[search-posts]", pRes.error);
      setUsers((uRes.data ?? []) as UserHit[]);
      setResults((pRes.data ?? []) as SearchHit[]);
      setSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const trimmedLen = debounced.trim().replace(/^@/, "").length;
  const nothing = !searching && trimmedLen >= 2 && users.length === 0 && results.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 pb-3 pt-safe">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts or @users…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {trimmedLen < 2 ? (
          <p className="mt-10 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Type at least 2 characters · prefix with @ to find users
          </p>
        ) : searching ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : nothing ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No results for "{query}"
          </p>
        ) : (
          <div className="space-y-6">
            {users.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                  Users
                </p>
                <ul className="space-y-2">
                  {users.map((u) => (
                    <li key={u.id}>
                      <Link
                        to="/u/$handle"
                        params={{ handle: u.handle }}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-2xl bg-surface p-2 transition-colors hover:bg-secondary"
                      >
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.display_name}
                            loading="lazy"
                            className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
                            {u.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="truncate text-sm font-semibold">{u.display_name}</p>
                            {u.is_verified && (
                              <BadgeCheck className="h-3.5 w-3.5 text-accent" fill="currentColor" />
                            )}
                            {u.account_type === "brand" && (
                              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-accent">
                                Brand
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">@{u.handle}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!isUserSearch && results.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                  Posts
                </p>
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/p/$postId"
                        params={{ postId: r.id }}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-2xl bg-surface p-2 transition-colors hover:bg-secondary"
                      >
                        <img
                          src={r.image_url}
                          alt={r.title}
                          loading="lazy"
                          className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            {r.brand}
                          </p>
                          <p className="truncate text-sm font-semibold">{r.title}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.category}
                          </p>
                        </div>
                        {r.product_link && <ExternalLink className="h-4 w-4 text-muted-foreground" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
