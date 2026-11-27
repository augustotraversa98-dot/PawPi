import { useRef } from "react";
import { toast } from "sonner";
import { useAnswerShareOffer, useShareOffers } from "../hooks/useShareOffers";
import { COLORS } from "../lib/colors";
import recordCopy from "../i18n/record";
import shareOffersCopy from "../i18n/shareOffers";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill, formatDate } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Owners' invitations to see a record, on the Clinical screen. Before answering, the business sees only the pet's
// name, the owner's display name, which parts and how long. Hidden while there are none.
export default function ClinicalShareOffers({ providerId }) {
  const { data, isError, refetch } = useShareOffers(providerId);
  const answer = useAnswerShareOffer(providerId);
  const { t, lang } = useProviderCopy(shareOffersCopy);
  // A second click before the button is redrawn as disabled must not answer twice.
  const answering = useRef(false);
  const sections = recordCopy[lang].sections;
  const offers = data?.offers ?? [];

  if (isError && offers.length === 0) {
    return (
      <p className="mb-5 text-sm text-[#B23B30]">
        {t.loadFailed}{" "}
        <button type="button" onClick={() => refetch()} className="font-bold underline">
          {t.retry}
        </button>
      </p>
    );
  }
  if (offers.length === 0) return null;

  const respond = (offer, action) => {
    if (answering.current) return;
    answering.current = true;
    answer.mutate(
      { offerId: offer.id, action },
      {
        onSuccess: (result) => {
          toast.success(
            result.status === "accepted" ? fill(t.accepted, { pet: offer.pet_name }) : t.declined,
          );
        },
        onError: (error) => {
          if (error.code === "offer_not_open") toast.error(t.notOpen);
          else if (error.code === "not_eligible") toast.error(t.notEligible);
          else toast.error(serverErrorMessage(error, lang, t.failed));
        },
        onSettled: () => {
          answering.current = false;
        },
      },
    );
  };

  return (
    <section aria-label={t.title} className="mb-5">
      <h2 className="text-lg font-bold text-[#3B241B]">{t.title}</h2>
      <p className="mb-2 text-sm text-[#7A6254]">{t.body}</p>
      <ul className="space-y-3">
        {offers.map((offer) => (
          <li
            key={offer.id}
            data-testid={`share-offer-${offer.id}`}
            className="rounded-2xl border border-[#FFD9B3] bg-white p-5"
          >
            <p className="text-base font-bold text-[#3B241B]">{offer.pet_name}</p>
            <p className="text-sm text-[#7A6254]">
              {offer.owner_name ? fill(t.owner, { owner: offer.owner_name }) : t.someone}
            </p>
            <p className="mt-2 text-sm text-[#3B241B]">
              <span className="font-semibold">{t.parts}: </span>
              {offer.sections.map((key) => sections[key] ?? key).join(", ")}
            </p>
            <p className="text-sm text-[#3B241B]" data-testid={`share-offer-can-add-${offer.id}`}>
              <span className="font-semibold">{t.canAdd}: </span>
              {offer.edit_sections?.length
                ? offer.edit_sections.map((key) => sections[key] ?? key).join(", ")
                : t.viewOnly}
            </p>
            <p className="text-sm text-[#3B241B]">
              <span className="font-semibold">{t.lengthLabel}: </span>
              {t.length[offer.expiry] ?? offer.expiry}
            </p>
            <p className="mt-1 text-xs text-[#7A6254]">
              {fill(t.answerBy, { date: formatDate(offer.lapses_at, lang) })}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={answer.isPending}
                onClick={() => respond(offer, "accept")}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: COLORS.coral }}
              >
                {t.accept}
              </button>
              <button
                type="button"
                disabled={answer.isPending}
                onClick={() => respond(offer, "decline")}
                className="rounded-xl border-2 border-[#FFD9B3] px-4 py-2.5 text-sm font-bold text-[#3B241B] disabled:opacity-60"
              >
                {t.decline}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
