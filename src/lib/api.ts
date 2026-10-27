import { signOutDevice } from "@/lib/signOut";
import { useAuthStore } from "@/stores/authStore";

/** InterviewVeil API base URL, fixed at build time (`VITE_API_URL`). */
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** InterviewVeil website (sign-up, pricing, dashboard), fixed at build time (`VITE_WEB_URL`). */
export const WEB_URL = (import.meta.env.VITE_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

function platformLabel(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Linux")) return "linux";
  return navigator.platform?.slice(0, 64) || "unknown";
}

export function sessionHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "x-interviewveil-app-version": APP_VERSION,
    "x-interviewveil-platform": platformLabel(),
  };
  if (token) headers["x-interviewveil-session"] = token;
  return headers;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Extract a human-readable message from any of the API's error shapes. */
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown };
    if (typeof b.error === "string") return b.error;
    if (b.error && typeof b.error === "object" && "message" in b.error) {
      return String((b.error as { message: unknown }).message);
    }
  }
  return fallback;
}

/** JSON request to the InterviewVeil API with the session attached. Signs out on 401. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...sessionHeaders(),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the InterviewVeil service. Check your connection.", 0);
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401 && useAuthStore.getState().token) void signOutDevice();
  if (!res.ok) throw new ApiError(errorMessage(body, `Request failed (${res.status})`), res.status);
  return body as T;
}
