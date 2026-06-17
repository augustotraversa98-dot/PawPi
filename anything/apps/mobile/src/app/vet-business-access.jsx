import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, Building2, Check, ExternalLink } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { useAuth } from "@/utils/auth/useAuth";
import { useMyProviders, useCreateProvider } from "@/hooks/useProviders";

// The fixed provider types, mirroring the web onboarding
// (apps/web/src/app/provider/lib/providerTypes.js). provider_type is free-text
// server-side, but onboarding offers this exact set. Sent verbatim as
// provider_type — the backend seeds the matching capability.
const PROVIDER_TYPES = [
  { value: "vet", label: "Veterinary clinic", icon: "🩺" },
  { value: "walker", label: "Dog walker", icon: "🦮" },
  { value: "daycare", label: "Daycare / boarding", icon: "🏠" },
  { value: "shop", label: "Pet shop", icon: "🛍️" },
  { value: "groomer", label: "Groomer", icon: "✂️" },
];

// Where to finish setup. Provider management/publishing is web-primary for now, so
// after creating the draft we point owners at the web dashboard. Prefer the public
// app domain; fall back to the dev base URL.
const WEB_BASE = (
  process.env.EXPO_PUBLIC_APP_URL ||
  process.env.EXPO_PUBLIC_BASE_URL ||
  ""
).replace(/\/+$/, "");
const WEB_DASHBOARD_URL = WEB_BASE ? `${WEB_BASE}/provider` : null;

export default function VetBusinessAccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isReady, isAuthenticated, signIn, signUp } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Close Button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: insets.top + 16,
          right: 20,
          zIndex: 10,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <X size={24} color={COLORS.warmBrown} />
      </TouchableOpacity>

      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!isReady ? (
          <View style={{ paddingTop: 80, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isAuthenticated ? (
          <ProviderOnboarding />
        ) : (
          <SignedOutGate signIn={signIn} signUp={signUp} />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

// Shown when the visitor isn't logged in yet. A provider can only be created from an
// account (POST /api/providers needs auth), so we invite them to sign in / create one.
// Once the auth modal completes, isAuthenticated flips and the form appears.
function SignedOutGate({ signIn, signUp }) {
  return (
    <View>
      <Header
        title="List your business on PawPi"
        subtitle="Vets, walkers, daycares, shops, and groomers can create a business profile to reach pet owners. Log in or create an account to get started."
      />

      <PrimaryButton label="Create account" onPress={signUp} />
      <View style={{ height: 16 }} />
      <SecondaryButton label="Log in" onPress={signIn} />
    </View>
  );
}

// The real onboarding flow for a logged-in user.
function ProviderOnboarding() {
  const { data: myProviders = [], isLoading } = useMyProviders();
  const createProvider = useCreateProvider();

  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState(null);
  const [bio, setBio] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdProvider, setCreatedProvider] = useState(null);

  if (isLoading) {
    return (
      <View style={{ paddingTop: 80, alignItems: "center" }}>
        <ActivityIndicator color={COLORS.coral} />
      </View>
    );
  }

  // Just created one this session → success state.
  if (createdProvider) {
    return (
      <SuccessState
        providerName={createdProvider.name}
        heading="Your business is created!"
        body={`"${createdProvider.name}" is set up as a draft. Finish setup — publish, add your services, and invite staff — from the PawPi web dashboard.`}
      />
    );
  }

  // Already owns/works for a provider → reflect that instead of offering "create".
  if (myProviders.length > 0) {
    const primary = myProviders[0];
    return (
      <SuccessState
        providerName={primary?.name}
        heading="You're all set up"
        body={
          myProviders.length === 1
            ? `You already manage "${primary?.name}" on PawPi. Manage bookings, services, and staff from the web dashboard.`
            : `You manage ${myProviders.length} businesses on PawPi. Head to the web dashboard to manage bookings, services, and staff.`
        }
      />
    );
  }

  const handleCreate = async () => {
    setErrorMessage(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Please enter your business name.");
      return;
    }
    if (!providerType) {
      setErrorMessage("Please choose a business type.");
      return;
    }
    try {
      const provider = await createProvider.mutateAsync({
        name: trimmedName,
        provider_type: providerType,
        bio: bio.trim() || undefined,
      });
      setCreatedProvider(provider);
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <View>
      <Header
        title="Create your business"
        subtitle="Set up your business profile to reach pet owners and manage bookings. You can edit everything and publish later on the web dashboard."
      />

      {/* Business name */}
      <FieldLabel label="Business name" required />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Happy Paws Veterinary"
        placeholderTextColor={COLORS.mutedBrown}
        style={inputStyle}
      />

      {/* Provider type (single-select) */}
      <View style={{ height: 24 }} />
      <FieldLabel label="Business type" required />
      <View style={{ gap: 12 }}>
        {PROVIDER_TYPES.map((type) => {
          const selected = providerType === type.value;
          return (
            <TouchableOpacity
              key={type.value}
              onPress={() => setProviderType(type.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: selected ? "#FFF" : COLORS.sand,
                borderRadius: 16,
                padding: 16,
                borderWidth: 2,
                borderColor: selected ? COLORS.coral : "transparent",
              }}
            >
              <Text style={{ fontSize: 24, marginRight: 14 }}>{type.icon}</Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontWeight: "700",
                  color: COLORS.warmBrown,
                }}
              >
                {type.label}
              </Text>
              {selected && <Check size={22} color={COLORS.coral} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bio (optional) */}
      <View style={{ height: 24 }} />
      <FieldLabel label="Short bio" hint="Optional" />
      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder="Tell pet owners about your business…"
        placeholderTextColor={COLORS.mutedBrown}
        multiline
        style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
      />

      {errorMessage && (
        <Text
          style={{
            marginTop: 16,
            fontSize: 14,
            fontWeight: "600",
            color: "#B23B30",
          }}
        >
          {errorMessage}
        </Text>
      )}

      <View style={{ height: 28 }} />
      <PrimaryButton
        label={createProvider.isPending ? "Creating…" : "Create business"}
        onPress={handleCreate}
        loading={createProvider.isPending}
      />
    </View>
  );
}

// Shared success / already-onboarded panel with the web dashboard hand-off.
function SuccessState({ heading, body, providerName }) {
  return (
    <View>
      <View
        style={{
          alignSelf: "center",
          width: 72,
          height: 72,
          borderRadius: 24,
          backgroundColor: COLORS.peach,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Building2 size={34} color={COLORS.terracotta} />
      </View>
      <Text
        style={{
          fontSize: 26,
          fontWeight: "900",
          color: COLORS.warmBrown,
          textAlign: "center",
          marginBottom: 12,
          letterSpacing: -0.5,
        }}
      >
        {heading}
      </Text>
      <Text
        style={{
          fontSize: 16,
          color: COLORS.mutedBrown,
          lineHeight: 24,
          textAlign: "center",
          marginBottom: 28,
        }}
      >
        {body}
      </Text>

      <TouchableOpacity
        onPress={() => WEB_DASHBOARD_URL && Linking.openURL(WEB_DASHBOARD_URL)}
        disabled={!WEB_DASHBOARD_URL}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: COLORS.coral,
          borderRadius: 18,
          paddingVertical: 18,
          opacity: WEB_DASHBOARD_URL ? 1 : 0.6,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "800", color: "#FFF" }}>
          Open web dashboard
        </Text>
        <ExternalLink size={18} color="#FFF" />
      </TouchableOpacity>

      {WEB_DASHBOARD_URL && (
        <Text
          style={{
            marginTop: 14,
            fontSize: 13,
            color: COLORS.mutedBrown,
            textAlign: "center",
          }}
        >
          {WEB_DASHBOARD_URL}
        </Text>
      )}
    </View>
  );
}

// --- small presentational helpers -------------------------------------------

function Header({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 32 }}>
      <Text
        style={{
          fontSize: 32,
          fontWeight: "900",
          color: COLORS.warmBrown,
          marginBottom: 12,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 16, color: COLORS.mutedBrown, lineHeight: 24 }}>
        {subtitle}
      </Text>
    </View>
  );
}

function FieldLabel({ label, required, hint }) {
  return (
    <Text
      style={{
        fontSize: 15,
        fontWeight: "700",
        color: COLORS.warmBrown,
        marginBottom: 10,
      }}
    >
      {label}
      {required && <Text style={{ color: COLORS.coral }}> *</Text>}
      {hint && (
        <Text style={{ fontWeight: "500", color: COLORS.mutedBrown }}>
          {"  "}
          {hint}
        </Text>
      )}
    </Text>
  );
}

function PrimaryButton({ label, onPress, loading }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: COLORS.coral,
        borderRadius: 18,
        paddingVertical: 18,
        shadowColor: COLORS.coral,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading && <ActivityIndicator color="#FFF" />}
      <Text style={{ fontSize: 17, fontWeight: "800", color: "#FFF" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: COLORS.sand,
        borderRadius: 18,
        paddingVertical: 18,
        alignItems: "center",
        borderWidth: 2,
        borderColor: COLORS.coral,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "800", color: COLORS.coral }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const inputStyle = {
  borderWidth: 2,
  borderColor: COLORS.peach,
  backgroundColor: COLORS.card,
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 16,
  color: COLORS.warmBrown,
};
