import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  Image,
  Modal,
  Alert,
  Linking,
  ScrollView,
  Dimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import {
  PawPrint,
  ChevronRight,
  X,
  MessageSquare,
  Check,
  MapPin,
} from "lucide-react-native";
import MapLocationView from "@/components/Map/MapLocationView";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import {
  useApplyForAdoption,
  useStartThread,
  useAdoptionCheckout,
} from "@/hooks/useProviders";
import { isValidCoord } from "@/utils/walkBuddies";

// SHARED adoption listing views (ticket 2.97). The adoptable-dog card + the full detail/apply
// modal, extracted verbatim from the Adoption browse screen (app/service/adoption.jsx) so the
// SAME design + apply flow renders in BOTH the standalone browse AND the business storefront's
// Adoption tab. No parallel design — one implementation, imported by both surfaces.

export function money(cents, currency = "ARS", t) {
  if (cents == null) return "";
  if (cents === 0) return t ? t("adoption.listing.free") : "Free";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export function ageLabel(years, months, t) {
  const y = years || 0;
  const m = months || 0;
  if (!y && !m) return t ? t("adoption.listing.ageUnknown") : "Age unknown";
  const parts = [];
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ");
}

export function Chip({ label }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.coral + "14",
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm + 2,
        paddingVertical: 4,
      }}
    >
      <Text style={[TYPE.caption, { fontWeight: "700", color: COLORS.coral, letterSpacing: 0 }]}>{label}</Text>
    </View>
  );
}

// The dog-profile card (ticket 2.86): the cover photo on TOP, then — BELOW it, so the dog is fully
// visible (NOT overlaid) — the name, a basic-info row (age · size · gender), the distance, and a
// "See more" affordance. `grid` renders the compact half-width variant for the browse grid.
export function DogProfileCard({ listing, onPress, grid = false }) {
  const { t } = useTranslation();
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  const photoH = grid ? 140 : 180;
  const info = [ageLabel(listing.age_years, listing.age_months, t), listing.size, listing.gender]
    .filter(Boolean)
    .join(" · ");
  const km = listing.distance_km;
  return (
    <PressableScale onPress={onPress}>
      <Card
        level="sm"
        radius={grid ? RADIUS.md : RADIUS.card}
        borderColor={COLORS.peach}
        style={{ marginBottom: SPACING.md + 2, overflow: "hidden" }}
      >
        <View>
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: "100%", height: photoH, backgroundColor: COLORS.sand }} />
          ) : (
            <View
              style={{
                width: "100%",
                height: photoH,
                backgroundColor: COLORS.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <PawPrint size={grid ? 30 : 40} color={COLORS.coral} />
            </View>
          )}
          {listing.is_urgent ? (
            <View
              testID={`urgent-${listing.id}`}
              style={{
                position: "absolute",
                top: SPACING.sm,
                left: SPACING.sm,
                backgroundColor: "#C2410C",
                borderRadius: RADIUS.chip,
                paddingHorizontal: SPACING.md - 2,
                paddingVertical: 4,
              }}
            >
              <Text style={[TYPE.caption, { color: "#fff", fontWeight: "800", letterSpacing: 0 }]}>{t("adoption.listing.urgent")}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ padding: grid ? SPACING.md : SPACING.lg }}>
          <Text
            style={[grid ? TYPE.headline : TYPE.title2, { color: COLORS.warmBrown }]}
            numberOfLines={1}
          >
            {listing.name}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]} numberOfLines={1}>
            {info || t("adoption.listing.detailsInside")}
          </Text>
          {km != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: SPACING.sm }}>
              <MapPin size={12} color={COLORS.mutedBrown} />
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                {km < 1 ? t("adoption.listing.lessThan1km") : t("adoption.listing.kmAway", { km: Math.round(km) })}
              </Text>
            </View>
          ) : null}
          {!grid ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm + 2 }}>
              {listing.placement_type === "foster" ? <Chip label={t("adoption.listing.chipFoster")} /> : null}
              {listing.placement_type === "both" ? <Chip label={t("adoption.listing.chipAdoptOrFoster")} /> : null}
              {listing.energy_level ? <Chip label={t("adoption.listing.chipEnergy", { level: listing.energy_level })} /> : null}
              {listing.good_with_kids === true ? <Chip label={t("adoption.listing.chipGoodWithKids")} /> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm + 2 }}>
            <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]} numberOfLines={1}>
              {money(listing.adoption_fee_cents, listing.currency, t)}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={[TYPE.footnote, { fontWeight: "700", color: COLORS.warmBrown }]}>{t("adoption.listing.seeMore")}</Text>
              <ChevronRight size={16} color={COLORS.warmBrown} />
            </View>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

// The four apply-button states driven by the viewer's OWN application (ticket 2.95). A pre-existing
// application (from the browse read's my_application_status) DISABLES the CTA with a status-aware
// label instead of re-arming "Apply to adopt" — declined included (no re-apply). i18n EN+ES.
const APPLIED_STATUSES = ["submitted", "under_review", "approved", "declined"];
function applicationStatusLabel(t, status) {
  if (status === "approved") return t("adoption.apply.approved");
  if (status === "declined") return t("adoption.apply.declined");
  return t("adoption.apply.reviewing"); // submitted | under_review
}

export function ListingDetailModal({ data, onClose, router }) {
  const { t } = useTranslation();
  const listing = data?.listing;
  const place = data?.place;
  const apply = useApplyForAdoption();
  const { mutate: startThread, isPending: startingThread } = useStartThread();
  const checkout = useAdoptionCheckout();
  // Foster-vs-adopt intent (ticket 2.57) — only shown when the listing allows BOTH.
  const [placement, setPlacement] = useState("adopt");
  // Clear submitted/confirmation state (ticket 2.95): once the application posts, the CTA turns
  // into a persistent "Application sent" confirmation instead of re-arming for a duplicate apply.
  const [submitted, setSubmitted] = useState(false);
  // Per-listing application questions (adoption applications v2). The shelter configures an
  // ordered list of questions on the listing; render one input per question and store the
  // responses (keyed by index) so they submit into adoption_applications.answers. A listing with
  // no questions (or a pre-migration listing where the field is absent) → apply works as before.
  const questions = Array.isArray(listing?.application_questions)
    ? listing.application_questions.filter((q) => typeof q === "string" && q.trim())
    : [];
  const [responses, setResponses] = useState({});

  // The viewer's own application on THIS listing, read straight off the browse row
  // (my_application_status). A fresh apply this session (`submitted`) keeps its own "Application
  // sent" confirmation; otherwise an existing server status disables the CTA (declined = no
  // re-apply — the server also 409s it).
  const serverStatus = APPLIED_STATUSES.includes(listing?.my_application_status)
    ? listing.my_application_status
    : null;
  const canApply = !submitted && !serverStatus;

  // Reset the per-listing state whenever a different dog opens in the modal.
  useEffect(() => {
    setSubmitted(false);
    setPlacement("adopt");
    setResponses({});
  }, [listing?.id]);

  const doApply = async () => {
    try {
      const requestedPlacement =
        listing.placement_type === "foster"
          ? "foster"
          : listing.placement_type === "both"
            ? placement
            : null;
      // Self-describing answers: [{ question, answer }] captures the question text at submit time
      // (robust if the shelter later edits the questions). The provider review renders these
      // directly. No questions → an empty array (unchanged behavior).
      const answers = questions.map((q, i) => ({
        question: q,
        answer: (responses[i] ?? "").trim(),
      }));
      await apply.mutateAsync({
        listing_id: listing.id,
        answers,
        requested_placement: requestedPlacement,
      });
      setSubmitted(true);
      Alert.alert(
        t("adoption.listing.applicationSentTitle"),
        t("adoption.listing.applicationSentBody", { name: listing.name }),
      );
    } catch (e) {
      Alert.alert(t("adoption.listing.applyErrorTitle"), e.message || t("common.pleaseTryAgain"));
    }
  };

  const doChat = () => {
    if (startingThread) return;
    startThread(
      { providerId: place.id },
      {
        onSuccess: (res) => {
          const thread = res?.thread;
          if (!thread) return;
          onClose();
          router.push({
            pathname: "/provider-chat",
            params: {
              threadId: String(thread.id),
              providerName: place.name || t("adoption.listing.shelter"),
              ownerUserId: String(thread.owner_user_id),
            },
          });
        },
        onError: (e) => Alert.alert(t("adoption.listing.chatErrorTitle"), e.message || t("adoption.listing.pleaseTryAgain")),
      },
    );
  };

  const doPay = async (kind, amountCents) => {
    try {
      const res = await checkout.mutateAsync({
        provider_id: place.id,
        kind,
        amount_cents: amountCents,
        source_ref: `adoption-listing-${listing.id}`,
      });
      if (res.checkoutUrl) {
        Linking.openURL(res.checkoutUrl).catch(() => {});
        Alert.alert(t("adoption.listing.paymentStartedTitle"), t("adoption.listing.paymentStartedBody"));
      } else {
        Alert.alert(t("adoption.listing.thankYouTitle"), t("adoption.listing.paymentProcessingBody"));
      }
    } catch (e) {
      // Surfaces the backend's 503 "payments not configured" message verbatim.
      Alert.alert(t("adoption.listing.paymentsUnavailableTitle"), e.message || t("adoption.listing.pleaseTryAgainLater"));
    }
  };

  return (
    <Modal
      visible={!!data}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {listing ? (
        <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
          <GlassSurface
            intensity={BLUR.thick}
            style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
            contentStyle={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: SPACING.lg,
            }}
          >
            <Text style={[TYPE.title2, { fontSize: 18, color: COLORS.warmBrown, flex: 1 }]} numberOfLines={1}>
              {listing.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
              {/* Report this adoption listing (T4). */}
              <ModerationMenu targetType="adoption_listing" targetId={listing.id} iconSize={18} />
              <PressableScale onPress={onClose}>
                <X size={22} color={COLORS.warmBrown} />
              </PressableScale>
            </View>
          </GlassSurface>

          <RefreshableScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {listing.is_urgent ? (
              <View testID="detail-urgent" style={{ margin: SPACING.lg, marginBottom: 0, backgroundColor: "#C2410C", borderRadius: RADIUS.md - 4, padding: SPACING.md }}>
                <Text style={[TYPE.body, { color: "#fff", fontWeight: "800" }]}>
                  {t("adoption.listing.urgentLabel")}{listing.urgent_reason ? `: ${listing.urgent_reason}` : ""}
                </Text>
              </View>
            ) : null}

            <DogProfileDetail listing={listing} place={place} />

            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              {/* Placement: shown only when the listing allows BOTH adopt + foster. */}
              {listing.placement_type === "both" ? (
                <View>
                  <Text style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "700", marginBottom: SPACING.sm - 2 }]}>
                    {t("adoption.listing.idLikeTo")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                    <PressableScale
                      testID="placement-adopt"
                      onPress={() => setPlacement("adopt")}
                      style={{ paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm, borderRadius: RADIUS.chip, borderWidth: 1, borderColor: placement === "adopt" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "adopt" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={[TYPE.body, { color: placement === "adopt" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }]}>{t("adoption.listing.adopt")}</Text>
                    </PressableScale>
                    <PressableScale
                      testID="placement-foster"
                      onPress={() => setPlacement("foster")}
                      style={{ paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm, borderRadius: RADIUS.chip, borderWidth: 1, borderColor: placement === "foster" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "foster" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={[TYPE.body, { color: placement === "foster" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }]}>{t("adoption.listing.foster")}</Text>
                    </PressableScale>
                  </View>
                </View>
              ) : listing.placement_type === "foster" ? (
                <Text testID="placement-foster-only" style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
                  {t("adoption.listing.fosterOnly")}
                </Text>
              ) : null}

              {/* Shelter's application questions (adoption applications v2) — one input each. Only
                  while the owner can still apply (hidden once an application exists). */}
              {questions.length > 0 && canApply ? (
                <View testID="application-questions" style={{ gap: SPACING.sm }}>
                  <Text style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
                    {t("adoption.listing.questionsHeading")}
                  </Text>
                  {questions.map((q, i) => (
                    <View key={i} style={{ gap: 4 }}>
                      <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "600" }]}>
                        {q}
                      </Text>
                      <TextInput
                        testID={`answer-${i}`}
                        value={responses[i] ?? ""}
                        onChangeText={(v) => setResponses((r) => ({ ...r, [i]: v }))}
                        placeholder={t("adoption.listing.answerPlaceholder")}
                        placeholderTextColor={COLORS.mutedBrown}
                        multiline
                        style={{
                          borderWidth: 1,
                          borderColor: COLORS.peach,
                          borderRadius: RADIUS.control,
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm + 2,
                          minHeight: 44,
                          color: COLORS.warmBrown,
                          backgroundColor: COLORS.card,
                          ...TYPE.body,
                        }}
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              {submitted ? (
                <View
                  testID="application-sent"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: SPACING.sm,
                    backgroundColor: "#3FA34D" + "18",
                    borderWidth: 1,
                    borderColor: "#3FA34D",
                    borderRadius: RADIUS.control,
                    paddingVertical: 15,
                  }}
                >
                  <Check size={18} color="#3FA34D" />
                  <Text style={[TYPE.headline, { color: "#3FA34D" }]}>{t("adoption.apply.sent")}</Text>
                </View>
              ) : serverStatus ? (
                // The owner already applied (loaded from the browse read): a DISABLED, status-aware
                // CTA — never a re-arm-to-duplicate "Apply to adopt". Declined stays disabled too.
                <PrimaryButton
                  testID={`application-status-${serverStatus}`}
                  label={applicationStatusLabel(t, serverStatus)}
                  onPress={() => {}}
                  disabled
                />
              ) : (
                <PrimaryButton
                  label={
                    apply.isPending
                      ? t("adoption.apply.sending")
                      : listing.placement_type === "foster" ||
                          (listing.placement_type === "both" && placement === "foster")
                        ? t("adoption.apply.foster")
                        : t("adoption.apply.adopt")
                  }
                  onPress={doApply}
                  disabled={apply.isPending}
                />
              )}
              <SecondaryButton
                label={startingThread ? t("adoption.listing.opening") : t("adoption.listing.chatWithShelter")}
                icon={MessageSquare}
                onPress={doChat}
                disabled={startingThread}
              />
              <SecondaryButton
                label={
                  listing.adoption_fee_cents > 0
                    ? t("adoption.listing.payFee", { amount: money(listing.adoption_fee_cents, listing.currency, t) })
                    : t("adoption.listing.noFee")
                }
                onPress={() =>
                  listing.adoption_fee_cents > 0 &&
                  doPay("adoption_fee", listing.adoption_fee_cents)
                }
                disabled={checkout.isPending || listing.adoption_fee_cents <= 0}
              />
              <SecondaryButton
                label={t("adoption.listing.donate")}
                onPress={() =>
                  Alert.prompt
                    ? Alert.prompt(
                        t("adoption.listing.donateTitle"),
                        t("adoption.listing.donateBody"),
                        (val) => {
                          const cents = Math.round(parseFloat(val) * 100);
                          if (Number.isFinite(cents) && cents > 0) doPay("donation", cents);
                        },
                        "plain-text",
                        "",
                        "numeric",
                      )
                    : doPay("donation", 1000)
                }
                disabled={checkout.isPending}
              />
            </View>
          </RefreshableScrollView>
        </View>
      ) : (
        <View />
      )}
    </Modal>
  );
}

// Swipeable media gallery (ticket 2.87): all photo_urls[] as paged images + the intro video_url as a
// final page (expo-av, native controls). Empty → a neutral paw placeholder (never fake media).
function MediaGallery({ photos, video }) {
  const [page, setPage] = useState(0);
  const width = Dimensions.get("window").width;
  const items = [
    ...(Array.isArray(photos) ? photos.filter(Boolean).map((uri) => ({ type: "photo", uri })) : []),
    ...(video ? [{ type: "video", uri: video }] : []),
  ];

  if (items.length === 0) {
    return (
      <View
        style={{ width: "100%", height: 280, backgroundColor: COLORS.sand, justifyContent: "center", alignItems: "center" }}
      >
        <PawPrint size={56} color={COLORS.coral} />
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
        }
      >
        {items.map((item, i) =>
          item.type === "photo" ? (
            <Image
              key={`p${i}`}
              testID={`gallery-photo-${i}`}
              source={{ uri: item.uri }}
              style={{ width, height: 300, backgroundColor: COLORS.sand }}
            />
          ) : (
            <Video
              key={`v${i}`}
              testID="gallery-video"
              source={{ uri: item.uri }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              style={{ width, height: 300, backgroundColor: "#000" }}
            />
          ),
        )}
      </ScrollView>
      {items.length > 1 ? (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: SPACING.sm }}>
          {items.map((it, i) => (
            <View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: RADIUS.chip,
                backgroundColor: i === page ? COLORS.coral : COLORS.peach,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// One fact row in the key-facts grid. Renders only when a real value exists (unknowns are omitted).
function Fact({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <View style={{ width: "50%", paddingVertical: SPACING.sm - 2 }}>
      <Text style={[TYPE.caption, { color: COLORS.mutedBrown, textTransform: "uppercase" }]}>
        {label}
      </Text>
      <Text style={[TYPE.body, { color: COLORS.warmBrown, fontWeight: "600", marginTop: 2 }]}>
        {value}
      </Text>
    </View>
  );
}

// The full dog-profile detail (ticket 2.87): media gallery (photos + video) → key facts →
// compatibility chips → story → shelter card with a map. Only real fields render; unknowns are
// omitted gracefully (never shown as fake).
function DogProfileDetail({ listing, place }) {
  const { t } = useTranslation();
  const hasCoord = isValidCoord(listing.provider_lat, listing.provider_lng);
  const shelterAddr = listing.provider_address;
  return (
    <View>
      <MediaGallery photos={listing.photo_urls} video={listing.video_url} />
      <View style={{ padding: SPACING.lg }}>
        <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>{listing.name}</Text>
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          {t("adoption.listing.listedBy", { name: listing.provider_name || place?.name || "" })}
        </Text>

        {/* Key facts — only the ones we actually know. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: SPACING.md + 2 }}>
          <Fact label={t("adoption.listing.factAge")} value={ageLabel(listing.age_years, listing.age_months, t) !== t("adoption.listing.ageUnknown") ? ageLabel(listing.age_years, listing.age_months, t) : null} />
          <Fact label={t("adoption.listing.factGender")} value={listing.gender} />
          <Fact label={t("adoption.listing.factSize")} value={listing.size} />
          <Fact label={t("adoption.listing.factBreed")} value={listing.breed} />
          <Fact label={t("adoption.listing.factVaccination")} value={listing.vaccination_status ? listing.vaccination_status.replace(/_/g, " ") : null} />
          <Fact label={t("adoption.listing.factFee")} value={money(listing.adoption_fee_cents, listing.currency, t)} />
        </View>

        {/* Compatibility chips. */}
        {(listing.energy_level || listing.good_with_kids === true || listing.good_with_cats === true || listing.good_with_dogs === true) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.md }}>
            {listing.energy_level ? <Chip label={t("adoption.listing.chipEnergy", { level: listing.energy_level })} /> : null}
            {listing.good_with_kids === true ? <Chip label={t("adoption.listing.chipGoodWithKids")} /> : null}
            {listing.good_with_cats === true ? <Chip label={t("adoption.listing.chipGoodWithCats")} /> : null}
            {listing.good_with_dogs === true ? <Chip label={t("adoption.listing.chipGoodWithDogs")} /> : null}
          </View>
        ) : null}

        {listing.story ? (
          <>
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.xl, marginBottom: SPACING.sm - 2 }]}>
              {t("adoption.listing.storyHeading", { name: listing.name })}
            </Text>
            <Text style={[TYPE.body, { color: COLORS.warmBrown, lineHeight: 22 }]}>
              {listing.story}
            </Text>
          </>
        ) : null}

        {/* Shelter card — name + a map of its location (ticket 2.68 MapLocationView) when known. */}
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.xl, marginBottom: SPACING.sm }]}>
          {t("adoption.listing.shelter")}
        </Text>
        <Card level="sm" radius={RADIUS.card} borderColor={COLORS.peach} style={{ padding: SPACING.md + 2 }}>
          <Text style={[TYPE.body, { fontWeight: "700", color: COLORS.warmBrown }]}>
            {listing.provider_name || place?.name}
          </Text>
          {shelterAddr ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <MapPin size={13} color={COLORS.mutedBrown} />
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", flex: 1 }]}>{shelterAddr}</Text>
            </View>
          ) : null}
          {hasCoord ? (
            <View style={{ marginTop: SPACING.sm + 2 }}>
              <MapLocationView
                testID="shelter-map"
                points={{ lat: listing.provider_lat, lng: listing.provider_lng }}
                height={160}
              />
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, testID }) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: COLORS.coral,
        borderRadius: RADIUS.control,
        paddingVertical: 15,
        alignItems: "center",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={[TYPE.headline, { color: "#FFF" }]}>{label}</Text>
    </PressableScale>
  );
}

function SecondaryButton({ label, icon: Icon, onPress, disabled }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.control,
        paddingVertical: 14,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.peach,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon ? <Icon size={18} color={COLORS.coral} /> : null}
      <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "800" }]}>{label}</Text>
    </PressableScale>
  );
}
