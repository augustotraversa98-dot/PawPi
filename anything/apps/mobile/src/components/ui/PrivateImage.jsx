import * as React from "react";
import { Image, View } from "react-native";
import { usePrivateMediaUri } from "@/utils/privateMedia";

// AUDIT A-04 — render primitive for medical/chat media stored as a PRIVATE key.
//
// Drop-in for `<Image source={{ uri: value }} … />` where `value` may be either a
// private object key (`pets/<petId>/<uuid>.<ext>`) or a plain public URL / local
// file uri. A key is exchanged for a short-lived signed URL via GET /api/media
// (usePrivateMediaUri); a URL / local uri renders immediately unchanged, so
// legacy media keeps working with no round-trip. All other props (style,
// resizeMode, …) forward to the underlying Image.
export default function PrivateImage({ value, providerId, fallback = null, ...imageProps }) {
  const { uri } = usePrivateMediaUri(value, { providerId });
  if (!uri) {
    // While a key resolves (or if it failed / value is empty) keep the same box
    // so layout doesn't jump; callers can pass a `fallback` node instead.
    return fallback ?? <View style={imageProps.style} />;
  }
  return <Image source={{ uri }} {...imageProps} />;
}
