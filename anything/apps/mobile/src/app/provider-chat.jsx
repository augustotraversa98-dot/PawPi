import React, { useEffect, useRef, useState } from "react";
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
import { ArrowLeft, Send, ImageIcon } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import {
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
} from "@/hooks/useProviders";
import useUpload from "@/utils/useUpload";

// Owner-side conversation view (Phase 2 ticket 2.5). Reads one thread's messages
// (polled), sends text, and attaches an image via the SHARED Supabase Storage upload
// path (useUpload). The owner is the current user, so messages from ownerUserId are
// "mine" (right-aligned); the rest are the provider's.
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  const mm = m < 10 ? `0${m}` : m;
  return `${hh}:${mm} ${ampm}`;
}

export default function ProviderChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const threadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const providerName = Array.isArray(params.providerName)
    ? params.providerName[0]
    : params.providerName;
  const ownerUserId = Array.isArray(params.ownerUserId)
    ? params.ownerUserId[0]
    : params.ownerUserId;

  const { data: messages, isLoading } = useThreadMessages(threadId);
  const { mutate: send, isPending } = useSendMessage(threadId);
  const { mutate: markRead } = useMarkThreadRead();
  const [upload, { loading: uploading }] = useUpload();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  // Mark read on open and whenever new messages arrive while open.
  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages?.length]);

  // Messages come newest-first; render oldest-first and pin to the bottom.
  const ordered = (messages ?? []).slice().reverse();
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const onSendText = () => {
    const text = draft.trim();
    if (!text) return;
    send({ body: text }, { onSuccess: () => setDraft("") });
  };

  const onAttachImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const uploaded = await upload({
      reactNativeAsset: {
        uri: asset.uri,
        name: asset.fileName ?? "photo.jpg",
        mimeType: asset.mimeType ?? "image/jpeg",
      },
    });
    if (uploaded?.error || !uploaded?.url) return;
    send({ attachment_url: uploaded.url });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
          {providerName || "Provider"}
        </Text>
      </GlassSurface>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {ordered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text
                style={[
                  TYPE.callout,
                  { color: COLORS.mutedBrown, textAlign: "center" },
                ]}
              >
                No messages yet. Say hello.
              </Text>
            </View>
          ) : (
            ordered.map((msg) => {
              const mine = String(msg.sender_user_id) === String(ownerUserId);
              return (
                <View
                  key={msg.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "78%",
                    marginBottom: SPACING.sm,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: mine ? COLORS.coral : COLORS.card,
                      borderRadius: RADIUS.control,
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.sm,
                      borderWidth: mine ? 0 : 1,
                      borderColor: MATERIALS.hairline,
                    }}
                  >
                    {msg.attachment_url ? (
                      <Image
                        source={{ uri: msg.attachment_url }}
                        style={{ width: 180, height: 180, borderRadius: 10, marginBottom: msg.body ? 6 : 0 }}
                        contentFit="cover"
                      />
                    ) : null}
                    {msg.body ? (
                      <Text
                        style={[
                          TYPE.body,
                          { color: mine ? "#FFF" : COLORS.warmBrown, lineHeight: 20 },
                        ]}
                      >
                        {msg.body}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        fontSize: 10,
                        marginTop: 4,
                        color: mine ? "rgba(255,255,255,0.8)" : COLORS.mutedBrown,
                        textAlign: "right",
                      }}
                    >
                      {formatTime(msg.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderTopWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: insets.bottom + SPACING.sm,
        }}
      >
        <PressableScale
          onPress={onAttachImage}
          disabled={uploading}
          accessibilityRole="button"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: MATERIALS.surfaceSunken,
            justifyContent: "center",
            alignItems: "center",
            opacity: uploading ? 0.5 : 1,
          }}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.coral} />
          ) : (
            <ImageIcon size={20} color={COLORS.mutedBrown} />
          )}
        </PressableScale>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message…"
          placeholderTextColor={COLORS.mutedBrown}
          style={[
            TYPE.body,
            {
              flex: 1,
              backgroundColor: MATERIALS.surfaceSunken,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.sm,
              color: COLORS.warmBrown,
              maxHeight: 100,
            },
          ]}
          multiline
        />
        <PressableScale
          onPress={onSendText}
          disabled={isPending || !draft.trim()}
          accessibilityRole="button"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.coral,
            justifyContent: "center",
            alignItems: "center",
            opacity: isPending || !draft.trim() ? 0.5 : 1,
          }}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Send size={18} color="#FFF" />
          )}
        </PressableScale>
      </GlassSurface>
    </KeyboardAvoidingView>
  );
}
