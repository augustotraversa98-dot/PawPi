import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View, StyleSheet } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Image } from "expo-image";
import { PawPrint, Play } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Below this gap (ms) a second tap counts as a double-tap (mirrors PawablePhoto,
// ticket 2.64).
const DOUBLE_TAP_DELAY = 260;

// A video post that plays inline (daily video moments, step 4). It shows the
// poster frame (video_thumbnail_url) with a play-button overlay; a single tap
// toggles play/pause WITH sound, a double tap gives a Paw — same disambiguation
// PawablePhoto uses, so the single-tap play is deferred past the double-tap
// window and a double-tap never also toggles playback. When there's no poster
// thumbnail a neutral sand placeholder (or the first video frame) stands in, so
// a missing thumbnail is never a broken image and never crashes.
export function FeedVideo({
  videoUri,
  posterUri,
  onDoubleTap,
  style,
  testID = "feed-video",
}) {
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Coral paw-pop on double-tap, identical feel to PawablePhoto.
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [popping, setPopping] = useState(false);

  const clearSingleTap = useCallback(() => {
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
  }, []);

  useEffect(() => clearSingleTap, [clearSingleTap]);

  const playPop = useCallback(() => {
    setPopping(true);
    scale.setValue(0.3);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(300),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
    ]).start(() => setPopping(false));
  }, [opacity, scale]);

  const togglePlay = useCallback(async () => {
    const ref = videoRef.current;
    if (!ref || !videoUri) return;
    try {
      if (playing) {
        await ref.pauseAsync?.();
        setPlaying(false);
      } else {
        await ref.playAsync?.();
        setPlaying(true);
      }
    } catch (e) {
      // Playback failures (bad URL, codec, etc.) must never crash the feed.
      setPlaying(false);
    }
  }, [playing, videoUri]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap → paw + animate. Reset so a triple-tap isn't a new double.
      lastTapRef.current = 0;
      clearSingleTap();
      playPop();
      onDoubleTap?.();
    } else {
      lastTapRef.current = now;
      clearSingleTap();
      // Defer play/pause until the double-tap window closes, so a double-tap
      // (to Paw) doesn't also toggle playback.
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        togglePlay();
      }, DOUBLE_TAP_DELAY);
    }
  }, [clearSingleTap, onDoubleTap, playPop, togglePlay]);

  return (
    <Pressable testID={testID} onPress={handlePress} style={style}>
      {/* Neutral placeholder behind everything, so a missing poster / first frame
          is never a broken image. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.sand }]} />

      {videoUri ? (
        <Video
          ref={videoRef}
          testID={`${testID}-player`}
          source={{ uri: videoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          usePoster={!!posterUri}
          posterSource={posterUri ? { uri: posterUri } : undefined}
          posterStyle={{ resizeMode: "cover" }}
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (status?.didJustFinish) setPlaying(false);
          }}
        />
      ) : posterUri ? (
        // No playable URL but we have a poster — show it as a still rather than a
        // dead player.
        <Image
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}

      {/* Play affordance — shown whenever nothing is playing (idle/paused). */}
      {!playing ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.center]}
        >
          <View testID={`${testID}-play`} style={styles.playButton}>
            <Play size={26} color={COLORS.cream} fill={COLORS.cream} />
          </View>
        </View>
      ) : null}

      {popping ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.center]}
        >
          <Animated.View testID="paw-pop" style={{ transform: [{ scale }], opacity }}>
            <PawPrint size={96} color={COLORS.coral} fill={COLORS.coral} />
          </Animated.View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(59, 36, 27, 0.55)", // warmBrown @ ~55%
    justifyContent: "center",
    alignItems: "center",
  },
});

export default FeedVideo;
