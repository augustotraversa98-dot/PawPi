import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Send } from "lucide-react-native";
import {
  useForumThread,
  useCreateComment,
  useForumVote,
} from "@/hooks/useForum";
import VoteControl from "@/components/Forum/VoteControl";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sand: "#F8EBDD",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function ForumThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const threadId = id ? parseInt(id) : null;

  const { data, isLoading, refetch } = useForumThread(threadId);
  const createComment = useCreateComment(threadId);
  const voteMutation = useForumVote();
  const [commentText, setCommentText] = useState("");

  const thread = data?.thread;
  const comments = data?.comments || [];

  const vote = (targetType, targetId, value) =>
    voteMutation.mutate({ targetType, targetId, value });

  const submitComment = () => {
    const body = commentText.trim();
    if (!body) return;
    createComment.mutate(
      { body, parentCommentId: null },
      { onSuccess: () => setCommentText("") },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          testID="thread-back"
          onPress={() => router.back()}
          style={{ marginRight: 12 }}
        >
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
          Discussion
        </Text>
      </View>

      <RefreshableScrollView
        refetch={refetch}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", padding: 40 }}>
            <ActivityIndicator size="large" color={C.coral} />
          </View>
        )}

        {!isLoading && !thread && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <Text style={{ fontSize: 32 }}>🐾</Text>
            <Text style={{ color: C.mutedBrown, marginTop: 10, fontWeight: "700" }}>
              This discussion is no longer available.
            </Text>
          </View>
        )}

        {!isLoading && thread && (
          <>
            {/* Thread */}
            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: C.peach,
                flexDirection: "row",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <VoteControl
                score={thread.score || 0}
                myVote={thread.my_vote ?? null}
                onVote={(value) => vote("thread", thread.id, value)}
                testIDPrefix="thread-vote"
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ flex: 1, fontSize: 11, color: C.mutedBrown, fontWeight: "700" }}>
                    {thread.category} · 🐾 {thread.author_username || "someone"}
                  </Text>
                  {/* Report/Block the thread author (T4) — hidden on your own thread. */}
                  <ModerationMenu
                    targetType="forum_thread"
                    targetId={thread.id}
                    authorUserId={thread.author_user_id}
                    iconSize={18}
                  />
                </View>
                <Text style={{ fontSize: 19, fontWeight: "800", color: C.warmBrown, lineHeight: 25 }}>
                  {thread.title}
                </Text>
                {thread.body ? (
                  <Text style={{ fontSize: 14, color: C.warmBrown, marginTop: 8, lineHeight: 20 }}>
                    {thread.body}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Comments */}
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: C.mutedBrown,
                letterSpacing: 0.8,
                marginBottom: 10,
              }}
            >
              {comments.length} {comments.length === 1 ? "COMMENT" : "COMMENTS"}
            </Text>

            {comments.length === 0 && (
              <Text style={{ fontSize: 13, color: C.mutedBrown, marginBottom: 12 }}>
                No comments yet — start the conversation.
              </Text>
            )}

            {comments.map((c) => (
              <View
                key={c.id}
                testID={`comment-${c.id}`}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  marginLeft: c.parent_comment_id ? 20 : 0,
                  borderWidth: 1,
                  borderColor: C.peach,
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <VoteControl
                  score={c.score || 0}
                  myVote={c.my_vote ?? null}
                  onVote={(value) => vote("comment", c.id, value)}
                  testIDPrefix={`comment-vote-${c.id}`}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                    <Text style={{ flex: 1, fontSize: 12, color: C.mutedBrown, fontWeight: "700" }}>
                      🐾 {c.author_username || "someone"}
                    </Text>
                    {/* Report/Block the comment author (T4) — hidden on your own comment. */}
                    <ModerationMenu
                      targetType="forum_comment"
                      targetId={c.id}
                      authorUserId={c.author_user_id}
                      iconSize={16}
                    />
                  </View>
                  <Text style={{ fontSize: 14, color: C.warmBrown, lineHeight: 19 }}>
                    {c.body}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </RefreshableScrollView>

      {/* Comment composer */}
      {thread && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: insets.bottom + 10,
            borderTopWidth: 1,
            borderTopColor: C.peach,
            backgroundColor: C.card,
          }}
        >
          <TextInput
            testID="comment-input"
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            placeholderTextColor={C.mutedBrown + "90"}
            style={{
              flex: 1,
              backgroundColor: C.sand,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 14,
              color: C.warmBrown,
            }}
          />
          <TouchableOpacity
            testID="comment-submit"
            onPress={submitComment}
            disabled={createComment.isPending || !commentText.trim()}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: commentText.trim() ? C.coral : C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {createComment.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Send size={18} color={commentText.trim() ? "#FFF" : C.mutedBrown} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
