import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Send,
  Trash2,
  PawPrint,
  MessageCircle,
  Store,
  X,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { useAuth } from "@/utils/auth/useAuth";
import { useMyProfileId } from "@/hooks/useUserProfile";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { formatRelativeTime } from "@/utils/relativeTime";
import { getProviderPost } from "@/utils/providerPostHandoff";
import {
  useProviderPostComments,
  useAddProviderPostComment,
  useDeleteProviderPostComment,
} from "@/hooks/useProviderPostComments";
import {
  useProviderPostPaw,
  useToggleProviderPostPaw,
} from "@/hooks/useProviderPostPaw";
import { PawablePhoto } from "@/components/Feed/PawablePhoto";
import { FeedVideo } from "@/components/Feed/FeedVideo";

const { width: SCREEN_W } = Dimensions.get("window");

// Provider-post DETAIL — the drill-in from a tappable storefront Posts tile. Mirrors the PET post
// detail (Feed/PostDetailModal): a business author row (logo + name + @handle + · time), the post
// image(s) FULL-WIDTH and tap-to-enlarge (not a thumbnail), the caption, an engagement row (paws +
// comments — paws stays 0 until ticket 2.94), then the comment list + composer. Guests read; a
// signed-in owner comments (unchanged flow). The rich post (incl. the business identity) is handed
// off in memory (ticket 2.88), so a cold deep-link degrades to comments-only, never a crash.

// Business author avatar: the provider logo, or a fallback tile.
function BusinessAvatar({ uri }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.sand }}
      />
    );
  }
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.sand,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Store size={22} color={COLORS.coral} />
    </View>
  );
}

function Avatar({ uri, name }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.sand }}
      />
    );
  }
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: COLORS.peach,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>{initial}</Text>
    </View>
  );
}

export default function ProviderPostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();

  const providerId = Array.isArray(params.providerId) ? params.providerId[0] : params.providerId;
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;

  const post = useMemo(() => {
    // Rich post handed off in memory (the primary path — keeps the nav URL clean; ticket 2.88).
    const fromStore = getProviderPost(providerId, postId);
    if (fromStore) return fromStore;
    // Fallback for any entry that still carries a legacy `post` JSON param (back-compat / cold
    // deep-link). Missing → null → comments-only, never a crash.
    const raw = Array.isArray(params.post) ? params.post[0] : params.post;
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [providerId, postId, params.post]);

  const { isAuthenticated, signIn } = useAuth();
  const { data: myProfileId } = useMyProfileId();
  // The active pet attributes the comment to that pet (name/@handle/avatar), like a pet-feed bark.
  const { data: currentPet } = useCurrentPet();
  const { data: comments = [], isLoading } = useProviderPostComments(providerId, postId);
  const addComment = useAddProviderPostComment(providerId, postId, currentPet?.id);
  const deleteComment = useDeleteProviderPostComment(providerId, postId);

  // Paws (ticket 2.94) — live count + is-pawed for the signed-in viewer; a guest skips the fetch
  // and sees the handoff's count / 0. The toggle is optimistic (see the hook).
  const { data: pawData } = useProviderPostPaw(providerId, postId, {
    enabled: isAuthenticated,
  });
  const togglePaw = useToggleProviderPostPaw(providerId, postId);

  const [text, setText] = useState("");

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || addComment.isPending) return;
    try {
      await addComment.mutateAsync(trimmed);
      setText("");
    } catch (e) {
      Alert.alert(t("storefront.comments.postError"), e?.message);
    }
  };

  const handleDelete = (comment) => {
    Alert.alert(
      t("storefront.comments.deleteConfirmTitle"),
      t("storefront.comments.deleteConfirmBody"),
      [
        { text: t("storefront.comments.cancel"), style: "cancel" },
        {
          text: t("storefront.comments.remove"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteComment.mutateAsync(comment.id);
            } catch (e) {
              Alert.alert(t("storefront.comments.deleteError"), e?.message);
            }
          },
        },
      ],
    );
  };

  const images = Array.isArray(post?.image_urls) ? post.image_urls : [];
  // A video moment renders the inline player instead of the image(s).
  const isVideoPost = post?.media_type === "video" && !!post?.video_url;

  // Rich-detail derivations (ticket 2.93). The business identity rides along in the handoff; a cold
  // deep-link (no stash) has none → the author row hides its name/handle but the post/comments still
  // render. Paws stays 0 until 2.94 lands the paw primitive.
  const [viewerUri, setViewerUri] = useState(null);
  const business = post?.business ?? null;
  // Paw state prefers the live query; falls back to whatever the handoff carried, else 0/false.
  const liked = pawData?.is_pawed ?? post?.is_pawed === true;
  const pawsCount = pawData?.paw_count ?? Number(post?.paw_count ?? 0);
  const commentCount = comments.length;
  const timestamp = post?.created_at ? formatRelativeTime(post.created_at, { t }) : "";

  // Tap the paw control → toggle (guest → sign-in). Optimistic + revert live in the hook.
  const handlePawPress = () => {
    if (!isAuthenticated) {
      signIn();
      return;
    }
    if (togglePaw.isPending) return;
    togglePaw.mutate({ isPawed: liked });
  };
  // Double-tap the image → ALWAYS paw (never un-paw), mirroring the pet feed (ticket 2.64). The
  // brand paw "pop" animation plays inside PawablePhoto regardless; we only fire the network paw
  // when not already pawed, so the count never double-counts.
  const handleDoubleTapPaw = () => {
    if (!isAuthenticated) {
      signIn();
      return;
    }
    if (liked || togglePaw.isPending) return;
    togglePaw.mutate({ isPawed: false });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
          backgroundColor: COLORS.card,
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text
          style={[TYPE.title2, { color: COLORS.warmBrown, flex: 1 }]}
          numberOfLines={1}
        >
          {t("storefront.social.postDetailTitle")}
        </Text>
        {/* Report / Block this post (Guideline 1.2) — moved here from the storefront card since
            the Posts grid tiles have no room for the menu. Hidden on the author's own post. */}
        {post && post.id != null ? (
          <ModerationMenu
            targetType="provider_post"
            targetId={post.id}
            authorUserId={post.author_user_id}
            isOwn={!!post.is_own}
            iconSize={20}
          />
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* The post — mirrors the pet post detail (author row → full-width media → caption →
              engagement row). */}
          {post ? (
            <View style={{ marginBottom: SPACING.lg }}>
              {/* Author row — the BUSINESS (logo + name + @handle + · time). */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm + 2,
                  marginBottom: SPACING.md,
                }}
              >
                <BusinessAvatar uri={business?.logo_url} />
                <View style={{ flex: 1 }}>
                  {business?.name ? (
                    <Text
                      style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
                      numberOfLines={1}
                    >
                      {business.name}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {business?.slug ? (
                      <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]}>
                        @{business.slug}
                      </Text>
                    ) : null}
                    {business?.slug && timestamp ? (
                      <Text style={{ color: COLORS.peach }}>·</Text>
                    ) : null}
                    {timestamp ? (
                      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>{timestamp}</Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Media — FULL-WIDTH (bleeds past the scroll padding). A video moment plays inline
                  (single tap play/pause, double tap Paw); images tap to enlarge. */}
              {isVideoPost ? (
                <View
                  style={{
                    marginHorizontal: -SPACING.xl,
                    marginBottom: post.body ? SPACING.md : 0,
                  }}
                >
                  <FeedVideo
                    testID="provider-post-video"
                    videoUri={post.video_url}
                    posterUri={post.video_thumbnail_url}
                    onDoubleTap={handleDoubleTapPaw}
                    style={{ width: SCREEN_W, height: SCREEN_W, backgroundColor: COLORS.sand }}
                  />
                </View>
              ) : images.length > 0 ? (
                <View
                  style={{
                    marginHorizontal: -SPACING.xl,
                    marginBottom: post.body ? SPACING.md : 0,
                  }}
                >
                  {images.map((uri, i) => (
                    <View key={`img-${i}`} style={{ marginTop: i === 0 ? 0 : 2 }}>
                      {/* Single tap enlarges; double tap gives a Paw (brand-color pop), reusing the
                          pet-feed PawablePhoto (ticket 2.64). */}
                      <PawablePhoto
                        testID="provider-post-image"
                        photoUri={uri}
                        onSingleTap={() => setViewerUri(uri)}
                        onDoubleTap={handleDoubleTapPaw}
                        style={{ width: SCREEN_W, height: SCREEN_W, backgroundColor: COLORS.sand }}
                        contentFit="cover"
                      />
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Caption — business name (bold) + body, like the pet caption. */}
              {post.body ? (
                <Text style={[TYPE.body, { color: COLORS.warmBrown, lineHeight: 23 }]}>
                  {business?.name ? (
                    <Text style={{ fontWeight: "800" }}>{business.name} </Text>
                  ) : null}
                  {post.body}
                </Text>
              ) : null}

              {/* Engagement row — paws (0 until ticket 2.94) + comments. */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.xl,
                  marginTop: SPACING.md,
                  paddingTop: SPACING.md,
                  borderTopWidth: 1,
                  borderTopColor: MATERIALS.hairline,
                }}
              >
                <TouchableOpacity
                  testID="provider-post-paw"
                  onPress={handlePawPress}
                  disabled={togglePaw.isPending}
                  accessibilityRole="button"
                  accessibilityState={{ selected: liked }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <PawPrint
                    size={22}
                    color={liked ? COLORS.coral : COLORS.mutedBrown}
                    fill={liked ? COLORS.coral : "transparent"}
                  />
                  <Text
                    style={[
                      TYPE.callout,
                      { fontWeight: "700", color: liked ? COLORS.coral : COLORS.mutedBrown },
                    ]}
                  >
                    {pawsCount} {t("storefront.social.paws")}
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MessageCircle size={20} color={COLORS.mutedBrown} />
                  <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.mutedBrown }]}>
                    {commentCount === 1
                      ? t("storefront.comments.countOne", { count: commentCount })
                      : t("storefront.comments.countOther", { count: commentCount })}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Comments header */}
          <Text
            style={[
              TYPE.headline,
              { color: COLORS.warmBrown, marginBottom: SPACING.md },
            ]}
          >
            {t("storefront.comments.title")}
          </Text>

          {isLoading ? (
            <ActivityIndicator color={COLORS.coral} style={{ marginTop: SPACING.md }} />
          ) : comments.length === 0 ? (
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
              {t("storefront.comments.empty")}
            </Text>
          ) : (
            comments.map((c) => {
              const mine =
                myProfileId != null && String(c.author_user_id) === String(myProfileId);
              // Attribute to the commenting PET (name/@handle/avatar), mirroring the pet feed.
              // Legacy rows / pet-less commenters (no pet_* fields) fall back to the account.
              const displayHandle = c.pet_handle || c.author_username;
              const displayName = c.pet_name || c.author_name;
              const displayAvatar = c.pet_avatar_url || c.author_avatar_url;
              return (
                <View
                  key={c.id}
                  testID="provider-post-comment"
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    marginBottom: SPACING.md,
                    alignItems: "flex-start",
                  }}
                >
                  <Avatar uri={displayAvatar} name={displayName || displayHandle} />
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
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.coral }}>
                        {displayHandle ? `@${displayHandle}` : displayName}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
                          {formatRelativeTime(c.created_at, { t })}
                        </Text>
                        {mine ? (
                          <TouchableOpacity
                            testID={`delete-comment-${c.id}`}
                            onPress={() => handleDelete(c)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color={COLORS.mutedBrown} />
                          </TouchableOpacity>
                        ) : (
                          // Someone else's comment: Report + Block the commenter (Apple 1.2, A3).
                          <ModerationMenu
                            targetType="provider_post_comment"
                            targetId={c.id}
                            authorUserId={c.author_user_id}
                            iconSize={15}
                          />
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.warmBrown, lineHeight: 20 }}>
                      {c.body}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Composer (signed-in) or sign-in prompt (guest) */}
        {isAuthenticated ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: SPACING.xl,
              paddingTop: SPACING.md,
              paddingBottom: insets.bottom + SPACING.md,
              borderTopWidth: 1,
              borderTopColor: COLORS.peach,
              gap: 10,
              backgroundColor: COLORS.card,
            }}
          >
            <TextInput
              testID="comment-input"
              style={{
                flex: 1,
                backgroundColor: COLORS.sand,
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 11,
                fontSize: 14,
                color: COLORS.warmBrown,
                borderWidth: 1.5,
                borderColor: COLORS.peach,
                maxHeight: 90,
              }}
              placeholder={t("storefront.comments.placeholder")}
              placeholderTextColor={COLORS.mutedBrown}
              value={text}
              onChangeText={setText}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              editable={!addComment.isPending}
            />
            <TouchableOpacity
              testID="comment-send"
              onPress={handleSend}
              disabled={!text.trim() || addComment.isPending}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor:
                  text.trim() && !addComment.isPending ? COLORS.coral : COLORS.peach,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Send size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: SPACING.xl,
              paddingTop: SPACING.md,
              paddingBottom: insets.bottom + SPACING.md,
              borderTopWidth: 1,
              borderTopColor: COLORS.peach,
              backgroundColor: COLORS.card,
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
              {t("storefront.comments.signInPrompt")}
            </Text>
            <PressableScale
              testID="comment-signin"
              onPress={signIn}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: 22,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800" }}>
                {t("storefront.comments.signInCta")}
              </Text>
            </PressableScale>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Full-screen image viewer (ticket 2.93) — tapping a post image opens it enlarged; tap
          anywhere or the ✕ to close. Mounted only while open so it never counts as a stray Image. */}
      {viewerUri ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerUri(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.96)",
              justifyContent: "center",
            }}
          >
            <PressableScale
              testID="provider-post-image-viewer-close"
              onPress={() => setViewerUri(null)}
              accessibilityRole="button"
              accessibilityLabel={t("storefront.social.closeImage")}
              style={{ position: "absolute", top: insets.top + 12, right: 20, zIndex: 2, padding: 8 }}
            >
              <X size={26} color="#FFF" />
            </PressableScale>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setViewerUri(null)}
              style={{ width: "100%", height: "100%", justifyContent: "center" }}
            >
              <Image
                testID="provider-post-image-viewer"
                source={{ uri: viewerUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
