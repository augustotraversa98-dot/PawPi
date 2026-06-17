import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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

  const { data: programs } = useTrainingPrograms(petId);
  const activePrograms = (programs ?? []).filter((p) => p.status !== "cancelled");

  const [bookFor, setBookFor] = useState(null); // the provider being booked

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Training 🎓
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Hire a trainer — 1:1, group classes, and programs
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/provider-messages")}
          accessibilityLabel="Messages"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MessageSquare size={20} color={COLORS.coral} />
        </TouchableOpacity>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {/* The pet's enrollments — progress + video lessons, owner-readable. */}
        {activePrograms.length > 0 ? (
          <>
            <SectionLabel>YOUR TRAINING</SectionLabel>
            {activePrograms.map((p) => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </>
        ) : null}

        <SectionLabel style={{ marginTop: activePrograms.length ? 24 : 0 }}>
          TRAINERS NEAR YOU
        </SectionLabel>

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <EmptyState
            title="Couldn't load trainers"
            body="Something went wrong. Pull down to try again."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="No trainers available yet"
            body="Check back soon — dog trainers are joining PawPi."
          />
        ) : (
          providers.map((p) => (
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
  const progress = Array.isArray(program.progress) ? program.progress : [];
  const completed = progress.filter((p) => p.status === "completed").length;
  const programVideos = Array.isArray(program.video_lesson_urls)
    ? program.video_lesson_urls
    : [];

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
          {program.title || "Program"}
        </Text>
        <StatusPill status={program.status} />
      </View>
      {program.provider_name ? (
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
          {program.provider_name}
        </Text>
      ) : null}

      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 8 }}>
        {completed} of {program.total_sessions} sessions completed
      </Text>

      {/* Per-session progress notes the trainer logged. */}
      {progress.map((s) => (
        <View
          key={s.id}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 }}
        >
          {s.status === "completed" ? (
            <CheckCircle2 size={18} color="#3FA34D" />
          ) : (
            <Circle size={18} color={COLORS.peach} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.warmBrown }}>
              {s.session_title || "Session"}
            </Text>
            {s.progress_note ? (
              <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}>
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
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.mutedBrown }}>
            VIDEO LESSONS
          </Text>
          <VideoLink count={programVideos.length} />
        </View>
      ) : null}
    </View>
  );
}

function VideoLink({ count }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
      <PlayCircle size={14} color={COLORS.coral} />
      <Text style={{ fontSize: 12, color: COLORS.coral, fontWeight: "700" }}>
        Watch {count} video lesson{count > 1 ? "s" : ""}
      </Text>
    </View>
  );
}

function StatusPill({ status }) {
  const map = {
    active: { label: "Active", color: COLORS.coral },
    completed: { label: "Completed", color: "#3FA34D" },
    cancelled: { label: "Cancelled", color: COLORS.mutedBrown },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View
      style={{
        backgroundColor: s.color + "22",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: s.color }}>{s.label}</Text>
    </View>
  );
}

function ProviderCard({ provider, onOpen, onBook }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.85}
        style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        {provider.logo_url ? (
          <Image
            source={{ uri: provider.logo_url }}
            style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
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
            style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
            />
          </View>
          {provider.bio ? (
            <Text
              style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}
              numberOfLines={2}
            >
              {provider.bio}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBook}
        activeOpacity={0.9}
        style={{
          marginTop: 12,
          backgroundColor: COLORS.coral,
          borderRadius: 14,
          paddingVertical: 11,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>
          Book training
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const SERVICE_TYPES = [
  { key: "one_on_one", label: "1:1 session" },
  { key: "group_class", label: "Group class" },
  { key: "program", label: "Program" },
];

// Book a training service: type (1:1 / group class / program). For a GROUP CLASS the owner
// picks an existing published class to JOIN (capacity-enforced by the backend); for a 1:1 /
// PROGRAM the owner enrolls (a program is a package of N sessions). Booking the appointment
// itself reuses the provider chat for coordination; the enrollment + class roster are the
// new training records.
function BookTrainingModal({ provider, petId, onClose }) {
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
          Alert.alert("Pick a class", "Choose a group class to join.");
          return;
        }
        await join.mutateAsync({
          petId,
          session_id: selectedClassId,
        });
        Alert.alert("Class booked", "You're enrolled. You'll see progress here.");
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
            (serviceType === "program" ? "Training program" : "1:1 training"),
          total_sessions: n,
        });
        Alert.alert(
          "Training booked",
          "You're enrolled. Your trainer will log progress here.",
        );
      }
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't book", e.message || "Please try again.");
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
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
            backgroundColor: COLORS.card,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}>
            Book training
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
          {provider ? (
            <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginBottom: 16 }}>
              {provider.name}
            </Text>
          ) : null}

          <FieldLabel>Service</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SERVICE_TYPES.map((t) => {
              const selected = serviceType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setServiceType(t.key)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? COLORS.coral : COLORS.peach,
                    backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: selected ? COLORS.coral : COLORS.warmBrown,
                    }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {serviceType === "group_class" ? (
            <>
              <FieldLabel style={{ marginTop: 16 }}>Pick a class</FieldLabel>
              {!classes || classes.length === 0 ? (
                <Text style={{ fontSize: 13, color: COLORS.mutedBrown }}>
                  This trainer has no group classes yet.
                </Text>
              ) : (
                classes.map((c) => {
                  const selected = selectedClassId === c.id;
                  const full =
                    c.capacity != null && (c.attendee_count ?? 0) >= c.capacity;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      disabled={full}
                      onPress={() => setSelectedClassId(c.id)}
                      activeOpacity={0.85}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: selected ? COLORS.coral : COLORS.peach,
                        backgroundColor: selected ? COLORS.coral + "12" : COLORS.card,
                        marginTop: 8,
                        opacity: full ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: COLORS.warmBrown,
                        }}
                      >
                        {c.title || "Group class"}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
                        {c.capacity != null
                          ? `${c.attendee_count ?? 0} / ${c.capacity} seats${full ? " · Full" : ""}`
                          : `${c.attendee_count ?? 0} enrolled`}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          ) : (
            <>
              <FieldLabel style={{ marginTop: 16 }}>Title</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={
                  serviceType === "program"
                    ? "e.g. Puppy Foundations"
                    : "e.g. Leash manners"
                }
                placeholderTextColor={COLORS.mutedBrown}
                style={inputStyle}
              />
              {serviceType === "program" ? (
                <>
                  <FieldLabel style={{ marginTop: 16 }}>Number of sessions</FieldLabel>
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

          <TouchableOpacity
            onPress={submit}
            disabled={pending}
            activeOpacity={0.9}
            style={{
              marginTop: 24,
              backgroundColor: COLORS.coral,
              borderRadius: 16,
              paddingVertical: 15,
              alignItems: "center",
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
              {pending ? "Booking…" : "Confirm booking"}
            </Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const inputStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.peach,
  padding: 12,
  fontSize: 14,
  color: COLORS.warmBrown,
  minHeight: 48,
};

function FieldLabel({ children, style }) {
  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: "700", color: COLORS.warmBrown, marginBottom: 6 },
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
        {
          fontSize: 13,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: 14,
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
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <GraduationCap size={32} color={COLORS.mutedBrown} />
      <Text
        style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: COLORS.mutedBrown,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
