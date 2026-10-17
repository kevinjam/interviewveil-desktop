import { openUrl } from "@tauri-apps/plugin-opener";
import { API_URL, WEB_URL, apiFetch } from "@/lib/api";
import { signOutDevice } from "@/lib/signOut";
import { useAuthStore, type AccountInfo } from "@/stores/authStore";
import type { Plan } from "@/types";

/** Pull plan + remaining tokens into the auth store. */
export async function refreshAccount(): Promise<AccountInfo | null> {
  if (!useAuthStore.getState().token) return null;
  try {
    const account = await apiFetch<AccountInfo>("/account");
    useAuthStore.getState().setAccount(account);
    return account;
  } catch {
    return null; // offline: keep last known state
  }
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
  await signOutDevice();
}

interface DesktopLogin {
  id: string;
  secret: string;
  userCode: string;
  url: string;
  expiresAt: string;
}

/**
 * Browser sign-in: open the web portal, where the user signs in (email,
 * Google or GitHub) and confirms the code; meanwhile poll until approved.
 * `onCode` receives the code to display so the user can match it.
 */
export async function signInWithBrowser(
  onCode: (code: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const login = await apiFetch<DesktopLogin>("/auth/desktop/start", { method: "POST" });
  onCode(login.userCode);
  await openUrl(login.url);

  const deadline = new Date(login.expiresAt).getTime();
  while (!signal.aborted && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    if (signal.aborted) break;
    const res = await fetch(`${API_URL}/auth/desktop/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: login.id, secret: login.secret }),
    }).catch(() => null);
    if (!res || res.status === 202) continue;
    if (res.ok) {
      const body = (await res.json()) as { token: string; account: AccountInfo };
      useAuthStore.getState().setSession(body.token, body.account);
      return;
    }
    throw new Error("Sign-in expired. Please try again.");
  }
  if (!signal.aborted) throw new Error("Sign-in timed out. Please try again.");
}

export const openWebPage = (path: string) => openUrl(`${WEB_URL}${path}`);

export interface PlanInfo {
  id: Plan;
  name: string;
  price: string;
  priceCents: number;
  tokensPerMonth: number;
  audioSecondsPerMonth: number;
  tagline: string;
}

export async function fetchPlans(): Promise<PlanInfo[] | null> {
  return apiFetch<PlanInfo[]>("/billing/plans").catch(() => null);
}

/**
 * Choose a paid plan. New subscribers get a Stripe Checkout URL (opened in the
 * browser); existing subscribers are upgraded now or downgraded next cycle.
 */
export async function choosePlan(plan: Exclude<Plan, "free">): Promise<{ notice?: string }> {
  const res = await apiFetch<{ url?: string; notice?: string }>("/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  if (res.url) await openUrl(res.url);
  else await refreshAccount();
  return { notice: res.notice };
}

export async function openBillingPortal(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>("/billing/portal", { method: "POST" });
  await openUrl(url);
}
