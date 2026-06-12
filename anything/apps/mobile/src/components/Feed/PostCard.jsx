import React, { memo } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { PawPrint, Megaphone, Share2 } from "lucide-react-native";
import { COLORS, TAG_COLORS } from "@/constants/colors";
import { useTogglePaw } from "@/hooks/useFeedPosts";

export const PostCard = memo(function PostCard({
  post,
  liked,
  locked,
  onToggleLike,
  onOpenBarks,
  onOpenDetail,
  onOpenProfile,
}) {
  const togglePawMutation = useTogglePaw(post.id);

  const handlePawPress = async () => {
    if (locked) return;

    try {
      await togglePawMutation.mutateAsync({ isPawed: liked });
      // Success - mutation handles optimistic update
    } catch (error) {
      console.error("Error toggling paw:", error);
      Alert.alert("Error", "Could not save. Please try again.");
    }
  };

  const tagStyle = TAG_COLORS[post.tag] || {
    bg: COLORS.peach,
    text: COLORS.terracotta,
  };

  // Use database fields with fallback to old fields for compatibility
  const dogName = post.pet_name || post.dogName;
  const petHandle = post.pet_handle;
  const ownerName = post.username || post.ownerName;
  const avatar = post.pet_avatar || post.avatar;
  const photo = post.image_url || post.photo;
  const pawsCount = post.paw_count ?? post.paws ?? 0;
  const barksCount = post.bark_count ?? post.barks ?? 0;
  const tag = post.is_daily_update ? "Daily moment" : post.tag || "Moment";

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      {/* Header */}
      <TouchableOpacity
        onPress={locked ? undefined : onOpenProfile}
        activeOpacity={locked ? 1 : 0.8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              borderWidth: 2.5,
              borderColor: COLORS.coral,
              borderRadius: 24,
              marginRight: 10,
            }}
          >
            <Image
              source={{ uri: avatar }}
              style={{ width: 42, height: 42, borderRadius: 21 }}
            />
          </View>
          <View>
            <Text
              style={{
                fontWeight: "800",
                fontSize: 15,
                color: COLORS.warmBrown,
              }}
            >
              {dogName}
            </Text>
            {petHandle ? (
              <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
                @{petHandle}
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
              by {ownerName}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View
            style={{
              backgroundColor: tagStyle.bg,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
            }}
          >
            <Text
              style={{ color: tagStyle.text, fontSize: 11, fontWeight: "700" }}
            >
              {tag}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
            {post.timestamp || "Just now"}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Photo */}
      <TouchableOpacity
        onPress={locked ? undefined : onOpenDetail}
        activeOpacity={locked ? 1 : 0.95}
      >
        <Image
          source={{ uri: photo }}
          style={{ width: "100%", height: 340 }}
          resizeMode="cover"
        />
      </TouchableOpacity>

      {/* Caption + Actions */}
      <View style={{ padding: 14 }}>
        {post.caption && (
          <TouchableOpacity
            onPress={locked ? undefined : onOpenDetail}
            activeOpacity={locked ? 1 : 0.8}
          >
            <Text
              style={{
                fontSize: 14,
                color: COLORS.warmBrown,
                lineHeight: 21,
                marginBottom: 14,
              }}
              numberOfLines={2}
            >
              <Text style={{ fontWeight: "800" }}>{dogName} </Text>
              {post.caption}
            </Text>
          </TouchableOpacity>
        )}

        {/* Action Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: post.caption ? 12 : 0,
            borderTopWidth: post.caption ? 1 : 0,
            borderTopColor: COLORS.peach,
            gap: 20,
          }}
        >
          <TouchableOpacity
            onPress={handlePawPress}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            disabled={locked || togglePawMutation.isPending}
          >
            <PawPrint
              size={22}
              color={liked && !locked ? COLORS.coral : COLORS.mutedBrown}
              fill={liked && !locked ? COLORS.coral : "none"}
            />
            <Text
              style={{
                fontWeight: "700",
                color: liked && !locked ? COLORS.coral : COLORS.mutedBrown,
                fontSize: 13,
              }}
            >
              {pawsCount} paws
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={locked ? undefined : onOpenBarks}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            disabled={locked}
          >
            <Megaphone size={20} color={COLORS.mutedBrown} />
            <Text
              style={{
                fontWeight: "700",
                color: COLORS.mutedBrown,
                fontSize: 13,
              }}
            >
              {barksCount} barks
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity disabled={locked}>
            <Share2
              size={20}
              color={locked ? COLORS.peach : COLORS.mutedBrown}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
