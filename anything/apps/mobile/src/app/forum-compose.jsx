import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCreateThread, FORUM_CATEGORIES } from "@/hooks/useForum";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sand: "#F8EBDD",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

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
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          testID="compose-back"
          onPress={() => router.back()}
          style={{ marginRight: 12 }}
        >
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          New Discussion
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              testID={`compose-category-${cat}`}
              onPress={() => setCategory(cat)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 18,
                backgroundColor: category === cat ? C.coral : C.sand,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: category === cat ? "#FFF" : C.mutedBrown,
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          testID="compose-title"
          value={title}
          onChangeText={setTitle}
          placeholder="What's your question?"
          placeholderTextColor={C.mutedBrown + "90"}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>Details (optional)</Text>
        <TextInput
          testID="compose-body"
          value={body}
          onChangeText={setBody}
          placeholder="Add more context..."
          placeholderTextColor={C.mutedBrown + "90"}
          multiline
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
        />

        <TouchableOpacity
          testID="compose-submit"
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? C.coral : C.sand,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: 28,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {createThread.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: canSubmit ? "#FFF" : C.mutedBrown,
              }}
            >
              Post
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = {
  label: { fontSize: 14, fontWeight: "700", color: C.warmBrown, marginBottom: 8 },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.warmBrown,
    borderWidth: 1,
    borderColor: C.peach,
  },
};
