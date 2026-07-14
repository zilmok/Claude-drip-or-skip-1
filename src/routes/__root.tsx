import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { TabBar } from "@/components/TabBar";
import { AuthProvider } from "@/lib/auth";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-primary text-glow-drip">404</h1>
        <h2 className="mt-4 font-display text-2xl font-bold">Page skipped</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This route didn't get the drip. Head back home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground"
          >
            Back to feed
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "DripOrSkip — Rate the fit. Find your drip." },
      {
        name: "description",
        content:
          "DripOrSkip is the streetwear social where you swipe to rate fits, sneakers, and drops. Drip or Skip — you decide.",
      },
      { name: "theme-color", content: "#000000" },
      { property: "og:title", content: "DripOrSkip — Rate the fit. Find your drip." },
      {
        property: "og:description",
        content: "Tinder for streetwear. Swipe Drip or Skip on every fit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { pathname } = useLocation();
  const keyboardVisible = useKeyboardVisible();
  const hideTabBarForRoute = pathname === "/auth" || /^\/messages\/[^/]+$/.test(pathname);
  // Hide the fixed bottom TabBar while the native soft keyboard is open,
  // so it doesn't ride up above the keyboard and cover the focused input
  // (with windowSoftInputMode="adjustResize" the WebView shrinks and any
  // fixed bottom-0 element would otherwise sit right on top of the
  // keyboard). No-op on web.
  const hideTabBar = hideTabBarForRoute || keyboardVisible;
  return (
    <AuthProvider>
      <div
        className={`mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background ${
          hideTabBarForRoute ? "" : "pb-24"
        }`}
      >
        <Outlet />
        {!hideTabBar && <TabBar />}
      </div>
    </AuthProvider>
  );
}
