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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send, Trash2 } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { useAuth } from "@/utils/auth/useAuth";
import { useMyProfileId } from "@/hooks/useUserProfile";
import { formatRelativeTime } from "@/utils/relativeTime";
import {
  useProviderPostComments,
  useAddProviderPostComment,
  useDeleteProviderPostComment,
} from "@/hooks/useProviderPostComments";

// Provider-post DETAIL (Phase C) — the drill-in from a tappable storefront post card. Renders the
// post (body + images, passed via params so it shows instantly and guests can read without an
// auth'd refetch) + its comment list. Signed-in users get a composer; guests get a
// "sign in to comment" prompt but can still READ. Mirrors BarkModal's keyboard/composer pattern.

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
    const raw = Array.isArray(params.post) ? params.post[0] : params.post;
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [params.post]);

  const { isAuthenticated, signIn } = useAuth();
  const { data: myProfileId } = useMyProfileId();
  const { data: comments = [], isLoading } = useProviderPostComments(providerId, postId);
  const addComment = useAddProviderPostComment(providerId, postId);
  const deleteComment = useDeleteProviderPostComment(providerId, postId);

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
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]} numberOfLines={1}>
          {t("storefront.comments.title")}
        </Text>
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
          {/* The post */}
          {post ? (
            <View style={{ marginBottom: SPACING.lg }}>
              {post.body ? (
                <Text style={[TYPE.callout, { color: COLORS.warmBrown, lineHeight: 22 }]}>
                  {post.body}
                </Text>
              ) : null}
              {images.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: SPACING.sm,
                    marginTop: post.body ? SPACING.md : 0,
                  }}
                >
                  {images.map((uri, i) => (
                    <Image
                      key={`img-${i}`}
                      source={{ uri }}
                      style={{
                        width: 108,
                        height: 108,
                        borderRadius: RADIUS.control,
                        backgroundColor: COLORS.sand,
                      }}
                    />
                  ))}
                </View>
              ) : null}
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
                  <Avatar uri={c.author_avatar_url} name={c.author_name || c.author_username} />
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
                        {c.author_username ? `@${c.author_username}` : c.author_name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
                          {formatRelativeTime(c.created_at)}
                        </Text>
                        {mine ? (
                          <TouchableOpacity
                            testID={`delete-comment-${c.id}`}
                            onPress={() => handleDelete(c)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color={COLORS.mutedBrown} />
                          </TouchableOpacity>
                        ) : null}
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
    </View>
  );
}
