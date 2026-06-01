import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Send, ImageIcon, Share2 } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { COLORS } from "@/constants/colors";
import useSocialPetStore from "@/store/socialPetStore";
import * as ImagePicker from "expo-image-picker";

const formatMessageTime = (timestamp) => {
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
  const { conversationId, petName, ownerName, avatar, petAvatar } = params;

  const [text, setText] = useState("");
  const scrollViewRef = useRef(null);
  const inputRef = useRef(null);

  const currentUser = useSocialPetStore((state) => state.currentUser);
  const getConversationMessages = useSocialPetStore(
    (state) => state.getConversationMessages,
  );
  const addMessage = useSocialPetStore((state) => state.addMessage);
  const markConversationRead = useSocialPetStore(
    (state) => state.markConversationRead,
  );

  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Load messages for this conversation
    const convMessages = getConversationMessages(conversationId);
    setMessages(convMessages);
    // Mark as read
    markConversationRead(conversationId);
  }, [conversationId, getConversationMessages, markConversationRead]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newMessage = {
      id: Date.now().toString(),
      conversationId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text: trimmed,
      timestamp: new Date().toISOString(),
      read: false,
    };

    addMessage(conversationId, newMessage);
    // Update local messages
    const updatedMessages = getConversationMessages(conversationId);
    setMessages(updatedMessages);
    setText("");
  };

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const newMessage = {
        id: Date.now().toString(),
        conversationId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        image: result.assets[0].uri,
        timestamp: new Date().toISOString(),
        read: false,
      };

      addMessage(conversationId, newMessage);
      const updatedMessages = getConversationMessages(conversationId);
      setMessages(updatedMessages);
    }
  };

  return (
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
          gap: 12,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color={COLORS.coral} />
        </TouchableOpacity>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ position: "relative" }}>
            <Image
              source={{ uri: avatar }}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                borderWidth: 2,
                borderColor: COLORS.coral,
              }}
              transition={100}
            />
            {petAvatar && (
              <Image
                source={{ uri: petAvatar }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: COLORS.card,
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                }}
                transition={100}
              />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: COLORS.warmBrown,
              }}
            >
              {petName}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: COLORS.mutedBrown,
              }}
            >
              {ownerName}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 60}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingVertical: 16,
            paddingHorizontal: 16,
            paddingBottom: 20,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message, index) => {
            const isCurrentUser = message.senderId === currentUser.id;
            const showAvatar = !isCurrentUser;
            const prevMessage = messages[index - 1];
            const showTimestamp =
              !prevMessage ||
              new Date(message.timestamp) - new Date(prevMessage.timestamp) >
                5 * 60 * 1000; // 5 minutes

            return (
              <View key={message.id} style={{ marginBottom: 12 }}>
                {showTimestamp && (
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      color: COLORS.mutedBrown,
                      marginBottom: 12,
                    }}
                  >
                    {formatMessageTime(message.timestamp)}
                  </Text>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: isCurrentUser ? "flex-end" : "flex-start",
                    alignItems: "flex-end",
                    gap: 8,
                  }}
                >
                  {showAvatar && (
                    <Image
                      source={{ uri: avatar }}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                      }}
                      transition={100}
                    />
                  )}

                  {message.image ? (
                    <View
                      style={{
                        maxWidth: "70%",
                        backgroundColor: isCurrentUser
                          ? COLORS.coral
                          : COLORS.card,
                        borderRadius: 18,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: isCurrentUser
                          ? COLORS.coral
                          : COLORS.peach,
                      }}
                    >
                      <Image
                        source={{ uri: message.image }}
                        style={{
                          width: 200,
                          height: 150,
                        }}
                        contentFit="cover"
                        transition={100}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        maxWidth: "70%",
                        backgroundColor: isCurrentUser
                          ? COLORS.coral
                          : COLORS.card,
                        borderRadius: 18,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: isCurrentUser
                          ? COLORS.coral
                          : COLORS.peach,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          color: isCurrentUser ? "#FFF" : COLORS.warmBrown,
                          lineHeight: 21,
                        }}
                      >
                        {message.text}
                      </Text>
                    </View>
                  )}

                  {!showAvatar && isCurrentUser && (
                    <View style={{ width: 30 }} />
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Input area */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            paddingBottom: insets.bottom + 12,
            backgroundColor: COLORS.card,
            borderTopWidth: 1,
            borderTopColor: COLORS.peach,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={handleImagePick}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <ImageIcon size={18} color={COLORS.coral} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              backgroundColor: COLORS.sand,
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 11,
              fontSize: 15,
              color: COLORS.warmBrown,
              borderWidth: 1.5,
              borderColor: COLORS.peach,
              maxHeight: 90,
            }}
            placeholder="Send a message…"
            placeholderTextColor={COLORS.mutedBrown}
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
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
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
