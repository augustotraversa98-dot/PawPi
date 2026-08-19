import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Home,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import {
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import DateField from "@/components/DateField";
import {
  useDiscoverProviders,
  useDaycareStays,
  useBookDaycareStay,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
} from "@/components/Providers/ProviderListControls";

// Daycare & Boarding discovery + stays (ticket 2.8) — browse PUBLISHED daycare providers
// (real data, no mocks) and manage the active pet's STAYS: book a multi-day stay with
// feeding/med instructions, see the VACCINE status (pass/fail + missing), and read the
// daily REPORT CARDS the facility posts. Discovery is the SHARED
// /api/providers/discover?type=daycare (capability match, ticket 2.1) via the SAME
// useDiscoverProviders hook the vet/grooming/walking screens use — no duplicate endpoint.
export default function DaycareScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useDiscoverProviders("daycare");
  const { t } = useTranslation();
  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(providers);
  const hasProviders = !!providers && providers.length > 0;

  const { data: stays } = useDaycareStays(petId);
  const activeStays = (stays ?? []).filter(
    (s) => s.status === "booked" || s.status === "checked_in",
  );
  const pastStays = (stays ?? []).filter(
    (s) => s.status === "checked_out" || s.status === "cancelled",
  );

  const [bookFor, setBookFor] = useState(null); // the provider being booked

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("daycare.headerTitle")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("daycare.headerSubtitle")}
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel={t("daycare.messages")}
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.chip,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MessageSquare size={20} color={COLORS.coral} />
        </PressableScale>
      </GlassSurface>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
      >
        {/* Active stays — booked / checked-in, with vaccine status + report cards. */}
        {activeStays.length > 0 ? (
          <>
            <SectionLabel>{t("daycare.yourStays")}</SectionLabel>
            {activeStays.map((s) => (
              <StayCard key={s.id} stay={s} petName={currentPet?.name} />
            ))}
          </>
        ) : null}

        <SectionLabel style={{ marginTop: activeStays.length ? SPACING.xxl : 0 }}>
          {t("daycare.nearYou")}
        </SectionLabel>

        {hasProviders ? (
          <ProviderListControls
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={setSort}
          />
        ) : null}

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title={t("daycare.couldNotLoadTitle")}
            body={t("daycare.couldNotLoadBody")}
          />
        ) : !hasProviders ? (
          <EmptyState
            title={t("daycare.emptyTitle")}
            body={t("daycare.emptyBody")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t("common.noResults")}
            body={t("providers.noMatchBody", { query: query.trim() })}
          />
        ) : (
          filtered.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onOpen={() =>
                router.push({
                  pathname: "/service/provider",
                  params: { slug: p.slug, capability: "daycare" },
                })
              }
              onBook={() => setBookFor(p)}
            />
          ))
        )}

        {pastStays.length > 0 ? (
          <>
            <SectionLabel style={{ marginTop: SPACING.xxl }}>{t("daycare.pastStays")}</SectionLabel>
            {pastStays.map((s) => (
              <StayCard key={s.id} stay={s} petName={currentPet?.name} />
            ))}
          </>
        ) : null}
      </RefreshableScrollView>

      <BookStayModal
        provider={bookFor}
        petId={petId}
        onClose={() => setBookFor(null)}
      />
    </View>
  );
}

function StayCard({ stay, petName }) {
  const { t } = useTranslation();
  const status = stay.status;
  const vax = stay.vaccine_status;
  const cards = stay.report_cards ?? [];
  return (
    <Card
      level="sm"
      radius={RADIUS.card}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
          {stay.provider_name || t("daycare.stay")}
        </Text>
        <StatusPill status={status} />
      </View>
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 4 }]}>
        {stay.start_date}
        {stay.end_date && stay.end_date !== stay.start_date
          ? ` → ${stay.end_date}`
          : ""}
        {stay.location_name ? ` · ${stay.location_name}` : ""}
      </Text>

      {/* Vaccine status pass/fail + missing. */}
      {vax ? <VaccineStatus vax={vax} /> : null}

      {stay.feeding_instructions ? (
        <Text style={[TYPE.footnote, { color: COLORS.warmBrown, marginTop: SPACING.sm }]}>
          🍽️ {stay.feeding_instructions}
        </Text>
      ) : null}
      {stay.med_instructions ? (
        <Text style={[TYPE.footnote, { color: COLORS.warmBrown, marginTop: 4 }]}>
          💊 {stay.med_instructions}
        </Text>
      ) : null}

      {/* Daily report cards from the facility. */}
      {cards.length > 0 ? (
        <View style={{ marginTop: SPACING.sm + 2 }}>
          <Text
            style={[
              TYPE.caption,
              {
                fontWeight: "800",
                color: COLORS.mutedBrown,
                letterSpacing: 0.5,
                marginBottom: 6,
              },
            ]}
          >
            {t("daycare.reportCards")}
          </Text>
          {cards.map((c) => (
            <ReportCard key={c.id} card={c} petName={petName} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ReportCard({ card, petName }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        backgroundColor: COLORS.cream,
        borderRadius: RADIUS.control,
        padding: SPACING.sm + 2,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text style={[TYPE.footnote, { fontWeight: "800", color: COLORS.warmBrown }]}>
        {card.date}
      </Text>
      {card.mood ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          {t("daycare.mood")}: {card.mood}
        </Text>
      ) : null}
      {card.meals ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          {t("daycare.meals")}: {card.meals}
        </Text>
      ) : null}
      {card.activities ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          {t("daycare.activities")}: {card.activities}
        </Text>
      ) : null}
      {card.notes ? (
        <Text style={[TYPE.footnote, { color: COLORS.warmBrown, marginTop: 4 }]}>
          {card.notes}
        </Text>
      ) : null}
      {Array.isArray(card.photo_urls) && card.photo_urls.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm }}>
          {card.photo_urls.map((u) => (
            <Image
              key={u}
              source={{ uri: u }}
              style={{ width: 64, height: 64, borderRadius: RADIUS.xs, backgroundColor: COLORS.sand }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function VaccineStatus({ vax }) {
  const { t } = useTranslation();
  if (!vax.required || vax.required.length === 0) return null;
  if (vax.passed) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm }}>
        <CheckCircle2 size={16} color="#3FA34D" />
        <Text style={[TYPE.footnote, { color: "#3FA34D", fontWeight: "700" }]}>
          {t("daycare.vaccinesUpToDate")}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={16} color={COLORS.coral} />
        <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]}>
          {t("daycare.missingVaccines")}
        </Text>
      </View>
      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
        {vax.missing.join(", ")}
      </Text>
    </View>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    booked: { label: t("daycare.statusBooked"), color: COLORS.coral },
    checked_in: { label: t("daycare.statusCheckedIn"), color: "#3FA34D" },
    checked_out: { label: t("daycare.statusCheckedOut"), color: COLORS.mutedBrown },
    cancelled: { label: t("daycare.statusCancelled"), color: COLORS.mutedBrown },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View
      style={{
        backgroundColor: s.color + "22",
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm + 2,
        paddingVertical: 3,
      }}
    >
      <Text style={[TYPE.caption, { fontWeight: "800", color: s.color, letterSpacing: 0 }]}>
        {s.label}
      </Text>
    </View>
  );
}

function ProviderCard({ provider, onOpen, onBook }) {
  const { t } = useTranslation();
  return (
    <Card
      level="md"
      radius={RADIUS.card}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md + 2 }}
    >
      <PressableScale
        onPress={onOpen}
        style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md + 2 }}
      >
        {provider.logo_url ? (
          <Image
            source={{ uri: provider.logo_url }}
            style={{ width: 52, height: 52, borderRadius: RADIUS.control, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.control,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Home size={24} color={COLORS.coral} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.title2, { fontSize: 17, lineHeight: 22, color: COLORS.warmBrown }]}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: 2 }}>
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
            />
          </View>
          {provider.bio ? (
            <Text
              style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 4 }]}
              numberOfLines={2}
            >
              {provider.bio}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </PressableScale>

      <PressableScale
        onPress={onBook}
        style={{
          marginTop: SPACING.md,
          backgroundColor: COLORS.coral,
          borderRadius: RADIUS.control,
          paddingVertical: SPACING.md - 1,
          alignItems: "center",
        }}
      >
        <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "800" }]}>
          {t("daycare.bookAStay")}
        </Text>
      </PressableScale>
    </Card>
  );
}

// Book a stay: dates + feeding/med instructions. Calls useBookDaycareStay, which the
// backend gates for capacity/overbook (the "fully booked" message surfaces here).
function BookStayModal({ provider, petId, onClose }) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feeding, setFeeding] = useState("");
  const [meds, setMeds] = useState("");
  const book = useBookDaycareStay();

  const reset = () => {
    setStartDate("");
    setEndDate("");
    setFeeding("");
    setMeds("");
  };

  const submit = async () => {
    if (!startDate || !endDate) {
      Alert.alert(t("daycare.pickDatesTitle"), t("daycare.pickDatesBody"));
      return;
    }
    try {
      const res = await book.mutateAsync({
        petId,
        provider_id: provider.id,
        location_id: provider.primary_location_id ?? null,
        start_date: startDate,
        end_date: endDate,
        feeding_instructions: feeding || null,
        med_instructions: meds || null,
      });
      const vax = res?.vaccine_status;
      const needsVax = vax && vax.required?.length > 0 && !vax.passed;
      reset();
      onClose();
      // Pay-at-request (0071): the facility priced this stay (rate × nights or a deposit) →
      // open MercadoPago. If it's a free / pay-in-person facility, checkoutUrl is null.
      if (res?.checkoutUrl) {
        Alert.alert(
          t("daycare.bookedPayTitle"),
          t("daycare.bookedPayBody"),
        );
        Linking.openURL(res.checkoutUrl).catch(() => {});
      } else if (needsVax) {
        Alert.alert(
          t("daycare.bookedVaxTitle"),
          t("daycare.bookedVaxBody", { missing: vax.missing.join(", ") }),
        );
      } else {
        Alert.alert(t("daycare.bookedTitle"), t("daycare.bookedBody"));
      }
    } catch (e) {
      Alert.alert(t("daycare.couldNotBook"), e.message || t("common.pleaseTryAgain"));
    }
  };

  return (
    <Modal
      visible={!!provider}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: SPACING.lg,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
            backgroundColor: COLORS.card,
          }}
        >
          <Text style={[TYPE.title2, { fontSize: 18, lineHeight: 24, color: COLORS.warmBrown }]}>
            {t("daycare.bookAStay")}
          </Text>
          <PressableScale onPress={onClose}>
            <X size={22} color={COLORS.warmBrown} />
          </PressableScale>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          {provider ? (
            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.lg }]}>
              {provider.name}
            </Text>
          ) : null}

          <FieldLabel>{t("daycare.startDate")}</FieldLabel>
          <DateField value={startDate} onChange={setStartDate} placeholder={t("daycare.selectStart")} />

          <FieldLabel style={{ marginTop: SPACING.lg }}>{t("daycare.endDate")}</FieldLabel>
          <DateField
            value={endDate}
            onChange={setEndDate}
            placeholder={t("daycare.selectEnd")}
            minimumDate={startDate ? new Date(startDate) : undefined}
          />

          <FieldLabel style={{ marginTop: SPACING.lg }}>{t("daycare.feedingInstructions")}</FieldLabel>
          <TextInput
            value={feeding}
            onChangeText={setFeeding}
            placeholder={t("daycare.feedingPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <FieldLabel style={{ marginTop: SPACING.lg }}>{t("daycare.medInstructions")}</FieldLabel>
          <TextInput
            value={meds}
            onChangeText={setMeds}
            placeholder={t("daycare.medPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <PressableScale
            onPress={submit}
            disabled={book.isPending}
            style={{
              marginTop: SPACING.xxl,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.lg - 1,
              alignItems: "center",
              opacity: book.isPending ? 0.6 : 1,
            }}
          >
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {book.isPending ? t("daycare.booking") : t("daycare.confirmStay")}
            </Text>
          </PressableScale>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: COLORS.card,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: COLORS.peach,
  padding: SPACING.md,
  fontSize: 14,
  color: COLORS.warmBrown,
  minHeight: 48,
  textAlignVertical: "top",
};

function FieldLabel({ children, style }) {
  return (
    <Text
      style={[
        TYPE.subhead,
        { fontWeight: "700", color: COLORS.warmBrown, marginBottom: 6 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function SectionLabel({ children, style }) {
  return (
    <Text
      style={[
        TYPE.subhead,
        {
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: SPACING.md + 2,
          letterSpacing: 0.6,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <Card
      level="sm"
      radius={RADIUS.card}
      style={{ padding: SPACING.xxl + 4, alignItems: "center" }}
    >
      <Home size={32} color={COLORS.mutedBrown} />
      <Text
        style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}
      >
        {title}
      </Text>
      <Text
        style={[
          TYPE.subhead,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginTop: 6,
            textAlign: "center",
          },
        ]}
      >
        {body}
      </Text>
    </Card>
  );
}
