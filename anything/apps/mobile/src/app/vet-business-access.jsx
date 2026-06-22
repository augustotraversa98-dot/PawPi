import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  X,
  Building2,
  Check,
  ExternalLink,
  FileText,
  Sparkles,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";
import * as DocumentPicker from "expo-document-picker";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import LocationField from "@/components/Map/LocationField";
import { useAuth } from "@/utils/auth/useAuth";
import {
  useMyProviders,
  useCreateProvider,
  useCreateProviderLocation,
  useEnrichProvider,
  useEnrichProviderDocument,
  useUpdateProvider,
  useCreateProviderService,
} from "@/hooks/useProviders";
import useUpload from "@/utils/useUpload";
import { isValidCoord } from "@/utils/walkBuddies";
import { toServiceRows, rowToServiceBody } from "@/utils/enrichmentDraft";

// The capabilities (services) a business can offer. A provider has MANY capabilities
// (the CORE MODEL — see docs/phase2-tickets/00-README.md), so onboarding is MULTI-select:
// a single business (e.g. a "vet shop") can offer several services at once and then
// surfaces under EVERY one in discovery. We offer ONLY capabilities that have a LIVE
// owner-facing service module (project rule: only feature live capabilities) — NOT
// transport/pharmacy (those modules aren't built yet). telehealth was added by ticket 2.18.
// Mirrors apps/web/src/app/api/utils/providerAuth.js ALLOWED_CAPABILITIES and the web labels.
const CAPABILITIES = [
  { value: "vet", label: "Veterinary clinic", icon: "🩺" },
  { value: "telehealth", label: "Telehealth (video vet)", icon: "📹" },
  { value: "groomer", label: "Groomer", icon: "✂️" },
  { value: "walker", label: "Dog walker", icon: "🦮" },
  { value: "daycare", label: "Daycare / boarding", icon: "🏠" },
  { value: "sitter", label: "Pet sitter", icon: "🏡" },
  { value: "trainer", label: "Trainer", icon: "🎓" },
  { value: "shop", label: "Pet shop", icon: "🛍️" },
  { value: "adoption", label: "Adoption / shelter", icon: "🐶" },
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
//
// EULA gate (Guideline 1.2): this is the SECOND account-creation entry point (alongside the
// owner welcome), so it must gate "Create account" on Terms acceptance identically. The
// checkbox + copy + "One more step" alert mirror welcome.jsx so both entry points match.
// "Log in" stays ungated.
function SignedOutGate({ signIn, signUp }) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleCreateAccount = () => {
    if (!agreedToTerms) {
      Alert.alert(
        "One more step",
        "Please agree to the Terms of Service and Privacy Policy to create an account.",
      );
      return;
    }
    signUp();
  };

  return (
    <View>
      <Header
        title="List your business on PawPi"
        subtitle="Vets, walkers, daycares, shops, and groomers can create a business profile to reach pet owners. Log in or create an account to get started."
      />

      {/* Terms acceptance gate (Guideline 1.2) — required, unchecked by default. */}
      <TouchableOpacity
        onPress={() => setAgreedToTerms((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreedToTerms }}
        accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        activeOpacity={0.8}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 24 }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: COLORS.coral,
            backgroundColor: agreedToTerms ? COLORS.coral : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {agreedToTerms ? <Check size={16} color="#FFF" /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: COLORS.mutedBrown, lineHeight: 19 }}>
          I agree to the{" "}
          <Text
            style={{ fontWeight: "800", color: COLORS.coral }}
            onPress={
              TERMS_OF_SERVICE_URL ? () => Linking.openURL(TERMS_OF_SERVICE_URL) : undefined
            }
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={{ fontWeight: "800", color: COLORS.coral }}
            onPress={
              PRIVACY_POLICY_URL ? () => Linking.openURL(PRIVACY_POLICY_URL) : undefined
            }
          >
            Privacy Policy
          </Text>
          , including PawPi's zero-tolerance policy for objectionable content and abusive behavior.
        </Text>
      </TouchableOpacity>

      {/* Create account — gated on the Terms box (mirrors welcome.jsx). */}
      <TouchableOpacity
        onPress={handleCreateAccount}
        accessibilityLabel="Create account"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          backgroundColor: COLORS.coral,
          borderRadius: 18,
          paddingVertical: 18,
          opacity: agreedToTerms ? 1 : 0.5,
          shadowColor: COLORS.coral,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "800", color: "#FFF" }}>
          Create account
        </Text>
      </TouchableOpacity>

      <View style={{ height: 16 }} />
      <SecondaryButton label="Log in" onPress={signIn} />
    </View>
  );
}

// The real onboarding flow for a logged-in user. The "magic onboarding" wizard (ticket 2.83): the
// provider gives a little (name + services + map pin + links + an optional price-list doc), taps
// "Build my profile", and the system PRE-FILLS the rest from the confirm-first enrichment seam (2.21
// + 2.82). They review/edit ONE screen, then save through the existing owner-identity routes.
// Degrades fully: with no enrichment keys, "Build my profile" returns an empty draft and onboarding
// is exactly the manual flow.
function ProviderOnboarding() {
  const { data: myProviders = [], isLoading } = useMyProviders();
  const createProvider = useCreateProvider();
  const createLocation = useCreateProviderLocation();
  const enrich = useEnrichProvider();
  const enrichDocument = useEnrichProviderDocument();
  const updateProvider = useUpdateProvider();
  const createService = useCreateProviderService();
  const [upload, { loading: uploading }] = useUpload();

  const [name, setName] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState([]);
  const [bio, setBio] = useState("");
  // Optional price-list/menu document (ticket 2.82) — transient input for the catalog proposal.
  const [doc, setDoc] = useState(null); // { url, filename, mimeType } | null
  const [building, setBuilding] = useState(false);
  // Review phase (confirm-first): the created provider + the proposed, editable draft.
  const [review, setReview] = useState(null); // { provider, description, serviceRows, photos } | null
  // Business location (ticket 2.81) — the shared map pin keeps address + lat/lng in sync. Optional:
  // a manual address still saves when location permission is denied (LocationField's "My location"
  // is the only thing that needs GPS; tap-to-drop + the address line work without it).
  const [location, setLocation] = useState(null); // { lat, lng, address } | null
  // Optional public links (ticket 2.20) — onboarding stays fast; all optional.
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");

  // Toggle a capability in/out of the selection, preserving CAPABILITIES order so the
  // primary (provider_type) is stable and the summary line reads naturally.
  const toggleCapability = (value) => {
    setSelectedCapabilities((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : CAPABILITIES.filter((c) => c.value === value || prev.includes(c.value)).map(
            (c) => c.value,
          ),
    );
  };
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdProvider, setCreatedProvider] = useState(null);

  // Pick a price-list/menu document (PDF/Excel/CSV) and upload it to the Storage path; we keep just
  // the URL as transient input for the catalog proposal (ticket 2.82). Best-effort + optional.
  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/csv", "text/comma-separated-values",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });
      const asset = res?.assets?.[0];
      if (!asset) return;
      const up = await upload({ reactNativeAsset: asset });
      if (up?.error || !up?.url) {
        setErrorMessage(up?.error || "Couldn't upload that document.");
        return;
      }
      setDoc({ url: up.url, filename: asset.name, mimeType: asset.mimeType });
    } catch (err) {
      setErrorMessage(err?.message || "Couldn't pick that document.");
    }
  };

  const handleBuildProfile = async () => {
    setErrorMessage(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Please enter your business name.");
      return;
    }
    if (selectedCapabilities.length === 0) {
      setErrorMessage("Please choose at least one service.");
      return;
    }
    setBuilding(true);
    try {
      const provider = await createProvider.mutateAsync({
        name: trimmedName,
        // provider_type stays required server-side (now display-only per 2.1); send the
        // FIRST/primary selected capability as the type. capabilities[] is the real
        // multi-service set the backend persists into provider_capabilities.
        provider_type: selectedCapabilities[0],
        capabilities: selectedCapabilities,
        bio: bio.trim() || undefined,
        // Optional links (ticket 2.20) — only send non-empty ones. IG/FB carry through (links-only).
        website_url: websiteUrl.trim() || undefined,
        instagram_url: instagramUrl.trim() || undefined,
        facebook_url: facebookUrl.trim() || undefined,
        google_maps_url: googleMapsUrl.trim() || undefined,
      });

      // Persist the map pin (ticket 2.81) as the provider's primary location, if set. Best-effort.
      const hasCoord = location && isValidCoord(location.lat, location.lng);
      if (provider?.id && (hasCoord || location?.address)) {
        try {
          await createLocation.mutateAsync({
            providerId: provider.id,
            name: trimmedName,
            address: location?.address || undefined,
            lat: hasCoord ? location.lat : undefined,
            lng: hasCoord ? location.lng : undefined,
          });
        } catch {
          // swallow — the provider still exists; the owner can add the location on the dashboard.
        }
      }

      // PROPOSE a profile from the links (+ the uploaded document). Both /enrich routes write NOTHING
      // and degrade cleanly: a 503 (no keys) or any failure just yields an empty draft → manual.
      let draftDescription = bio.trim();
      let services = [];
      const photos = [];
      try {
        const { draft } = await enrich.mutateAsync(provider.id);
        if (draft?.description) draftDescription = draftDescription || draft.description;
        if (Array.isArray(draft?.services)) services = services.concat(draft.services);
        if (Array.isArray(draft?.photos)) photos.push(...draft.photos);
      } catch {
        /* enrichment unconfigured / failed → manual */
      }
      if (doc?.url) {
        try {
          const { draft } = await enrichDocument.mutateAsync({
            providerId: provider.id,
            url: doc.url,
            filename: doc.filename,
            mimeType: doc.mimeType,
          });
          if (Array.isArray(draft?.services)) services = services.concat(draft.services);
        } catch {
          /* document enrichment unconfigured / failed → manual */
        }
      }

      const serviceRows = toServiceRows(services);
      // Anything to review? (a proposed description beyond what they typed, or candidate services)
      const hasProposal =
        serviceRows.length > 0 ||
        (draftDescription && draftDescription !== bio.trim());
      if (hasProposal) {
        setReview({ provider, description: draftDescription, serviceRows, photos });
      } else {
        setCreatedProvider(provider);
      }
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBuilding(false);
    }
  };

  // Apply the reviewed draft through the existing owner routes, then finish (ticket 2.83). The
  // description saves to the provider (bio); each SELECTED service row creates a real provider_service.
  // Best-effort per service so one bad row doesn't abort the rest; the business already exists.
  const saveReviewed = async () => {
    if (!review?.provider?.id) return;
    setBuilding(true);
    try {
      const desc = (review.description || "").trim();
      if (desc && desc !== (bio.trim() || "")) {
        try {
          await updateProvider.mutateAsync({ providerId: review.provider.id, bio: desc });
        } catch {
          /* non-fatal — keep going to services */
        }
      }
      for (const row of review.serviceRows.filter((r) => r.selected && r.name.trim())) {
        try {
          await createService.mutateAsync({
            providerId: review.provider.id,
            ...rowToServiceBody(row),
          });
        } catch {
          /* skip a failed row */
        }
      }
      setCreatedProvider(review.provider);
    } finally {
      setBuilding(false);
    }
  };

  const setRow = (key, patch) =>
    setReview((prev) =>
      prev
        ? {
            ...prev,
            serviceRows: prev.serviceRows.map((r) =>
              r.key === key ? { ...r, ...patch } : r,
            ),
          }
        : prev,
    );

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

  // Confirm-first review (ticket 2.83) — the provider exists as a draft; show the PROPOSED, editable
  // profile. Rendered BEFORE the myProviders check so the freshly-created business doesn't flip us to
  // the "already set up" state mid-review.
  if (review) {
    return (
      <ReviewStep
        review={review}
        setDescription={(t) => setReview((prev) => (prev ? { ...prev, description: t } : prev))}
        setRow={setRow}
        onSave={saveReviewed}
        saving={building}
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

      {/* Services offered (multi-select) — a business can offer several at once */}
      <View style={{ height: 24 }} />
      <FieldLabel label="Services you offer" required hint="Choose one or more" />
      <View style={{ gap: 12 }}>
        {CAPABILITIES.map((cap) => {
          const selected = selectedCapabilities.includes(cap.value);
          return (
            <TouchableOpacity
              key={cap.value}
              onPress={() => toggleCapability(cap.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
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
              <Text style={{ fontSize: 24, marginRight: 14 }}>{cap.icon}</Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontWeight: "700",
                  color: COLORS.warmBrown,
                }}
              >
                {cap.label}
              </Text>
              {selected && <Check size={22} color={COLORS.coral} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedCapabilities.length > 0 && (
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            fontWeight: "600",
            color: COLORS.mutedBrown,
          }}
        >
          Selected:{" "}
          {selectedCapabilities
            .map((v) => CAPABILITIES.find((c) => c.value === v)?.label)
            .filter(Boolean)
            .join(", ")}
        </Text>
      )}

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

      {/* Business location (ticket 2.81) — shared map pin; address + lat/lng stay in sync.
          Optional, and degrades cleanly: a typed address still saves when GPS is denied. */}
      <View style={{ height: 24 }} />
      <LocationField
        testID="business-location"
        label="Business location"
        value={location}
        onChange={setLocation}
      />

      {/* Public links (optional, ticket 2.20) — owners can add or edit these later. */}
      <View style={{ height: 24 }} />
      <FieldLabel label="Links" hint="Optional" />
      <TextInput
        value={websiteUrl}
        onChangeText={setWebsiteUrl}
        placeholder="Website (https://…)"
        placeholderTextColor={COLORS.mutedBrown}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />
      <View style={{ height: 12 }} />
      <TextInput
        value={instagramUrl}
        onChangeText={setInstagramUrl}
        placeholder="Instagram URL"
        placeholderTextColor={COLORS.mutedBrown}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />
      <View style={{ height: 12 }} />
      <TextInput
        value={facebookUrl}
        onChangeText={setFacebookUrl}
        placeholder="Facebook URL"
        placeholderTextColor={COLORS.mutedBrown}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />
      <View style={{ height: 12 }} />
      <TextInput
        value={googleMapsUrl}
        onChangeText={setGoogleMapsUrl}
        placeholder="Google Maps URL"
        placeholderTextColor={COLORS.mutedBrown}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />

      {/* Optional price-list / menu document (ticket 2.82) — we propose a catalog you review. */}
      <View style={{ height: 24 }} />
      <FieldLabel label="Price list or menu" hint="Optional — PDF, Excel or CSV" />
      <TouchableOpacity
        onPress={pickDocument}
        disabled={uploading}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 2,
          borderColor: COLORS.peach,
          borderStyle: "dashed",
          backgroundColor: COLORS.card,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        {uploading ? (
          <ActivityIndicator color={COLORS.coral} />
        ) : (
          <FileText size={18} color={doc ? COLORS.coral : COLORS.mutedBrown} />
        )}
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 14, color: doc ? COLORS.warmBrown : COLORS.mutedBrown }}
        >
          {doc ? doc.filename : "Upload a price list to pre-fill your services"}
        </Text>
        {doc && (
          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.coral }}>
            Change
          </Text>
        )}
      </TouchableOpacity>

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
        label={building ? "Building your profile…" : "Build my profile"}
        onPress={handleBuildProfile}
        loading={building}
        icon={<Sparkles size={18} color="#FFF" />}
      />
      <Text
        style={{
          marginTop: 12,
          fontSize: 13,
          color: COLORS.mutedBrown,
          textAlign: "center",
          lineHeight: 19,
        }}
      >
        We’ll pre-fill what we can from your links and document — you review and edit before anything
        goes live.
      </Text>
    </View>
  );
}

// The confirm-first review screen (ticket 2.83): the proposed profile, fully editable, before save.
function ReviewStep({ review, setDescription, setRow, onSave, saving }) {
  const { description, serviceRows, photos } = review;
  return (
    <View>
      <Header
        title="Review your profile"
        subtitle="We pre-filled this from your links and document. Edit anything, then save — nothing is published until you do."
      />

      <FieldLabel label="About your business" hint="Optional" />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Tell pet owners about your business…"
        placeholderTextColor={COLORS.mutedBrown}
        multiline
        style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
      />

      {serviceRows.length > 0 && (
        <>
          <View style={{ height: 24 }} />
          <FieldLabel label="Proposed services" hint="Toggle off any you don't want" />
          <View style={{ gap: 12 }}>
            {serviceRows.map((row) => (
              <View
                key={row.key}
                style={{
                  backgroundColor: row.selected ? "#FFF" : COLORS.sand,
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 2,
                  borderColor: row.selected ? COLORS.coral : "transparent",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setRow(row.key, { selected: !row.selected })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: row.selected }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: COLORS.coral,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: row.selected ? COLORS.coral : "transparent",
                    }}
                  >
                    {row.selected && <Check size={16} color="#FFF" />}
                  </TouchableOpacity>
                  <TextInput
                    value={row.name}
                    onChangeText={(t) => setRow(row.key, { name: t })}
                    placeholder="Service name"
                    placeholderTextColor={COLORS.mutedBrown}
                    style={[inputStyle, { flex: 1, paddingVertical: 10 }]}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TextInput
                    value={row.price}
                    onChangeText={(t) => setRow(row.key, { price: t })}
                    placeholder="Price"
                    placeholderTextColor={COLORS.mutedBrown}
                    keyboardType="decimal-pad"
                    style={[inputStyle, { flex: 1, paddingVertical: 10 }]}
                  />
                  <TextInput
                    value={row.duration}
                    onChangeText={(t) => setRow(row.key, { duration: t })}
                    placeholder="Mins"
                    placeholderTextColor={COLORS.mutedBrown}
                    keyboardType="number-pad"
                    style={[inputStyle, { width: 96, paddingVertical: 10 }]}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {photos?.length > 0 && (
        <Text style={{ marginTop: 16, fontSize: 13, color: COLORS.mutedBrown }}>
          {photos.length} candidate photo{photos.length === 1 ? "" : "s"} found — add them later from
          the web dashboard.
        </Text>
      )}

      <View style={{ height: 28 }} />
      <PrimaryButton
        label={saving ? "Saving…" : "Save & finish"}
        onPress={onSave}
        loading={saving}
        icon={<Check size={18} color="#FFF" />}
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

function PrimaryButton({ label, onPress, loading, icon }) {
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
      {loading ? <ActivityIndicator color="#FFF" /> : icon}
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
