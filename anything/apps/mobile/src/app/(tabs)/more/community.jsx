import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Megaphone, Plus, Flame, Clock, TrendingUp, CalendarDays, RotateCcw } from "lucide-react-native";
import {
  useForumThreads,
  useForumVote,
  FORUM_CATEGORIES,
} from "@/hooks/useForum";
import VoteControl from "@/components/Forum/VoteControl";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, GlassSurface, PressableScale, PawMark } from "@/components/ui";

const CATEGORY_COLORS = {
  Health: { bg: "#EEF4FF", text: "#3B5CC4" },
  Food: { bg: "#FFF8E1", text: "#B8860B" },
  Training: { bg: "#E8F5E9", text: "#2E7D32" },
  Behavior: { bg: "#FBE9E7", text: "#BF360C" },
  General: { bg: COLORS.sand, text: COLORS.mutedBrown },
};

const SORTS = [
  { key: "hot", labelKey: "community.sortHot", Icon: Flame },
  { key: "new", labelKey: "community.sortNew", Icon: Clock },
  { key: "top", labelKey: "community.sortTop", Icon: TrendingUp },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState("All");
  const [sort, setSort] = useState("hot");

  const {
    data: threads,
    isLoading,
    isError,
    refetch,
  } = useForumThreads(activeCategory, sort);
  const voteMutation = useForumVote();

  const handleVote = (thread, value) => {
    voteMutation.mutate({ targetType: "thread", targetId: thread.id, value });
  };

  const ThreadCard = ({ thread }) => {
    const catStyle = CATEGORY_COLORS[thread.category] || CATEGORY_COLORS.General;
    return (
      <PressableScale
        testID={`thread-${thread.id}`}
        onPress={() => router.push(`/forum-thread?id=${thread.id}`)}
      >
        <Card
          radius={RADIUS.card}
          style={{
            padding: SPACING.lg,
            marginBottom: SPACING.md,
            flexDirection: "row",
            gap: SPACING.md,
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
                marginBottom: SPACING.sm,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  backgroundColor: catStyle.bg,
                  paddingHorizontal: SPACING.sm,
                  paddingVertical: 3,
                  borderRadius: RADIUS.chip,
                }}
              >
                <Text style={[TYPE.caption, { color: catStyle.text, fontWeight: "700", letterSpacing: 0 }]}>
                  {t(`community.category.${thread.category}`)}
                </Text>
              </View>
            </View>
            <Text
              style={[
                TYPE.headline,
                { color: COLORS.warmBrown, fontWeight: "800", marginBottom: SPACING.sm },
              ]}
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
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
                🐾 {thread.author_username || "someone"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Megaphone size={14} color={COLORS.mutedBrown} />
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
                  {thread.comment_count || 0}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </PressableScale>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
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
            <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
              <ArrowLeft size={22} color={COLORS.warmBrown} />
            </PressableScale>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
                {t("community.title")} 🐕
              </Text>
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>
                {t("community.subtitle")}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
            <PressableScale
              testID="events-button"
              onPress={() => router.push("/events")}
              style={{
                backgroundColor: MATERIALS.glassTintLight,
                width: 42,
                height: 42,
                borderRadius: RADIUS.chip,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: MATERIALS.hairline,
              }}
            >
              <CalendarDays size={20} color={COLORS.coral} />
            </PressableScale>
            <PressableScale
              testID="compose-button"
              onPress={() => router.push("/forum-compose")}
              style={{
                backgroundColor: COLORS.coral,
                width: 42,
                height: 42,
                borderRadius: RADIUS.chip,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Plus size={22} color="#FFF" />
            </PressableScale>
          </View>
        </View>
      </GlassSurface>

      {/* Sort */}
      <View
        style={{
          flexDirection: "row",
          gap: SPACING.sm,
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.md,
          backgroundColor: COLORS.cream,
        }}
      >
        {SORTS.map(({ key, labelKey, Icon }) => (
          <PressableScale
            key={key}
            testID={`sort-${key}`}
            onPress={() => setSort(key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: SPACING.md,
              paddingVertical: 7,
              borderRadius: RADIUS.chip,
              backgroundColor: sort === key ? COLORS.coral : MATERIALS.surfaceSunken,
            }}
          >
            <Icon size={14} color={sort === key ? "#FFF" : COLORS.mutedBrown} />
            <Text
              style={[
                TYPE.subhead,
                {
                  fontWeight: "700",
                  color: sort === key ? "#FFF" : COLORS.mutedBrown,
                },
              ]}
            >
              {t(labelKey)}
            </Text>
          </PressableScale>
        ))}
      </View>

      {/* Categories */}
      <View
        style={{
          backgroundColor: COLORS.cream,
          paddingVertical: SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: MATERIALS.hairline,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
        >
          {FORUM_CATEGORIES.map((cat) => (
            <PressableScale
              key={cat}
              testID={`category-${cat}`}
              onPress={() => setActiveCategory(cat)}
              style={{
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                marginRight: SPACING.sm,
                backgroundColor: activeCategory === cat ? COLORS.coral : MATERIALS.surfaceSunken,
                borderWidth: 1.5,
                borderColor: activeCategory === cat ? COLORS.coral : MATERIALS.hairline,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  {
                    color: activeCategory === cat ? "#FFF" : COLORS.mutedBrown,
                    fontWeight: "700",
                  },
                ]}
              >
                {t(`community.category.${cat}`)}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", padding: SPACING.huge }}>
            <ActivityIndicator size="large" color={COLORS.coral} />
          </View>
        )}

        {/* A fetch failure is NOT the same as "no discussions" — show a real error
            with a Retry so an outage never masquerades as an empty community. */}
        {!isLoading && isError && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <PawMark size={36} color={COLORS.warmBrown} />
            <Text
              style={[
                TYPE.headline,
                { color: COLORS.warmBrown, fontWeight: "700", marginTop: SPACING.md, textAlign: "center" },
              ]}
            >
              {t("common.somethingWrong")}
            </Text>
            <PressableScale
              onPress={() => refetch()}
              accessibilityRole="button"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm,
                marginTop: SPACING.lg,
                paddingHorizontal: SPACING.xl,
                paddingVertical: SPACING.md,
                borderRadius: RADIUS.control,
                backgroundColor: COLORS.coral,
              }}
            >
              <RotateCcw size={16} color="#FFF" />
              <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
                {t("common.retry")}
              </Text>
            </PressableScale>
          </View>
        )}

        {!isLoading &&
          !isError &&
          threads &&
          threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}

        {!isLoading && threads && threads.length === 0 && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <PawMark size={36} color={COLORS.warmBrown} />
            <Text
              style={[
                TYPE.headline,
                { color: COLORS.warmBrown, fontWeight: "700", marginTop: SPACING.md },
              ]}
            >
              No discussions here yet.
            </Text>
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
              Be the first to bark!
            </Text>
          </View>
        )}
      </RefreshableScrollView>
    </View>
  );
}
