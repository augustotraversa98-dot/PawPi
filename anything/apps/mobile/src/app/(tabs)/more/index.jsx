import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Stethoscope,
  Heart,
  ShoppingBag,
  Settings,
  User,
  ChevronRight,
  LogOut,
  Dog,
  PawPrint,
  Bell,
  Calendar,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/utils/auth/useAuth";

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
  const [petProfile, setPetProfile] = useState(null);
  const { setAuth } = useAuth();

  useEffect(() => {
    async function loadProfile() {
      const profile = await AsyncStorage.getItem("pet_profile");
      if (profile) setPetProfile(JSON.parse(profile));
    }
    loadProfile();
  }, []);

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
          More 🐾
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Profile Card */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/more/profile")}
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
          {petProfile?.photo ? (
            <Image
              source={{ uri: petProfile.photo }}
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
              {petProfile?.name || "My Dog"}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                marginTop: 2,
              }}
            >
              {petProfile?.breed || "Puppy"} · {petProfile?.age || ""}
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
          PET SERVICES
        </Text>
        <MenuItem
          title="Veterinary"
          emoji="🏥"
          color={C.coral}
          onPress={() => router.push("/(tabs)/more/vet")}
        />
        <MenuItem
          title="Adoption"
          emoji="🐶"
          color="#FF4081"
          onPress={() => router.push("/(tabs)/more/adopt")}
        />
        <MenuItem
          title="Pet Shop"
          emoji="🛍️"
          color={C.sageDark}
          onPress={() => router.push("/(tabs)/more/shop")}
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
        <MenuItem
          title="Dog Profile"
          emoji="🐾"
          color={C.terracotta}
          onPress={() => router.push("/(tabs)/more/profile")}
        />

        {/* NEW: Reminders & Routines */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/more/reminders")}
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
          onPress={() => router.push("/(tabs)/more/settings")}
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
  );
}
