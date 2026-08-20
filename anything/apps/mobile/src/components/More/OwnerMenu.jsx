import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, LogOut, Menu, X } from "lucide-react-native";
import { useAuth } from "@/utils/auth/useAuth";
import { useMyProviders } from "@/hooks/useProviders";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

// The "More" menu behind the Profile tab's top-right burger (ticket 2.39, reused
// by 2.60 so the Profile tab can BE the pet's social profile while every former
// More destination + the My Dogs switcher stay reachable from here). Closing the
// sheet before navigating keeps tab nav clean (honors the 2.19 fix).
export function OwnerMenu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { setAuth } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  // Business mode: an account that is ALSO active staff of ≥1 provider keeps the pet app but gets a
  // clear way to switch into Business home. Empty for a pure pet owner → the item never renders.
  const { data: myProviders = [] } = useMyProviders();
  const isBusiness = (myProviders?.length ?? 0) > 0;

  const goMenu = (path) => {
    setMenuVisible(false);
    router.push(path);
  };

  const handleLogout = async () => {
    try {
      // Lazy-require so merely importing OwnerMenu doesn't pull the native
      // AsyncStorage module into unrelated test renders.
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.clear();
      if (setAuth) setAuth(null);
      router.replace("/welcome");
    } catch (error) {
      router.replace("/welcome");
    }
  };

  const MenuItem = ({ title, color, emoji, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: C.card,
        borderRadius: 18,
        marginBottom: 10,
        shadowColor: C.terracotta,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: C.peach,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: (color || C.sageDark) + "20",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <Text
        style={{ flex: 1, fontSize: 16, fontWeight: "700", color: C.warmBrown }}
      >
        {title}
      </Text>
      <ChevronRight size={18} color={C.peach} />
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        accessibilityLabel={t("ownerMenu.openMenu")}
        onPress={() => setMenuVisible(true)}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Menu size={22} color={C.warmBrown} />
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          />
          <View
            style={{
              backgroundColor: C.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 6,
              paddingBottom: insets.bottom + 20,
              maxHeight: "82%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingVertical: 14,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
                {t("ownerMenu.title")}
              </Text>
              <TouchableOpacity
                accessibilityLabel={t("ownerMenu.closeMenu")}
                onPress={() => setMenuVisible(false)}
              >
                <X size={22} color={C.mutedBrown} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
              {/* My Dogs — switch/add the active pet (kept reachable here). */}
              <PetSwitcher variant="row" />

              {/* Business — only for accounts that are ALSO provider staff. Switches to Business
                  home (post moments + glance); a pure pet owner never sees this. */}
              {isBusiness ? (
                <>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: C.mutedBrown,
                      marginBottom: 10,
                      marginTop: 18,
                      marginLeft: 2,
                      letterSpacing: 0.8,
                    }}
                  >
                    {t("business.menu.item").toUpperCase()}
                  </Text>
                  <MenuItem
                    title={t("business.menu.item")}
                    emoji="🏪"
                    color={C.coral}
                    onPress={() => goMenu("/business")}
                  />
                </>
              ) : null}

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: C.mutedBrown,
                  marginBottom: 10,
                  marginTop: 18,
                  marginLeft: 2,
                  letterSpacing: 0.8,
                }}
              >
                {t("ownerMenu.sectionCommunity")}
              </Text>
              <MenuItem
                title={t("ownerMenu.community")}
                emoji="🐕"
                color={C.sageDark}
                onPress={() => goMenu("/(tabs)/more/community")}
              />

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: C.mutedBrown,
                  marginBottom: 10,
                  marginTop: 18,
                  marginLeft: 2,
                  letterSpacing: 0.8,
                }}
              >
                {t("ownerMenu.sectionAccount")}
              </Text>
              <MenuItem
                title={t("ownerMenu.myHub")}
                emoji="🗂️"
                color={C.sageDark}
                onPress={() => goMenu("/(tabs)/more/hub")}
              />
              <MenuItem
                title={t("ownerMenu.dogProfile")}
                emoji="🐾"
                color={C.terracotta}
                onPress={() => goMenu("/(tabs)/more/profile")}
              />
              <MenuItem
                title={t("ownerMenu.family")}
                emoji="👨‍👩‍👧"
                color={C.sageDark}
                onPress={() => goMenu("/pet-sharing")}
              />
              <MenuItem
                title={t("ownerMenu.lostFound")}
                emoji="🔍"
                color={C.coral}
                onPress={() => goMenu("/lost-found")}
              />
              <MenuItem
                title={t("ownerMenu.memories")}
                emoji="✨"
                color={C.apricot}
                onPress={() => goMenu("/memories")}
              />
              <MenuItem
                title={t("ownerMenu.reminders")}
                emoji="🔔"
                color="#FF9A62"
                onPress={() => goMenu("/(tabs)/more/reminders")}
              />
              <MenuItem
                title={t("ownerMenu.settings")}
                emoji="⚙️"
                color={C.mutedBrown}
                onPress={() => goMenu("/(tabs)/more/settings")}
              />

              <TouchableOpacity
                onPress={handleLogout}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                  backgroundColor: C.card,
                  borderRadius: 16,
                  marginTop: 20,
                  borderWidth: 1.5,
                  borderColor: "#FFCDD2",
                  gap: 10,
                }}
              >
                <LogOut size={18} color="#E53935" />
                <Text style={{ color: "#E53935", fontWeight: "700", fontSize: 15 }}>
                  {t("ownerMenu.resetApp")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default OwnerMenu;
