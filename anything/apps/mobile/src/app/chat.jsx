import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Send, ImageIcon, User } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import * as ImagePicker from "expo-image-picker";
import { useDMMessages, useSendDM, useMarkDMRead } from "@/hooks/useDMs";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import useUpload from "@/utils/useUpload";

// Owner↔owner conversation on REAL data (ticket 2.27). Messages come from the API
// (newest-first → reversed for display); a message isMine when its sender isn't the
// other participant. Mark-read on open; short-poll while open.
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
  return `${displayHours}:${displayMinutes} ${ampm}`;
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const threadId = Array.isArray(params.threadId)
    ? params.threadId[0]
    : params.threadId;
  const otherUserId = Array.isArray(params.otherUserId)
    ? params.otherUserId[0]
    : params.otherUserId;
  const otherName = params.otherName || "Pet parent";
  const otherAvatar = params.otherAvatar;

  const [text, setText] = useState("");
  const scrollViewRef = useRef(null);

  const { data: rawMessages, isLoading } = useDMMessages(threadId);
  const send = useSendDM(threadId);
  const markRead = useMarkDMRead();
  const [upload, { loading: uploading }] = useUpload();

  // API returns newest-first; show oldest→newest.
  const messages = [...(rawMessages || [])].reverse();

  // Mark read on open + whenever new messages arrive.
  useEffect(() => {
    if (threadId) markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, rawMessages?.length]);

  useEffect(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    send.mutate({ body: trimmed }, { onSuccess: () => setText("") });
  };

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const res = await upload({ reactNativeAsset: asset });
    if (res?.url) send.mutate({ image_url: res.url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        <PressableScale onPress={() => router.back()} accessibilityRole="button">
          <ChevronLeft size={24} color={COLORS.coral} />
        </PressableScale>
        {otherAvatar ? (
          <Image
            source={{ uri: otherAvatar }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 2,
              borderColor: COLORS.coral,
            }}
            transition={100}
          />
        ) : (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <User size={20} color={COLORS.coral} />
          </View>
        )}
        <Text
          style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown, flex: 1 }]}
          numberOfLines={1}
        >
          {otherName}
        </Text>
        {/* Block the other participant (T4). Blocking stops messages both ways (T3). */}
        <ModerationMenu
          authorUserId={otherUserId ? Number(otherUserId) : null}
          onBlocked={() => router.back()}
        />
      </GlassSurface>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator color={COLORS.coral} />
            </View>
          ) : messages.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={[TYPE.subhead, { fontWeight: "500", color: COLORS.mutedBrown }]}>
                Say hello to start the conversation.
              </Text>
            </View>
          ) : (
            messages.map((m, index) => {
              const isMine = String(m.sender_user_id) !== String(otherUserId);
              const prev = messages[index - 1];
              const showTime =
                !prev ||
                new Date(m.created_at) - new Date(prev.created_at) > 5 * 60 * 1000;
              return (
                <View key={m.id} style={{ marginBottom: SPACING.md }}>
                  {showTime && (
                    <Text
                      style={[
                        TYPE.caption,
                        {
                          letterSpacing: 0,
                          fontWeight: "500",
                          textAlign: "center",
                          color: COLORS.mutedBrown,
                          marginBottom: SPACING.md,
                        },
                      ]}
                    >
                      {formatTime(m.created_at)}
                    </Text>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: isMine ? "flex-end" : "flex-start",
                    }}
                  >
                    {m.image_url ? (
                      <View
                        style={{
                          maxWidth: "70%",
                          backgroundColor: isMine ? COLORS.coral : COLORS.card,
                          borderRadius: RADIUS.card,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: isMine ? COLORS.coral : MATERIALS.hairline,
                        }}
                      >
                        <Image
                          source={{ uri: m.image_url }}
                          style={{ width: 200, height: 150 }}
                          contentFit="cover"
                          transition={100}
                        />
                      </View>
                    ) : (
                      <View
                        style={{
                          maxWidth: "70%",
                          backgroundColor: isMine ? COLORS.coral : COLORS.card,
                          borderRadius: RADIUS.card,
                          padding: SPACING.md,
                          borderWidth: 1,
                          borderColor: isMine ? COLORS.coral : MATERIALS.hairline,
                        }}
                      >
                        <Text
                          style={[
                            TYPE.body,
                            { color: isMine ? "#FFF" : COLORS.warmBrown, lineHeight: 21 },
                          ]}
                        >
                          {m.body}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <GlassSurface
          intensity={BLUR.thick}
          style={{ borderTopWidth: 1, borderColor: MATERIALS.glassBorder }}
          contentStyle={{
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.md,
            paddingBottom: insets.bottom + SPACING.md,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
          }}
        >
          <PressableScale
            onPress={handleImagePick}
            disabled={uploading}
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: MATERIALS.surfaceSunken,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: MATERIALS.hairline,
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={COLORS.coral} />
            ) : (
              <ImageIcon size={18} color={COLORS.coral} />
            )}
          </PressableScale>

          <TextInput
            style={[
              TYPE.body,
              {
                flex: 1,
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.chip,
                paddingHorizontal: SPACING.lg,
                paddingVertical: 11,
                color: COLORS.warmBrown,
                borderWidth: 1.5,
                borderColor: MATERIALS.hairline,
                maxHeight: 90,
              },
            ]}
            placeholder="Send a message…"
            placeholderTextColor={COLORS.mutedBrown}
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />

          <PressableScale
            onPress={handleSend}
            disabled={!text.trim() || send.isPending}
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: text.trim() ? COLORS.coral : COLORS.peach,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Send size={18} color="#FFF" />
          </PressableScale>
        </GlassSurface>
      </KeyboardAvoidingView>
    </View>
  );
}
