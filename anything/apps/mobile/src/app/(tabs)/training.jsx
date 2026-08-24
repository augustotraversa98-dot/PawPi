import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  UserRound,
  X,
  ArrowLeft,
  Lightbulb,
  Footprints,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import ServicesDiscovery from "@/components/Services/ServicesDiscovery";
import { CARE_CATEGORIES } from "@/constants/servicesCategories";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  useSelfTrainingProgress,
  useToggleSession,
} from "@/hooks/useSelfTraining";
import {
  TRAINING_PROGRAMS,
  completionId,
  programDoneCount,
} from "@/data/trainingCurriculum";

// The CARE hub (ticket D2) — a segmented [Learn | Hire] shell (mirrors the Services tab).
//   • LEARN = the SELF / DIY training curriculum (ticket 2.45), a real multi-program curriculum the
//     owner works through per pet — unchanged, just re-homed under the Learn segment.
//   • HIRE  = care-provider discovery (ServicesDiscovery scoped to CARE_CATEGORIES: walkers /
//     daycare / sitters / trainers) + the walker owner surfaces (packages/QR via the storefront,
//     request-a-walk + find-a-walker-now via /service/walking). "Split by intent": Stores & Vets
//     (shop/vet) vs Care (hire someone to care for the dog).
// Curriculum content is curated (trainingCurriculum module); only completion is persisted.

// Care keys that a legacy ?category deep-link may carry (friendly + capability aliases) → open Hire.
const CARE_DEEPLINK_KEYS = new Set([
  "walking", "daycare", "sitting", "training",
  "walker", "sitter", "trainer",
]);

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const DIFF_COLORS = {
  Beginner: { bg: "#E8F5E9", text: "#2E7D32" },
  Intermediate: { bg: "#FFF8E1", text: "#F57F17" },
  Advanced: { bg: "#FBE9E7", text: "#BF360C" },
};

export default function TrainingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const { t } = useTranslation();
  const { completedSet } = useSelfTrainingProgress(petId);
  const toggle = useToggleSession(petId);

  // Segmented [Learn | Hire]. A deep link opens Hire when ?pane=hire or ?category is a care category
  // (D1 routes care deep-links here instead of Stores & Vets).
  const params = useLocalSearchParams();
  const careParam =
    typeof params?.category === "string" && CARE_DEEPLINK_KEYS.has(params.category)
      ? params.category
      : null;
  const [pane, setPane] = useState(
    params?.pane === "hire" || careParam ? "hire" : "learn",
  );
  const segments = [
    { key: "learn", label: t("care.segLearn") },
    { key: "hire", label: t("care.segHire") },
  ];

  const [openProgram, setOpenProgram] = useState(null); // program object
  const [openSession, setOpenSession] = useState(null); // session object

  const totalDone = TRAINING_PROGRAMS.reduce(
    (sum, p) => sum + programDoneCount(p.key, completedSet),
    0,
  );
  const totalSessions = TRAINING_PROGRAMS.reduce(
    (sum, p) => sum + p.sessions.length,
    0,
  );

  const handleToggle = (program, session) => {
    if (!petId) return;
    const id = completionId(program.key, session.key);
    const isDone = completedSet.has(id);
    toggle.mutate({
      programKey: program.key,
      sessionKey: session.key,
      completed: !isDone,
    });
  };

  const ProgramCard = ({ program }) => {
    const done = programDoneCount(program.key, completedSet);
    const total = program.sessions.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const diff = DIFF_COLORS[program.difficulty] || DIFF_COLORS.Beginner;
    return (
      <TouchableOpacity
        testID={`program-${program.key}`}
        onPress={() => setOpenProgram(program)}
        activeOpacity={0.92}
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          padding: 18,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 26, marginRight: 10 }}>{program.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
              {program.title}
            </Text>
            <View
              style={{
                backgroundColor: diff.bg,
                alignSelf: "flex-start",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 7,
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 11, color: diff.text, fontWeight: "700" }}>
                {program.difficulty}
              </Text>
            </View>
          </View>
          {done === total && total > 0 ? (
            <CheckCircle2 size={24} color="#2E7D32" />
          ) : (
            <ChevronRight size={20} color={C.mutedBrown} />
          )}
        </View>
        <Text style={{ fontSize: 13, color: C.mutedBrown, lineHeight: 19, marginBottom: 12 }}>
          {program.summary}
        </Text>
        <View
          style={{
            height: 8,
            backgroundColor: C.sand,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: C.sageDark,
              borderRadius: 4,
            }}
          />
        </View>
        <Text
          testID={`program-progress-${program.key}`}
          style={{ fontSize: 12, color: C.mutedBrown, marginTop: 6, fontWeight: "700" }}
        >
          {done} of {total} sessions done
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Segmented [Learn | Hire] shell (ticket D2) — mirrors the Services tab. */}
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.md,
        }}
      >
        <View
          testID="care-segments"
          style={{
            flexDirection: "row",
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.chip,
            padding: 3,
          }}
        >
          {segments.map((s) => {
            const active = pane === s.key;
            return (
              <PressableScale
                key={s.key}
                testID={`care-seg-${s.key}`}
                onPress={() => setPane(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  paddingVertical: SPACING.sm + 1,
                  borderRadius: RADIUS.chip - 2,
                  backgroundColor: active ? COLORS.card : "transparent",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={[
                    TYPE.subhead,
                    { fontWeight: "800", color: active ? COLORS.warmBrown : COLORS.mutedBrown },
                  ]}
                >
                  {s.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </GlassSurface>

      {pane === "hire" ? (
        <View style={{ flex: 1 }}>
          {/* Walkers entry — relocates request-a-walk (C1) + find-a-walker-now (C2), which live on
              /service/walking (otherwise unreachable). Packages/QR come via the walker storefront. */}
          <PressableScale
            testID="care-walker-entry"
            onPress={() => router.push("/service/walking")}
            accessibilityRole="button"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.md,
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.card,
              padding: SPACING.lg,
              marginHorizontal: SPACING.lg,
              marginTop: SPACING.md,
            }}
          >
            <Footprints size={20} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                {t("care.walkerEntryTitle")}
              </Text>
              <Text style={[TYPE.footnote, { color: "#FFFFFFCC", marginTop: 1 }]}>
                {t("care.walkerEntryBody")}
              </Text>
            </View>
            <ChevronRight size={20} color="#FFF" />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <ServicesDiscovery
              variant="landing"
              showHeader={false}
              allowedCategories={CARE_CATEGORIES}
              initialCategory={careParam ?? undefined}
            />
          </View>
        </View>
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        // Liquid Glass: scroll behind the translucent iOS 26 tab bar; the native
        // tab controller insets the last row so it clears the bar (replaces the
        // old hard-coded paddingBottom). iOS-only; ignored on Android.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: SPACING.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hire-a-trainer banner → PROVIDER training service (2.10), kept distinct. */}
        <TouchableOpacity
          testID="hire-trainer-banner"
          onPress={() => router.push("/service/training")}
          activeOpacity={0.9}
          accessibilityRole="button"
          style={{
            backgroundColor: C.card,
            borderRadius: 18,
            padding: 16,
            marginBottom: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: C.coral + "20",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <UserRound size={20} color={C.coral} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: C.warmBrown }}>
              Want a pro? Hire a trainer
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
              1:1 sessions, group classes, and multi-week programs
            </Text>
          </View>
          <ChevronRight size={18} color={C.mutedBrown} />
        </TouchableOpacity>

        {/* Overall progress */}
        <View
          style={{
            backgroundColor: C.apricot,
            borderRadius: 20,
            padding: 18,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}>
            Your training journey 🏆
          </Text>
          <Text
            testID="overall-progress"
            style={{ fontSize: 13, color: C.terracotta, marginTop: 4, fontWeight: "700" }}
          >
            {totalDone} of {totalSessions} sessions completed across{" "}
            {TRAINING_PROGRAMS.length} programs
          </Text>
        </View>

        <Text
          style={{
            fontSize: 17,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 14,
          }}
        >
          Programs
        </Text>

        {TRAINING_PROGRAMS.map((program) => (
          <ProgramCard key={program.key} program={program} />
        ))}
      </ScrollView>
      )}

      {/* Program → session list */}
      <Modal
        visible={!!openProgram}
        animationType="slide"
        onRequestClose={() => setOpenProgram(null)}
      >
        <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
          <View
            style={{
              padding: 18,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: C.card,
            }}
          >
            <TouchableOpacity
              testID="program-back"
              onPress={() => setOpenProgram(null)}
              style={{ marginRight: 12 }}
            >
              <ArrowLeft size={22} color={C.warmBrown} />
            </TouchableOpacity>
            <Text style={{ fontSize: 19, fontWeight: "800", color: C.warmBrown, flex: 1 }}>
              {openProgram?.emoji} {openProgram?.title}
            </Text>
          </View>

          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 21, marginBottom: 16 }}>
              {openProgram?.summary}
            </Text>

            {openProgram?.sessions.map((session, index) => {
              const isDone = completedSet.has(
                completionId(openProgram.key, session.key),
              );
              return (
                <TouchableOpacity
                  key={session.key}
                  testID={`session-${session.key}`}
                  onPress={() => setOpenSession(session)}
                  activeOpacity={0.9}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: isDone ? C.sage : C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 size={24} color="#2E7D32" />
                  ) : (
                    <Circle size={24} color={C.peach} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown }}>
                      {index + 1}. {session.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                      <Clock size={12} color={C.mutedBrown} />
                      <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                        {session.durationMin} min · {session.difficulty}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={C.mutedBrown} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Session detail */}
      <Modal
        visible={!!openSession}
        animationType="slide"
        onRequestClose={() => setOpenSession(null)}
      >
        <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
          <View
            style={{
              padding: 18,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: C.card,
            }}
          >
            <TouchableOpacity
              testID="session-close"
              onPress={() => setOpenSession(null)}
              style={{ marginRight: 12 }}
            >
              <X size={20} color={C.warmBrown} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown, flex: 1 }}>
              {openSession?.title}
            </Text>
          </View>

          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {openSession && openProgram && (
              <>
                <Text style={{ fontSize: 14, color: C.warmBrown, lineHeight: 22, marginBottom: 18 }}>
                  🎯 {openSession.objective}
                </Text>

                <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginBottom: 14 }}>
                  Step-by-step
                </Text>
                {openSession.steps.map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", marginBottom: 14, alignItems: "flex-start" }}>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: C.coral,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 13 }}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: C.warmBrown, lineHeight: 21 }}>
                      {step}
                    </Text>
                  </View>
                ))}

                {openSession.tips?.length > 0 && (
                  <View
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 14,
                      padding: 14,
                      marginTop: 8,
                      marginBottom: 8,
                    }}
                  >
                    {openSession.tips.map((tip, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                        <Lightbulb size={15} color={C.terracotta} />
                        <Text style={{ flex: 1, fontSize: 13, color: C.mutedBrown, lineHeight: 19 }}>
                          {tip}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {(() => {
                  const isDone = completedSet.has(
                    completionId(openProgram.key, openSession.key),
                  );
                  return (
                    <TouchableOpacity
                      testID="toggle-complete"
                      onPress={() => handleToggle(openProgram, openSession)}
                      disabled={toggle.isPending || !petId}
                      style={{
                        backgroundColor: isDone ? C.sageDark : C.coral,
                        borderRadius: 16,
                        padding: 18,
                        alignItems: "center",
                        marginTop: 16,
                        opacity: !petId ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                        {isDone ? "✓ Completed — tap to undo" : "Mark as completed"}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
