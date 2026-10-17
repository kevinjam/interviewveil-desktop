import Anthropic from "@anthropic-ai/sdk";
import { API_URL, errorMessage, sessionHeaders } from "@/lib/api";
import { sanitizeUserError } from "@/lib/userErrors";
import { liveAssistHeaders, type LiveAssistContext } from "@/lib/ai/context";
import type { InterviewMode, Plan } from "@/types";

export interface StreamImage {
  dataBase64: string;
  mime?: string;
}

export interface StreamRequest {
  /** Drives client stream options only; the API routes by plan on the server. */
  plan: Plan;
  /** What this response is for; recorded in usage history. */
  kind: "question" | "review" | "explain" | "follow_up";
  mode?: InterviewMode;
  /** Required for question/review; omitted for explain/follow_up (server-owned prompt). */
  system?: string;
  liveAssist?: LiveAssistContext;
  userMessage: string;
  imageBase64?: string;
  imageMime?: string;
  images?: StreamImage[];
  onDelta: (text: string) => void;
}

type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * Streams a Claude answer through the InterviewVeil API, which holds the
 * Anthropic key and meters usage. The app never sees an API key.
 */
export async function streamClaude(req: StreamRequest): Promise<string> {
  const client = new Anthropic({
    apiKey: "managed-by-interviewveil-api",
    baseURL: API_URL,
    defaultHeaders: {
      ...sessionHeaders(),
      "x-interviewveil-kind": req.kind,
      ...(req.liveAssist ? liveAssistHeaders(req.liveAssist) : req.mode ? { "x-interviewveil-mode": req.mode } : {}),
    },
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const supported: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  const shots: StreamImage[] =
    req.images && req.images.length > 0
      ? req.images
      : req.imageBase64
        ? [{ dataBase64: req.imageBase64, mime: req.imageMime }]
        : [];
  for (const shot of shots) {
    const mediaType = (
      shot.mime && supported.includes(shot.mime) ? shot.mime : "image/png"
    ) as ImageMime;
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: shot.dataBase64 },
    });
  }
  content.push({ type: "text", text: req.userMessage });

  const liveAssist = req.kind === "explain" || req.kind === "follow_up";
  // Practice on Pro/Expert: low effort on the server for question/review only (not live assist).
  const practiceModern =
    !liveAssist && (req.plan === "professional" || req.plan === "expert");
  const model = "claude-haiku-4-5";

  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: liveAssist ? 8192 : 16000,
      ...(practiceModern && {
        output_config: { effort: "low" as const },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      }),
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content }],
    });

    stream.on("text", (delta) => req.onDelta(delta));
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new Error("The model declined to answer this request.");
    }
    return message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  } catch (e) {
    // Surface the InterviewVeil API's own message (sign-in, quota, rate limit).
    if (e instanceof Anthropic.APIError) {
      const raw = errorMessage(e.error, e.message);
      throw Object.assign(new Error(sanitizeUserError(raw)), { status: e.status });
    }
    throw e;
  }
}
