import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send } from "lucide-react-native";
import {
  useForumThread,
  useCreateComment,
  useForumVote,
} from "@/hooks/useForum";
import VoteControl from "@/components/Forum/VoteControl";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, GlassSurface, PressableScale, PawMark } from "@/components/ui";

export default function ForumThreadScreen() {
  const { t } = useTranslation();
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
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
        }}
      >
        <PressableScale
          testID="thread-back"
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          {t("forum.title")}
        </Text>
      </GlassSurface>

      <RefreshableScrollView
        refetch={refetch}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxl }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", padding: SPACING.huge }}>
            <ActivityIndicator size="large" color={COLORS.coral} />
          </View>
        )}

        {!isLoading && !thread && (
          <View style={{ alignItems: "center", padding: 50 }}>
            <PawMark size={32} color={COLORS.warmBrown} />
            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginTop: SPACING.sm, fontWeight: "700" }]}>
              {t("forum.threadNotAvailable")}
            </Text>
          </View>
        )}

        {!isLoading && thread && (
          <>
            {/* Thread */}
            <Card
              radius={RADIUS.card}
              style={{
                padding: SPACING.lg,
                flexDirection: "row",
                gap: SPACING.md,
                marginBottom: SPACING.lg,
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
                  <Text
                    style={[
                      TYPE.caption,
                      { flex: 1, color: COLORS.mutedBrown, fontWeight: "700", letterSpacing: 0 },
                    ]}
                  >
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
                <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
                  {thread.title}
                </Text>
                {thread.body ? (
                  <Text style={[TYPE.callout, { color: COLORS.warmBrown, marginTop: SPACING.sm }]}>
                    {thread.body}
                  </Text>
                ) : null}
              </View>
            </Card>

            {/* Comments */}
            <Text
              style={[
                TYPE.footnote,
                {
                  fontWeight: "800",
                  color: COLORS.mutedBrown,
                  letterSpacing: 0.8,
                  marginBottom: SPACING.sm,
                },
              ]}
            >
              {comments.length} {t(comments.length === 1 ? "forum.comment_one" : "forum.comment_other")}
            </Text>

            {comments.length === 0 && (
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginBottom: SPACING.md }]}>
                {t("forum.noComments")}
              </Text>
            )}

            {comments.map((c) => (
              <Card
                key={c.id}
                testID={`comment-${c.id}`}
                radius={RADIUS.control}
                style={{
                  padding: SPACING.md,
                  marginBottom: SPACING.sm,
                  marginLeft: c.parent_comment_id ? SPACING.xl : 0,
                  flexDirection: "row",
                  gap: SPACING.sm,
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
                    <Text
                      style={[TYPE.footnote, { flex: 1, color: COLORS.mutedBrown, fontWeight: "700" }]}
                    >
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
                  <Text style={[TYPE.callout, { color: COLORS.warmBrown }]}>
                    {c.body}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}
      </RefreshableScrollView>

      {/* Comment composer */}
      {thread && (
        <GlassSurface
          intensity={BLUR.thick}
          style={{
            borderTopWidth: 1,
            borderColor: MATERIALS.glassBorder,
          }}
          contentStyle={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: insets.bottom + SPACING.sm,
          }}
        >
          <TextInput
            testID="comment-input"
            value={commentText}
            onChangeText={setCommentText}
            placeholder={t("forum.addCommentPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown + "90"}
            style={{
              flex: 1,
              backgroundColor: MATERIALS.surfaceSunken,
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.sm,
              borderWidth: 1,
              borderColor: MATERIALS.hairline,
              ...TYPE.callout,
              color: COLORS.warmBrown,
            }}
          />
          <PressableScale
            testID="comment-submit"
            onPress={submitComment}
            disabled={createComment.isPending || !commentText.trim()}
            style={{
              width: 42,
              height: 42,
              borderRadius: RADIUS.chip,
              backgroundColor: commentText.trim() ? COLORS.coral : MATERIALS.surfaceSunken,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {createComment.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Send size={18} color={commentText.trim() ? "#FFF" : COLORS.mutedBrown} />
            )}
          </PressableScale>
        </GlassSurface>
      )}
    </View>
  );
}
