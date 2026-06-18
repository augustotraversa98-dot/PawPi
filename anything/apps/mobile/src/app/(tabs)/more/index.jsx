import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Settings,
  User,
  ChevronRight,
  LogOut,
  Dog,
  PawPrint,
  Bell,
  Calendar,
  Menu,
  X,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/utils/auth/useAuth";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";

// Mirror the pet-profile age formatting so the header reads "2 yrs 3 mos".
function formatAge(years, months) {
  const y = Number(years) || 0;
  const m = Number(months) || 0;
  const parts = [];
  if (y > 0) parts.push(`${y} ${y === 1 ? "yr" : "yrs"}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

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

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setAuth } = useAuth();
  // Instagram-style (ticket 2.39): this tab is the owner's Profile; the former
  // "More" menu lives behind a top-right burger. goMenu closes the sheet first
  // so the destination push lands cleanly (no stale modal layered over a tab).
  const [menuVisible, setMenuVisible] = useState(false);
  const goMenu = (path) => {
    setMenuVisible(false);
    router.push(path);
  };

  // The header reflects the reactive current pet (single source of truth), so it
  // updates immediately when the active pet is switched or a new pet is created —
  // no stale AsyncStorage snapshot (ticket 2.34).
  const { data: currentPet } = useCurrentPet();

  const MenuItem = ({ title, icon: Icon, color, emoji, onPress }) => (
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
          backgroundColor: color + "20",
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

  const handleLogout = async () => {
    try {
      console.log("[More] Logging out user");
      await AsyncStorage.clear();

      // Clear auth state
      if (setAuth) {
        setAuth(null);
      }

      console.log("[More] Redirecting to welcome");
      router.replace("/welcome");
    } catch (error) {
      console.error("[More] Logout error:", error);
      // Force redirect even on error
      router.replace("/welcome");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: C.warmBrown,
            letterSpacing: -0.5,
          }}
        >
          Profile 🐾
        </Text>
        {/* Burger → the full "More" menu (every former More destination). */}
        <TouchableOpacity
          accessibilityLabel="Open menu"
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
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Profile Card */}
        <TouchableOpacity
          onPress={() => goMenu("/(tabs)/more/profile")}
          activeOpacity={0.92}
          style={{
            backgroundColor: C.coral,
            borderRadius: 26,
            padding: 20,
            marginBottom: 22,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: C.coral,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 14,
            elevation: 6,
          }}
        >
          {currentPet?.avatar_url ? (
            <Image
              source={{ uri: currentPet.avatar_url }}
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                borderWidth: 2,
                borderColor: "#FFF",
              }}
            />
          ) : (
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                backgroundColor: "rgba(255,255,255,0.25)",
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.5)",
              }}
            >
              <Dog size={30} color="#FFF" />
            </View>
          )}
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFF" }}>
              {currentPet?.name || "My Dog"}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                marginTop: 2,
              }}
            >
              {currentPet?.breed || "Puppy"}
              {currentPet?.age_years || currentPet?.age_months
                ? ` · ${formatAge(currentPet.age_years, currentPet.age_months)}`
                : ""}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.22)",
              padding: 10,
              borderRadius: 14,
            }}
          >
            <PawPrint size={20} color="#FFF" />
          </View>
        </TouchableOpacity>

        {/* My Dogs — switch/add the active pet (stays on the profile body). */}
        <PetSwitcher variant="row" />
      </ScrollView>

      {/* ── Burger menu (ticket 2.39): every former "More" destination lives
          here, opened from the profile's top-right ☰. Closing first keeps tab
          nav clean (honors the 2.19 fix). ── */}
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
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
              >
                More
              </Text>
              <TouchableOpacity
                accessibilityLabel="Close menu"
                onPress={() => setMenuVisible(false)}
              >
                <X size={22} color={C.mutedBrown} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            marginLeft: 2,
            letterSpacing: 0.8,
          }}
        >
          COMMUNITY
        </Text>
        <MenuItem
          title="Community"
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
            marginLeft: 2,
            marginTop: 18,
            letterSpacing: 0.8,
          }}
        >
          YOUR ACCOUNT
        </Text>

        {/* My Hub — the unified owner overview (bookings, orders, access, saved) */}
        <MenuItem
          title="My Hub"
          emoji="🗂️"
          color={C.sageDark}
          onPress={() => goMenu("/(tabs)/more/hub")}
        />

        <MenuItem
          title="Dog Profile"
          emoji="🐾"
          color={C.terracotta}
          onPress={() => goMenu("/(tabs)/more/profile")}
        />

        <MenuItem
          title="Family & Caregivers"
          emoji="👨‍👩‍👧"
          color={C.sageDark}
          onPress={() => goMenu("/pet-sharing")}
        />

        <MenuItem
          title="Lost & Found"
          emoji="🔍"
          color={C.coral}
          onPress={() => goMenu("/lost-found")}
        />

        {/* NEW: Reminders & Routines */}
        <TouchableOpacity
          onPress={() => goMenu("/(tabs)/more/reminders")}
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
              backgroundColor: "#FF9A62" + "20",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 14,
            }}
          >
            <Text style={{ fontSize: 22 }}>🔔</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
            >
              Reminders & Routines
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                marginTop: 2,
                lineHeight: 16,
              }}
            >
              Feeding, walks, photo checks, medication, and care schedules
            </Text>
          </View>
          <ChevronRight size={18} color={C.peach} />
        </TouchableOpacity>

        <MenuItem
          title="Settings"
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
            Reset App Data
          </Text>
        </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
