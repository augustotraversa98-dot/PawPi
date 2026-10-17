import React, { useEffect, useState } from "react";
import { COLORS } from "@/constants/theme";
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bell,
  Lock,
  Globe,
  HelpCircle,
  PawPrint,
  Activity,
  Check,
  Footprints,
  Trash2,
  Calendar,
  CalendarClock,
  ShoppingBag,
  MessageCircle,
  Heart,
  Star,
  DollarSign,
  UserPlus,
  ShieldCheck,
  FileText,
  ScrollText,
} from "lucide-react-native";
import { useAuth } from "@/utils/auth/useAuth";
import useBottomClearance from "@/hooks/useBottomClearance";
import WalkTrackingSettings from "@/components/Health/WalkActivity/WalkTrackingSettings";
import { WALK_TRACKING_INTEGRATIONS_ENABLED } from "@/constants/featureFlags";
import { formatAppVersion } from "@/utils/appVersion";
import {
  getLocalePreference,
  setLocalePreference,
} from "@/i18n/localePreference";
import {
  getNotificationPrefs,
  setCategoryEnabled,
} from "@/utils/notificationPreferences";
import { NOTIF_CATEGORIES, SCHEDULED_CATEGORIES } from "@/utils/notificationPolicy";
import {
  getOwnerNotificationPrefs,
  setOwnerCategoryEnabled,
  getQuietHours,
  setQuietHours,
  formatHour,
} from "@/utils/ownerNotificationPrefs";
import {
  BUSINESS_NOTIF_CATEGORIES,
  BUSINESS_NOTIF_INFO_CATEGORIES,
  CHANNEL_GROUP,
  categoryDefaultEnabled,
  getBusinessNotificationPrefs,
  setBusinessCategoryEnabled,
} from "@/utils/businessNotificationPrefs";
import {
  SUPPORT_EMAIL,
  HELP_CENTER_URL,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  EULA_URL,
} from "@/constants/legal";
import { readTelemetryEnabled, setTelemetryEnabled } from "@/telemetry/telemetryControl";
import { markExpectedNavigation } from "@/telemetry/navExpect";
import { clearAccountStorage } from "@/utils/accountStorage";

const C = {
  coral: COLORS.coral,
  peach: COLORS.peach,
  terracotta: COLORS.terracotta,
  cream: COLORS.cream,
  sand: COLORS.sand,
  card: COLORS.card,
  warmBrown: COLORS.warmBrown,
  mutedBrown: COLORS.mutedBrown,
};

// Language selector (ticket 2.29): System default / English / Español. Updates the app
// language immediately and persists the choice. "System default" follows the phone.
function LanguageSelector() {
  const { t } = useTranslation();
  const [pref, setPref] = useState("system");

  useEffect(() => {
    getLocalePreference().then(setPref);
  }, []);

  const choose = async (value) => {
    setPref(value);
    await setLocalePreference(value);
  };

  const OPTIONS = [
    { value: "system", label: t("settings.systemDefault") },
    { value: "en", label: t("settings.english") },
    { value: "es", label: t("settings.spanish") },
  ];

  return (
    <View>
      {OPTIONS.map((o, i) => (
        <TouchableOpacity
          key={o.value}
          testID={`lang-${o.value}`}
          onPress={() => choose(o.value)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            borderBottomWidth: i < OPTIONS.length - 1 ? 1 : 0,
            borderBottomColor: COLORS.peach,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, color: COLORS.warmBrown, fontWeight: "600" }}>
            {o.label}
          </Text>
          {pref === o.value ? <Check size={18} color={COLORS.coral} /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// "Help improve PawPi (anonymous)": the anonymous usage-telemetry switch (docs/privacy/telemetry.md). Default ON.
// Turning it OFF runs the opt-out flow (queue cleared, ONE opt_out event, random install id deleted, nothing
// more is sent); turning it back ON starts over with a NEW random id.
function TelemetryToggle() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    readTelemetryEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onChange = (value) => {
    setEnabled(value); // optimistic
    setTelemetryEnabled(value);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.peach,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Activity size={18} color={C.mutedBrown} />
      </View>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 15, color: C.warmBrown, fontWeight: "600" }}>
          {t("settings.telemetryTitle")}
        </Text>
        <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }} numberOfLines={2}>
          {t("settings.telemetryHint")}
        </Text>
        {/* The full explanation lives in the Privacy Policy page — keep this row to one short line. */}
        {PRIVACY_POLICY_URL ? (
          <TouchableOpacity
            testID="telemetry-learn-more"
            accessibilityRole="link"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
            style={{ alignSelf: "flex-start", paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12, color: C.coral, fontWeight: "700" }}>
              {t("settings.learnMore")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Switch
        testID="telemetry-toggle"
        accessibilityLabel={t("settings.telemetryTitle")}
        value={enabled}
        onValueChange={onChange}
        trackColor={{ false: C.peach, true: C.coral }}
        thumbColor="#FFF"
      />
    </View>
  );
}

// E5 notification rewrite: real, persisted per-category toggles. Only categories that a scheduler really
// reads are shown (SCHEDULED_CATEGORIES: Streak reminder, Care reminders) — Friends & social and Milestones
// gate nothing yet, so they are hidden rather than faked. They gate the wanted-trigger schedulers via
// notificationPreferences (AsyncStorage). No guilt/chore categories exist anymore.
//
// Notifications v2: when the server offers owner preferences (its flag is on) a server-backed row for the
// win-back email consent is added below the local toggles. Default OFF; absent from the UI otherwise.
function NotificationToggles() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(null);
  const [ownerPrefs, setOwnerPrefs] = useState(null);
  const [quiet, setQuiet] = useState(null);

  useEffect(() => {
    getNotificationPrefs().then(setPrefs);
    let alive = true;
    getOwnerNotificationPrefs().then((p) => {
      if (alive) setOwnerPrefs(p);
    });
    getQuietHours().then((q) => {
      if (alive) setQuiet(q);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleOwner = async (category, value) => {
    setOwnerPrefs((p) => ({ ...(p || {}), [category]: value })); // optimistic
    const ok = await setOwnerCategoryEnabled(category, value);
    if (!ok) setOwnerPrefs((p) => ({ ...(p || {}), [category]: !value })); // roll back: never show a false state
  };

  // Quiet hours: optimistic, then the server's saved value (roll back when the save failed).
  const changeQuiet = async (patch) => {
    const before = quiet;
    setQuiet((q) => ({ ...(q || {}), ...patch }));
    const saved = await setQuietHours(patch);
    setQuiet(saved || before);
  };
  const stepHour = (field, delta) => changeQuiet({ [field]: (quiet[field] + delta + 24) % 24 });

  const toggle = async (category, value) => {
    setPrefs((p) => ({ ...(p || {}), [category]: value })); // optimistic
    const next = await setCategoryEnabled(category, value);
    setPrefs(next);
  };

  const ALL_ROWS = [
    {
      key: NOTIF_CATEGORIES.STREAK,
      icon: Activity,
      label: t("notifPrefs.streak"),
      hint: t("notifPrefs.streakHint"),
    },
    {
      key: NOTIF_CATEGORIES.CARE,
      icon: Check,
      label: t("notifPrefs.care"),
      hint: t("notifPrefs.careHint"),
    },
  ];
  const ROWS = ALL_ROWS.filter((r) => SCHEDULED_CATEGORIES.includes(r.key));
  // Server-backed owner preferences (shown only when the server offers them): promotional => default OFF.
  const OWNER_ROWS = [
    // transactional (default ON)
    { key: "owner_bookings", label: t("notifPrefs.ownerBookings"), hint: t("notifPrefs.ownerBookingsHint") },
    { key: "owner_adoption", label: t("notifPrefs.ownerAdoption"), hint: t("notifPrefs.ownerAdoptionHint") },
    { key: "owner_walk_requests", label: t("notifPrefs.ownerWalkRequests"), hint: t("notifPrefs.ownerWalkRequestsHint") },
    { key: "owner_lost_alerts", label: t("notifPrefs.ownerLostAlerts"), hint: t("notifPrefs.ownerLostAlertsHint") },
    // promotional (opt-in, default OFF)
    {
      key: "weekly_digest_push",
      label: t("notifPrefs.weeklyDigestPush"),
      hint: t("notifPrefs.weeklyDigestPushHint"),
    },
    {
      key: "winback_push",
      label: t("notifPrefs.winbackPush"),
      hint: t("notifPrefs.winbackPushHint"),
    },
    {
      key: "winback_email",
      label: t("notifPrefs.winbackEmail"),
      hint: t("notifPrefs.winbackEmailHint"),
    },
  ];

  return (
    <View>
      {ROWS.map((row, i) => {
        const Icon = row.icon;
        const enabled = prefs ? prefs[row.key] !== false : true;
        return (
          <View
            key={row.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              borderBottomWidth: i < ROWS.length - 1 ? 1 : 0,
              borderBottomColor: C.peach,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
                marginRight: 14,
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Icon size={18} color={C.mutedBrown} />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontSize: 15, color: C.warmBrown, fontWeight: "600" }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
                {row.hint}
              </Text>
            </View>
            <Switch
              testID={`notif-toggle-${row.key}`}
              value={enabled}
              onValueChange={(v) => toggle(row.key, v)}
              trackColor={{ false: C.peach, true: C.coral }}
              thumbColor="#FFF"
            />
          </View>
        );
      })}
      {OWNER_ROWS.filter((r) => ownerPrefs && typeof ownerPrefs[r.key] === "boolean").map((row) => (
        <View
          key={row.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: C.peach,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 14,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Bell size={18} color={C.mutedBrown} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 15, color: C.warmBrown, fontWeight: "600" }}>{row.label}</Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>{row.hint}</Text>
          </View>
          <Switch
            testID={`notif-owner-toggle-${row.key}`}
            value={ownerPrefs[row.key] === true}
            onValueChange={(v) => toggleOwner(row.key, v)}
            trackColor={{ false: C.peach, true: C.coral }}
            thumbColor="#FFF"
          />
        </View>
      ))}
      {quiet && (
        <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.peach }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontSize: 15, color: C.warmBrown, fontWeight: "600" }}>{t("notifPrefs.quietHours")}</Text>
              <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>{t("notifPrefs.quietHoursHint")}</Text>
            </View>
            <Switch
              testID="quiet-hours-toggle"
              accessibilityLabel={t("notifPrefs.quietHours")}
              value={quiet.enabled}
              onValueChange={(v) => changeQuiet({ enabled: v })}
              trackColor={{ false: C.peach, true: C.coral }}
              thumbColor="#FFF"
            />
          </View>
          {quiet.enabled && (
            <View style={{ flexDirection: "row", marginTop: 10, gap: 12 }}>
              {[
                { field: "start", label: t("notifPrefs.quietFrom") },
                { field: "end", label: t("notifPrefs.quietUntil") },
              ].map(({ field, label }) => (
                <View key={field} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.sand, borderRadius: 12, borderWidth: 1, borderColor: C.peach, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <TouchableOpacity
                    testID={`quiet-${field}-dec`}
                    accessibilityLabel={`${label} -1`}
                    onPress={() => stepHour(field, -1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 20, color: C.warmBrown, fontWeight: "700" }}>−</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: C.mutedBrown }}>{label}</Text>
                    <Text testID={`quiet-${field}-value`} style={{ fontSize: 15, color: C.warmBrown, fontWeight: "700" }}>
                      {formatHour(quiet[field])}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`quiet-${field}-inc`}
                    accessibilityLabel={`${label} +1`}
                    onPress={() => stepHour(field, 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 20, color: C.warmBrown, fontWeight: "700" }}>+</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// BX4 + BN2 business-mode notifications: SERVER-BACKED per-category preferences that gate real,
// server-sent business notifications (migration 0108 / GET+PUT /api/notification-prefs). Distinct
// from the pet-owner E5 toggles above (client-side AsyncStorage). BN2 groups the categories by their
// PUSH channel class (businessNotificationPrefs.js):
//   • "Notify my phone" (PUSH, default ON)   — booking / order / message / adoption / walk requests.
//   • "Optional push"   (OPTIONAL, default OFF) — reviews / payouts (opt-in).
//   • "In-app only"     (info, no toggle)     — post activity / followers: always a bell, never a push.
// Every category ALWAYS writes an in-app bell; a toggle only governs the phone push. Icons live here;
// labels/hints are i18n keys under bizNotif.*.
const BUSINESS_NOTIF_ICON = {
  walk_requests: Footprints,
  biz_booking: Calendar,
  biz_booking_change: CalendarClock,
  biz_order: ShoppingBag,
  biz_message: MessageCircle,
  biz_adoption_application: Heart,
  biz_review: Star,
  biz_payout: DollarSign,
  biz_post_engagement: PawPrint,
  biz_follow: UserPlus,
};

// A small header above each channel group.
function GroupHeader({ label }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "800",
        color: C.mutedBrown,
        letterSpacing: 0.6,
        marginTop: 8,
        marginBottom: 4,
      }}
    >
      {label}
    </Text>
  );
}

// One category row. `onToggle` present → a Switch (push categories); absent → an info row with a
// "bell only" tag (in-app-only categories are shown for transparency but can't be turned off).
function BusinessNotifRow({ row, enabled, onToggle, isLast, t }) {
  const Icon = BUSINESS_NOTIF_ICON[row.key] || Bell;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: C.peach,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Icon size={18} color={C.mutedBrown} />
      </View>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 15, color: C.warmBrown, fontWeight: "600" }}>
          {t(row.labelKey)}
        </Text>
        <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
          {t(row.hintKey)}
        </Text>
      </View>
      {onToggle ? (
        <Switch
          testID={`biz-notif-toggle-${row.key}`}
          value={enabled}
          onValueChange={(v) => onToggle(row.key, v)}
          trackColor={{ false: C.peach, true: C.coral }}
          thumbColor="#FFF"
        />
      ) : (
        <View
          testID={`biz-notif-info-${row.key}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: C.sand,
          }}
        >
          <Bell size={12} color={C.mutedBrown} />
        </View>
      )}
    </View>
  );
}

function BusinessNotificationToggles() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    getBusinessNotificationPrefs().then(setPrefs);
  }, []);

  const toggle = async (category, value) => {
    setPrefs((p) => ({ ...(p || {}), [category]: value })); // optimistic
    const next = await setBusinessCategoryEnabled(category, value);
    setPrefs(next);
  };

  // The enabled state to display: the loaded pref, else the category's catalog default.
  const isEnabled = (key) =>
    prefs && prefs[key] !== undefined ? prefs[key] : categoryDefaultEnabled(key);

  const pushRows = BUSINESS_NOTIF_CATEGORIES.filter((c) => c.group === CHANNEL_GROUP.PUSH);
  const optionalRows = BUSINESS_NOTIF_CATEGORIES.filter((c) => c.group === CHANNEL_GROUP.OPTIONAL);

  return (
    <View>
      {/* Notify my phone (PUSH, default ON) */}
      <GroupHeader label={t("bizNotif.groupPush")} />
      {pushRows.map((row, i) => (
        <BusinessNotifRow
          key={row.key}
          row={row}
          t={t}
          enabled={isEnabled(row.key)}
          onToggle={toggle}
          isLast={i === pushRows.length - 1}
        />
      ))}

      {/* Optional push (OPTIONAL_PUSH, default OFF) */}
      {optionalRows.length > 0 && (
        <>
          <GroupHeader label={t("bizNotif.groupOptional")} />
          {optionalRows.map((row, i) => (
            <BusinessNotifRow
              key={row.key}
              row={row}
              t={t}
              enabled={isEnabled(row.key)}
              onToggle={toggle}
              isLast={i === optionalRows.length - 1}
            />
          ))}
        </>
      )}

      {/* In-app only (info group — shown, never pushed, no toggle) */}
      {BUSINESS_NOTIF_INFO_CATEGORIES.length > 0 && (
        <>
          <GroupHeader label={t("bizNotif.groupInApp")} />
          <Text style={{ fontSize: 12, color: C.mutedBrown, marginBottom: 4 }}>
            {t("bizNotif.groupInAppNote")}
          </Text>
          {BUSINESS_NOTIF_INFO_CATEGORIES.map((row, i) => (
            <BusinessNotifRow
              key={row.key}
              row={row}
              t={t}
              onToggle={null}
              isLast={i === BUSINESS_NOTIF_INFO_CATEGORIES.length - 1}
            />
          ))}
        </>
      )}
    </View>
  );
}

// Shared, route-agnostic app-settings body (BX3 + BX4). Both the pet-owner route
// app/(tabs)/more/settings.jsx AND the business route app/business/settings.jsx render this
// component, so the SAME settings UI is reachable from either host without the business host
// having to jump into the (tabs) pet-owner group. The header back button is always router.back(),
// so it returns to whichever screen pushed it (More in the pet app, Profile in business mode).
//
// mode (BX4): "petOwner" (default) renders the pet-owner notification categories + the
// Walk-tracking / Apple Health block, exactly as before — the pet route is byte-for-byte
// unchanged. "business" swaps in the server-backed business categories and HIDES the pet-owner
// categories + the walk-tracking block; Language / Help / Contact / Delete account stay in both.
export default function AppSettings({ mode = "petOwner" }) {
  const isBusiness = mode === "business";
  const insets = useSafeAreaInsets();
  // Keep the last rows / footer clear of the native tab bar (QA 2026-10-16 bug 03).
  const bottomClearance = useBottomClearance();
  const router = useRouter();
  const { t } = useTranslation();
  const { setAuth } = useAuth();
  const [deleting, setDeleting] = useState(false);

  // In-app account deletion (App Store 5.1.1(v)). Two-step confirm → DELETE /api/account
  // (irreversibly removes the account + owner-scoped data server-side) → clear local session → welcome.
  const performDelete = async () => {
    try {
      setDeleting(true);
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || t("settings.deleteFailed"));
      }
      await clearAccountStorage(); // account data only; language / notification prefs / telemetry opt-out stay
      if (setAuth) setAuth(null);
      markExpectedNavigation(); // anonymous telemetry: this landing on Welcome is a user action
      router.replace("/welcome");
    } catch (e) {
      setDeleting(false);
      Alert.alert(t("settings.deleteErrorTitle"), e.message || t("common.pleaseTryAgain"));
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteAccountTitle"),
      t("settings.deleteAccountBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.deleteAccountCta"),
          style: "destructive",
          onPress: () =>
            Alert.alert(
              t("settings.deletePermanentTitle"),
              t("settings.deletePermanentBody"),
              [
                { text: t("settings.keepAccount"), style: "cancel" },
                { text: t("settings.deleteForever"), style: "destructive", onPress: performDelete },
              ],
            ),
        },
      ],
    );
  };

  // Contact Us → opens the user's mail app to the support address (Guideline 1.2 / App Store
  // "Support URL"). Always works — SUPPORT_EMAIL has a default.
  const openContactUs = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("settings.supportSubject"))}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t("settings.contactUs"), t("settings.emailUsAt", { email: SUPPORT_EMAIL })),
    );
  };

  // Help Center → the hosted help/contact page when configured, otherwise falls back to email.
  const openHelpCenter = () => {
    if (HELP_CENTER_URL) {
      Linking.openURL(HELP_CENTER_URL).catch(() => openContactUs());
    } else {
      openContactUs();
    }
  };

  // Privacy Policy / Terms / EULA → the hosted pages on www.pawpi.info (constants/legal.js). A row only
  // renders when its URL is configured, so there is never a dead link.
  const openLegalUrl = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t("settings.privacyPolicy"), t("common.pleaseTryAgain")),
    );
  };

  const SettingRow = ({
    label,
    icon: Icon,
    value,
    isSwitch = false,
    onValueChange,
    onPress,
  }) => {
    // A row with an onPress becomes a real tappable link (Help Center / Contact Us); otherwise
    // it stays a plain View. Switch rows are never pressable as a whole.
    const RowContainer = onPress && !isSwitch ? TouchableOpacity : View;
    return (
    <RowContainer
      {...(onPress && !isSwitch
        ? { onPress, accessibilityRole: "button", accessibilityLabel: label }
        : {})}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.peach,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Icon size={18} color={C.mutedBrown} />
      </View>
      <Text
        style={{ flex: 1, fontSize: 15, color: C.warmBrown, fontWeight: "600" }}
      >
        {label}
      </Text>
      {isSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: C.peach, true: C.coral }}
          thumbColor="#FFF"
        />
      ) : (
        <Text style={{ color: C.mutedBrown, fontSize: 13, fontWeight: "600" }}>
          {value}
        </Text>
      )}
    </RowContainer>
    );
  };

  const SectionCard = ({ children }) => (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 18,
        paddingHorizontal: 16,
        marginBottom: 22,
        borderWidth: 1,
        borderColor: C.peach,
        shadowColor: C.terracotta,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      }}
    >
      {children}
    </View>
  );

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
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.warmBrown }}>
          {t("settings.title")} ⚙️
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomClearance + 24 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          {t("notifications.title").toUpperCase()}
        </Text>
        <SectionCard>
          {isBusiness ? <BusinessNotificationToggles /> : <NotificationToggles />}
        </SectionCard>

        {!isBusiness && WALK_TRACKING_INTEGRATIONS_ENABLED && (
          <>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: C.mutedBrown,
                marginBottom: 10,
                letterSpacing: 0.8,
              }}
            >
  {t("settings.walkTrackingSection")}
            </Text>
            <SectionCard>
              <View style={{ paddingVertical: 6 }}>
                <WalkTrackingSettings />
              </View>
            </SectionCard>
          </>
        )}

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
          {t("settings.language").toUpperCase()}
        </Text>
        <SectionCard>
          <LanguageSelector />
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
{t("settings.privacyDataSection")}
        </Text>
        <SectionCard>
          <SettingRow label={t("settings.accountPrivacy")} icon={Lock} value={t("settings.accountPublic")} />
          <TelemetryToggle />
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
{t("settings.supportSection")}
        </Text>
        <SectionCard>
          <SettingRow label={t("settings.helpCenter")} icon={HelpCircle} value="→" onPress={openHelpCenter} />
          <SettingRow label={t("settings.contactUs")} icon={Globe} value="→" onPress={openContactUs} />
          {PRIVACY_POLICY_URL ? (
            <SettingRow
              label={t("settings.privacyPolicy")}
              icon={ShieldCheck}
              value="→"
              onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}
            />
          ) : null}
          {TERMS_OF_SERVICE_URL ? (
            <SettingRow
              label={t("settings.termsOfService")}
              icon={FileText}
              value="→"
              onPress={() => openLegalUrl(TERMS_OF_SERVICE_URL)}
            />
          ) : null}
          {EULA_URL ? (
            <SettingRow
              label={t("settings.eula")}
              icon={ScrollText}
              value="→"
              onPress={() => openLegalUrl(EULA_URL)}
            />
          ) : null}
        </SectionCard>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: C.mutedBrown,
            marginBottom: 10,
            letterSpacing: 0.8,
          }}
        >
{t("settings.accountSection")}
        </Text>
        <SectionCard>
          <TouchableOpacity
            testID="delete-account"
            onPress={confirmDeleteAccount}
            disabled={deleting}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              opacity: deleting ? 0.5 : 1,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: "#FBE7E4",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 14,
                borderWidth: 1,
                borderColor: "#F3B5AD",
              }}
            >
              <Trash2 size={18} color="#B23A2E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: "#B23A2E", fontWeight: "700" }}>
                {deleting ? t("settings.deleting") : t("settings.deleteAccount")}
              </Text>
              <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
                {t("settings.deleteAccountHint")}
              </Text>
            </View>
          </TouchableOpacity>
        </SectionCard>

        <View style={{ alignItems: "center", marginTop: 12, gap: 6 }}>
          <PawPrint size={20} color={C.peach} />
          <Text
            style={{ color: C.mutedBrown, fontSize: 12, fontWeight: "600" }}
          >
            {`PawPi ${formatAppVersion()}`.trim()}
          </Text>
          <Text style={{ color: C.peach, fontSize: 11 }}>
            {t("settings.madeWith")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
