import { useParams, useSearchParams } from "react-router";
import ProviderShell from "../../../components/ProviderShell";
import ProviderPetRecord from "../../../components/ProviderPetRecord";

// /provider/pets/:petId/record — the consent-gated clinical record (c3). The
// shell resolves auth + the active provider context and hands the resolved
// providerId to the screen; petId comes from the route and bookingId/petName from
// the query (carried by the bookings "Open record" action). The record itself is
// gated server-side by assertCareAccess — this only resolves the ids.
export default function ProviderPetRecordPage() {
  const { petId } = useParams();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("bookingId");
  const petName = searchParams.get("petName");

  return (
    <ProviderShell active="clinical">
      {(providerId) => (
        <ProviderPetRecord
          providerId={providerId}
          petId={petId}
          bookingId={bookingId}
          petName={petName}
        />
      )}
    </ProviderShell>
  );
}
