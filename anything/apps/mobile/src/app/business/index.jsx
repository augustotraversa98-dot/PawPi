import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Store,
  Camera,
  Bell,
  ChevronDown,
  ChevronRight,
  Check,
  PawPrint,
  MessageCircle,
  CalendarClock,
  Play,
  Globe,
} from "lucide-react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { COLORS, TYPE, SPACING, RADIUS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { PostComposerModal } from "@/components/Feed/PostComposerModal";
import {
  useProviderBookings,
  useProviderUnreadCount,
  useProviderAdoptionApplications,
  useProviderProfile,
} from "@/hooks/useProviders";
import {
  useProviderPosts,
  useCreateProviderPost,
} from "@/hooks/useProviderPosts";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import BusinessStatRow from "@/components/Providers/StorefrontPanels/BusinessStatRow";
import useActiveProviderStore from "@/store/activeProviderStore";
import { useUpload } from "@/utils/useUpload";
import { stashProviderPost } from "@/utils/providerPostHandoff";
import { toCanonicalDate, formatDisplayTime } from "@/utils/canonicalDateTime";

// Pending adoption-application statuses (the shelter's open queue) — counted for the Today glance.
const PENDING_APP_STATUSES = ["submitted", "under_review", "pending"];

const { width: SCREEN_W } = Dimensions.get("window");
const TILE = (SCREEN_W - SPACING.xl * 2 - SPACING.md) / 2;

// Business logo (round) or a Store fallback tile.
function BusinessLogo({ uri, size = 48 }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.sand }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.sand,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Store size={size * 0.5} color={COLORS.coral} />
    </View>
  );
}

// One recent-moment tile: thumbnail (video poster or first image), a video badge, and the
// paw + comment counts. Taps through to the shared provider-post detail.
function MomentTile({ post, onPress, t }) {
  const isVideo = post?.media_type === "video";
  const images = Array.isArray(post?.image_urls) ? post.image_urls : [];
  const thumb = isVideo ? post?.video_thumbnail_url : images[0];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      testID={`business-post-${post.id}`}
      style={{ width: TILE, marginBottom: SPACING.md }}
    >
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: RADIUS.card,
          backgroundColor: COLORS.sand,
          overflow: "hidden",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Store size={28} color={COLORS.mutedBrown} />
        )}
        {isVideo ? (
          <View
            style={{
              position: "absolute",
              top: SPACING.sm,
              right: SPACING.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "rgba(0,0,0,0.55)",
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.sm,
              paddingVertical: 2,
            }}
          >
            <Play size={12} color="#FFF" fill="#FFF" />
            <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "700" }}>
              {t("business.home.video")}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.lg, marginTop: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <PawPrint size={14} color={COLORS.coral} />
          <Text style={[TYPE.caption, { color: COLORS.mutedBrown }]}>
            {Number(post?.paw_count ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MessageCircle size={14} color={COLORS.mutedBrown} />
          <Text style={[TYPE.caption, { color: COLORS.mutedBrown }]}>
            {Number(post?.comment_count ?? 0)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

// One "Today at a glance" summary line: an icon, a label (+ optional detail), a big count, and a
// chevron when it taps through to its tab. A non-tappable row (adoption) omits the chevron.
function GlanceRow({ testID, icon, label, value, detail, onPress, last }) {
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        paddingVertical: SPACING.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: COLORS.sand,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "700" }]}>
          {label}
        </Text>
        {detail ? (
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>{value}</Text>
      {onPress ? <ChevronRight size={18} color={COLORS.mutedBrown} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityRole="button" testID={testID}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View testID={testID}>{body}</View>
  );
}

export default function BusinessHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  // The active business is resolved by the shared hook so all four tabs follow the switcher in
  // lockstep. The switcher itself (below) writes activeProviderId through the store setter.
  const { activeProvider, providers, isLoading: loadingProviders } = useActiveProvider();
  const setActiveProviderId = useActiveProviderStore((s) => s.setActiveProviderId);

  const providerId = activeProvider?.id;
  const {
    data: posts = [],
    isLoading: loadingPosts,
    isError: postsError,
    refetch: refetchPosts,
  } = useProviderPosts(providerId);
  const createPost = useCreateProviderPost(providerId);
  const [upload] = useUpload();

  // ── Today-at-a-glance sources (all reuse existing provider reads; nothing new server-side) ──
  const hasAdoption = (activeProvider?.capabilities ?? []).includes("adoption");
  const { data: bookings = [] } = useProviderBookings(providerId);
  const { data: unreadCount = 0 } = useProviderUnreadCount(providerId);
  const { data: adoptionApps = [] } = useProviderAdoptionApplications(providerId, {
    enabled: hasAdoption,
  });
  // The public storefront read supplies the stat strip's post/paw/bark counts (followers is read
  // live inside BusinessStatRow). Same query the Profile tab uses, so it's cached across tabs.
  const { data: profile } = useProviderProfile(activeProvider?.slug);
  const stats = profile?.stats;

  // Today's active bookings (requested/confirmed) + the next one up, from the same read the
  // Bookings agenda uses. Declined/cancelled/completed and past dates are excluded.
  const { todayBookingCount, nextBooking } = useMemo(() => {
    const today = toCanonicalDate(new Date());
    const upcoming = bookings
      .filter(
        (b) =>
          (b.booking_status === "requested" || b.booking_status === "confirmed") &&
          typeof b.appointment_date === "string" &&
          b.appointment_date >= today,
      )
      .sort((a, b) => {
        const ka = `${a.appointment_date}T${a.appointment_time || "00:00"}`;
        const kb = `${b.appointment_date}T${b.appointment_time || "00:00"}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
    return {
      todayBookingCount: upcoming.filter((b) => b.appointment_date === today).length,
      nextBooking: upcoming[0] ?? null,
    };
  }, [bookings]);

  const pendingAppCount = useMemo(
    () => adoptionApps.filter((a) => PENDING_APP_STATUSES.includes(a.status)).length,
    [adoptionApps],
  );

  const [composerOpen, setComposerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // Compose copy for the reused daily-moment composer, in business voice + EN/ES.
  const composerCopy = useMemo(
    () => ({
      pickerHeader: t("business.composer.pickerHeader"),
      composeHeader: t("business.composer.composeHeader"),
      heading: t("business.composer.heading"),
      subheading: t("business.composer.subheading"),
      takePhoto: t("business.composer.takePhoto"),
      recordVideo: t("business.composer.recordVideo"),
      captionLabel: t("business.composer.captionLabel"),
      captionPlaceholder: t("business.composer.captionPlaceholder"),
      submit: t("business.composer.submit"),
    }),
    [t],
  );

  // Post a business moment: reuse the shared upload path (image OR short video), then POST to the
  // provider posts endpoint. Mirrors the pet feed's handlePost, but targets /api/providers/[id]/posts
  // and always allows video (no daily lottery for a business).
  const handleMomentPost = useCallback(
    async ({ uri, caption, mediaType = "image" }) => {
      if (!providerId) return;
      const isVideo = mediaType === "video";
      setPosting(true);
      try {
        const ext = (uri.split(".").pop() || "").toLowerCase();
        const mediaUpload = await upload({
          reactNativeAsset: {
            uri,
            name: isVideo
              ? `moment-${Date.now()}.${ext || "mp4"}`
              : `moment-${Date.now()}.jpg`,
            mimeType: isVideo
              ? ext === "mov"
                ? "video/quicktime"
                : "video/mp4"
              : "image/jpeg",
          },
        });
        if (mediaUpload.error) throw new Error(mediaUpload.error);
        if (!mediaUpload.url) throw new Error("Upload returned no URL");
        const mediaUrl = mediaUpload.url;

        let payload;
        if (isVideo) {
          // Best-effort poster frame (never blocks the post).
          let videoThumbnailUrl = null;
          try {
            const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
              time: 0,
              quality: 0.7,
            });
            const thumbUpload = await upload({
              reactNativeAsset: {
                uri: thumbUri,
                name: `moment-thumb-${Date.now()}.jpg`,
                mimeType: "image/jpeg",
              },
            });
            if (!thumbUpload.error && thumbUpload.url) videoThumbnailUrl = thumbUpload.url;
          } catch {
            // no thumbnail → post with a null poster
          }
          payload = {
            body: caption || "",
            media_type: "video",
            video_url: mediaUrl,
            video_thumbnail_url: videoThumbnailUrl,
          };
        } else {
          payload = { body: caption || "", image_urls: [mediaUrl] };
        }

        await createPost.mutateAsync(payload);
        await refetchPosts();
      } catch (error) {
        Alert.alert(t("business.home.postError"), error?.message);
      } finally {
        setPosting(false);
      }
    },
    [providerId, upload, createPost, refetchPosts, t],
  );

  // Open a moment in the shared provider-post detail (paws + comments live there). Mirror the feed's
  // handoff: stash the rich post (+ business identity) in memory, navigate with URL-safe params.
  const openMoment = useCallback(
    (post) => {
      if (post?.id == null || providerId == null) return;
      stashProviderPost(String(providerId), String(post.id), {
        ...post,
        business: {
          name: activeProvider?.name ?? "",
          slug: activeProvider?.slug ?? "",
          logo_url: activeProvider?.logo_url ?? null,
        },
      });
      router.push({
        pathname: "/service/provider-post",
        params: { providerId: String(providerId), postId: String(post.id) },
      });
    },
    [providerId, activeProvider, router],
  );

  const pickProvider = useCallback(
    (id) => {
      setActiveProviderId(id);
      setSwitcherOpen(false);
    },
    [setActiveProviderId],
  );

  if (loadingProviders) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.cream, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  const businessName = activeProvider?.name || t("business.home.fallbackName");
  const multi = providers.length > 1;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header: logo + business name (+ switcher when staff of several) + notifications */}
      <View
        style={{
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        <BusinessLogo uri={activeProvider?.logo_url} />
        <PressableScale
          onPress={multi ? () => setSwitcherOpen(true) : undefined}
          accessibilityRole={multi ? "button" : undefined}
          testID="business-switcher"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, flexShrink: 1 }]} numberOfLines={1}>
            {businessName}
          </Text>
          {multi ? <ChevronDown size={18} color={COLORS.mutedBrown} /> : null}
        </PressableScale>
        <PressableScale
          onPress={() => router.push("/notifications")}
          accessibilityRole="button"
          accessibilityLabel={t("business.home.notifications")}
          testID="business-notifications"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Bell size={20} color={COLORS.warmBrown} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + 90 }}>
        {/* Business stat strip (Followers · Posts · Paws · Barks) — reused from the storefront
            (2.93). Tapping through opens the Profile tab (the full public view). */}
        <PressableScale
          onPress={() => router.push("/business/profile")}
          accessibilityRole="button"
          testID="business-stat-row"
          style={{ borderRadius: RADIUS.card, overflow: "hidden", marginBottom: SPACING.xl }}
        >
          <BusinessStatRow providerId={providerId} stats={stats} />
        </PressableScale>

        {/* Today at a glance — today's bookings + next up, unread messages, and (adoption only)
            pending applications. Each summary derives from an existing provider read. */}
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: RADIUS.card,
            borderWidth: 1,
            borderColor: COLORS.peach,
            padding: SPACING.lg,
            marginBottom: SPACING.xl,
          }}
        >
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.md }]}>
            {t("business.today.glanceTitle")}
          </Text>

          {/* Bookings today → Bookings tab */}
          <GlanceRow
            testID="glance-bookings"
            icon={<CalendarClock size={20} color={COLORS.coral} />}
            label={t("business.today.bookingsLabel")}
            value={todayBookingCount}
            detail={
              nextBooking
                ? `${t("business.today.nextUp")}: ${[
                    nextBooking.appointment_time
                      ? formatDisplayTime(nextBooking.appointment_time)
                      : null,
                    nextBooking.service_name || nextBooking.pet_name,
                  ]
                    .filter(Boolean)
                    .join(" · ")}`
                : t("business.today.noBookingsToday")
            }
            onPress={() => router.push("/business/bookings")}
          />

          {/* Unread messages → Messages tab */}
          <GlanceRow
            testID="glance-messages"
            icon={<MessageCircle size={20} color={COLORS.coral} />}
            label={t("business.today.unreadLabel")}
            value={Number(unreadCount) || 0}
            onPress={() => router.push("/business/messages")}
          />

          {/* Pending adoption applications (adoption capability only) — informational; the review
              queue is managed on the web dashboard, so this summary has no mobile tab to open. */}
          {hasAdoption ? (
            <GlanceRow
              testID="glance-applications"
              icon={<PawPrint size={20} color={COLORS.coral} />}
              label={t("business.today.applicationsLabel")}
              value={pendingAppCount}
              last
            />
          ) : null}
        </View>

        {/* Primary action: post a moment */}
        <PressableScale
          onPress={() => setComposerOpen(true)}
          accessibilityRole="button"
          testID="business-post-moment"
          disabled={posting || !providerId}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.md,
            opacity: posting ? 0.7 : 1,
          }}
        >
          {posting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Camera size={22} color="#FFF" />
          )}
          <Text style={[TYPE.headline, { color: "#FFF" }]}>
            {posting ? t("business.home.posting") : t("business.home.postMoment")}
          </Text>
        </PressableScale>

        {/* Recent moments */}
        <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginTop: SPACING.xxl, marginBottom: SPACING.md }]}>
          {t("business.home.recentTitle")}
        </Text>

        {loadingPosts ? (
          <ActivityIndicator color={COLORS.coral} style={{ marginTop: SPACING.xl }} />
        ) : postsError ? (
          <View style={{ alignItems: "center", paddingVertical: SPACING.xxl }}>
            <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}>
              {t("business.home.loadError")}
            </Text>
            <PressableScale
              onPress={() => refetchPosts()}
              accessibilityRole="button"
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.chip,
                paddingHorizontal: SPACING.xl,
                paddingVertical: SPACING.sm,
              }}
            >
              <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
                {t("business.home.retry")}
              </Text>
            </PressableScale>
          </View>
        ) : posts.length === 0 ? (
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: RADIUS.card,
              padding: SPACING.xl,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginBottom: 4 }]}>
              {t("business.home.emptyTitle")}
            </Text>
            <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
              {t("business.home.emptyBody")}
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {posts.map((post) => (
              <MomentTile key={post.id} post={post} t={t} onPress={() => openMoment(post)} />
            ))}
          </View>
        )}

        {/* Manage on web note — services/products/hours/applications/adoption stay on the extranet */}
        <View
          style={{
            marginTop: SPACING.xxl,
            backgroundColor: COLORS.card,
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            borderWidth: 1,
            borderColor: COLORS.peach,
            flexDirection: "row",
            gap: SPACING.md,
          }}
        >
          <Globe size={20} color={COLORS.sageDark} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800", marginBottom: 2 }]}>
              {t("business.home.manageTitle")}
            </Text>
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
              {t("business.home.manageBody")}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Provider switcher (only when staff of several) */}
      <Modal
        visible={switcherOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}>
          <PressableScale style={{ flex: 1 }} onPress={() => setSwitcherOpen(false)} />
          <View
            style={{
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: SPACING.lg,
              paddingBottom: insets.bottom + SPACING.xl,
              paddingHorizontal: SPACING.xl,
              maxHeight: "70%",
            }}
          >
            <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.lg }]}>
              {t("business.home.switchTitle")}
            </Text>
            <ScrollView>
              {providers.map((p) => {
                const selected = String(p.id) === String(activeProvider?.id);
                return (
                  <PressableScale
                    key={p.id}
                    onPress={() => pickProvider(p.id)}
                    accessibilityRole="button"
                    testID={`business-provider-${p.id}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACING.md,
                      paddingVertical: SPACING.md,
                    }}
                  >
                    <BusinessLogo uri={p.logo_url} size={40} />
                    <Text style={[TYPE.headline, { flex: 1, color: COLORS.warmBrown }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {selected ? <Check size={20} color={COLORS.coral} /> : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reused daily-moment composer — business voice, video always available. */}
      <PostComposerModal
        visible={composerOpen}
        petName={businessName}
        onClose={() => setComposerOpen(false)}
        onPost={handleMomentPost}
        allowVideo
        showLuckyBanner={false}
        copy={composerCopy}
      />
    </View>
  );
}
