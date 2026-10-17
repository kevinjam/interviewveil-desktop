/** Last-line guard if a vendor string slips through the API or SDK. */
const VENDORISH =
  /openrouter|provider returned|upstream|agentic harness|\/[a-z0-9-]+:free|google ai studio|cohere:|anthropic\/|rate-limited upstream/i;

const OUR_PREFIX =
  /^(interviewveil|you're out of|please sign in|the ai |we couldn't|that was too much|listening is|transcription )/i;

export function sanitizeUserError(message: string, fallback = "We couldn't generate an answer. Please try again."): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (OUR_PREFIX.test(trimmed)) return trimmed;
  if (VENDORISH.test(trimmed)) return fallback;
  if (trimmed.length > 220) return fallback;
  return trimmed;
}
