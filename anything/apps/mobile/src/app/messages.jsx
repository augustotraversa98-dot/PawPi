import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Search, User, Store } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
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
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              letterSpacing: -0.3,
            }}
          >
            Messages
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.sand,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.peach,
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.mutedBrown} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: COLORS.warmBrown, padding: 0 }}
            placeholder="Search people or start a new chat…"
            placeholderTextColor={COLORS.mutedBrown}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
        </View>

        {/* All / People / Businesses segmented filter */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 18,
                  backgroundColor: active ? COLORS.coral : COLORS.sand,
                  borderWidth: 1,
                  borderColor: active ? COLORS.coral : COLORS.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: active ? "#FFF" : COLORS.mutedBrown,
                  }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Owner search results — tap to start a DM (people only). */}
        {q.length >= 2 && (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: COLORS.mutedBrown,
                letterSpacing: 0.7,
                marginLeft: 20,
                marginBottom: 4,
              }}
            >
              START A NEW CHAT
            </Text>
            {searching && owners.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <ActivityIndicator color={COLORS.coral} />
              </View>
            ) : owners.length === 0 ? (
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.mutedBrown,
                  marginLeft: 20,
                  marginBottom: 8,
                }}
              >
                No pet parents found.
              </Text>
            ) : (
              owners.map((owner) => (
                <TouchableOpacity
                  key={`owner-${owner.id}`}
                  testID="owner-result"
                  onPress={() => startChatWithOwner(owner)}
                  style={{
                    marginHorizontal: 16,
                    marginTop: 8,
                    backgroundColor: COLORS.card,
                    borderRadius: 16,
                    padding: 12,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: COLORS.peach,
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
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: COLORS.warmBrown,
                    }}
                  >
                    {owner.full_name || owner.username || "Pet parent"}
                  </Text>
                </TouchableOpacity>
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
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: COLORS.warmBrown,
                marginTop: 16,
              }}
            >
              No conversations yet
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: COLORS.mutedBrown,
                marginTop: 8,
                textAlign: "center",
                paddingHorizontal: 40,
              }}
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
              <TouchableOpacity
                key={it.key}
                testID={it.kind === "people" ? "dm-thread" : "biz-thread"}
                onPress={() => it.open(router)}
                style={{
                  marginHorizontal: 16,
                  marginTop: 12,
                  backgroundColor: COLORS.card,
                  borderRadius: 20,
                  padding: 16,
                  flexDirection: "row",
                  gap: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: unread ? COLORS.coral : COLORS.peach,
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
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: COLORS.warmBrown,
                        flex: 1,
                        marginRight: 8,
                      }}
                      numberOfLines={1}
                    >
                      {it.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                        fontWeight: unread ? "700" : "400",
                      }}
                    >
                      {formatMessageTime(it.at)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      color: unread ? COLORS.warmBrown : COLORS.mutedBrown,
                      fontWeight: unread ? "700" : "400",
                    }}
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
                      paddingHorizontal: 6,
                      backgroundColor: COLORS.coral,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>
                      {it.unread}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
