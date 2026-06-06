import React, { useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { create } from "zustand";
import { useCallback, useMemo } from "react";
import { AuthWebView } from "./AuthWebView";
import { useAuthStore, useAuthModal } from "./store";

/**
 * This component renders a modal for authentication purposes.
 * To show it programmatically, you should either use the `useRequireAuth` hook or the `useAuthModal` hook.
 */
export const AuthModal = () => {
  const { isOpen, mode, close } = useAuthModal();
  const { auth } = useAuthStore();

  const snapPoints = useMemo(() => ["100%"], []);
  const proxyURL = process.env.EXPO_PUBLIC_PROXY_BASE_URL;
  // Native sign-in must hit the same host fetch.ts uses for the API. On a
  // physical device "localhost" is the phone itself, so the WebView can't reach
  // the dev backend — prefer EXPO_PUBLIC_API_URL (the LAN IP) like fetch.ts,
  // falling back to EXPO_PUBLIC_BASE_URL for simulator/web. This keeps the JWT
  // minted by the current local backend (correct AUTH_SECRET / salt), not an
  // unreachable host. (Web uses the iframe + proxyURL below, so it's unaffected.)
  const baseURL =
    process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_BASE_URL;

  // Close modal when authentication succeeds
  useEffect(() => {
    if (auth && isOpen) {
      close();
    }
  }, [auth, isOpen, close]);

  if (!proxyURL && !baseURL) {
    return null;
  }

  return (
    <Modal visible={isOpen && !auth} transparent={true} animationType="slide">
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "100%",
          width: "100%",
          backgroundColor: "#fff",
          padding: 0,
        }}
      >
        <AuthWebView mode={mode} proxyURL={proxyURL} baseURL={baseURL} />
      </View>
    </Modal>
  );
};

export default useAuthModal;
