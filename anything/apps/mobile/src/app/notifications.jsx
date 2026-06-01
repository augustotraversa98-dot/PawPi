import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Bell,
  PawPrint,
  Megaphone,
  MapPin,
  Utensils,
  Target,
  ChevronRight,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import useSocialPetStore from "@/store/socialPetStore";
import {
  handleNotificationTap,
  getNotificationDisplayInfo,
} from "@/utils/handleNotificationTap";
import { mockNotifications } from "@/data/mockNotificationsData";

const FILTER_OPTIONS = ["All", "Walks", "Feeding", "Paws", "Barks", "Training"];

const NotificationIcon = ({ type }) => {
  switch (type) {
    case "walk":
      return <MapPin size={18} color={COLORS.sage} />;
    case "feeding":
      return <Utensils size={18} color={COLORS.coral} />;
    case "paw":
      return <PawPrint size={18} color={COLORS.coral} fill={COLORS.coral} />;
    case "bark":
      return <Megaphone size={18} color={COLORS.terracotta} />;
    case "training":
      return <Target size={18} color={COLORS.sageDark} />;
    default:
      return <Bell size={18} color={COLORS.mutedBrown} />;
  }
};

const formatTimestamp = (timestamp) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState("All");

  const notifications = useSocialPetStore((state) => state.notifications);
  const markNotificationRead = useSocialPetStore(
    (state) => state.markNotificationRead,
  );
  const markAllNotificationsRead = useSocialPetStore(
    (state) => state.markAllNotificationsRead,
  );

  // Load mock notifications on first render
  useEffect(() => {
    if (notifications.length === 0) {
      const store = useSocialPetStore.getState();
      mockNotifications.forEach((notif) => {
        store.addNotification(notif);
      });
    }
  }, []);

  // Filter notifications
  const filteredNotifications = notifications.filter((notif) => {
    if (selectedFilter === "All") return true;
    const typeMap = {
      Walks: "walk",
      Feeding: "feeding",
      Paws: "paw",
      Barks: "bark",
      Training: "training",
    };
    return notif.type === typeMap[selectedFilter];
  });

  const handleNotifTap = (notif) => {
    if (!notif.read) {
      markNotificationRead(notif.id);
    }

    // Handle reminder notifications with the utility
    if (notif.reminderId) {
      handleNotificationTap(notif);
    } else if (notif.relatedPostId) {
      router.back();
    } else if (notif.relatedWalkId) {
      router.back();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
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
            Notifications
          </Text>
          <TouchableOpacity onPress={markAllNotificationsRead}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: COLORS.coral,
              }}
            >
              Mark all read
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          gap: 10,
        }}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
          backgroundColor: COLORS.card,
        }}
      >
        {FILTER_OPTIONS.map((filter) => {
          const isSelected = selectedFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isSelected ? COLORS.coral : COLORS.sand,
                borderWidth: 1,
                borderColor: isSelected ? COLORS.coral : COLORS.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: isSelected ? "#FFF" : COLORS.mutedBrown,
                }}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Notifications list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {filteredNotifications.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 48 }}>🐾</Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: COLORS.warmBrown,
                marginTop: 16,
              }}
            >
              No new notifications yet
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
              Phoebe's world is quiet for now.
            </Text>
          </View>
        ) : (
          filteredNotifications.map((notif) => {
            const isReminder = !!notif.reminderId;
            const displayInfo = isReminder
              ? getNotificationDisplayInfo(notif)
              : null;

            return (
              <TouchableOpacity
                key={notif.id}
                onPress={() => handleNotifTap(notif)}
                style={{
                  marginHorizontal: 16,
                  marginTop: 12,
                  backgroundColor: notif.read ? COLORS.card : COLORS.sand,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: notif.read ? COLORS.peach : COLORS.coral,
                  shadowColor: notif.read ? "transparent" : COLORS.coral,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: notif.read ? 0 : 0.1,
                  shadowRadius: 8,
                  elevation: notif.read ? 0 : 2,
                }}
              >
                <View style={{ flexDirection: "row", gap: 14 }}>
                  {notif.avatar ? (
                    <Image
                      source={{ uri: notif.avatar }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: 2,
                        borderColor: COLORS.coral,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: displayInfo
                          ? displayInfo.color + "20"
                          : COLORS.peach,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>
                        {displayInfo ? (
                          displayInfo.icon
                        ) : (
                          <NotificationIcon type={notif.type} />
                        )}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: COLORS.warmBrown,
                          flex: 1,
                          marginRight: 8,
                        }}
                      >
                        {notif.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: COLORS.mutedBrown,
                        }}
                      >
                        {formatTimestamp(notif.timestamp)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: COLORS.mutedBrown,
                        lineHeight: 19,
                        marginBottom: isReminder && notif.actionLabel ? 10 : 0,
                      }}
                    >
                      {notif.message}
                    </Text>

                    {/* Action button for reminder notifications */}
                    {isReminder && notif.actionLabel && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: displayInfo?.color || COLORS.sage,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          alignSelf: "flex-start",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#FFF",
                            marginRight: 4,
                          }}
                        >
                          {notif.actionLabel}
                        </Text>
                        <ChevronRight size={14} color="#FFF" />
                      </View>
                    )}
                  </View>

                  {!notif.read && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: COLORS.coral,
                        position: "absolute",
                        top: 16,
                        right: 16,
                      }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
