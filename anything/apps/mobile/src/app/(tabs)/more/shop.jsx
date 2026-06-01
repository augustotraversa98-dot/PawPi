import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShoppingCart, Plus } from "lucide-react-native";
import { SHOP_PRODUCTS } from "../../../data/mockData";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  honey: "#FFC857",
  terracotta: "#B75D32",
  sageDark: "#5A8A74",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

const CAT_COLORS = {
  Food: { bg: "#FFF8E1", text: "#B8860B" },
  Toys: { bg: "#E8F5E9", text: "#2E7D32" },
  Treats: { bg: "#FFF0EC", text: "#BF360C" },
  Accessories: { bg: "#EEF4FF", text: "#3B5CC4" },
  Health: { bg: "#F3E5F5", text: "#7B1FA2" },
};

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(2);

  const addToCart = () => {
    setCartCount((c) => c + 1);
    Alert.alert("🛍️ Added!", "Item added to your cart.");
  };

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
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 14 }}
          >
            <ArrowLeft size={22} color={C.warmBrown} />
          </TouchableOpacity>
          <View>
            <Text
              style={{ fontSize: 22, fontWeight: "800", color: C.warmBrown }}
            >
              Pet Shop 🛍️
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 1 }}>
              Everything your pup needs
            </Text>
          </View>
        </View>
        <TouchableOpacity style={{ position: "relative", padding: 8 }}>
          <ShoppingCart size={22} color={C.warmBrown} />
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              backgroundColor: C.coral,
              width: 18,
              height: 18,
              borderRadius: 9,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>
              {cartCount}
            </Text>
          </View>
        </TouchableOpacity>
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
          FEATURED PRODUCTS
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {SHOP_PRODUCTS.map((product) => {
            const catStyle = CAT_COLORS[product.category] || {
              bg: C.sand,
              text: C.mutedBrown,
            };
            return (
              <View
                key={product.id}
                style={{
                  width: "48%",
                  backgroundColor: C.card,
                  borderRadius: 22,
                  marginBottom: 14,
                  overflow: "hidden",
                  shadowColor: C.terracotta,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.07,
                  shadowRadius: 14,
                  elevation: 3,
                  borderWidth: 1,
                  borderColor: C.peach,
                }}
              >
                <Image
                  source={{ uri: product.image }}
                  style={{ width: "100%", height: 140 }}
                  contentFit="cover"
                />
                <View style={{ padding: 12 }}>
                  <View
                    style={{
                      backgroundColor: catStyle.bg,
                      alignSelf: "flex-start",
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 7,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: catStyle.text,
                        fontWeight: "700",
                      }}
                    >
                      {product.category}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 8,
                    }}
                    numberOfLines={1}
                  >
                    {product.name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: C.coral,
                      }}
                    >
                      {product.price}
                    </Text>
                    <TouchableOpacity
                      onPress={addToCart}
                      style={{
                        backgroundColor: C.coral,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        justifyContent: "center",
                        alignItems: "center",
                        shadowColor: C.coral,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 5,
                      }}
                    >
                      <Plus size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
