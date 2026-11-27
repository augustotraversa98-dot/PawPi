import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
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
import { FirstFocusGate } from "@/components/FirstFocusGate";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface, ErrorState } from "@/components/ui";
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
  difficultyLabel,
  programTitle,
  programSummary,
  sessionTitle,
  sessionObjective,
  sessionSteps,
  sessionTips,
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
  coral: COLORS.coral,
  apricot: COLORS.apricot,
  peach: COLORS.peach,
  terracotta: COLORS.terracotta,
  sage: COLORS.sage,
  sageDark: COLORS.sageDark,
  cream: COLORS.cream,
  sand: COLORS.sand,
  card: COLORS.card,
  warmBrown: COLORS.warmBrown,
  mutedBrown: COLORS.mutedBrown,
};

const DIFF_COLORS = {
  Beginner: { bg: "#E8F5E9", text: "#2E7D32" },
  Intermediate: { bg: "#FFF8E1", text: "#F57F17" },
  Advanced: { bg: "#FBE9E7", text: "#BF360C" },
};

// The only thing the curriculum loads is which sessions are done (the lessons ship with the app).
// Until that answer is in, say so rather than showing "0 done" as if it were true.
function ProgressNotice({ status, onRetry, style }) {
  const { t } = useTranslation();
  if (status === "loading") {
    return (
      <View
        testID="progress-loading"
        style={[
          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
          style,
        ]}
      >
        <ActivityIndicator size="small" color={C.coral} />
        <Text style={{ fontSize: 13, color: C.mutedBrown }}>
          {t("screensUi.training.loadingProgress")}
        </Text>
      </View>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        testID="progress-error"
        message={t("screensUi.training.progressLoadFailed")}
        onRetry={onRetry}
        style={style}
      />
    );
  }
  return null;
}

function TrainingScreenContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    data: currentPet,
    isLoading: petLoading,
    isError: petFailed,
    refetch: refetchPet,
  } = useCurrentPet();
  const petId = currentPet?.id;

  const { t } = useTranslation();
  const progress = useSelfTrainingProgress(petId);
  const { completedSet } = progress;
  const toggle = useToggleSession(petId);

  // "paused" = waiting for the network with nothing to show. Progress already on screen stays
  // there if a later refresh fails.
  const noProgressYet = progress.data === undefined;
  const petMissing = !petId && petFailed;
  const progressStatus =
    petMissing || (noProgressYet && (progress.isError || progress.fetchStatus === "paused"))
      ? "error"
      : (!petId && petLoading) || progress.isLoading
        ? "loading"
        : "ready";
  const progressReady = progressStatus === "ready";
  const retryProgress = () => (petMissing ? refetchPet() : progress.refetch());

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

  // The program stays set after closing, so the modal keeps its content while it slides away.
  const [openProgram, setOpenProgram] = useState(null); // program object
  const [programVisible, setProgramVisible] = useState(false);
  const [openSession, setOpenSession] = useState(null); // session object

  const showProgram = (program) => {
    setOpenProgram(program);
    setOpenSession(null);
    setProgramVisible(true);
  };
  const closeProgram = () => setProgramVisible(false);
  const closeSession = () => setOpenSession(null);

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
        onPress={() => showProgram(program)}
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
              {programTitle(t, program)}
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
                {difficultyLabel(t, program.difficulty)}
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
          {programSummary(t, program)}
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
          {progressReady ? t("screensUi.training.sessionsDone", { done, total }) : " "}
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
              {t("screensUi.training.wantAProHireA")}
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
              {t("screensUi.training.11SessionsGroupClasses")}
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
            {t("screensUi.training.yourTrainingJourney")}
          </Text>
          {progressReady ? (
            <Text
              testID="overall-progress"
              style={{ fontSize: 13, color: C.terracotta, marginTop: 4, fontWeight: "700" }}
            >
              {t("screensUi.training.overallProgress", {
                done: totalDone,
                total: totalSessions,
                programs: TRAINING_PROGRAMS.length,
              })}
            </Text>
          ) : progressStatus === "loading" ? (
            <ProgressNotice
              status="loading"
              style={{ justifyContent: "flex-start", padding: 0, marginTop: 4 }}
            />
          ) : null}
        </View>

        {progressStatus === "error" && (
          <ProgressNotice status="error" onRetry={retryProgress} style={{ marginBottom: 20 }} />
        )}

        <Text
          style={{
            fontSize: 17,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 14,
          }}
        >
          {t("screensUi.training.programs")}
        </Text>

        {TRAINING_PROGRAMS.map((program) => (
          <ProgramCard key={program.key} program={program} />
        ))}
      </ScrollView>
      )}

      {/* Program → session list → session detail, all inside ONE native modal. iOS will not present a
          second sibling <Modal> while one is up: it ignored the tap on a session, then showed that
          modal EMPTY once the list closed. So the session is a layer over the list instead (which
          also keeps the list's scroll position). */}
      <Modal
        visible={programVisible}
        animationType="slide"
        backdropColor={C.cream}
        onRequestClose={openSession ? closeSession : closeProgram}
      >
        <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
          {openProgram && (
            <View key={openProgram.key} style={{ flex: 1 }}>
              <View
                style={{ flex: 1 }}
                accessibilityElementsHidden={!!openSession}
                importantForAccessibility={openSession ? "no-hide-descendants" : "auto"}
              >
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
                  <TouchableOpacity accessibilityLabel={t("common.back")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    testID="program-back"
                    onPress={closeProgram}
                    style={{ marginRight: 12 }}
                  >
                    <ArrowLeft size={22} color={C.warmBrown} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 19, fontWeight: "800", color: C.warmBrown, flex: 1 }}>
                    {openProgram.emoji} {programTitle(t, openProgram)}
                  </Text>
                </View>

                <ScrollView
                  contentInsetAdjustmentBehavior="automatic"
                  contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                >
                  <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 21, marginBottom: 16 }}>
                    {programSummary(t, openProgram)}
                  </Text>

                  {progressStatus === "error" && (
                    <ProgressNotice status="error" onRetry={retryProgress} style={{ marginBottom: 12 }} />
                  )}

                  {openProgram.sessions.map((session, index) => {
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
                            {index + 1}. {sessionTitle(t, openProgram.key, session)}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                            <Clock size={12} color={C.mutedBrown} />
                            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                              {t("screensUi.training.sessionMeta", {
                                minutes: session.durationMin,
                                difficulty: difficultyLabel(t, session.difficulty),
                              })}
                            </Text>
                          </View>
                        </View>
                        <ChevronRight size={18} color={C.mutedBrown} />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Under the rows, so they never move under the finger when progress arrives. */}
                  {progressStatus === "loading" && <ProgressNotice status="loading" />}
                </ScrollView>
              </View>

              {openSession && (
                <View
                  testID="session-detail"
                  accessibilityViewIsModal
                  style={[StyleSheet.absoluteFill, { backgroundColor: C.cream }]}
                >
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
                    <TouchableOpacity accessibilityLabel={t("common.close")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      testID="session-close"
                      onPress={closeSession}
                      style={{ marginRight: 12 }}
                    >
                      <X size={20} color={C.warmBrown} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown, flex: 1 }}>
                      {sessionTitle(t, openProgram.key, openSession)}
                    </Text>
                  </View>

                  <ScrollView
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                  >
                    <Text style={{ fontSize: 14, color: C.warmBrown, lineHeight: 22, marginBottom: 18 }}>
                      🎯 {sessionObjective(t, openProgram.key, openSession)}
                    </Text>

                    <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginBottom: 14 }}>
                      {t("screensUi.training.stepByStep")}
                    </Text>
                    {sessionSteps(t, openProgram.key, openSession).map((step, i) => (
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

                    {sessionTips(t, openProgram.key, openSession).length > 0 && (
                      <View
                        style={{
                          backgroundColor: C.sand,
                          borderRadius: 14,
                          padding: 14,
                          marginTop: 8,
                          marginBottom: 8,
                        }}
                      >
                        {sessionTips(t, openProgram.key, openSession).map((tip, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                            <Lightbulb size={15} color={C.terracotta} />
                            <Text style={{ flex: 1, fontSize: 13, color: C.mutedBrown, lineHeight: 19 }}>
                              {tip}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {progressReady ? (() => {
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
                            {isDone
                              ? t("screensUi.training.completedTapToUndo")
                              : t("screensUi.training.markAsCompleted")}
                          </Text>
                        </TouchableOpacity>
                      );
                    })() : (
                      <ProgressNotice status={progressStatus} onRetry={retryProgress} style={{ marginTop: 16 }} />
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// Mounted (and so fetching) only once the tab has been opened for the first time — see
// hooks/useHasBeenFocused. Keeps this tab's reads out of the app-launch burst.
export default function TrainingScreen() {
  return (
    <FirstFocusGate backgroundColor={COLORS.cream}>
      <TrainingScreenContent />
    </FirstFocusGate>
  );
}
