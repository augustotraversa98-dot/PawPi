import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  X,
  Search,
  PawPrint,
  Megaphone,
  Store,
  User,
  Sparkles,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { useDiscover } from "@/hooks/useDiscover";
import { useSearch, useDebouncedValue } from "@/hooks/useSearch";

// Search & Discover on REAL data (ticket 2.25). No mock fallback — empty → empty state.
// When the (debounced) query is < 2 chars we show Discover (popular profiles + moments);
// otherwise we show real Search results (pets / owners / businesses).
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const searching = debounced.trim().length >= 2;

  const discover = useDiscover();
  const search = useSearch(debounced);

  const openPet = (petId) =>
    router.push({ pathname: "/pet-profile", params: { petId: String(petId) } });
  const openProvider = (slug) =>
    router.push({ pathname: "/service/provider", params: { slug } });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          {/* Back (not a close X): PP1 made this screen a card push, so it sits on a
              real back stack — the affordance has to read as "back", not "dismiss". */}
          <TouchableOpacity
            testID="search-back"
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              letterSpacing: -0.3,
            }}
          >
            {t("search.title")}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.sand,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.peach,
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.mutedBrown} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: COLORS.warmBrown, padding: 0 }}
            placeholder={t("search.placeholder")}
            placeholderTextColor={COLORS.mutedBrown}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("search.clearQuery")}
              onPress={() => setQuery("")}
            >
              <X size={16} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {searching ? (
          <SearchResults
            t={t}
            data={search.data}
            isLoading={search.isLoading}
            onOpenPet={openPet}
            onOpenProvider={openProvider}
          />
        ) : (
          <Discover
            t={t}
            data={discover.data}
            isLoading={discover.isLoading}
            onOpenPet={openPet}
          />
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ Icon, color, label }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
        gap: 6,
      }}
    >
      <Icon size={14} color={color} />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          color: COLORS.mutedBrown,
          letterSpacing: 0.7,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Loading() {
  return (
    <View style={{ alignItems: "center", paddingVertical: 50 }}>
      <ActivityIndicator color={COLORS.coral} />
    </View>
  );
}

function EmptyState({ emoji = "🔍", title, subtitle }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 50 }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: COLORS.mutedBrown,
          marginTop: 12,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function SearchResults({ t, data, isLoading, onOpenPet, onOpenProvider }) {
  if (isLoading) return <Loading />;
  const pets = data?.pets ?? [];
  const owners = data?.owners ?? [];
  const providers = data?.providers ?? [];
  const total = pets.length + owners.length + providers.length;

  if (total === 0) {
    return (
      <EmptyState
        title={t("search.noResults")}
        subtitle={t("search.noResultsHint")}
      />
    );
  }

  return (
    <View>
      {pets.length > 0 && (
        <>
          <SectionHeader
            Icon={PawPrint}
            color={COLORS.terracotta}
            label={t("search.pets")}
          />
          {pets.map((p) => (
            <ResultRow
              key={`pet-${p.id}`}
              testID="search-pet"
              avatar={p.avatar_url}
              title={p.name}
              subtitle={[p.breed, p.handle ? `@${p.handle}` : null]
                .filter(Boolean)
                .join(" • ")}
              onPress={() => onOpenPet(p.id)}
            />
          ))}
        </>
      )}

      {providers.length > 0 && (
        <>
          <SectionHeader
            Icon={Store}
            color={COLORS.coral}
            label={t("search.businesses")}
          />
          {providers.map((pr) => (
            <ResultRow
              key={`prov-${pr.id}`}
              testID="search-provider"
              avatar={pr.logo_url}
              fallbackIcon={Store}
              title={pr.name}
              subtitle={pr.provider_type}
              onPress={() => onOpenProvider(pr.slug)}
            />
          ))}
        </>
      )}

      {owners.length > 0 && (
        <>
          <SectionHeader
            Icon={User}
            color={COLORS.sage}
            label={t("search.petParents")}
          />
          {owners.map((o) => (
            <ResultRow
              key={`owner-${o.id}`}
              testID="search-owner"
              avatar={o.avatar_url}
              fallbackIcon={User}
              title={o.full_name || o.username}
              subtitle={o.username ? `@${o.username}` : null}
            />
          ))}
        </>
      )}
    </View>
  );
}

function Discover({ t, data, isLoading, onOpenPet }) {
  if (isLoading) return <Loading />;
  const profiles = data?.profiles ?? [];
  const moments = data?.moments ?? [];

  if (profiles.length === 0 && moments.length === 0) {
    return (
      <EmptyState
        emoji="🐾"
        title={t("search.nothingHere")}
        subtitle={t("search.nothingHereHint")}
      />
    );
  }

  return (
    <View>
      {profiles.length > 0 && (
        <>
          <SectionHeader
            Icon={PawPrint}
            color={COLORS.terracotta}
            label={t("search.popularProfiles")}
          />
          {profiles.map((p) => (
            <ResultRow
              key={`disc-${p.id}`}
              testID="discover-profile"
              avatar={p.avatar_url}
              title={p.name}
              subtitle={[
                p.breed,
                p.owner_name ? t("search.byOwner", { name: p.owner_name }) : null,
              ]
                .filter(Boolean)
                .join(" • ")}
              stats={[
                { Icon: PawPrint, value: p.paws ?? 0 },
                { Icon: Megaphone, value: p.barks ?? 0 },
              ]}
              onPress={() => onOpenPet(p.id)}
            />
          ))}
        </>
      )}

      {moments.length > 0 && (
        <>
          <SectionHeader
            Icon={Sparkles}
            color={COLORS.honey}
            label={t("search.popularMoments")}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            style={{ flexGrow: 0 }}
          >
            {moments.map((m) => (
              <TouchableOpacity
                key={`moment-${m.id}`}
                testID="discover-moment"
                onPress={() => onOpenPet(m.pet_id)}
                style={{
                  width: 200,
                  backgroundColor: COLORS.card,
                  borderRadius: 18,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                }}
              >
                <Image
                  source={{ uri: m.image_url }}
                  style={{ width: "100%", height: 140 }}
                  contentFit="cover"
                  transition={100}
                />
                <View style={{ padding: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Image
                      source={{ uri: m.pet_avatar }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: COLORS.coral,
                      }}
                      transition={100}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: COLORS.warmBrown,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {m.pet_name}
                    </Text>
                  </View>
                  {m.caption ? (
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.warmBrown,
                        lineHeight: 17,
                        marginBottom: 10,
                      }}
                      numberOfLines={2}
                    >
                      {m.caption}
                    </Text>
                  ) : null}
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
                  >
                    <Stat Icon={PawPrint} value={m.paw_count ?? 0} />
                    <Stat Icon={Megaphone} value={m.bark_count ?? 0} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function Stat({ Icon, value }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon size={12} color={COLORS.coral} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.mutedBrown }}>
        {value}
      </Text>
    </View>
  );
}

function ResultRow({
  testID,
  avatar,
  fallbackIcon: Fallback,
  title,
  subtitle,
  stats,
  onPress,
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      testID={testID}
      onPress={onPress}
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 16,
        flexDirection: "row",
        gap: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      {avatar ? (
        <Image
          source={{ uri: avatar }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 2,
            borderColor: COLORS.coral,
          }}
          transition={100}
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {Fallback ? <Fallback size={22} color={COLORS.coral} /> : null}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
        {stats ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginTop: 6,
            }}
          >
            {stats.map((s, i) => (
              <Stat key={i} Icon={s.Icon} value={s.value} />
            ))}
          </View>
        ) : null}
      </View>
    </Wrapper>
  );
}
