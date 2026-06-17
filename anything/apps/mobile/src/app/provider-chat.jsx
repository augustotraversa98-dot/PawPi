import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }}>
          {providerName || "Provider"}
        </Text>
      </View>

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
              <Text style={{ fontSize: 14, color: COLORS.mutedBrown, textAlign: "center" }}>
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
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: mine ? COLORS.coral : COLORS.card,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: mine ? 0 : 1,
                      borderColor: COLORS.peach,
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
                        style={{
                          fontSize: 15,
                          color: mine ? "#FFF" : COLORS.warmBrown,
                          lineHeight: 20,
                        }}
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

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          borderTopWidth: 1,
          borderTopColor: COLORS.peach,
          backgroundColor: COLORS.card,
        }}
      >
        <TouchableOpacity
          onPress={onAttachImage}
          disabled={uploading}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
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
        </TouchableOpacity>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message…"
          placeholderTextColor={COLORS.mutedBrown}
          style={{
            flex: 1,
            backgroundColor: COLORS.sand,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 15,
            color: COLORS.warmBrown,
            maxHeight: 100,
          }}
          multiline
        />
        <TouchableOpacity
          onPress={onSendText}
          disabled={isPending || !draft.trim()}
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
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
