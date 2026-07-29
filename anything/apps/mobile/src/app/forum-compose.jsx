import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCreateThread, FORUM_CATEGORIES } from "@/hooks/useForum";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { GlassSurface, PressableScale } from "@/components/ui";

// Categories minus the "All" pseudo-filter.
const CATEGORIES = FORUM_CATEGORIES.filter((c) => c !== "All");

export default function ForumComposeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const createThread = useCreateThread();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");

  const canSubmit = title.trim().length > 0 && !createThread.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createThread.mutate(
      { title: title.trim(), body: body.trim() || null, category },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.lg,
        }}
      >
        <PressableScale
          testID="compose-back"
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          New Discussion
        </Text>
      </GlassSurface>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: 18 }}>
          {CATEGORIES.map((cat) => (
            <PressableScale
              key={cat}
              testID={`compose-category-${cat}`}
              onPress={() => setCategory(cat)}
              style={{
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                backgroundColor: category === cat ? COLORS.coral : MATERIALS.surfaceSunken,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  {
                    fontWeight: "700",
                    color: category === cat ? "#FFF" : COLORS.mutedBrown,
                  },
                ]}
              >
                {cat}
              </Text>
            </PressableScale>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          testID="compose-title"
          value={title}
          onChangeText={setTitle}
          placeholder="What's your question?"
          placeholderTextColor={COLORS.mutedBrown + "90"}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: SPACING.lg }]}>Details (optional)</Text>
        <TextInput
          testID="compose-body"
          value={body}
          onChangeText={setBody}
          placeholder="Add more context..."
          placeholderTextColor={COLORS.mutedBrown + "90"}
          multiline
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
        />

        <PressableScale
          testID="compose-submit"
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? COLORS.coral : MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            marginTop: 28,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {createThread.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text
              style={[
                TYPE.headline,
                {
                  fontWeight: "800",
                  color: canSubmit ? "#FFF" : COLORS.mutedBrown,
                },
              ]}
            >
              Post
            </Text>
          )}
        </PressableScale>
      </ScrollView>
    </View>
  );
}

const styles = {
  label: { ...TYPE.callout, fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
  input: {
    backgroundColor: MATERIALS.surfaceSunken,
    borderRadius: RADIUS.control,
    padding: SPACING.md,
    ...TYPE.body,
    color: COLORS.warmBrown,
    borderWidth: 1,
    borderColor: MATERIALS.hairline,
  },
};
