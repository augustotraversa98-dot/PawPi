import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Search } from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import useSocialPetStore from "@/store/socialPetStore";
import { mockConversations, mockMessages } from "@/data/mockConversationsData";

const formatMessageTime = (timestamp) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString();
};

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const conversations = useSocialPetStore((state) => state.conversations);
  const messages = useSocialPetStore((state) => state.messages);

  // Load mock conversations on first render
  useEffect(() => {
    const store = useSocialPetStore.getState();
    if (conversations.length === 0) {
      mockConversations.forEach((conv) => {
        store.addConversation(conv);
      });
      // Load mock messages
      Object.entries(mockMessages).forEach(([convId, msgs]) => {
        msgs.forEach((msg) => {
          // Don't use addMessage as it updates conversation, just set directly
          store.messages[convId] = msgs;
        });
      });
    }
  }, []);

  // Filter conversations based on search
  const filteredConversations = searchQuery.trim()
    ? conversations.filter((conv) => {
        const query = searchQuery.toLowerCase();
        return (
          conv.petName.toLowerCase().includes(query) ||
          conv.ownerName.toLowerCase().includes(query) ||
          conv.lastMessage.toLowerCase().includes(query)
        );
      })
    : conversations;

  const handleConversationTap = (conversation) => {
    router.push({
      pathname: "/chat",
      params: {
        conversationId: conversation.id,
        petName: conversation.petName,
        ownerName: conversation.ownerName,
        avatar: conversation.avatar,
        petAvatar: conversation.petAvatar,
      },
    });
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
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              letterSpacing: -0.3,
            }}
          >
            Messages
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Search input */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.sand,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.peach,
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.mutedBrown} />
          <TextInput
            style={{
              flex: 1,
              fontSize: 15,
              color: COLORS.warmBrown,
              padding: 0,
            }}
            placeholder="Search conversations…"
            placeholderTextColor={COLORS.mutedBrown}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Conversations list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {filteredConversations.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 48 }}>💬</Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: COLORS.warmBrown,
                marginTop: 16,
              }}
            >
              No conversations yet
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: COLORS.mutedBrown,
                marginTop: 8,
                textAlign: "center",
                paddingHorizontal: 40,
              }}
            >
              Start chatting with your pet friends!
            </Text>
          </View>
        ) : (
          filteredConversations.map((conversation) => (
            <TouchableOpacity
              key={conversation.id}
              onPress={() => handleConversationTap(conversation)}
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: COLORS.card,
                borderRadius: 20,
                padding: 16,
                flexDirection: "row",
                gap: 14,
                borderWidth: 1,
                borderColor: conversation.unread ? COLORS.coral : COLORS.peach,
                shadowColor: conversation.unread ? COLORS.coral : "transparent",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: conversation.unread ? 0.1 : 0,
                shadowRadius: 8,
                elevation: conversation.unread ? 2 : 0,
              }}
            >
              <View style={{ position: "relative" }}>
                <Image
                  source={{ uri: conversation.avatar }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    borderWidth: 2,
                    borderColor: COLORS.coral,
                  }}
                  transition={100}
                />
                {conversation.petAvatar && (
                  <Image
                    source={{ uri: conversation.petAvatar }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: COLORS.card,
                      position: "absolute",
                      bottom: -4,
                      right: -4,
                    }}
                    transition={100}
                  />
                )}
              </View>

              <View style={{ flex: 1, justifyContent: "center" }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: COLORS.warmBrown,
                      flex: 1,
                      marginRight: 8,
                    }}
                  >
                    {conversation.petName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: COLORS.mutedBrown,
                      fontWeight: conversation.unread ? "700" : "400",
                    }}
                  >
                    {formatMessageTime(conversation.lastMessageTime)}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: COLORS.mutedBrown,
                    marginBottom: 4,
                  }}
                >
                  with {conversation.ownerName}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: conversation.unread
                      ? COLORS.warmBrown
                      : COLORS.mutedBrown,
                    fontWeight: conversation.unread ? "700" : "400",
                    lineHeight: 20,
                  }}
                  numberOfLines={1}
                >
                  {conversation.lastMessage}
                </Text>
              </View>

              {conversation.unread && (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: COLORS.coral,
                    alignSelf: "center",
                  }}
                />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
