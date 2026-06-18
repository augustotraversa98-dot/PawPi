import { useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderInsurancePolicies,
  useInsurancePolicyAction,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { centsToCurrency, dollarsToCents } from "../lib/money";

// Provider INSURANCE POLICIES (Wave 7 ticket 2.72). A `insurance`-capable insurer sees applications +
// bound policies (pet/owner, premium, status, payment state), issues a policy_number + premium, and
// advances status. A policy goes 'active' ONLY through a confirmed 2.3 payment (the API refuses a
// plain status='active'), so this view never activates without payment. Empty → empty state; a
// non-insurer provider gets a clean capability message (403).

const STATUS_LABEL = {
  application: "Application",
  payment_pending: "Awaiting payment",
  active: "Active",
  lapsed: "Lapsed",
  cancelled: "Cancelled",
};

function IssueRow({ policy, onIssue, disabled }) {
  const [number, setNumber] = useState(policy.policy_number || "");
  const [price, setPrice] = useState(
    policy.premium_cents != null ? (policy.premium_cents / 100).toFixed(2) : "",
  );
  const [period, setPeriod] = useState(policy.billing_period || "monthly");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#FFF1E2] pt-3">
      <input
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Policy no."
        className="w-32 rounded-lg border border-[#FFD9B3] px-2 py-1 text-sm"
      />
      <span className="text-sm text-[#7A6254]">$</span>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="0.00"
        className="w-24 rounded-lg border border-[#FFD9B3] px-2 py-1 text-sm"
      />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className="rounded-lg border border-[#FFD9B3] px-2 py-1 text-sm"
      >
        <option value="monthly">monthly</option>
        <option value="annual">annual</option>
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const { cents, error } = dollarsToCents(price);
          if (error) return toast.error(error);
          onIssue({
            policy_number: number.trim() || null,
            premium_cents: cents,
            billing_period: period,
            status: "payment_pending",
          });
        }}
        className="rounded-lg bg-[#FF6F61] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Issue / update
      </button>
    </div>
  );
}

export default function InsurancePolicies({ providerId }) {
  const { data, isLoading, isError, error } =
    useProviderInsurancePolicies(providerId);
  const action = useInsurancePolicyAction(providerId);

  const run = (policyId, patch, verb) =>
    action.mutate(
      { policyId, ...patch },
      {
        onSuccess: () => toast.success(verb),
        onError: (e) => toast.error(e?.message || "Action failed"),
      },
    );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: COLORS.coral }} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-8 text-center">
          <p className="text-sm text-[#7A6254]">
            {error?.status === 403
              ? "This business doesn't offer insurance (the 'insurance' capability)."
              : error?.message || "Couldn't load policies."}
          </p>
        </div>
      </div>
    );
  }

  const policies = data?.policies ?? [];

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center gap-2">
        <Shield className="h-6 w-6" style={{ color: COLORS.coral }} />
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Policies</h1>
          <p className="text-sm text-[#7A6254]">
            Applications and bound policies — only this insurer's.
          </p>
        </div>
      </header>

      {policies.length === 0 ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center text-sm text-[#B8A99D]">
          No policies yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {policies.map((p) => {
            const terminal = p.status === "active" || p.status === "cancelled";
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-[#FFD9B3] bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-[#3B241B]">
                      {p.plan_name || "Plan"}
                      {p.policy_number ? ` · ${p.policy_number}` : ""}
                    </p>
                    <p className="text-sm text-[#7A6254]">
                      {p.pet_name || "Pet"}
                      {p.owner_name ? ` · ${p.owner_name}` : ""}
                      {p.premium_cents != null
                        ? ` · ${centsToCurrency(p.premium_cents)}${p.billing_period ? `/${p.billing_period}` : ""}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#7A6254]">
                      {p.terms_accepted_at ? "Terms accepted" : "Terms pending"}
                      {p.payment_status ? ` · payment ${p.payment_status}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#FFF1E2] px-2.5 py-1 text-xs font-semibold text-[#B75D32]">
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>

                {!terminal && (
                  <>
                    <IssueRow
                      policy={p}
                      disabled={action.isPending}
                      onIssue={(patch) => run(p.id, patch, "Policy updated")}
                    />
                    <button
                      type="button"
                      disabled={action.isPending}
                      onClick={() => run(p.id, { status: "cancelled" }, "Cancelled")}
                      className="mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#B23A2E] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
