import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Megaphone, Send, Trash2 } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import {
  usePostBarks,
  useCreateBark,
  useDeleteBark,
} from "@/hooks/useFeedPosts";
import { useMyProfileId } from "@/hooks/useUserProfile";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { useTranslation } from "react-i18next";

export const BarkModal = memo(function BarkModal({
  visible,
  post,
  onClose,
  onBarkAdded,
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  // Fetch barks from database
  const { data: barks = [], isLoading, refetch } = usePostBarks(post?.id);

  // Create + delete bark mutations
  const createBarkMutation = useCreateBark(post?.id);
  const deleteBarkMutation = useDeleteBark(post?.id);

  // My own profile id — so a comment I authored shows Delete (and never a Block-me).
  const { data: myProfileId } = useMyProfileId();

  // Confirm + delete one of MY OWN comments (A3 — Apple-1.2 delete-your-own-content).
  const handleDeleteBark = useCallback(
    (barkId) => {
      Alert.alert(
        t("moderation.deleteCommentTitle"),
        t("moderation.deleteCommentBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => deleteBarkMutation.mutate(barkId),
          },
        ],
      );
    },
    [deleteBarkMutation, t],
  );

  useEffect(() => {
    if (visible && post) {
      setText("");
      refetch();
      // Ticket 2.63: do NOT auto-focus. The field renders ready; tapping it
      // raises the keyboard as a deliberate second step (no jank on open).
    }
  }, [visible, post, refetch]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !post) return;

    try {
      await createBarkMutation.mutateAsync(trimmed);
      setText("");
      // Success - bark saved, UI will update automatically
      if (onBarkAdded) onBarkAdded(post.id, barks.length + 1);
    } catch (error) {
      console.error("Error creating bark:", error);
      Alert.alert(t("feed.errorSaveTitle"), error?.message || t("feed.errorSaveBody"));
    }
  }, [text, post, createBarkMutation, barks.length, onBarkAdded]);

  if (!post) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Dim backdrop */}
        <TouchableOpacity
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59,36,27,0.45)",
          }}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            maxHeight: "80%",
            paddingBottom: insets.bottom + 8,
          }}
        >
          {/* Handle */}
          <View
            style={{ alignItems: "center", paddingTop: 12, paddingBottom: 2 }}
          >
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.peach,
              }}
            />
          </View>

          {/* Compact post header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.peach,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 2,
                borderColor: COLORS.coral,
                overflow: "hidden",
              }}
            >
              <PetAvatar
                uri={post.pet_avatar || post.avatar || undefined}
                name={post.pet_name || post.dogName}
                size={36}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 15,
                  color: COLORS.warmBrown,
                }}
              >
                {post.pet_name || post.dogName}
              </Text>
              <Text
                style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}
                numberOfLines={1}
              >
                {post.caption}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: COLORS.sand,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 5,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Megaphone size={13} color={COLORS.terracotta} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: COLORS.terracotta,
                }}
              >
                {barks.length} barks
              </Text>
            </View>
          </View>

          {/* Comments list */}
          <ScrollView
            style={{ flexGrow: 0, maxHeight: 280 }}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 30 }}>
                <ActivityIndicator size="small" color={COLORS.coral} />
              </View>
            ) : barks.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 30 }}>
                <Text style={{ fontSize: 32 }}>🐾</Text>
                <Text
                  style={{
                    color: COLORS.mutedBrown,
                    fontSize: 14,
                    marginTop: 10,
                    fontWeight: "600",
                  }}
                >
                  Be the first to bark!
                </Text>
              </View>
            ) : (
              barks.map((bark) => (
                <View
                  key={bark.id}
                  style={{
                    flexDirection: "row",
                    marginBottom: 16,
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <PetAvatar uri={bark.pet_avatar_url} size={34} />
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
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "800",
                          color: COLORS.coral,
                        }}
                      >
                        {bark.pet_handle ? `@${bark.pet_handle}` : bark.username}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
                          {new Date(bark.created_at).toLocaleDateString()}
                        </Text>
                        {myProfileId != null && bark.user_id === myProfileId ? (
                          // My own comment: Delete-your-own-content (A3).
                          <TouchableOpacity
                            onPress={() => handleDeleteBark(bark.id)}
                            accessibilityRole="button"
                            accessibilityLabel={t("moderation.deleteCommentA11y")}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color={COLORS.mutedBrown} />
                          </TouchableOpacity>
                        ) : (
                          // Someone else's comment: Report + Block the commenter (Apple 1.2).
                          <ModerationMenu
                            targetType="bark"
                            targetId={bark.id}
                            authorUserId={bark.user_id}
                            iconSize={15}
                          />
                        )}
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        color: COLORS.warmBrown,
                        lineHeight: 20,
                      }}
                    >
                      {bark.text}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Text input row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: COLORS.peach,
              gap: 10,
              backgroundColor: COLORS.card,
            }}
          >
            <TextInput
              ref={inputRef}
              testID="bark-input"
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
              placeholder={`Leave a bark for ${post.pet_name || post.dogName}…`}
              placeholderTextColor={COLORS.mutedBrown}
              value={text}
              onChangeText={setText}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              editable={!createBarkMutation.isPending}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!text.trim() || createBarkMutation.isPending}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor:
                  text.trim() && !createBarkMutation.isPending
                    ? COLORS.coral
                    : COLORS.peach,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {createBarkMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Send size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});
