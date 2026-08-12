import { useState } from "react";
import {
  PawPrint,
  Loader2,
  Plus,
  Dog,
  Check,
  X,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdoptableListings,
  useCreateAdoptableListing,
  useUpdateAdoptableListing,
  useDeleteAdoptableListing,
  useRelistAdoptableListing,
  useAdoptionApplications,
  useReviewAdoptionApplication,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import ImageUploader from "./ImageUploader";
import VideoUploader from "./VideoUploader";

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

// Parse the editor's age inputs (years + optional months) into DB values so a listing
// no longer always saves NULL → "Age unknown". Empty → null (age genuinely unknown).
// Validates: years a non-negative integer; months a whole number 0–11. Returns either
// { ok: true, age_years, age_months } or { ok: false, error }. Both create + edit use it.
function parseAge(yearsStr, monthsStr) {
  const field = (s) => {
    const t = String(s ?? "").trim();
    if (t === "") return { value: null };
    // Digits only — rejects decimals, signs, and stray text (so no negative ages).
    if (!/^\d+$/.test(t)) return { error: true };
    return { value: parseInt(t, 10) };
  };
  const y = field(yearsStr);
  const m = field(monthsStr);
  if (y.error) {
    return { ok: false, error: "Age (years) must be a whole number, 0 or more." };
  }
  if (m.error || (m.value != null && m.value > 11)) {
    return { ok: false, error: "Months must be a whole number from 0 to 11." };
  }
  return { ok: true, age_years: y.value, age_months: m.value };
}

// A recommended starter question so every new listing captures a phone the shelter can call
// (there is no phone field on the applicant's profile). The shelter can edit or remove it.
const DEFAULT_QUESTIONS = ["Best contact number"];

// Application questions editor (adoption applications v2) — an ordered list the applicant answers
// on apply. Add / edit / remove / reorder; the parent owns the array. Used by both the create and
// the edit form so a listing's questions are managed the same way in both.
function QuestionsEditor({ questions, onChange }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...questions, t]);
    setDraft("");
  };
  const remove = (i) => onChange(questions.filter((_, idx) => idx !== i));
  const editAt = (i, val) => onChange(questions.map((q, idx) => (idx === i ? val : q)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = questions.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <p className="text-sm font-semibold text-[#3B241B]">Application questions</p>
      <p className="mb-2 text-xs text-[#7A6254]">
        Ask adopters a few questions (home, other pets, a phone to reach them). They answer these
        when they apply.
      </p>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => editAt(i, e.target.value)}
              aria-label={`Question ${i + 1}`}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: COLORS.peach }}
            />
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move question ${i + 1} up`}
              className="rounded-lg border p-2 disabled:opacity-40"
              style={{ borderColor: COLORS.peach, color: "#3B241B" }}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === questions.length - 1}
              aria-label={`Move question ${i + 1} down`}
              className="rounded-lg border p-2 disabled:opacity-40"
              style={{ borderColor: COLORS.peach, color: "#3B241B" }}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove question ${i + 1}`}
              className="rounded-lg border p-2"
              style={{ borderColor: COLORS.peach, color: COLORS.terracotta }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a question"
          aria-label="Add a question"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white"
          style={{ backgroundColor: COLORS.coral }}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

// Render an application's answers for the shelter's review. v2 stores an ordered array of
// { question, answer } (self-describing). Legacy rows stored a flat object → render its entries.
function AnswerLines({ answers }) {
  let rows = [];
  if (Array.isArray(answers)) {
    rows = answers
      .filter((a) => a && (a.question || a.answer))
      .map((a) => [a.question || "Question", a.answer]);
  } else if (answers && typeof answers === "object") {
    rows = Object.entries(answers);
  }
  const filled = rows.filter(([, v]) => v != null && String(v).trim() !== "");
  if (filled.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {filled.map(([q, v], i) => (
        <p key={i} className="text-sm text-[#7A6254]">
          <span className="font-semibold text-[#3B241B]">{q}:</span> {String(v)}
        </p>
      ))}
    </div>
  );
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
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [fee, setFee] = useState("");
  const [story, setStory] = useState("");
  // Media (ticket 2.85): photos → photo_urls[] (first = cover, reorder/remove); video → video_url.
  const [photos, setPhotos] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  // Per-listing application questions (adoption applications v2). Seeded with a recommended
  // "Best contact number" question; the shelter can edit/remove/reorder or add more.
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);

  const submit = async (e) => {
    e.preventDefault();
    if (!name) {
      toast.error("Enter the dog's name.");
      return;
    }
    const age = parseAge(ageYears, ageMonths);
    if (!age.ok) {
      toast.error(age.error);
      return;
    }
    const feeCents = fee ? Math.round(parseFloat(fee) * 100) : 0;
    try {
      await create.mutateAsync({
        name,
        breed: breed || null,
        age_years: age.age_years,
        age_months: age.age_months,
        adoption_fee_cents: Number.isFinite(feeCents) ? feeCents : 0,
        story: story || null,
        photo_urls: photos,
        video_url: videoUrl || null,
        application_questions: questions,
      });
      toast.success("Dog listed");
      setName("");
      setBreed("");
      setAgeYears("");
      setAgeMonths("");
      setFee("");
      setStory("");
      setPhotos([]);
      setVideoUrl(null);
      setQuestions(DEFAULT_QUESTIONS);
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
          value={ageYears}
          onChange={(e) => setAgeYears(e.target.value)}
          placeholder="Age in years (blank = unknown)"
          inputMode="numeric"
          aria-label="Age in years"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={ageMonths}
          onChange={(e) => setAgeMonths(e.target.value)}
          placeholder="Extra months 0–11 (optional)"
          inputMode="numeric"
          aria-label="Extra months"
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

      {/* Media (ticket 2.85) — photos[0] is the cover; one short intro video. Real uploads only. */}
      <div className="mt-4">
        <ImageUploader value={photos} onChange={setPhotos} label="Photos (first is the cover)" />
      </div>
      <div className="mt-4">
        <VideoUploader value={videoUrl} onChange={setVideoUrl} />
      </div>

      <div className="mt-4">
        <QuestionsEditor questions={questions} onChange={setQuestions} />
      </div>

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
  const relist = useRelistAdoptableListing(providerId);
  const [editingMedia, setEditingMedia] = useState(null); // the listing whose media is open

  const putBackUp = (listing) =>
    relist.mutate(listing.id, {
      onSuccess: (data) => {
        toast.success(
          data?.reopened_application_ids?.length
            ? "Back up for adoption — the approved application was re-opened"
            : "Back up for adoption",
        );
      },
      onError: (err) => toast.error(err?.message || "Couldn't re-list the dog"),
    });

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
            className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl"
            style={{ backgroundColor: COLORS.sand }}
          >
            {Array.isArray(l.photo_urls) && l.photo_urls[0] ? (
              <img src={l.photo_urls[0]} alt={l.name} className="h-full w-full object-cover" />
            ) : (
              <Dog className="h-5 w-5" style={{ color: COLORS.coral }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-[#3B241B]">{l.name}</span>
              <StatusTag status={l.status} />
            </div>
            <p className="text-sm text-[#7A6254]">
              {[
                l.breed,
                money(l.adoption_fee_cents, l.currency),
                (l.photo_urls?.length || 0) > 0
                  ? `${l.photo_urls.length} photo${l.photo_urls.length === 1 ? "" : "s"}`
                  : null,
                l.video_url ? "video" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {l.status !== "adopted" ? (
              <>
                <button
                  onClick={() => setEditingMedia(l)}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ color: "#3B241B" }}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => del.mutate(l.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ color: COLORS.terracotta }}
                >
                  Remove
                </button>
              </>
            ) : null}
            {l.status !== "available" ? (
              <button
                onClick={() => putBackUp(l)}
                disabled={relist.isPending}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ color: "#3FA34D" }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Put back up
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {editingMedia && (
        <ListingEditModal
          listing={editingMedia}
          saving={update.isPending}
          onClose={() => setEditingMedia(null)}
          onSave={(patch) =>
            update.mutate(
              { listingId: editingMedia.id, ...patch },
              {
                onSuccess: () => {
                  toast.success("Listing updated");
                  setEditingMedia(null);
                },
                onError: (err) => toast.error(err?.message || "Couldn't save changes"),
              },
            )
          }
        />
      )}
    </div>
  );
}

// Edit an EXISTING listing (ticket 2.91) — the info the business wrote (name, breed, fee, story,
// status) AND its media (photos: reorder/remove, first = cover; intro video), all PREFILLED from
// the saved listing so the business can review what it posted and change it. Saves the whole set
// via the existing useUpdateAdoptableListing PATCH (which COALESCEs unspecified fields). Previously
// only media was editable, so a business couldn't fix a name/story/fee or see the info it wrote.
function ListingEditModal({ listing, onClose, onSave, saving }) {
  const [name, setName] = useState(listing.name || "");
  const [breed, setBreed] = useState(listing.breed || "");
  const [ageYears, setAgeYears] = useState(
    listing.age_years != null ? String(listing.age_years) : "",
  );
  const [ageMonths, setAgeMonths] = useState(
    listing.age_months != null ? String(listing.age_months) : "",
  );
  const [fee, setFee] = useState(
    listing.adoption_fee_cents != null
      ? (listing.adoption_fee_cents / 100).toString()
      : "",
  );
  const [story, setStory] = useState(listing.story || "");
  const [status, setStatus] = useState(listing.status || "available");
  const [photos, setPhotos] = useState(
    Array.isArray(listing.photo_urls) ? listing.photo_urls : [],
  );
  const [videoUrl, setVideoUrl] = useState(listing.video_url || null);
  const [questions, setQuestions] = useState(
    Array.isArray(listing.application_questions)
      ? listing.application_questions.filter((q) => typeof q === "string")
      : [],
  );

  const save = () => {
    if (!name.trim()) {
      toast.error("Enter the dog's name.");
      return;
    }
    const age = parseAge(ageYears, ageMonths);
    if (!age.ok) {
      toast.error(age.error);
      return;
    }
    const feeCents = fee === "" ? 0 : Math.round(parseFloat(fee) * 100);
    onSave({
      name: name.trim(),
      breed: breed.trim() || null,
      // Always sent (value or null) so clearing the field clears the stored age.
      age_years: age.age_years,
      age_months: age.age_months,
      adoption_fee_cents: Number.isFinite(feeCents) && feeCents >= 0 ? feeCents : 0,
      // Empty string clears the story (PATCH COALESCE keeps a field only when null is sent).
      story: story,
      status,
      photo_urls: photos,
      video_url: videoUrl || null,
      application_questions: questions,
    });
  };

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm text-[#3B241B] outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${listing.name}`}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">Edit {listing.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 text-[#7A6254]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[#3B241B]">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 ${inputCls}`}
              style={{ borderColor: COLORS.peach }}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#3B241B]">
              Breed
              <input
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className={`mt-1 ${inputCls}`}
                style={{ borderColor: COLORS.peach }}
              />
            </label>
            <label className="block text-sm font-semibold text-[#3B241B]">
              Adoption fee (blank = free)
              <input
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 50.00"
                className={`mt-1 ${inputCls}`}
                style={{ borderColor: COLORS.peach }}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#3B241B]">
              Age in years (blank = unknown)
              <input
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 3"
                className={`mt-1 ${inputCls}`}
                style={{ borderColor: COLORS.peach }}
              />
            </label>
            <label className="block text-sm font-semibold text-[#3B241B]">
              Extra months 0–11 (optional)
              <input
                value={ageMonths}
                onChange={(e) => setAgeMonths(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 6"
                className={`mt-1 ${inputCls}`}
                style={{ borderColor: COLORS.peach }}
              />
            </label>
          </div>
          <label className="block text-sm font-semibold text-[#3B241B]">
            Story / about this dog
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              rows={3}
              className={`mt-1 resize-y ${inputCls}`}
              style={{ borderColor: COLORS.peach }}
            />
          </label>
          <label className="block text-sm font-semibold text-[#3B241B]">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Listing status"
              className={`mt-1 ${inputCls}`}
              style={{ borderColor: COLORS.peach }}
            >
              <option value="available">Available</option>
              <option value="pending">Pending</option>
              <option value="adopted">Adopted</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
          <ImageUploader value={photos} onChange={setPhotos} label="Photos (first is the cover)" />
        </div>
        <div className="mt-4">
          <VideoUploader value={videoUrl} onChange={setVideoUrl} />
        </div>

        <div className="mt-4">
          <QuestionsEditor questions={questions} onChange={setQuestions} />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 px-4 py-2.5 text-sm font-bold text-[#7A6254]"
            style={{ borderColor: COLORS.peach }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: COLORS.coral }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
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
            {a.applicant_email ? (
              <p className="mt-0.5 text-xs text-[#7A6254]">
                <a href={`mailto:${a.applicant_email}`} className="underline">
                  {a.applicant_email}
                </a>
              </p>
            ) : null}
            <AnswerLines answers={a.answers} />
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
