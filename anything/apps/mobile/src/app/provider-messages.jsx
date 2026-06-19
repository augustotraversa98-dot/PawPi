import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MessageSquare } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
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
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          Messages
        </Text>
      </GlassSurface>

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
            style={[
              TYPE.headline,
              { fontWeight: "800", color: COLORS.warmBrown, marginTop: SPACING.md },
            ]}
          >
            No conversations yet
          </Text>
          <Text
            style={[
              TYPE.subhead,
              {
                fontWeight: "500",
                color: COLORS.mutedBrown,
                marginTop: SPACING.sm,
                textAlign: "center",
              },
            ]}
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
            <PressableScale
              key={thread.id}
              onPress={() => openThread(thread)}
              accessibilityRole="button"
              style={{ marginBottom: SPACING.md }}
            >
              <Card
                level="sm"
                radius={RADIUS.card}
                borderColor={thread.unread_count > 0 ? COLORS.coral : MATERIALS.hairline}
                style={{
                  padding: SPACING.md,
                  flexDirection: "row",
                  gap: SPACING.md,
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
                    style={[
                      TYPE.body,
                      { fontWeight: "800", color: COLORS.warmBrown, flex: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {thread.provider_name || "Provider"}
                  </Text>
                  <Text
                    style={[
                      TYPE.caption,
                      { letterSpacing: 0, fontWeight: "500", color: COLORS.mutedBrown },
                    ]}
                  >
                    {formatTime(thread.last_message_at)}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: SPACING.xs,
                  }}
                >
                  <Text
                    style={[
                      TYPE.subhead,
                      {
                        color: thread.unread_count > 0 ? COLORS.warmBrown : COLORS.mutedBrown,
                        fontWeight: thread.unread_count > 0 ? "700" : "400",
                        flex: 1,
                      },
                    ]}
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
                        paddingHorizontal: SPACING.xs,
                        paddingVertical: 2,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={[
                          TYPE.caption,
                          { letterSpacing: 0, color: "#FFF", fontWeight: "800" },
                        ]}
                      >
                        {thread.unread_count}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              </Card>
            </PressableScale>
          ))}
        </RefreshableScrollView>
      )}
    </View>
  );
}
