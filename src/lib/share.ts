import { hapticTap } from "./haptics";

export interface ShareablePost {
  id: string;
  title: string;
  brand?: string | null;
}

/**
 * Share a post via the native Web Share API where available, otherwise
 * fall back to copying the deep link to clipboard.
 * Returns 'shared' | 'copied' | 'failed'.
 */
export async function sharePost(
  post: ShareablePost,
): Promise<"shared" | "copied" | "failed"> {
  console.log("sharePost called", post);
  hapticTap();
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/p/${post.id}`;
  console.log("[share] postId:", post.id, "url:", url);
  const text = post.brand
    ? `${post.title} — ${post.brand} · Drip or Skip?`
    : `${post.title} · Drip or Skip?`;

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      console.log("trying native share");
      await navigator.share({ title: post.title, text, url });
      console.log("[share] result: shared");
      return "shared";
    }
  } catch (e) {
    console.log("[share] native share threw:", (e as Error)?.name, (e as Error)?.message);
    // User cancelled — treat as no-op, do not fall through to clipboard.
    if ((e as Error)?.name === "AbortError") {
      console.log("[share] result: failed (aborted)");
      return "failed";
    }
  }

  console.log("fallback to clipboard");
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(url);
      console.log("[share] result: copied");
      return "copied";
    }
  } catch (e) {
    console.log("[share] clipboard threw:", (e as Error)?.message);
  }
  console.log("[share] result: failed");
  return "failed";
}
