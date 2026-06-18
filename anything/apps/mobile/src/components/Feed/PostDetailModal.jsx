import React, { memo, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PawPrint, Megaphone, Trash2, X, Pencil } from "lucide-react-native";
import { COLORS, TAG_COLORS } from "@/constants/colors";
import { usePostBarks } from "@/hooks/useFeedPosts";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { DailyShareButton } from "./DailyShareButton";
import { PawablePhoto } from "./PawablePhoto";
import { formatRelativeTime } from "@/utils/relativeTime";

const { width: SCREEN_W } = Dimensions.get("window");

export const PostDetailModal = memo(function PostDetailModal({
  visible,
  post,
  liked,
  canDelete = false,
  canEdit = false,
  onDelete,
  onClose,
  onToggleLike,
  onOpenBarks,
  onOpenProfile,
  onSaveCaption,
}) {
  const insets = useSafeAreaInsets();

  // Real bark thread for this post, scoped by post.id (same hook the BarkModal
  // uses). Called before the early return so hook order stays stable.
  const { data: barks = [], isLoading: loadingBarks } = usePostBarks(post?.id);

  // Caption edit state (ticket 2.65). localCaption holds the just-saved text so
  // the modal reflects the edit immediately even before the feed cache refreshes.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  const [localCaption, setLocalCaption] = useState(null);

  useEffect(() => {
    // Reset edit state whenever we open a different post.
    setEditing(false);
    setLocalCaption(null);
  }, [post?.id]);

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
  // Real relative time from created_at (ticket 2.38) — no more fake "Just now".
  const timestamp =
    formatRelativeTime(post.created_at) || post.timestamp || "just now";
  const pawsCount = post.paw_count ?? post.paws ?? 0;
  const barksCount = post.bark_count ?? post.barks ?? 0;
  const tag = post.is_daily_update ? "Daily moment" : post.tag || "Moment";

  // Double-tap the photo to Paw (ticket 2.64): paw only when not already pawed
  // (never un-paws on double-tap); reuses the same toggle the paw button uses so
  // the button + count stay in sync.
  const handleDoubleTapPaw = () => {
    if (!liked && onToggleLike) onToggleLike();
  };

  // Edit-my-caption (ticket 2.65): shown only on the owner's own post (same
  // signal as delete) and when a save handler is wired. Text only.
  const displayCaption = localCaption ?? caption;
  const canEditCaption = canEdit && typeof onSaveCaption === "function";

  const startEditCaption = () => {
    setDraft(displayCaption ?? "");
    setEditing(true);
  };

  const saveEditCaption = async () => {
    const next = draft;
    setSavingCaption(true);
    try {
      await onSaveCaption(next);
      setLocalCaption(next);
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSavingCaption(false);
    }
  };

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
            {/* Real share: reuses the 2.28 branded capture + system share sheet. */}
            <DailyShareButton petName={dogName} photoUri={photo} />
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
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  borderWidth: 2.5,
                  borderColor: COLORS.coral,
                  overflow: "hidden",
                }}
              >
                <PetAvatar uri={avatar || undefined} name={dogName} size={41} />
              </View>
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

          {/* Photo — double tap gives a Paw (2.64) */}
          <PawablePhoto
            testID="detail-post-photo"
            photoUri={photo}
            onDoubleTap={handleDoubleTapPaw}
            style={{ width: SCREEN_W, height: SCREEN_W }}
          />

          {/* Caption */}
          <View style={{ padding: 18 }}>
            {editing ? (
              <View style={{ marginBottom: 16 }}>
                <TextInput
                  testID="edit-caption-input"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={2000}
                  placeholder="Write a caption…"
                  placeholderTextColor={COLORS.mutedBrown}
                  style={{
                    minHeight: 72,
                    backgroundColor: COLORS.card,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: COLORS.peach,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 15,
                    color: COLORS.warmBrown,
                    textAlignVertical: "top",
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 18,
                    marginTop: 10,
                  }}
                >
                  <TouchableOpacity
                    testID="cancel-caption"
                    onPress={() => setEditing(false)}
                    disabled={savingCaption}
                  >
                    <Text style={{ fontWeight: "700", color: COLORS.mutedBrown }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="save-caption"
                    onPress={saveEditCaption}
                    disabled={savingCaption}
                  >
                    <Text style={{ fontWeight: "800", color: COLORS.coral }}>
                      {savingCaption ? "Saving…" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    color: COLORS.warmBrown,
                    lineHeight: 23,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>{dogName} </Text>
                  {displayCaption}
                </Text>
                {canEditCaption ? (
                  <TouchableOpacity
                    testID="edit-caption"
                    onPress={startEditCaption}
                    accessibilityLabel="Edit caption"
                    style={{ paddingLeft: 10, paddingTop: 2 }}
                  >
                    <Pencil size={16} color={COLORS.mutedBrown} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

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
