import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Heart,
  ChevronRight,
  MessageSquare,
  MapPin,
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
  useSittingVisits,
  useBookProvider,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
} from "@/components/Providers/ProviderListControls";

// Pet Sitting discovery + visit updates (ticket 2.9) — browse PUBLISHED sitter providers
// (real data, no mocks) and manage the active pet's sitting: book a drop-in visit /
// overnight / house-sit (optionally as a MEET-AND-GREET intro first), then read the
// per-visit UPDATES the sitter posts (notes + photos/video + optional location check-in).
// Discovery is the SHARED /api/providers/discover?type=sitter (capability match, ticket
// 2.1) via the SAME useDiscoverProviders hook the vet/grooming/walking/daycare screens use.
// Coordination (incl. the meet-and-greet conversation) reuses the provider chat (2.5).
const serviceTypes = (t) => [
  { key: "drop_in", label: t("sitting.serviceDropIn") },
  { key: "overnight", label: t("sitting.serviceOvernight") },
  { key: "house_sit", label: t("sitting.serviceHouseSit") },
];

export default function SittingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useDiscoverProviders("sitter");
  const { t } = useTranslation();
  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(providers);
  const hasProviders = !!providers && providers.length > 0;

  const { data: visits } = useSittingVisits(petId);
  const activeVisits = (visits ?? []).filter((v) => v.status !== "cancelled");

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
            {t("sitting.headerTitle")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("sitting.headerSubtitle")}
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel={t("sitting.messages")}
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
        {/* Visit updates the sitter posted, owner-readable. */}
        {activeVisits.length > 0 ? (
          <>
            <SectionLabel>{t("sitting.visitUpdates")}</SectionLabel>
            {activeVisits.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </>
        ) : null}

        <SectionLabel style={{ marginTop: activeVisits.length ? SPACING.xxl : 0 }}>
          {t("sitting.sittersNearYou")}
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
            title={t("sitting.couldNotLoadTitle")}
            body={t("sitting.couldNotLoadBody")}
          />
        ) : !hasProviders ? (
          <EmptyState
            title={t("sitting.emptyTitle")}
            body={t("sitting.emptyBody")}
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
                  params: { slug: p.slug, capability: "sitter" },
                })
              }
              onBook={() => setBookFor(p)}
            />
          ))
        )}
      </RefreshableScrollView>

      <BookSittingModal
        provider={bookFor}
        petId={petId}
        onClose={() => setBookFor(null)}
      />
    </View>
  );
}

function VisitCard({ visit }) {
  const { t } = useTranslation();
  const hasLocation =
    visit.check_in_lat != null && visit.check_in_lng != null;
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
          {visit.provider_name || t("sitting.visit")}
        </Text>
        <StatusPill status={visit.status} />
      </View>
      {visit.visit_at ? (
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 4 }]}>
          {String(visit.visit_at).slice(0, 16).replace("T", " ")}
          {visit.sitter_name ? ` · ${visit.sitter_name}` : ""}
        </Text>
      ) : null}

      {visit.notes ? (
        <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "500", marginTop: SPACING.sm }]}>
          {visit.notes}
        </Text>
      ) : null}

      {hasLocation ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: SPACING.sm }}>
          <MapPin size={14} color={COLORS.coral} />
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
            {t("sitting.checkedInAt", { lat: Number(visit.check_in_lat).toFixed(4), lng: Number(visit.check_in_lng).toFixed(4) })}
          </Text>
        </View>
      ) : null}

      {Array.isArray(visit.photo_urls) && visit.photo_urls.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm }}>
          {visit.photo_urls.map((u) => (
            <Image
              key={u}
              source={{ uri: u }}
              style={{ width: 72, height: 72, borderRadius: RADIUS.xs, backgroundColor: COLORS.sand }}
            />
          ))}
        </View>
      ) : null}
      {Array.isArray(visit.video_urls) && visit.video_urls.length > 0 ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 6 }]}>
          {t("sitting.videos", { count: visit.video_urls.length })}
        </Text>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    scheduled: { label: t("sitting.statusScheduled"), color: COLORS.coral },
    completed: { label: t("sitting.statusDone"), color: "#3FA34D" },
    cancelled: { label: t("sitting.statusCancelled"), color: COLORS.mutedBrown },
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
            <Heart size={24} color={COLORS.coral} />
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
          {t("sitting.bookASitter")}
        </Text>
      </PressableScale>
    </Card>
  );
}

// Book a sitting service: type (drop-in / overnight / house-sit) + date/time + an optional
// MEET-AND-GREET toggle (the lightweight intro step — owner + sitter align over chat first)
// + a recurring-drop-ins toggle (a weekly pack via recurrence_rule). Reuses useBookProvider
// with capability='sitter'; the backend stores meet_and_greet + recurrence_rule.
function BookSittingModal({ provider, petId, onClose }) {
  const { t } = useTranslation();
  const SERVICE_TYPES = serviceTypes(t);
  const [serviceType, setServiceType] = useState("drop_in");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [meetAndGreet, setMeetAndGreet] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const book = useBookProvider();

  const reset = () => {
    setServiceType("drop_in");
    setDate("");
    setTime("09:00");
    setMeetAndGreet(false);
    setRecurring(false);
    setNotes("");
  };

  const submit = async () => {
    if (!date) {
      Alert.alert(t("sitting.pickDateTitle"), t("sitting.pickDateBody"));
      return;
    }
    const typeLabel =
      SERVICE_TYPES.find((row) => row.key === serviceType)?.label || t("sitting.visit");
    try {
      await book.mutateAsync({
        providerId: provider.id,
        petId,
        capability: "sitter",
        appointment_date: date,
        appointment_time: time || "09:00",
        title: meetAndGreet ? t("sitting.meetGreetTitle", { type: typeLabel }) : typeLabel,
        notes: notes || null,
        meet_and_greet: meetAndGreet,
        // A recurring drop-in pack is one booking carrying a weekly RRULE (2.4).
        recurrence_rule:
          recurring && serviceType === "drop_in"
            ? "FREQ=WEEKLY;BYDAY=MO,WE,FR"
            : null,
      });
      Alert.alert(
        meetAndGreet ? t("sitting.meetGreetRequested") : t("sitting.sitterBooked"),
        meetAndGreet ? t("sitting.meetGreetBody") : t("sitting.sitterBookedBody"),
      );
      reset();
      onClose();
    } catch (e) {
      Alert.alert(t("sitting.couldNotBook"), e.message || t("common.pleaseTryAgain"));
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
            {t("sitting.bookASitter")}
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

          <FieldLabel>{t("sitting.service")}</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
            {SERVICE_TYPES.map((row) => {
              const selected = serviceType === row.key;
              return (
                <PressableScale
                  key={row.key}
                  onPress={() => setServiceType(row.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: SPACING.md + 2,
                    paddingVertical: 9,
                    borderRadius: RADIUS.chip,
                    borderWidth: 1,
                    borderColor: selected ? COLORS.coral : COLORS.peach,
                    backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
                  }}
                >
                  <Text
                    style={[
                      TYPE.subhead,
                      {
                        fontWeight: "700",
                        color: selected ? COLORS.coral : COLORS.warmBrown,
                      },
                    ]}
                  >
                    {row.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <FieldLabel style={{ marginTop: SPACING.lg }}>{t("sitting.date")}</FieldLabel>
          <DateField value={date} onChange={setDate} placeholder={t("sitting.selectDate")} />

          <FieldLabel style={{ marginTop: SPACING.lg }}>{t("sitting.notesForSitter")}</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t("sitting.notesPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            style={inputStyle}
          />

          <ToggleRow
            label={t("sitting.meetGreetLabel")}
            help={t("sitting.meetGreetHelp")}
            value={meetAndGreet}
            onValueChange={setMeetAndGreet}
          />

          {serviceType === "drop_in" ? (
            <ToggleRow
              label={t("sitting.recurringLabel")}
              help={t("sitting.recurringHelp")}
              value={recurring}
              onValueChange={setRecurring}
            />
          ) : null}

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
              {book.isPending
                ? t("sitting.booking")
                : meetAndGreet
                  ? t("sitting.requestMeetGreet")
                  : t("sitting.confirmBooking")}
            </Text>
          </PressableScale>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

function ToggleRow({ label, help, value, onValueChange }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: SPACING.lg + 2,
        gap: SPACING.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}>
          {label}
        </Text>
        {help ? (
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
            {help}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: COLORS.coral }}
      />
    </View>
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
      <Heart size={32} color={COLORS.mutedBrown} />
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
