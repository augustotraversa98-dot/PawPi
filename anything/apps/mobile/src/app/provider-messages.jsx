import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MessageSquare } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useMyThreads } from "@/hooks/useProviders";

// Owner-side Messages screen (Phase 2 ticket 2.5): the list of owner ↔ provider
// conversations. Real data only (the participant-scoped /api/threads), empty state
// when there are none. Tapping a thread opens the conversation (provider-chat).
//
// This is DISTINCT from the existing social-pet "messages"/"chat" screens (pet-friend
// chat) — owner↔provider messaging is its own surface.
function formatTime(ts) {
  if (!ts) return "";
  const then = new Date(ts);
  const now = new Date();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString();
}

export default function ProviderMessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: threads, isLoading, refetch } = useMyThreads();
  const list = threads ?? [];

  const openThread = (thread) => {
    router.push({
      pathname: "/provider-chat",
      params: {
        threadId: String(thread.id),
        providerName: thread.provider_name || "Provider",
        ownerUserId: String(thread.owner_user_id),
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          Messages
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : list.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <MessageSquare size={40} color={COLORS.mutedBrown} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: COLORS.warmBrown,
              marginTop: 14,
            }}
          >
            No conversations yet
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: COLORS.mutedBrown,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Message a vet or service provider from their profile to start a
            conversation.
          </Text>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
        >
          {list.map((thread) => (
            <TouchableOpacity
              key={thread.id}
              onPress={() => openThread(thread)}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 18,
                padding: 14,
                marginBottom: 12,
                flexDirection: "row",
                gap: 12,
                borderWidth: 1,
                borderColor: thread.unread_count > 0 ? COLORS.coral : COLORS.peach,
              }}
            >
              {thread.provider_logo_url ? (
                <Image
                  source={{ uri: thread.provider_logo_url }}
                  style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.sand }}
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: COLORS.sand,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <MessageSquare size={22} color={COLORS.coral} />
                </View>
              )}
              <View style={{ flex: 1, justifyContent: "center" }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown, flex: 1 }}
                    numberOfLines={1}
                  >
                    {thread.provider_name || "Provider"}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
                    {formatTime(thread.last_message_at)}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: thread.unread_count > 0 ? COLORS.warmBrown : COLORS.mutedBrown,
                      fontWeight: thread.unread_count > 0 ? "700" : "400",
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {thread.last_message_body ||
                      (thread.last_message_attachment_url ? "Photo" : "No messages yet")}
                  </Text>
                  {thread.unread_count > 0 && (
                    <View
                      style={{
                        backgroundColor: COLORS.coral,
                        borderRadius: 10,
                        minWidth: 20,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>
                        {thread.unread_count}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </RefreshableScrollView>
      )}
    </View>
  );
}
