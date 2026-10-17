import Anthropic from "@anthropic-ai/sdk";
import { API_URL, errorMessage, sessionHeaders } from "@/lib/api";
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
  /** Interview type; the API may route coding to `MODEL_CODING`. */
  mode?: InterviewMode;
  system: string;
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
      ...(req.mode ? { "x-interviewveil-mode": req.mode } : {}),
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

  // Free/Essential tiers use Haiku on the server (no effort / fallback betas).
  const modern = req.plan === "professional" || req.plan === "expert";
  const model = "claude-haiku-4-5";

  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 16000,
      ...(modern && {
        // Answers are read live while practicing: favour latency over depth.
        output_config: { effort: "low" as const },
        // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      }),
      system: req.system,
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
      const cause =
        e instanceof Anthropic.APIConnectionError && e.cause instanceof Error
          ? ` (${e.cause.message})`
          : "";
      throw Object.assign(new Error(errorMessage(e.error, e.message) + cause), { status: e.status });
    }
    throw e;
  }
}
