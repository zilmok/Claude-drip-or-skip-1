// Edge function: moderate-image
// Calls Lovable AI (Gemini) to classify an image for safety.
// Returns { allowed: boolean, reason?: string, categories?: {...} }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Global system-wide cap to prevent AI cost abuse.
const GLOBAL_CAP_PER_24H = 500;

interface ModerationVerdict {
  nsfw: boolean;
  violence: boolean;
  hate_or_harassment: boolean;
  illegal_or_dangerous: boolean;
  minors_unsafe: boolean;
  spam_or_lowquality: boolean;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url } = await req.json();
    if (!image_url || typeof image_url !== "string") {
      return json({ error: "image_url is required" }, 400);
    }

    // ---- Global AI moderation cost cap (system-wide, persistent) ----
    const { data: remaining, error: capErr } = await admin.rpc(
      "ai_moderation_remaining_global"
    );
    if (capErr) {
      console.error("cap check failed", capErr);
    } else if (typeof remaining === "number" && remaining <= 0) {
      return json(
        { error: "System temporarily at capacity, try again later" },
        503
      );
    }

    // Identify caller (best-effort) for logging
    let callerId: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const { data: u } = await admin.auth.getUser(token);
        callerId = u?.user?.id ?? null;
      }
    } catch {
      /* ignore */
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY missing");
      return json({ error: "Moderation service not configured" }, 500);
    }

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are a strict content moderator for a fashion / streetwear social app. " +
                "Inspect the image and decide if it is safe to publish. " +
                "Mark NSFW for nudity, sexual content, lingerie close-ups, or sexually suggestive posing. " +
                "Mark violence for blood, gore, weapons used threateningly, or fights. " +
                "Mark hate_or_harassment for hate symbols, slurs in image, harassing imagery. " +
                "Mark illegal_or_dangerous for drugs, illegal goods, dangerous activities. " +
                "Mark minors_unsafe if the image contains minors in any unsafe or suggestive context. " +
                "Mark spam_or_lowquality for blank, watermarked-only, screenshot of a screenshot, or unrelated junk images. " +
                "Be strict but fair: normal fashion, streetwear, sneakers, accessories, full-body outfits, " +
                "swimwear in a non-sexual editorial style, and brand logos are SAFE. " +
                "Always call the classify_image function with your verdict.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Classify this image for the fashion app's moderation policy.",
                },
                { type: "image_url", image_url: { url: image_url } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_image",
                description: "Return the safety classification for the image.",
                parameters: {
                  type: "object",
                  properties: {
                    nsfw: { type: "boolean" },
                    violence: { type: "boolean" },
                    hate_or_harassment: { type: "boolean" },
                    illegal_or_dangerous: { type: "boolean" },
                    minors_unsafe: { type: "boolean" },
                    spam_or_lowquality: { type: "boolean" },
                    reason: {
                      type: "string",
                      description:
                        "One short sentence explaining the verdict for the user.",
                    },
                  },
                  required: [
                    "nsfw",
                    "violence",
                    "hate_or_harassment",
                    "illegal_or_dangerous",
                    "minors_unsafe",
                    "spam_or_lowquality",
                    "reason",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "classify_image" },
          },
        }),
      }
    );

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI gateway error", aiRes.status, text);
      if (aiRes.status === 429) {
        return json(
          { error: "Moderation rate limit hit, try again in a moment." },
          429
        );
      }
      if (aiRes.status === 402) {
        return json(
          { error: "Moderation credits exhausted. Contact support." },
          402
        );
      }
      // Fail closed: do not allow uploads when moderation is unavailable.
      return json({ error: "Moderation unavailable" }, 502);
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      console.error("No tool call in AI response", JSON.stringify(data));
      return json({ error: "Moderation returned no verdict" }, 502);
    }

    let verdict: ModerationVerdict;
    try {
      verdict = JSON.parse(argsRaw);
    } catch (e) {
      console.error("Bad tool args", argsRaw);
      return json({ error: "Moderation returned malformed verdict" }, 502);
    }

    const flagged =
      verdict.nsfw ||
      verdict.violence ||
      verdict.hate_or_harassment ||
      verdict.illegal_or_dangerous ||
      verdict.minors_unsafe ||
      verdict.spam_or_lowquality;

    if (flagged) {
      const categories: string[] = [];
      if (verdict.nsfw) categories.push("nudity / sexual content");
      if (verdict.violence) categories.push("violence");
      if (verdict.hate_or_harassment) categories.push("hate / harassment");
      if (verdict.illegal_or_dangerous) categories.push("illegal / dangerous");
      if (verdict.minors_unsafe) categories.push("unsafe content involving minors");
      if (verdict.spam_or_lowquality) categories.push("spam / low quality");

      // Log blocked outcome (counts toward the global cap)
      admin
        .from("ai_moderation_events")
        .insert({ user_id: callerId, outcome: "blocked" })
        .then(() => {});
      return json({
        allowed: false,
        reason:
          verdict.reason ||
          `Image was flagged: ${categories.join(", ")}.`,
        categories,
        verdict,
      });
    }

    // Log allowed outcome
    admin
      .from("ai_moderation_events")
      .insert({ user_id: callerId, outcome: "allowed" })
      .then(() => {});
    return json({ allowed: true, verdict });
  } catch (e) {
    console.error("moderate-image error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
