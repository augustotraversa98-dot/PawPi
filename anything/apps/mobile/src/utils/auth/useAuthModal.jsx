import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Pressable, Platform } from "react-native";
import { ArrowLeft } from "lucide-react-native";
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
  const baseURL = process.env.EXPO_PUBLIC_BASE_URL;

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
    <Modal visible={isOpen && !auth} transparent={true} animationType="slide" onRequestClose={close}>
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
        {/* Back out of the auth WebView to Welcome (the modal's onRequestClose is Android-only). */}
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 54 : 16,
            left: 12,
            padding: 8,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.9)",
          }}
        >
          <ArrowLeft size={22} color="#3B241B" />
        </Pressable>
      </View>
    </Modal>
  );
};

export default useAuthModal;
