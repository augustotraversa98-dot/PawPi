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
