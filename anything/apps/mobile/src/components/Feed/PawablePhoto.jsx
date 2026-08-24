import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { feedImageHeight } from "@/utils/feedImageAspect";

// Below this gap (ms) a second tap counts as a double-tap (ticket 2.64).
const DOUBLE_TAP_DELAY = 260;

// A post image that gives a Paw on double-tap, Instagram-style: a brand-color
// paw "pops" over the image and the parent paws the post (idempotent — a second
// double-tap only replays the animation, never un-paws). A single tap is
// disambiguated and forwarded to onSingleTap (e.g. open profile/detail) after
// the double-tap window passes. The explicit paw button stays the toggle.
export function PawablePhoto({
  photoUri,
  onSingleTap,
  onDoubleTap,
  disabled = false,
  style,
  contentFit = "cover",
  pawSize = 96,
  testID = "pawable-photo",
  // Instagram-style responsive sizing (feed polish #1/#3). When a numeric width
  // is passed, the photo renders at that exact content width and derives its
  // height from the image's natural aspect ratio (clamped 1:1 → 4:5). Callers
  // that don't pass it keep the legacy fixed-`style` behavior untouched.
  responsiveWidth,
}) {
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef(null);
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [popping, setPopping] = useState(false);
  // Natural width/height ratio, measured on load (feed polish #3).
  const [naturalRatio, setNaturalRatio] = useState(null);

  const responsive = typeof responsiveWidth === "number" && responsiveWidth > 0;
  const responsiveStyle = responsive
    ? { width: responsiveWidth, height: feedImageHeight(responsiveWidth, naturalRatio) }
    : style;

  const handleLoad = useCallback((event) => {
    const src = event?.source;
    if (src && src.width > 0 && src.height > 0) {
      setNaturalRatio(src.width / src.height);
    }
  }, []);

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

  const handlePress = useCallback(() => {
    if (disabled) return;
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
      // Defer the single-tap action until the double-tap window closes, so a
      // double-tap doesn't also fire the single-tap navigation.
      if (onSingleTap) {
        singleTapTimer.current = setTimeout(() => {
          singleTapTimer.current = null;
          onSingleTap();
        }, DOUBLE_TAP_DELAY);
      }
    }
  }, [clearSingleTap, disabled, onDoubleTap, onSingleTap, playPop]);

  return (
    <Pressable testID={testID} onPress={handlePress}>
      <Image
        source={{ uri: photoUri }}
        style={responsiveStyle}
        contentFit={contentFit}
        onLoad={responsive ? handleLoad : undefined}
      />
      {popping ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Animated.View testID="paw-pop" style={{ transform: [{ scale }], opacity }}>
            <PawPrint size={pawSize} color={COLORS.coral} fill={COLORS.coral} />
          </Animated.View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default PawablePhoto;
