import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { choosePlan, fetchPlans, openWebPage, refreshAccount, type PlanInfo } from "@/lib/account";
import { useAuthStore } from "@/stores/authStore";
import type { Plan } from "@/types";

interface Props {
  onSignIn: () => void;
}

const RANK: Record<Plan, number> = { free: 0, essential: 1, professional: 2, expert: 3 };

const NOTICE: Record<string, string> = {
  upgraded: "Upgraded — your new allowance is active now.",
  downgrade: "Downgrade scheduled for your next billing date.",
  "downgrade-cancelled": "Scheduled downgrade cancelled.",
};

export function IslandPlansTab({ onSignIn }: Props) {
  const account = useAuthStore((s) => s.account);
  const signedIn = useAuthStore((s) => Boolean(s.token));
  const [plans, setPlans] = useState<PlanInfo[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchPlans().then(setPlans);
    void refreshAccount();
  }, []);

  const sub = account?.subscription;
  const live = sub && ["active", "trialing", "past_due"].includes(sub.status);
  const current: Plan = account?.plan ?? "free";

  const choose = async (plan: Exclude<Plan, "free">) => {
    if (!signedIn) return onSignIn();
    setBusy(plan);
    setMessage(null);
    try {
      const { notice } = await choosePlan(plan);
      const key = notice?.split(":")[0];
      setMessage(
        key && NOTICE[key]
          ? { kind: "ok", text: NOTICE[key] }
          : { kind: "ok", text: "Checkout opened in your browser. Come back here when you're done." },
      );
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't change plan" });
    } finally {
      setBusy(null);
    }
  };

  const label = (p: PlanInfo): { text: string; disabled: boolean; primary: boolean } => {
    if (p.id === "free") return { text: current === "free" ? "Current" : "Included", disabled: true, primary: false };
    if (live && sub?.plan === p.id) {
      return sub.pendingPlan
        ? { text: "Keep", disabled: false, primary: false }
        : { text: "Current", disabled: true, primary: false };
    }
    if (sub?.pendingPlan === p.id) return { text: "Scheduled", disabled: true, primary: false };
    if (!live) return { text: "Choose", disabled: false, primary: true };
    return RANK[p.id] > RANK[current]
      ? { text: "Upgrade", disabled: false, primary: true }
      : { text: "Downgrade", disabled: false, primary: false };
  };

  return (
    <div className="p-3 space-y-2">
      {plans === undefined && <p className="text-[12px] text-[var(--muted)] px-1">Loading plans…</p>}
      {plans === null && (
        <p className="text-[12px] text-[var(--muted)] px-1">Couldn't reach InterviewVeil to load plans.</p>
      )}

      {plans?.map((p) => {
        const b = label(p);
        const isCurrent = p.id === current;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--panel-2)] ${
              isCurrent ? "border-emerald-500/40" : "border-[var(--border)]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                {p.name}
                {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </p>
              <p className="text-[11px] text-[var(--muted)] truncate">
                {p.tokensPerMonth} responses / mo · {p.tagline}
              </p>
            </div>
            <p className="text-[13px] font-semibold tabular-nums shrink-0">
              {p.price}
              <span className="text-[11px] font-medium text-[var(--muted)]">/mo</span>
            </p>
            <button
              type="button"
              disabled={b.disabled || busy !== null}
              onClick={() => p.id !== "free" && void choose(p.id)}
              className={`window-no-drag shrink-0 w-[84px] h-8 inline-flex items-center justify-center gap-1 rounded-[var(--radius-sm)] text-[12px] font-semibold disabled:opacity-50 ${
                b.primary
                  ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
                  : "border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--hover)]"
              }`}
            >
              {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b.text}
            </button>
          </div>
        );
      })}

      {message && (
        <p className={`text-[11.5px] px-1 ${message.kind === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}

      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10.5px] text-[var(--muted)]">
          1 token = 1 AI response. Upgrades apply now; downgrades next cycle.
        </p>
        <button
          type="button"
          onClick={() => void openWebPage("/pricing")}
          className="window-no-drag shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand)] hover:underline"
        >
          Compare <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
