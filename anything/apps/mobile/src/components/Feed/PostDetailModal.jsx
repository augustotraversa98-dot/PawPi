import React, { memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PawPrint, Megaphone, Share2, X } from "lucide-react-native";
import { COLORS, TAG_COLORS } from "@/constants/colors";

const { width: SCREEN_W } = Dimensions.get("window");

export const PostDetailModal = memo(function PostDetailModal({
  visible,
  post,
  liked,
  onClose,
  onToggleLike,
  onOpenBarks,
  onOpenProfile,
}) {
  const insets = useSafeAreaInsets();
  if (!post) return null;

  const tagStyle = TAG_COLORS[post.tag] || {
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
          <TouchableOpacity>
            <Share2 size={20} color={COLORS.mutedBrown} />
          </TouchableOpacity>
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
                source={{ uri: post.avatar }}
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
                  {post.dogName}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
                  by {post.ownerName} · {post.timestamp}
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
                {post.tag}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Photo */}
          <Image
            source={{ uri: post.photo }}
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
              <Text style={{ fontWeight: "800" }}>{post.dogName} </Text>
              {post.caption}
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
                  {post.paws} paws
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
                  {post.barks} barks
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
              Barks ({post.comments?.length || 0})
            </Text>
            {(post.comments || []).map((c) => (
              <View
                key={c.id}
                style={{
                  flexDirection: "row",
                  marginBottom: 14,
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <Image
                  source={{ uri: c.authorAvatar }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    flexShrink: 0,
                  }}
                />
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
                    {c.author}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: COLORS.warmBrown,
                      lineHeight: 19,
                    }}
                  >
                    {c.text}
                  </Text>
                </View>
              </View>
            ))}
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
