import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Plan } from "@/types";

/** Signed-in account as returned by `GET /account`. */
export interface AccountInfo {
  email: string;
  name: string | null;
  /** Short, non-secret display id, e.g. "IV-7F3A···09C2". */
  accountKey: string;
  plan: Plan;
  planName: string;
  /** 1 token = 1 AI response. */
  tokensLeft: number;
  tokenAllowance: number;
  /** Transcription / listen time remaining this period (seconds). */
  audioSecondsLeft: number;
  audioSecondsAllowance: number;
  /** ISO date when the balance next resets. */
  resetsAt: string;
  subscription: {
    plan: Exclude<Plan, "free">;
    planName: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    pendingPlan: Exclude<Plan, "free"> | null;
    pendingPlanName: string | null;
  } | null;
  hasBillingAccount: boolean;
}

interface AuthState {
  token: string | null;
  account: AccountInfo | null;
  setSession: (token: string, account: AccountInfo) => void;
  setAccount: (account: AccountInfo) => void;
  /** Forget the session on this device (server logout is in lib/account). */
  signOutLocal: () => void;
}

const STORAGE_KEY = "interviewveil-auth";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      account: null,
      setSession: (token, account) => set({ token, account }),
      setAccount: (account) => set({ account }),
      signOutLocal: () => set({ token: null, account: null }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      // v1 accounts had a different shape (email-code sign-in); sign in again.
      migrate: () => ({ token: null, account: null }) as unknown as AuthState,
    },
  ),
);

// Island and chat are separate webviews: pick up sign-in/out from the other window.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) void useAuthStore.persist.rehydrate();
  });
}
