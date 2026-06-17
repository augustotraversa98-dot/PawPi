import React, { useState } from "react";
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
import { X, Search, User } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { useDMThreads } from "@/hooks/useDMs";

// Owner↔owner Messages inbox on REAL data (ticket 2.27). No mock — empty → empty state.
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

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: threads, isLoading } = useDMThreads();

  const filtered = (threads || []).filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (t.other_name || "").toLowerCase().includes(q) ||
      (t.last_message_body || "").toLowerCase().includes(q)
    );
  });

  const openThread = (t) => {
    router.push({
      pathname: "/chat",
      params: {
        threadId: String(t.id),
        otherUserId: String(t.other_user_id),
        otherName: t.other_name || t.other_username || "Pet parent",
        otherAvatar: t.other_avatar_url || "",
      },
    });
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
            placeholder="Search conversations…"
            placeholderTextColor={COLORS.mutedBrown}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
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
              Message another pet parent from their pet's profile.
            </Text>
          </View>
        ) : (
          filtered.map((t) => {
            const unread = (t.unread_count ?? 0) > 0;
            const preview = t.last_message_body
              ? t.last_message_body
              : t.last_message_image_url
                ? "📷 Photo"
                : "Say hi 👋";
            return (
              <TouchableOpacity
                key={t.id}
                testID="dm-thread"
                onPress={() => openThread(t)}
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
                {t.other_avatar_url ? (
                  <Image
                    source={{ uri: t.other_avatar_url }}
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
                    <User size={24} color={COLORS.coral} />
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
                      {t.other_name || t.other_username || "Pet parent"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                        fontWeight: unread ? "700" : "400",
                      }}
                    >
                      {formatMessageTime(t.last_message_at)}
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
                      {t.unread_count}
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
