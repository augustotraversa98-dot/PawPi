import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, MapPin, Heart } from "lucide-react-native";
import { ADOPTABLE_DOGS } from "../../../data/mockData";

const C = {
  coral: "#FF6F61",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function AdoptScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
        >
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.warmBrown }}>
            Adoption 🐶
          </Text>
          <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 1 }}>
            Find your new best friend
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 14,
            letterSpacing: 0.6,
          }}
        >
          DOGS LOOKING FOR A HOME 🐾
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {ADOPTABLE_DOGS.map((dog) => (
            <TouchableOpacity
              key={dog.id}
              activeOpacity={0.92}
              style={{
                width: "48%",
                backgroundColor: C.card,
                borderRadius: 22,
                marginBottom: 14,
                overflow: "hidden",
                shadowColor: C.terracotta,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 14,
                elevation: 3,
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Image
                source={{ uri: dog.image }}
                style={{ width: "100%", height: 165 }}
                contentFit="cover"
              />
              <View style={{ padding: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: C.warmBrown,
                    }}
                  >
                    {dog.name}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: C.coral, fontWeight: "700" }}
                  >
                    {dog.age}
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 12, color: C.mutedBrown, marginBottom: 6 }}
                >
                  {dog.breed}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                    gap: 4,
                  }}
                >
                  <MapPin size={11} color={C.mutedBrown} />
                  <Text style={{ fontSize: 11, color: C.mutedBrown }}>
                    {dog.location}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 4,
                    marginBottom: 12,
                  }}
                >
                  {dog.tags.slice(0, 2).map((tag) => (
                    <View
                      key={tag}
                      style={{
                        backgroundColor: C.sand,
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: C.peach,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          color: C.mutedBrown,
                          fontWeight: "600",
                        }}
                      >
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: C.coral,
                    padding: 10,
                    borderRadius: 12,
                    alignItems: "center",
                    shadowColor: C.coral,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 5,
                  }}
                >
                  <Text
                    style={{ color: "#FFF", fontWeight: "800", fontSize: 12 }}
                  >
                    Learn More 🐾
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
