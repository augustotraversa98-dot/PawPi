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
import { useTranslation } from "react-i18next";
import { PawPrint, Megaphone, Trash2, X, Pencil } from "lucide-react-native";
import {
  COLORS,
  TAG_COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { usePostBarks } from "@/hooks/useFeedPosts";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { DailyShareButton } from "./DailyShareButton";
import { PawablePhoto } from "./PawablePhoto";
import { FeedVideo } from "./FeedVideo";
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
  const { t } = useTranslation();

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
  // Daily video moments (step 4): play video posts inline (poster + tap-to-play),
  // like the unlocked feed card. Image posts are unchanged.
  const isVideo = post.media_type === "video";
  const videoUri = post.video_url;
  const posterUri = post.video_thumbnail_url;
  const caption = post.caption;
  // Real relative time from created_at (ticket 2.38; A2b) — localized, and honest when
  // absent (empty string renders nothing rather than a fabricated "just now").
  const timestamp = formatRelativeTime(post.created_at, { t });
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
  const hasCaption = !!(displayCaption && String(displayCaption).trim());
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
      Alert.alert(t("feed.saveFailedTitle"), t("feed.saveFailedBody"));
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
          <PressableScale onPress={onClose} accessibilityRole="button">
            <X size={22} color={COLORS.mutedBrown} />
          </PressableScale>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            Pet moment
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.lg }}>
            {canDelete ? (
              <PressableScale onPress={onDelete} accessibilityLabel="Delete post" accessibilityRole="button">
                <Trash2 size={20} color={COLORS.coral} />
              </PressableScale>
            ) : null}
            {/* Real share: reuses the 2.28 branded capture + system share sheet. */}
            <DailyShareButton petName={dogName} photoUri={photo} />
            {/* Report/Block (T4) — only on someone else's post (own post shows Delete above). */}
            <ModerationMenu
              targetType="post"
              targetId={post?.id}
              authorUserId={post?.user_id}
              isOwn={canDelete}
            />
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
                <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
                  {dogName}
                </Text>
                {petHandle ? (
                  <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                    @{petHandle}
                  </Text>
                ) : null}
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  by {ownerName} · {timestamp}
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: tagStyle.bg,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.xs,
                borderRadius: RADIUS.chip,
              }}
            >
              <Text style={[TYPE.caption, { color: tagStyle.text }]}>
                {tag}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Media — double tap gives a Paw (2.64). Video posts play inline
              (poster + tap-to-play); image posts render exactly as before. */}
          {isVideo ? (
            <FeedVideo
              testID="detail-post-video"
              videoUri={videoUri}
              posterUri={posterUri}
              onDoubleTap={handleDoubleTapPaw}
              style={{ width: SCREEN_W, height: SCREEN_W }}
            />
          ) : (
            <PawablePhoto
              testID="detail-post-photo"
              photoUri={photo}
              onDoubleTap={handleDoubleTapPaw}
              style={{ width: SCREEN_W, height: SCREEN_W }}
            />
          )}

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
                  placeholder={t("feed.captionPlaceholder")}
                  placeholderTextColor={COLORS.mutedBrown}
                  style={[
                    TYPE.body,
                    {
                      minHeight: 72,
                      backgroundColor: COLORS.card,
                      borderRadius: RADIUS.sm,
                      borderWidth: 1.5,
                      borderColor: MATERIALS.hairline,
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      color: COLORS.warmBrown,
                      textAlignVertical: "top",
                    },
                  ]}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: SPACING.lg,
                    marginTop: SPACING.sm,
                  }}
                >
                  <PressableScale
                    testID="cancel-caption"
                    onPress={() => setEditing(false)}
                    disabled={savingCaption}
                    accessibilityRole="button"
                  >
                    <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.mutedBrown }]}>
                      Cancel
                    </Text>
                  </PressableScale>
                  <PressableScale
                    testID="save-caption"
                    onPress={saveEditCaption}
                    disabled={savingCaption}
                    accessibilityRole="button"
                  >
                    <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.coral }]}>
                      {savingCaption ? "Saving…" : "Save"}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            ) : hasCaption ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <Text style={[TYPE.body, { flex: 1, color: COLORS.warmBrown, lineHeight: 23 }]}>
                  <Text style={{ fontWeight: "800" }}>{dogName} </Text>
                  {displayCaption}
                </Text>
                {canEditCaption ? (
                  <PressableScale
                    testID="edit-caption"
                    onPress={startEditCaption}
                    accessibilityLabel="Edit caption"
                    accessibilityRole="button"
                    style={{ paddingLeft: SPACING.sm, paddingTop: 2 }}
                  >
                    <Pencil size={16} color={COLORS.mutedBrown} />
                  </PressableScale>
                ) : null}
              </View>
            ) : canEditCaption ? (
              // Empty caption + owner: an explicit "Add a caption" affordance that
              // opens the same 2.65 editor. Without this an empty-caption post had
              // no discoverable way to ADD a caption (only a tiny inline pencil).
              <PressableScale
                testID="add-caption"
                onPress={startEditCaption}
                accessibilityLabel="Add caption"
                accessibilityRole="button"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                  marginBottom: 16,
                }}
              >
                <Pencil size={16} color={COLORS.coral} />
                <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "700" }]}>
                  Add a caption ✍️
                </Text>
              </PressableScale>
            ) : null}

            {/* Action row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingTop: SPACING.md,
                borderTopWidth: 1,
                borderTopColor: MATERIALS.hairline,
                gap: SPACING.xl,
              }}
            >
              <PressableScale
                onPress={onToggleLike}
                accessibilityRole="button"
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <PawPrint
                  size={24}
                  color={liked ? COLORS.coral : COLORS.mutedBrown}
                  fill={liked ? COLORS.coral : "none"}
                />
                <Text
                  style={[
                    TYPE.callout,
                    { fontWeight: "700", color: liked ? COLORS.coral : COLORS.mutedBrown },
                  ]}
                >
                  {pawsCount} paws
                </Text>
              </PressableScale>

              <PressableScale
                onPress={onOpenBarks}
                accessibilityRole="button"
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Megaphone size={22} color={COLORS.mutedBrown} />
                <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.mutedBrown }]}>
                  {barksCount} barks
                </Text>
              </PressableScale>
            </View>
          </View>

          {/* Comment previews */}
          <View
            style={{
              paddingHorizontal: SPACING.lg,
              borderTopWidth: 1,
              borderTopColor: MATERIALS.hairline,
              paddingTop: SPACING.lg,
            }}
          >
            <Text style={[TYPE.callout, { fontWeight: "800", color: COLORS.warmBrown, marginBottom: SPACING.md }]}>
              Barks ({barksCount})
            </Text>
            {loadingBarks ? (
              <View style={{ alignItems: "center", paddingVertical: SPACING.xl }}>
                <ActivityIndicator size="small" color={COLORS.coral} />
              </View>
            ) : barks.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: SPACING.xl }}>
                <Text style={{ fontSize: 28 }}>🐾</Text>
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, marginTop: SPACING.sm }]}>
                  No barks yet
                </Text>
              </View>
            ) : (
              barks.map((bark) => (
                <View
                  key={bark.id}
                  style={{
                    flexDirection: "row",
                    marginBottom: SPACING.md,
                    gap: SPACING.sm,
                    alignItems: "flex-start",
                  }}
                >
                  <PetAvatar uri={bark.pet_avatar_url} size={32} />
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.card,
                      borderRadius: RADIUS.sm,
                      padding: SPACING.md,
                      borderWidth: 1,
                      borderColor: MATERIALS.hairline,
                    }}
                  >
                    <Text style={[TYPE.footnote, { fontWeight: "800", color: COLORS.coral, marginBottom: 3 }]}>
                      {bark.pet_handle ? `@${bark.pet_handle}` : bark.username}
                    </Text>
                    <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "500", lineHeight: 19 }]}>
                      {bark.text}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <PressableScale
              onPress={onOpenBarks}
              accessibilityRole="button"
              style={{
                borderRadius: RADIUS.control,
                padding: SPACING.md,
                backgroundColor: COLORS.sand,
                alignItems: "center",
                borderWidth: 1,
                borderColor: MATERIALS.hairline,
                marginTop: SPACING.xs,
              }}
            >
              <Text style={[TYPE.callout, { color: COLORS.coral, fontWeight: "700" }]}>
                Add a bark 🐾
              </Text>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});
