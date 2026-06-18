import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Megaphone, Plus, Flame, Clock, TrendingUp } from "lucide-react-native";
import {
  useForumThreads,
  useForumVote,
  FORUM_CATEGORIES,
} from "@/hooks/useForum";
import VoteControl from "@/components/Forum/VoteControl";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";

const C = {
  coral: "#FF6F61",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const CATEGORY_COLORS = {
  Health: { bg: "#EEF4FF", text: "#3B5CC4" },
  Food: { bg: "#FFF8E1", text: "#B8860B" },
  Training: { bg: "#E8F5E9", text: "#2E7D32" },
  Behavior: { bg: "#FBE9E7", text: "#BF360C" },
  General: { bg: C.sand, text: C.mutedBrown },
};

const SORTS = [
  { key: "hot", label: "Hot", Icon: Flame },
  { key: "new", label: "New", Icon: Clock },
  { key: "top", label: "Top", Icon: TrendingUp },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [sort, setSort] = useState("hot");

  const {
    data: threads,
    isLoading,
    refetch,
  } = useForumThreads(activeCategory, sort);
  const voteMutation = useForumVote();

  const handleVote = (thread, value) => {
    voteMutation.mutate({ targetType: "thread", targetId: thread.id, value });
  };

  const ThreadCard = ({ thread }) => {
    const catStyle = CATEGORY_COLORS[thread.category] || CATEGORY_COLORS.General;
    return (
      <TouchableOpacity
        testID={`thread-${thread.id}`}
        activeOpacity={0.92}
        onPress={() => router.push(`/forum-thread?id=${thread.id}`)}
        style={{
          backgroundColor: C.card,
          borderRadius: 18,
          padding: 16,
          marginBottom: 12,
          flexDirection: "row",
          gap: 12,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <VoteControl
          score={thread.score || 0}
          myVote={thread.my_vote ?? null}
          onVote={(value) => handleVote(thread, value)}
          testIDPrefix={`thread-vote-${thread.id}`}
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: catStyle.bg,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 9,
              }}
            >
              <Text style={{ fontSize: 11, color: catStyle.text, fontWeight: "700" }}>
                {thread.category}
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 8,
              lineHeight: 22,
            }}
          >
            {thread.title}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: C.mutedBrown, fontWeight: "600" }}>
              🐾 {thread.author_username || "someone"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Megaphone size={14} color={C.mutedBrown} />
              <Text style={{ fontSize: 12, color: C.mutedBrown, fontWeight: "600" }}>
                {thread.comment_count || 0}
              </Text>
            </View>
          </View>
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
          paddingBottom: 12,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <ArrowLeft size={22} color={C.warmBrown} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: C.warmBrown }}>
                Community 🐕
              </Text>
              <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>
                Ask, share, and connect with pet parents.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            testID="compose-button"
            onPress={() => router.push("/forum-compose")}
            style={{
              backgroundColor: C.coral,
              width: 42,
              height: 42,
              borderRadius: 21,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Plus size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort */}
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          backgroundColor: C.card,
        }}
      >
        {SORTS.map(({ key, label, Icon }) => (
          <TouchableOpacity
            key={key}
            testID={`sort-${key}`}
            onPress={() => setSort(key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 18,
              backgroundColor: sort === key ? C.coral : C.sand,
            }}
          >
            <Icon size={14} color={sort === key ? "#FFF" : C.mutedBrown} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: sort === key ? "#FFF" : C.mutedBrown,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Categories */}
      <View
        style={{
          backgroundColor: C.card,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {FORUM_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              testID={`category-${cat}`}
              onPress={() => setActiveCategory(cat)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                marginRight: 8,
                backgroundColor: activeCategory === cat ? C.coral : C.sand,
                borderWidth: 1.5,
                borderColor: activeCategory === cat ? C.coral : C.peach,
              }}
            >
              <Text
                style={{
                  color: activeCategory === cat ? "#FFF" : C.mutedBrown,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", padding: 40 }}>
            <ActivityIndicator size="large" color={C.coral} />
          </View>
        )}

        {!isLoading &&
          threads &&
          threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}

        {!isLoading && threads && threads.length === 0 && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <Text style={{ fontSize: 36 }}>🐾</Text>
            <Text
              style={{
                color: C.warmBrown,
                fontSize: 16,
                fontWeight: "700",
                marginTop: 12,
              }}
            >
              No discussions here yet.
            </Text>
            <Text style={{ color: C.mutedBrown, fontSize: 13, marginTop: 4 }}>
              Be the first to bark!
            </Text>
          </View>
        )}
      </RefreshableScrollView>
    </View>
  );
}
