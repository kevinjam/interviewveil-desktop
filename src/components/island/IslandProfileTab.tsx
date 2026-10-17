import { useEffect, useRef, useState } from "react";
import { ChevronRight, ExternalLink, Globe, Loader2, LogOut, RefreshCw } from "lucide-react";
import {
  logout,
  openBillingPortal,
  openWebPage,
  refreshAccount,
  signInWithBrowser,
} from "@/lib/account";
import { useAuthStore, type AccountInfo } from "@/stores/authStore";

interface Props {
  onShowPlans: () => void;
}

const card = "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)]";
const primaryBtn =
  "window-no-drag w-full flex items-center justify-center gap-1.5 h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] text-[var(--primary-fg)] text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-40";
const secondaryBtn =
  "window-no-drag flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)] text-[12.5px] font-semibold hover:bg-[var(--hover)] disabled:opacity-40";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function fmtListening(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}

function SignIn() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      await signInWithBrowser(setCode, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) setError(errText(e));
    } finally {
      if (abort.current === controller) {
        setBusy(false);
        setCode(null);
      }
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setBusy(false);
    setCode(null);
  };

  return (
    <div className={`${card} p-4 space-y-3`}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--hover)] shrink-0">
          <Globe className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[13.5px] font-semibold">Sign in to InterviewVeil</p>
          <p className="text-[11.5px] text-[var(--muted)]">
            Continue in your browser with email, Google or GitHub.
          </p>
        </div>
      </div>

      {code ? (
        <div className="space-y-2">
          <p className="text-[11.5px] text-[var(--muted)]">Confirm this code in your browser:</p>
          <p className="text-center font-mono text-[20px] font-bold tracking-[0.15em] py-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--panel)]">
            {code}
          </p>
          <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--muted)]">
            <Loader2 className="w-3 h-3 animate-spin" /> Waiting for confirmation…
          </p>
          <button type="button" onClick={cancel} className={`${secondaryBtn} w-full`}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => void start()} disabled={busy} className={primaryBtn}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sign in with browser
          </button>
          <p className="text-center text-[11.5px] text-[var(--muted)]">
            New here?{" "}
            <button
              type="button"
              onClick={() => void openWebPage("/signup")}
              className="window-no-drag font-semibold text-[var(--brand)] hover:underline"
            >
              Create a free account
            </button>
          </p>
        </>
      )}

      {error && <p className="text-[11.5px] text-red-400">{error}</p>}
    </div>
  );
}

function initials(account: AccountInfo): string {
  const source = account.name?.trim() || account.email.split("@")[0];
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return (letters || "?").toUpperCase();
}

function status(account: AccountInfo): { label: string; tone: "ok" | "warn" | "off" } {
  const sub = account.subscription;
  if (!sub || !["active", "trialing", "past_due"].includes(sub.status)) return { label: "Free", tone: "off" };
  if (sub.status === "past_due") return { label: "Payment issue", tone: "warn" };
  if (sub.cancelAtPeriodEnd) return { label: `Ends ${fmtDate(sub.currentPeriodEnd)}`, tone: "warn" };
  return { label: "Active", tone: "ok" };
}

const BADGE = {
  ok: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  off: "bg-[var(--hover)] text-[var(--muted)] border-[var(--border)]",
};

function Account({ account, onShowPlans }: { account: AccountInfo; onShowPlans: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = status(account);
  const sub = account.subscription;

  const refresh = async () => {
    setRefreshing(true);
    await refreshAccount();
    setRefreshing(false);
  };

  const manage = async () => {
    setError(null);
    try {
      if (account.hasBillingAccount) await openBillingPortal();
      else await openWebPage("/dashboard");
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="space-y-2.5">
      <div className={`${card} flex items-center gap-3 p-2.5`}>
        <span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--hover)] border border-[var(--border)] text-[13px] font-bold shrink-0">
          {initials(account)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold truncate" title={account.email}>
            {account.email}
          </p>
          <p className="text-[11.5px] text-[var(--muted)] truncate">Key {account.accountKey}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh account"
          className="window-no-drag grid place-items-center w-8 h-8 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`${card} px-3 py-2.5`}>
          <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Tokens left</p>
          <p className="text-[20px] font-semibold mt-0.5 tabular-nums">
            {account.tokensLeft}
            <span className="text-[12px] font-medium text-[var(--muted)]"> / {account.tokenAllowance}</span>
          </p>
        </div>
        <div className={`${card} px-3 py-2.5`}>
          <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Listening left</p>
          <p className="text-[20px] font-semibold mt-0.5 tabular-nums">
            {fmtListening(account.audioSecondsLeft)}
            <span className="text-[12px] font-medium text-[var(--muted)]"> / {fmtListening(account.audioSecondsAllowance)}</span>
          </p>
        </div>
      </div>

      <section className="space-y-1.5">
        <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide px-1">Subscriptions</p>
        <div className={`${card} flex items-center justify-between gap-2 px-3 py-2.5`}>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">{account.planName} plan</p>
            <p className="text-[11px] text-[var(--muted)] truncate">
              {sub?.pendingPlanName
                ? `Switches to ${sub.pendingPlanName} on ${fmtDate(sub.currentPeriodEnd)}`
                : sub && ["active", "trialing", "past_due"].includes(sub.status)
                  ? `Renews ${fmtDate(sub.currentPeriodEnd)}`
                  : `${account.tokensLeft} of ${account.tokenAllowance} tokens left`}
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${BADGE[s.tone]}`}>
            {s.label}
          </span>
        </div>
      </section>

      <button type="button" onClick={onShowPlans} className={primaryBtn}>
        Show plans
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void manage()} className={secondaryBtn}>
          Manage
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className={secondaryBtn}
        >
          Log out
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && <p className="text-[11.5px] text-red-400 px-1">{error}</p>}
    </div>
  );
}

export function IslandProfileTab({ onShowPlans }: Props) {
  const token = useAuthStore((s) => s.token);
  const account = useAuthStore((s) => s.account);

  useEffect(() => {
    void refreshAccount();
  }, [token]);

  return <div className="p-1">{token && account ? <Account account={account} onShowPlans={onShowPlans} /> : <SignIn />}</div>;
}
