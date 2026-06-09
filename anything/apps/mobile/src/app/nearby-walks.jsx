import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  Calendar,
  Send,
  X,
} from "lucide-react-native";
import { useSocialWalks, useJoinSocialWalk } from "@/hooks/useSocialWalks";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function NearbyWalksPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const {
    data: nearbyWalks,
    isLoading,
    refetch: refetchNearbyWalks,
  } = useSocialWalks("nearby_pets");
  const [selectedWalk, setSelectedWalk] = useState(null);
  const [joinMessage, setJoinMessage] = useState("");
  const joinMutation = useJoinSocialWalk();

  const handleJoinRequest = () => {
    if (!currentPet?.id || !selectedWalk) return;

    joinMutation.mutate(
      {
        socialWalkId: selectedWalk.id,
        petId: currentPet.id,
        message: joinMessage.trim() || null,
      },
      {
        onSuccess: () => {
          setSelectedWalk(null);
          setJoinMessage("");
        },
      },
    );
  };

  const formatWalkDate = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };

  const formatWalkTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getSpotsAvailable = (walk) => {
    const taken = parseInt(walk.approved_participants_count || 0) + 1; // +1 for host
    const max = walk.max_pets || 4;
    return max - taken;
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.cream,
        paddingTop: insets.top,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: C.sand,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <ArrowLeft size={18} color={C.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
            Nearby Walks
          </Text>
          <Text style={{ fontSize: 13, color: C.mutedBrown }}>
            Join walks in your area
          </Text>
        </View>
      </View>

      {/* Content */}
      <RefreshableScrollView
        refetch={refetchNearbyWalks}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={C.sage} />
          </View>
        )}

        {!isLoading && nearbyWalks && nearbyWalks.length === 0 && (
          <View
            style={{
              backgroundColor: C.sand,
              borderRadius: 16,
              padding: 24,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 32, marginBottom: 12 }}>🐕</Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              No walks nearby
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textAlign: "center",
              }}
            >
              Check back later or create your own social walk
            </Text>
          </View>
        )}

        {!isLoading &&
          nearbyWalks &&
          nearbyWalks.map((walk) => {
            const spotsAvailable = getSpotsAvailable(walk);
            const isFull = spotsAvailable <= 0;

            return (
              <View
                key={walk.id}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                  marginBottom: 16,
                  shadowColor: C.terracotta,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                {/* Walk Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: C.sage + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>🚶</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: C.warmBrown,
                        marginBottom: 2,
                      }}
                    >
                      {walk.walk_name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        fontWeight: "600",
                      }}
                    >
                      Hosted by {walk.owner_username || "Unknown"}
                    </Text>
                  </View>
                  {isFull && (
                    <View
                      style={{
                        backgroundColor: C.mutedBrown + "20",
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: C.mutedBrown,
                        }}
                      >
                        FULL
                      </Text>
                    </View>
                  )}
                </View>

                {/* Walk Details */}
                <View style={{ gap: 8, marginBottom: 14 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Calendar size={14} color={C.coral} />
                    <Text
                      style={{
                        fontSize: 13,
                        color: C.warmBrown,
                        fontWeight: "600",
                      }}
                    >
                      {formatWalkDate(walk.scheduled_at)} at{" "}
                      {formatWalkTime(walk.scheduled_at)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Clock size={14} color={C.coral} />
                    <Text style={{ fontSize: 13, color: C.warmBrown }}>
                      {walk.duration_minutes || 30} min ·{" "}
                      {walk.pace || "Normal"} pace
                    </Text>
                  </View>

                  {walk.meeting_area && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <MapPin size={14} color={C.coral} />
                      <Text style={{ fontSize: 13, color: C.warmBrown }}>
                        {walk.meeting_area}
                      </Text>
                    </View>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Users size={14} color={C.coral} />
                    <Text style={{ fontSize: 13, color: C.warmBrown }}>
                      {spotsAvailable} spot{spotsAvailable !== 1 ? "s" : ""}{" "}
                      available
                    </Text>
                  </View>
                </View>

                {/* Notes for guests */}
                {walk.notes_for_guests && (
                  <View
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.mutedBrown,
                        lineHeight: 17,
                      }}
                    >
                      "{walk.notes_for_guests}"
                    </Text>
                  </View>
                )}

                {/* Join Button */}
                <TouchableOpacity
                  onPress={() => setSelectedWalk(walk)}
                  disabled={isFull}
                  style={{
                    backgroundColor: isFull ? C.sand : C.sage,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: isFull ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: isFull ? C.mutedBrown : "#FFF",
                    }}
                  >
                    {isFull
                      ? "Walk is full"
                      : walk.approval_required
                        ? "Request to join"
                        : "Join walk"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
      </RefreshableScrollView>

      {/* Join Request Modal */}
      <Modal
        visible={!!selectedWalk}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedWalk(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: C.cream,
            paddingTop: insets.top,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              Request to join
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedWalk(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={18} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 20,
              paddingBottom: insets.bottom + 20,
            }}
          >
            {selectedWalk && (
              <>
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: C.peach,
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 12,
                    }}
                  >
                    {selectedWalk.walk_name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: C.mutedBrown,
                      lineHeight: 19,
                    }}
                  >
                    {formatWalkDate(selectedWalk.scheduled_at)} at{" "}
                    {formatWalkTime(selectedWalk.scheduled_at)}
                    {"\n"}
                    {selectedWalk.duration_minutes || 30} min ·{" "}
                    {selectedWalk.pace || "Normal"} pace
                    {"\n"}
                    {selectedWalk.meeting_area || "Location TBD"}
                  </Text>
                </View>

                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.warmBrown,
                      marginBottom: 8,
                    }}
                  >
                    Message (optional)
                  </Text>
                  <TextInput
                    value={joinMessage}
                    onChangeText={setJoinMessage}
                    placeholder="Say hello..."
                    placeholderTextColor={C.mutedBrown + "80"}
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 14,
                      color: C.warmBrown,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      textAlignVertical: "top",
                      minHeight: 80,
                    }}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleJoinRequest}
                  disabled={joinMutation.isPending}
                  style={{
                    backgroundColor: joinMutation.isPending
                      ? C.mutedBrown
                      : C.coral,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                    opacity: joinMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {joinMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Send size={18} color="#FFF" />
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "800",
                          color: "#FFF",
                        }}
                      >
                        Send Request
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <View
                  style={{
                    backgroundColor: C.sand,
                    borderRadius: 12,
                    padding: 14,
                    marginTop: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                      textAlign: "center",
                    }}
                  >
                    The walk owner will review your request. You'll receive a
                    notification with the exact meeting location if approved.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
