import { useMemo } from "react";
import { Link } from "react-router";
import { Stethoscope, ShieldCheck, ChevronRight, Loader2 } from "lucide-react";
import { useProviderBookings } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Clinical index (c3). Clinical data is pet-specific and consent-gated, so this
// index lists only the DISTINCT pets the provider already sees through bookings
// (name + a link into each pet's record) — it surfaces NO medical data; the
// record itself opens under assertCareAccess. Bookings are the only place a pet
// name is already exposed, so they're the safe entry list.
export default function ProviderClinical({ providerId }) {
  const { data: bookings, isLoading, isError, error } =
    useProviderBookings(providerId);

  // Distinct pets, keeping the most recent booking id per pet for the deep link.
  const pets = useMemo(() => {
    const byPet = new Map();
    for (const b of bookings ?? []) {
      if (b.pet_id == null) continue;
      const key = String(b.pet_id);
      if (!byPet.has(key)) {
        byPet.set(key, {
          petId: b.pet_id,
          petName: b.pet_name || `Pet #${b.pet_id}`,
          bookingId: b.id,
        });
      }
    }
    return [...byPet.values()];
  }, [bookings]);

  const recordHref = (p) => {
    const params = new URLSearchParams();
    if (p.petName) params.set("petName", p.petName);
    if (p.bookingId != null) params.set("bookingId", String(p.bookingId));
    return `/provider/pets/${p.petId}/record?${params.toString()}`;
  };

  return (
    <div className="px-8 py-7">
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <Stethoscope className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Clinical</h1>
          <p className="flex items-center gap-1.5 text-sm text-[#7A6254]">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#1F7A4D" }} />
            Open a pet's record to view it — access is owner-granted and every
            view is logged.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
            Loading pets…
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">Couldn't load pets</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {error?.message || "Please try again."}
            </p>
          </div>
        ) : pets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">No pets yet</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              When pets book with you, open a booking to view that pet's record.
            </p>
          </div>
        ) : (
          <ul>
            {pets.map((p) => (
              <li key={p.petId}>
                <Link
                  to={recordHref(p)}
                  className="flex items-center justify-between border-b border-[#FFF7EF] px-5 py-4 last:border-0 hover:bg-[#FFFBF6]"
                >
                  <span className="font-semibold text-[#3B241B]">
                    {p.petName}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-[#B75D32]">
                    Open record
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
