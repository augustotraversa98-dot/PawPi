import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  GraduationCap,
  ChevronRight,
  MessageSquare,
  PlayCircle,
  CheckCircle2,
  Circle,
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
import {
  useDiscoverProviders,
  useTrainingPrograms,
  useTrainingClasses,
  useEnrollTrainingProgram,
  useJoinTrainingClass,
} from "@/hooks/useProviders";
import { useCurrentPet } from "@/hooks/usePetProfile";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
} from "@/components/Providers/ProviderListControls";

// PROVIDER Training discovery + progress (ticket 2.10) — HIRING a trainer. This is DISTINCT
// from the consumer self-Training tab ((tabs)/training.jsx — static how-to content, no
// provider/DB): this screen browses PUBLISHED trainer providers (real data, no mocks), books
// a 1:1 session / group class / multi-session program, then shows the pet's PROGRESS (trainer
// notes + attendance) and async VIDEO LESSONS. Discovery is the SHARED
// /api/providers/discover?type=trainer (capability match, 2.1) via the SAME
// useDiscoverProviders hook the vet/grooming/walking/daycare/sitting screens use. Coordination
// reuses the provider chat (2.5); the fee reuses payments (2.3). RLS (0036) is the real guard
// — the owner sees their OWN pet's progress only.

export default function TrainingServiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const {
    data: providers,
    isLoading,
    isError,
    refetch,
  } = useDiscoverProviders("trainer");
  const { t } = useTranslation();
  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(providers);
  const hasProviders = !!providers && providers.length > 0;

  const { data: programs } = useTrainingPrograms(petId);
  const activePrograms = (programs ?? []).filter((p) => p.status !== "cancelled");

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
            {t("training.headerTitle")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("training.headerSubtitle")}
          </Text>
        </View>
        <PressableScale
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel={t("training.messages")}
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
        {/* The pet's enrollments — progress + video lessons, owner-readable. */}
        {activePrograms.length > 0 ? (
          <>
            <SectionLabel>{t("training.yourTraining")}</SectionLabel>
            {activePrograms.map((p) => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </>
        ) : null}

        <SectionLabel style={{ marginTop: activePrograms.length ? SPACING.xxl : 0 }}>
          {t("training.trainersNearYou")}
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
            title={t("training.couldNotLoadTitle")}
            body={t("training.couldNotLoadBody")}
          />
        ) : !hasProviders ? (
          <EmptyState
            title={t("training.emptyTitle")}
            body={t("training.emptyBody")}
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
                  params: { slug: p.slug, capability: "trainer" },
                })
              }
              onBook={() => setBookFor(p)}
            />
          ))
        )}
      </RefreshableScrollView>

      <BookTrainingModal
        provider={bookFor}
        petId={petId}
        onClose={() => setBookFor(null)}
      />
    </View>
  );
}

function ProgramCard({ program }) {
  const { t } = useTranslation();
  const progress = Array.isArray(program.progress) ? program.progress : [];
  const completed = progress.filter((p) => p.status === "completed").length;
  const programVideos = Array.isArray(program.video_lesson_urls)
    ? program.video_lesson_urls
    : [];

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
          {program.title || t("training.program")}
        </Text>
        <StatusPill status={program.status} />
      </View>
      {program.provider_name ? (
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>
          {program.provider_name}
        </Text>
      ) : null}

      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: SPACING.sm }]}>
        {t("training.progressLine", { completed, total: program.total_sessions })}
      </Text>

      {/* Per-session progress notes the trainer logged. */}
      {progress.map((s) => (
        <View
          key={s.id}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginTop: SPACING.sm + 2 }}
        >
          {s.status === "completed" ? (
            <CheckCircle2 size={18} color="#3FA34D" />
          ) : (
            <Circle size={18} color={COLORS.peach} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.warmBrown }]}>
              {s.session_title || t("training.session")}
            </Text>
            {s.progress_note ? (
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>
                {s.progress_note}
              </Text>
            ) : null}
            {Array.isArray(s.video_lesson_urls) && s.video_lesson_urls.length > 0 ? (
              <VideoLink count={s.video_lesson_urls.length} />
            ) : null}
          </View>
        </View>
      ))}

      {/* Program-level async video lessons. */}
      {programVideos.length > 0 ? (
        <View style={{ marginTop: SPACING.md }}>
          <Text style={[TYPE.footnote, { fontWeight: "800", color: COLORS.mutedBrown }]}>
            {t("training.videoLessonsHeader")}
          </Text>
          <VideoLink count={programVideos.length} />
        </View>
      ) : null}
    </Card>
  );
}

function VideoLink({ count }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
      <PlayCircle size={14} color={COLORS.coral} />
      <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]}>
        {t("training.watchVideos", { count })}
      </Text>
    </View>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    active: { label: t("training.statusActive"), color: COLORS.coral },
    completed: { label: t("training.statusCompleted"), color: "#3FA34D" },
    cancelled: { label: t("training.statusCancelled"), color: COLORS.mutedBrown },
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
      <Text style={[TYPE.caption, { fontWeight: "800", color: s.color, letterSpacing: 0 }]}>{s.label}</Text>
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
            <GraduationCap size={24} color={COLORS.coral} />
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
          {t("training.bookTraining")}
        </Text>
      </PressableScale>
    </Card>
  );
}

const serviceTypes = (t) => [
  { key: "one_on_one", label: t("training.oneOnOne") },
  { key: "group_class", label: t("training.groupClass") },
  { key: "program", label: t("training.programLabel") },
];

// Book a training service: type (1:1 / group class / program). For a GROUP CLASS the owner
// picks an existing published class to JOIN (capacity-enforced by the backend); for a 1:1 /
// PROGRAM the owner enrolls (a program is a package of N sessions). Booking the appointment
// itself reuses the provider chat for coordination; the enrollment + class roster are the
// new training records.
function BookTrainingModal({ provider, petId, onClose }) {
  const { t } = useTranslation();
  const SERVICE_TYPES = serviceTypes(t);
  const [serviceType, setServiceType] = useState("one_on_one");
  const [title, setTitle] = useState("");
  const [totalSessions, setTotalSessions] = useState("6");
  const [selectedClassId, setSelectedClassId] = useState(null);

  const { data: classes } = useTrainingClasses(provider?.id);
  const enroll = useEnrollTrainingProgram();
  const join = useJoinTrainingClass();

  const reset = () => {
    setServiceType("one_on_one");
    setTitle("");
    setTotalSessions("6");
    setSelectedClassId(null);
  };

  const submit = async () => {
    try {
      if (serviceType === "group_class") {
        if (!selectedClassId) {
          Alert.alert(t("training.pickClassTitle"), t("training.pickClassBody"));
          return;
        }
        await join.mutateAsync({
          petId,
          session_id: selectedClassId,
        });
        Alert.alert(t("training.classBookedTitle"), t("training.classBookedBody"));
      } else {
        const n =
          serviceType === "program"
            ? Math.max(1, parseInt(totalSessions, 10) || 1)
            : 1;
        await enroll.mutateAsync({
          petId,
          provider_id: provider.id,
          title:
            title ||
            (serviceType === "program" ? t("training.defaultProgramTitle") : t("training.defaultOneOnOneTitle")),
          total_sessions: n,
        });
        Alert.alert(
          t("training.trainingBookedTitle"),
          t("training.trainingBookedBody"),
        );
      }
      reset();
      onClose();
    } catch (e) {
      Alert.alert(t("training.couldNotBook"), e.message || t("common.pleaseTryAgain"));
    }
  };

  const pending = enroll.isPending || join.isPending;

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
            {t("training.bookTraining")}
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

          <FieldLabel>{t("training.service")}</FieldLabel>
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

          {serviceType === "group_class" ? (
            <>
              <FieldLabel style={{ marginTop: SPACING.lg }}>{t("training.pickAClass")}</FieldLabel>
              {!classes || classes.length === 0 ? (
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
                  {t("training.noGroupClasses")}
                </Text>
              ) : (
                classes.map((c) => {
                  const selected = selectedClassId === c.id;
                  const full =
                    c.capacity != null && (c.attendee_count ?? 0) >= c.capacity;
                  return (
                    <PressableScale
                      key={c.id}
                      disabled={full}
                      onPress={() => setSelectedClassId(c.id)}
                      style={{
                        padding: SPACING.md,
                        borderRadius: RADIUS.control,
                        borderWidth: 1,
                        borderColor: selected ? COLORS.coral : COLORS.peach,
                        backgroundColor: selected ? COLORS.coral + "12" : COLORS.card,
                        marginTop: SPACING.sm,
                        opacity: full ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}
                      >
                        {c.title || t("training.groupClass")}
                      </Text>
                      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
                        {c.capacity != null
                          ? t("training.seats", { attendee: c.attendee_count ?? 0, capacity: c.capacity, suffix: full ? ` · ${t("training.full")}` : "" })
                          : t("training.enrolledCount", { count: c.attendee_count ?? 0 })}
                      </Text>
                    </PressableScale>
                  );
                })
              )}
            </>
          ) : (
            <>
              <FieldLabel style={{ marginTop: SPACING.lg }}>{t("training.titleLabel")}</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={
                  serviceType === "program"
                    ? t("training.programTitlePlaceholder")
                    : t("training.oneOnOnePlaceholder")
                }
                placeholderTextColor={COLORS.mutedBrown}
                style={inputStyle}
              />
              {serviceType === "program" ? (
                <>
                  <FieldLabel style={{ marginTop: SPACING.lg }}>{t("training.numberOfSessions")}</FieldLabel>
                  <TextInput
                    value={totalSessions}
                    onChangeText={setTotalSessions}
                    keyboardType="number-pad"
                    placeholder="6"
                    placeholderTextColor={COLORS.mutedBrown}
                    style={inputStyle}
                  />
                </>
              ) : null}
            </>
          )}

          <PressableScale
            onPress={submit}
            disabled={pending}
            style={{
              marginTop: SPACING.xxl,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.lg - 1,
              alignItems: "center",
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
              {pending ? t("training.booking") : t("training.confirmBooking")}
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
      <GraduationCap size={32} color={COLORS.mutedBrown} />
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
