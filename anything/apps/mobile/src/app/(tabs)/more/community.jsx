import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Search, Megaphone, Plus, Filter } from "lucide-react-native";
import { COMMUNITY_POSTS } from "../../../data/mockData";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  honey: "#FFC857",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
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

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = [
    "All",
    "Health",
    "Food",
    "Training",
    "Behavior",
    "General",
  ];

  const filtered = COMMUNITY_POSTS.filter((p) => {
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    const matchSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const PostCard = ({ post }) => {
    const catStyle = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.General;
    return (
      <TouchableOpacity
        activeOpacity={0.92}
        style={{
          backgroundColor: C.card,
          borderRadius: 22,
          padding: 17,
          marginBottom: 12,
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
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: catStyle.bg,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 9,
            }}
          >
            <Text
              style={{ fontSize: 12, color: catStyle.text, fontWeight: "700" }}
            >
              {post.category}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: C.mutedBrown }}>
            {post.timestamp}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 10,
            lineHeight: 23,
          }}
        >
          {post.title}
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontSize: 13, color: C.mutedBrown, fontWeight: "600" }}
          >
            🐾 {post.author}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Megaphone size={14} color={C.mutedBrown} />
            <Text
              style={{ fontSize: 13, color: C.mutedBrown, fontWeight: "600" }}
            >
              {post.comments} barks
            </Text>
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
          paddingBottom: 14,
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
            marginBottom: 14,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginRight: 12 }}
            >
              <ArrowLeft size={22} color={C.warmBrown} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "800",
                  color: C.warmBrown,
                  letterSpacing: -0.5,
                }}
              >
                Community 🐕
              </Text>
              <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>
                Ask, share, and connect with pet parents.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: C.coral,
              width: 42,
              height: 42,
              borderRadius: 21,
              justifyContent: "center",
              alignItems: "center",
              shadowColor: C.coral,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
            }}
          >
            <Plus size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.sand,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Search size={18} color={C.mutedBrown} style={{ marginRight: 9 }} />
          <TextInput
            placeholder="Search questions or tips..."
            placeholderTextColor={C.mutedBrown}
            style={{ flex: 1, fontSize: 14, color: C.warmBrown }}
            value={search}
            onChangeText={setSearch}
          />
          <Filter size={17} color={C.mutedBrown} />
        </View>
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
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 14,
            letterSpacing: 0.8,
          }}
        >
          LATEST DISCUSSIONS
        </Text>

        {filtered.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}

        {filtered.length === 0 && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <Text style={{ fontSize: 36 }}>🐾</Text>
            <Text
              style={{
                color: C.mutedBrown,
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

        <TouchableOpacity
          style={{
            marginTop: 16,
            padding: 18,
            backgroundColor: C.card,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: C.coral,
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.coral, fontWeight: "800", fontSize: 15 }}>
            🐾 Ask a Question
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
