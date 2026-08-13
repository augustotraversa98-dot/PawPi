import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { MessageSquare, User } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import BusinessHeader from "@/components/Business/BusinessHeader";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import { useProviderThreads } from "@/hooks/useProviders";
import { useMyProfileId } from "@/hooks/useUserProfile";

// Business mode v2 → Messages tab. The active provider's conversation inbox (its message threads),
// reusing the existing messaging infra from the PROVIDER perspective (useProviderThreads →
// /api/threads?side=provider). The other party on each row is the CUSTOMER (owner). Tapping a
// thread opens the SHARED provider-chat screen with the staff member's own id (meUserId) so their
// replies right-align, and the customer name as the header title.
function formatTime(ts) {
  if (!ts) return "";
  const then = new Date(ts);
  const now = new Date();
  const diffMins = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString();
}

export default function BusinessMessages() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id;

  const { data: threads, isLoading, isError, refetch } = useProviderThreads(providerId);
  const { data: myProfileId } = useMyProfileId();
  const list = threads ?? [];

  const openThread = (thread) => {
    router.push({
      pathname: "/provider-chat",
      params: {
        threadId: String(thread.id),
        title: thread.owner_name || t("business.messages.customer"),
        // On the provider side the current user is the STAFF member, not the owner — pass their
        // own profile id so provider-chat right-aligns their replies. ownerUserId is the customer.
        meUserId: myProfileId != null ? String(myProfileId) : "",
        ownerUserId: thread.owner_user_id != null ? String(thread.owner_user_id) : "",
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <BusinessHeader
        businessName={activeProvider?.name || t("business.home.fallbackName")}
        logoUri={activeProvider?.logo_url}
        title={t("business.messages.title")}
      />

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError ? (
        <View style={{ alignItems: "center", paddingVertical: SPACING.huge }}>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}>
            {t("business.messages.loadError")}
          </Text>
          <PressableScale
            onPress={() => refetch()}
            accessibilityRole="button"
            testID="business-messages-retry"
            style={{
              backgroundColor: COLORS.coral,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.xl,
              paddingVertical: SPACING.sm,
            }}
          >
            <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
              {t("business.messages.retry")}
            </Text>
          </PressableScale>
        </View>
      ) : list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
          <MessageSquare size={40} color={COLORS.mutedBrown} />
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown, marginTop: SPACING.md }]}>
            {t("business.messages.emptyTitle")}
          </Text>
          <Text
            style={[
              TYPE.subhead,
              { fontWeight: "500", color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
            ]}
          >
            {t("business.messages.emptyBody")}
          </Text>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        >
          {list.map((thread) => {
            const unread = Number(thread.unread_count ?? 0) > 0;
            return (
              <PressableScale
                key={thread.id}
                onPress={() => openThread(thread)}
                accessibilityRole="button"
                testID={`business-thread-${thread.id}`}
                style={{ marginBottom: SPACING.md }}
              >
                <Card
                  level="sm"
                  radius={RADIUS.card}
                  borderColor={unread ? COLORS.coral : MATERIALS.hairline}
                  style={{ padding: SPACING.md, flexDirection: "row", gap: SPACING.md }}
                >
                  {thread.owner_avatar_url ? (
                    <Image
                      source={{ uri: thread.owner_avatar_url }}
                      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.sand }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: COLORS.sand,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <User size={22} color={COLORS.coral} />
                    </View>
                  )}
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text
                        style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {thread.owner_name || t("business.messages.customer")}
                      </Text>
                      <Text style={[TYPE.caption, { letterSpacing: 0, fontWeight: "500", color: COLORS.mutedBrown }]}>
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
                            color: unread ? COLORS.warmBrown : COLORS.mutedBrown,
                            fontWeight: unread ? "700" : "400",
                            flex: 1,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {thread.last_message_body ||
                          (thread.last_message_attachment_url
                            ? t("business.messages.photo")
                            : t("business.messages.noMessages"))}
                      </Text>
                      {unread ? (
                        <View
                          testID={`business-thread-unread-${thread.id}`}
                          style={{
                            backgroundColor: COLORS.coral,
                            borderRadius: 10,
                            minWidth: 20,
                            paddingHorizontal: SPACING.xs,
                            paddingVertical: 2,
                            alignItems: "center",
                          }}
                        >
                          <Text style={[TYPE.caption, { letterSpacing: 0, color: "#FFF", fontWeight: "800" }]}>
                            {thread.unread_count}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Card>
              </PressableScale>
            );
          })}
        </RefreshableScrollView>
      )}
    </View>
  );
}
