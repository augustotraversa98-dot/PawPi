import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Search, User, Store } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { useDMThreads, useStartDM } from "@/hooks/useDMs";
import { useMyThreads } from "@/hooks/useProviders";
import { useSearch, useDebouncedValue } from "@/hooks/useSearch";

// Unified Messages hub (ticket 2.40): owner↔owner DMs (people) AND owner↔business
// provider chats, side by side with an All / People / Businesses filter, plus an
// owner search to start a new DM. The two backends stay SEPARATE (dm_threads vs
// message_threads) — this screen only presents them together. No mock data.

const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";
  const now = new Date();
  const then = new Date(timestamp);
  const diffMins = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString();
};

// Normalize a people DM thread + a business provider thread into one row shape.
function dmToItem(t) {
  return {
    key: `dm-${t.id}`,
    kind: "people",
    name: t.other_name || t.other_username || "Pet parent",
    avatar: t.other_avatar_url || "",
    body: t.last_message_body,
    imagePreview: t.last_message_image_url,
    at: t.last_message_at,
    unread: t.unread_count ?? 0,
    open: (router) =>
      router.push({
        pathname: "/chat",
        params: {
          threadId: String(t.id),
          otherUserId: String(t.other_user_id),
          otherName: t.other_name || t.other_username || "Pet parent",
          otherAvatar: t.other_avatar_url || "",
        },
      }),
  };
}

function providerToItem(t) {
  return {
    key: `biz-${t.id}`,
    kind: "businesses",
    name: t.provider_name || "Provider",
    avatar: t.provider_logo_url || "",
    body: t.last_message_body,
    imagePreview: t.last_message_attachment_url,
    at: t.last_message_at,
    unread: t.unread_count ?? 0,
    open: (router) =>
      router.push({
        pathname: "/provider-chat",
        params: {
          threadId: String(t.id),
          providerName: t.provider_name || "Provider",
          ownerUserId: String(t.owner_user_id),
        },
      }),
  };
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "people", label: "People" },
  { key: "businesses", label: "Businesses" },
];

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: dmThreads, isLoading: loadingDM } = useDMThreads();
  const { data: bizThreads, isLoading: loadingBiz } = useMyThreads();
  const startDM = useStartDM();

  // Owner search to start a new DM (reuses the 2.25 search; owners only here).
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const { data: searchResults, isFetching: searching } =
    useSearch(debouncedQuery);
  const owners = searchResults?.owners || [];

  const items = useMemo(() => {
    const people = (dmThreads || []).map(dmToItem);
    const businesses = (bizThreads || []).map(providerToItem);
    return [...people, ...businesses].sort(
      (a, b) => new Date(b.at || 0) - new Date(a.at || 0),
    );
  }, [dmThreads, bizThreads]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (filter !== "all" && it.kind !== filter) return false;
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      (it.body || "").toLowerCase().includes(q)
    );
  });

  const isLoading = loadingDM || loadingBiz;

  const startChatWithOwner = async (owner) => {
    try {
      const res = await startDM.mutateAsync({ otherUserId: owner.id });
      const thread = res?.thread;
      if (!thread) return;
      setSearchQuery("");
      router.push({
        pathname: "/chat",
        params: {
          threadId: String(thread.id),
          otherUserId: String(owner.id),
          otherName: owner.full_name || owner.username || "Pet parent",
          otherAvatar: owner.avatar_url || "",
        },
      });
    } catch (e) {
      // Surface nothing destructive — the thread create is idempotent; a failure
      // just leaves the search open.
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: SPACING.md,
          }}
        >
          <PressableScale onPress={() => router.back()} accessibilityRole="button">
            <X size={22} color={COLORS.mutedBrown} />
          </PressableScale>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            Messages
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.md,
            borderWidth: 1,
            borderColor: MATERIALS.hairline,
            gap: SPACING.sm,
          }}
        >
          <Search size={18} color={COLORS.mutedBrown} />
          <TextInput
            style={[TYPE.body, { flex: 1, color: COLORS.warmBrown, padding: 0 }]}
            placeholder="Search people or start a new chat…"
            placeholderTextColor={COLORS.mutedBrown}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <PressableScale onPress={() => setSearchQuery("")} accessibilityRole="button">
              <X size={16} color={COLORS.mutedBrown} />
            </PressableScale>
          )}
        </View>

        {/* All / People / Businesses segmented filter */}
        <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <PressableScale
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                style={{
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: 7,
                  borderRadius: RADIUS.chip,
                  backgroundColor: active ? COLORS.coral : MATERIALS.surfaceSunken,
                  borderWidth: 1,
                  borderColor: active ? COLORS.coral : MATERIALS.hairline,
                }}
              >
                <Text
                  style={[
                    TYPE.subhead,
                    { fontWeight: "700", color: active ? "#FFF" : COLORS.mutedBrown },
                  ]}
                >
                  {f.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </GlassSurface>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Owner search results — tap to start a DM (people only). */}
        {q.length >= 2 && (
          <View style={{ marginTop: SPACING.sm }}>
            <Text
              style={[
                TYPE.overline,
                { color: COLORS.mutedBrown, marginLeft: SPACING.xl, marginBottom: SPACING.xs },
              ]}
            >
              START A NEW CHAT
            </Text>
            {searching && owners.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: SPACING.lg }}>
                <ActivityIndicator color={COLORS.coral} />
              </View>
            ) : owners.length === 0 ? (
              <Text
                style={[
                  TYPE.subhead,
                  {
                    fontWeight: "500",
                    color: COLORS.mutedBrown,
                    marginLeft: SPACING.xl,
                    marginBottom: SPACING.sm,
                  },
                ]}
              >
                No pet parents found.
              </Text>
            ) : (
              owners.map((owner) => (
                <PressableScale
                  key={`owner-${owner.id}`}
                  testID="owner-result"
                  onPress={() => startChatWithOwner(owner)}
                  accessibilityRole="button"
                  style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.sm }}
                >
                  <Card
                    level="sm"
                    radius={RADIUS.control}
                    style={{
                      padding: SPACING.md,
                      flexDirection: "row",
                      gap: SPACING.md,
                      alignItems: "center",
                    }}
                  >
                    {owner.avatar_url ? (
                      <Image
                        source={{ uri: owner.avatar_url }}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: COLORS.sand,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <User size={20} color={COLORS.coral} />
                      </View>
                    )}
                    <Text
                      style={[
                        TYPE.body,
                        { fontWeight: "700", color: COLORS.warmBrown },
                      ]}
                    >
                      {owner.full_name || owner.username || "Pet parent"}
                    </Text>
                  </Card>
                </PressableScale>
              ))
            )}
          </View>
        )}

        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 48 }}>💬</Text>
            <Text
              style={[
                TYPE.headline,
                { fontWeight: "700", color: COLORS.warmBrown, marginTop: SPACING.lg },
              ]}
            >
              No conversations yet
            </Text>
            <Text
              style={[
                TYPE.callout,
                {
                  color: COLORS.mutedBrown,
                  marginTop: SPACING.sm,
                  textAlign: "center",
                  paddingHorizontal: SPACING.huge,
                },
              ]}
            >
              Search a pet parent above to start a chat, or message a business
              from its profile.
            </Text>
          </View>
        ) : (
          filtered.map((it) => {
            const unread = it.unread > 0;
            const preview = it.body
              ? it.body
              : it.imagePreview
                ? "📷 Photo"
                : "Say hi 👋";
            return (
              <PressableScale
                key={it.key}
                testID={it.kind === "people" ? "dm-thread" : "biz-thread"}
                onPress={() => it.open(router)}
                accessibilityRole="button"
                style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md }}
              >
                <Card
                  level="sm"
                  radius={RADIUS.card}
                  borderColor={unread ? COLORS.coral : MATERIALS.hairline}
                  style={{
                    padding: SPACING.lg,
                    flexDirection: "row",
                    gap: SPACING.md,
                    alignItems: "center",
                  }}
                >
                  {it.avatar ? (
                    <Image
                      source={{ uri: it.avatar }}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        borderWidth: 2,
                        borderColor: COLORS.coral,
                      }}
                      transition={100}
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: COLORS.sand,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {it.kind === "businesses" ? (
                        <Store size={24} color={COLORS.coral} />
                      ) : (
                        <User size={24} color={COLORS.coral} />
                      )}
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: SPACING.xs,
                      }}
                    >
                      <Text
                        style={[
                          TYPE.headline,
                          {
                            fontWeight: "800",
                            color: COLORS.warmBrown,
                            flex: 1,
                            marginRight: SPACING.sm,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {it.name}
                      </Text>
                      <Text
                        style={[
                          TYPE.caption,
                          {
                            letterSpacing: 0,
                            color: COLORS.mutedBrown,
                            fontWeight: unread ? "700" : "400",
                          },
                        ]}
                      >
                        {formatMessageTime(it.at)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        TYPE.callout,
                        {
                          color: unread ? COLORS.warmBrown : COLORS.mutedBrown,
                          fontWeight: unread ? "700" : "400",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>
                  </View>

                  {unread && (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        paddingHorizontal: SPACING.xs,
                        backgroundColor: COLORS.coral,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={[
                          TYPE.caption,
                          { letterSpacing: 0, color: "#FFF", fontWeight: "800" },
                        ]}
                      >
                        {it.unread}
                      </Text>
                    </View>
                  )}
                </Card>
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
