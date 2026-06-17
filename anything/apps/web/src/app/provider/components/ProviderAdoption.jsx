import { useState } from "react";
import { PawPrint, Loader2, Plus, Dog, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAdoptableListings,
  useCreateAdoptableListing,
  useUpdateAdoptableListing,
  useDeleteAdoptableListing,
  useAdoptionApplications,
  useReviewAdoptionApplication,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// /provider/adoption — the adoption PLACE's listing + application workspace (ticket 2.12).
// Manage adoptable DOGS (in the dog-profile field shape) and REVIEW incoming APPLICATIONS
// (under_review / declined / approved). APPROVAL creates the adopter's pet + marks the listing
// adopted (server-side app_approve_adoption). RLS (0038) + the 'adoption' capability gate +
// shelter-admin writes are the real guards. Fees/donations + chat REUSE the 2.3 / 2.5 layers.

function money(cents, currency = "ARS") {
  if (cents == null) return "";
  if (cents === 0) return "Free";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function ProviderAdoption({ providerId }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <PawPrint className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#3B241B]">Adoption</h1>
          <p className="text-sm text-[#7A6254]">
            List adoptable dogs and review adoption applications.
          </p>
        </div>
      </div>

      <CreateListingForm providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Adoptable dogs
      </h2>
      <ListingList providerId={providerId} />

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Applications
      </h2>
      <ApplicationList providerId={providerId} />
    </div>
  );
}

function CreateListingForm({ providerId }) {
  const create = useCreateAdoptableListing(providerId);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [fee, setFee] = useState("");
  const [story, setStory] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name) {
      toast.error("Enter the dog's name.");
      return;
    }
    const feeCents = fee ? Math.round(parseFloat(fee) * 100) : 0;
    try {
      await create.mutateAsync({
        name,
        breed: breed || null,
        adoption_fee_cents: Number.isFinite(feeCents) ? feeCents : 0,
        story: story || null,
      });
      toast.success("Dog listed");
      setName("");
      setBreed("");
      setFee("");
      setStory("");
    } catch (err) {
      toast.error(err.message || "Couldn't list the dog");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border p-4"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dog's name"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
          placeholder="Breed"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Adoption fee (e.g. 50.00, blank = free)"
          inputMode="decimal"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
      </div>
      <textarea
        value={story}
        onChange={(e) => setStory(e.target.value)}
        placeholder="Story / about this dog"
        rows={2}
        className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: COLORS.peach }}
      />
      <button
        type="submit"
        disabled={create.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: COLORS.coral }}
      >
        <Plus className="h-4 w-4" />
        {create.isPending ? "Listing…" : "List a dog"}
      </button>
    </form>
  );
}

function ListingList({ providerId }) {
  const { data: listings, isLoading, isError, error } = useAdoptableListings(providerId);
  const update = useUpdateAdoptableListing(providerId);
  const del = useDeleteAdoptableListing(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading dogs…
      </div>
    );
  }
  if (isError) {
    return <p className="py-8 text-sm text-[#B4452F]">{error?.message || "Couldn't load dogs."}</p>;
  }
  if (!listings || listings.length === 0) {
    return <EmptyCard title="No dogs listed yet" body="Add your first dog above to start." />;
  }

  return (
    <div className="space-y-3">
      {listings.map((l) => (
        <div
          key={l.id}
          className="flex items-center gap-4 rounded-2xl border p-4"
          style={{
            borderColor: COLORS.peach,
            backgroundColor: "#fff",
            opacity: l.status === "adopted" ? 0.6 : 1,
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.sand }}
          >
            <Dog className="h-5 w-5" style={{ color: COLORS.coral }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-[#3B241B]">{l.name}</span>
              <StatusTag status={l.status} />
            </div>
            <p className="text-sm text-[#7A6254]">
              {[l.breed, money(l.adoption_fee_cents, l.currency)].filter(Boolean).join(" · ")}
            </p>
          </div>
          {l.status !== "adopted" ? (
            <button
              onClick={() => del.mutate(l.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: COLORS.terracotta }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ApplicationList({ providerId }) {
  const { data: apps, isLoading, isError, error } = useAdoptionApplications(providerId);
  const review = useReviewAdoptionApplication(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading applications…
      </div>
    );
  }
  if (isError) {
    return <p className="py-8 text-sm text-[#B4452F]">{error?.message || "Couldn't load applications."}</p>;
  }
  if (!apps || apps.length === 0) {
    return <EmptyCard title="No applications yet" body="Applications to adopt your dogs appear here." />;
  }

  const act = async (applicationId, status) => {
    try {
      await review.mutateAsync({ applicationId, status });
      toast.success(
        status === "approved"
          ? "Approved — the dog is now the adopter's pet"
          : `Marked ${status.replace(/_/g, " ")}`,
      );
    } catch (err) {
      toast.error(err.message || "Couldn't update the application");
    }
  };

  return (
    <div className="space-y-3">
      {apps.map((a) => {
        const decided = a.status === "approved" || a.status === "declined";
        return (
          <div
            key={a.id}
            className="rounded-2xl border p-4"
            style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#3B241B]">
                {a.applicant_name || `Applicant #${a.applicant_owner_user_id}`} → {a.listing_name || "dog"}
              </span>
              <StatusTag status={a.status} />
            </div>
            {a.answers && Object.keys(a.answers).length > 0 ? (
              <p className="mt-1 text-sm text-[#7A6254]">
                {Object.entries(a.answers)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(" · ")}
              </p>
            ) : null}
            {!decided ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => act(a.id, "under_review")}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: COLORS.peach, color: "#3B241B" }}
                >
                  Mark under review
                </button>
                <button
                  onClick={() => act(a.id, "approved")}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: "#3FA34D" }}
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => act(a.id, "declined")}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: COLORS.peach, color: COLORS.terracotta }}
                >
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StatusTag({ status }) {
  const map = {
    available: { label: "Available", color: "#3FA34D" },
    pending: { label: "Pending", color: COLORS.coral },
    adopted: { label: "Adopted", color: COLORS.mutedBrown },
    submitted: { label: "Submitted", color: COLORS.mutedBrown },
    under_review: { label: "Under review", color: COLORS.coral },
    approved: { label: "Approved", color: "#3FA34D" },
    declined: { label: "Declined", color: COLORS.terracotta },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: s.color + "22", color: s.color }}
    >
      {s.label}
    </span>
  );
}

function EmptyCard({ title, body }) {
  return (
    <div
      className="rounded-2xl border p-8 text-center"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      <PawPrint className="mx-auto h-8 w-8" style={{ color: COLORS.mutedBrown }} />
      <p className="mt-3 font-semibold text-[#3B241B]">{title}</p>
      <p className="mt-1 text-sm text-[#7A6254]">{body}</p>
    </div>
  );
}
