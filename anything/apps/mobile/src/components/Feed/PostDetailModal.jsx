import React, { memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PawPrint, Megaphone, Share2, Trash2, X } from "lucide-react-native";
import { COLORS, TAG_COLORS } from "@/constants/colors";
import { usePostBarks } from "@/hooks/useFeedPosts";
import { PetAvatar } from "@/components/Pets/PetAvatar";

const { width: SCREEN_W } = Dimensions.get("window");

export const PostDetailModal = memo(function PostDetailModal({
  visible,
  post,
  liked,
  canDelete = false,
  onDelete,
  onClose,
  onToggleLike,
  onOpenBarks,
  onOpenProfile,
}) {
  const insets = useSafeAreaInsets();

  // Real bark thread for this post, scoped by post.id (same hook the BarkModal
  // uses). Called before the early return so hook order stays stable.
  const { data: barks = [], isLoading: loadingBarks } = usePostBarks(post?.id);

  if (!post) return null;

  // Read the real DB post fields, mirroring PostCard so the viewer matches the
  // feed card exactly (same paw/bark counts). Old denormalized names are kept
  // only as a compatibility fallback — no mock store, no placeholder images.
  const dogName = post.pet_name || post.dogName;
  const petHandle = post.pet_handle;
  const ownerName = post.username || post.ownerName;
  const avatar = post.pet_avatar || post.avatar;
  const photo = post.image_url || post.photo;
  const caption = post.caption;
  const timestamp = post.timestamp || "Just now";
  const pawsCount = post.paw_count ?? post.paws ?? 0;
  const barksCount = post.bark_count ?? post.barks ?? 0;
  const tag = post.is_daily_update ? "Daily moment" : post.tag || "Moment";

  const tagStyle = TAG_COLORS[tag] || {
    bg: COLORS.peach,
    text: COLORS.terracotta,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: COLORS.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text
            style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
          >
            Pet moment
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            {canDelete ? (
              <TouchableOpacity onPress={onDelete} accessibilityLabel="Delete post">
                <Trash2 size={20} color={COLORS.coral} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity>
              <Share2 size={20} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          {/* Avatar + name row */}
          <TouchableOpacity
            onPress={onOpenProfile}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Image
                source={{ uri: avatar }}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  borderWidth: 2.5,
                  borderColor: COLORS.coral,
                }}
              />
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
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
                  by {ownerName} · {timestamp}
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: tagStyle.bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
              }}
            >
              <Text
                style={{
                  color: tagStyle.text,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {tag}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Photo */}
          <Image
            source={{ uri: photo }}
            style={{ width: SCREEN_W, height: SCREEN_W }}
            resizeMode="cover"
          />

          {/* Caption */}
          <View style={{ padding: 18 }}>
            <Text
              style={{
                fontSize: 15,
                color: COLORS.warmBrown,
                lineHeight: 23,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontWeight: "800" }}>{dogName} </Text>
              {caption}
            </Text>

            {/* Action row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: COLORS.peach,
                gap: 22,
              }}
            >
              <TouchableOpacity
                onPress={onToggleLike}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <PawPrint
                  size={24}
                  color={liked ? COLORS.coral : COLORS.mutedBrown}
                  fill={liked ? COLORS.coral : "none"}
                />
                <Text
                  style={{
                    fontWeight: "700",
                    color: liked ? COLORS.coral : COLORS.mutedBrown,
                    fontSize: 14,
                  }}
                >
                  {pawsCount} paws
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onOpenBarks}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Megaphone size={22} color={COLORS.mutedBrown} />
                <Text
                  style={{
                    fontWeight: "700",
                    color: COLORS.mutedBrown,
                    fontSize: 14,
                  }}
                >
                  {barksCount} barks
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Comment previews */}
          <View
            style={{
              paddingHorizontal: 18,
              borderTopWidth: 1,
              borderTopColor: COLORS.peach,
              paddingTop: 16,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: COLORS.warmBrown,
                marginBottom: 14,
              }}
            >
              Barks ({barksCount})
            </Text>
            {loadingBarks ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={COLORS.coral} />
              </View>
            ) : barks.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <Text style={{ fontSize: 28 }}>🐾</Text>
                <Text
                  style={{
                    color: COLORS.mutedBrown,
                    fontSize: 13,
                    fontWeight: "600",
                    marginTop: 8,
                  }}
                >
                  No barks yet
                </Text>
              </View>
            ) : (
              barks.map((bark) => (
                <View
                  key={bark.id}
                  style={{
                    flexDirection: "row",
                    marginBottom: 14,
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <PetAvatar uri={bark.pet_avatar_url} size={32} />
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.card,
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: COLORS.peach,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: COLORS.coral,
                        marginBottom: 3,
                      }}
                    >
                      {bark.pet_handle ? `@${bark.pet_handle}` : bark.username}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: COLORS.warmBrown,
                        lineHeight: 19,
                      }}
                    >
                      {bark.text}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              onPress={onOpenBarks}
              style={{
                borderRadius: 16,
                padding: 14,
                backgroundColor: COLORS.sand,
                alignItems: "center",
                borderWidth: 1,
                borderColor: COLORS.peach,
                marginTop: 4,
              }}
            >
              <Text
                style={{ color: COLORS.coral, fontWeight: "700", fontSize: 14 }}
              >
                Add a bark 🐾
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});
