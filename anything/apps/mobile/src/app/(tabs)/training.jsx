import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GraduationCap,
  ChevronRight,
  Clock,
  Trophy,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react-native";
import { TRAINING_LESSONS } from "../../data/mockData";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  honey: "#FFC857",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
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
  const [selectedLesson, setSelectedLesson] = useState(null);

  const LessonCard = ({ lesson }) => {
    const diff = DIFF_COLORS[lesson.difficulty] || DIFF_COLORS.Beginner;
    return (
      <TouchableOpacity
        onPress={() => setSelectedLesson(lesson)}
        activeOpacity={0.92}
        style={{
          backgroundColor: C.card,
          borderRadius: 22,
          padding: 18,
          marginBottom: 14,
          shadowColor: C.terracotta,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.07,
          shadowRadius: 14,
          elevation: 3,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 19,
                fontWeight: "800",
                color: C.warmBrown,
                letterSpacing: -0.3,
              }}
            >
              {lesson.title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
                gap: 8,
              }}
            >
              <View
                style={{
                  backgroundColor: diff.bg,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: diff.text, fontWeight: "700" }}
                >
                  {lesson.difficulty}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Clock size={13} color={C.mutedBrown} />
                <Text
                  style={{
                    fontSize: 12,
                    color: C.mutedBrown,
                    fontWeight: "600",
                  }}
                >
                  {lesson.time}
                </Text>
              </View>
            </View>
          </View>
          {lesson.status === "completed" ? (
            <CheckCircle2 size={26} color="#2E7D32" />
          ) : lesson.status === "in progress" ? (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2.5,
                borderColor: C.coral,
                borderStyle: "dashed",
              }}
            />
          ) : (
            <Circle size={26} color={C.peach} />
          )}
        </View>

        <Text
          style={{
            fontSize: 14,
            color: C.mutedBrown,
            lineHeight: 21,
            marginBottom: 14,
          }}
        >
          {lesson.description}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.coral }}>
            Start Lesson
          </Text>
          <ChevronRight size={16} color={C.coral} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: C.warmBrown,
            letterSpacing: -0.5,
          }}
        >
          Dog Training 🎓
        </Text>
        <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>
          Build habits. Strengthen your bond.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Banner */}
        <View
          style={{
            backgroundColor: C.apricot,
            borderRadius: 22,
            padding: 18,
            marginBottom: 22,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: C.terracotta,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}
            >
              Beginner Path 🏆
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.terracotta,
                marginTop: 3,
                marginBottom: 12,
              }}
            >
              Complete 7 lessons to build a strong foundation.
            </Text>
            <View
              style={{
                height: 8,
                backgroundColor: "rgba(255,255,255,0.5)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: "30%",
                  height: "100%",
                  backgroundColor: C.warmBrown,
                  borderRadius: 4,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                color: C.terracotta,
                marginTop: 6,
                fontWeight: "700",
              }}
            >
              2 of 7 lessons completed
            </Text>
          </View>
          <Trophy
            size={50}
            color={C.warmBrown}
            style={{ marginLeft: 14, opacity: 0.7 }}
          />
        </View>

        <Text
          style={{
            fontSize: 17,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 14,
            letterSpacing: -0.2,
          }}
        >
          Lesson List
        </Text>

        {TRAINING_LESSONS.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} />
        ))}

        <View style={{ marginTop: 10, alignItems: "center", padding: 16 }}>
          <Text style={{ color: C.mutedBrown, fontSize: 13 }}>
            🐾 New lessons added every month!
          </Text>
        </View>
      </ScrollView>

      {/* Lesson Detail Modal */}
      <Modal
        visible={!!selectedLesson}
        animationType="slide"
        transparent={false}
      >
        <View
          style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}
        >
          <View
            style={{
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: C.card,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
                flex: 1,
              }}
            >
              {selectedLesson?.title} Training
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedLesson(null)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={16} color={C.mutedBrown} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
          >
            <Text
              style={{
                fontSize: 15,
                color: C.mutedBrown,
                marginBottom: 24,
                lineHeight: 24,
              }}
            >
              {selectedLesson?.description}
            </Text>

            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 18,
              }}
            >
              Step-by-Step 🐾
            </Text>

            {selectedLesson?.steps.map((step, index) => (
              <View
                key={index}
                style={{
                  flexDirection: "row",
                  marginBottom: 20,
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: C.coral,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 14,
                    flexShrink: 0,
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 5,
                  }}
                >
                  <Text
                    style={{ color: "#FFF", fontWeight: "800", fontSize: 13 }}
                  >
                    {index + 1}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{ fontSize: 15, color: C.warmBrown, lineHeight: 23 }}
                  >
                    {step}
                  </Text>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setSelectedLesson(null)}
              style={{
                backgroundColor: C.coral,
                borderRadius: 16,
                padding: 18,
                alignItems: "center",
                marginTop: 16,
                shadowColor: C.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                Mark as Completed ✅
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
