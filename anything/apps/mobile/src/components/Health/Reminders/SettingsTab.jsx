import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from "react-native";
import {
  Bell,
  Moon,
  Clock,
  Volume2,
  Smartphone,
  CheckCircle,
  AlertCircle,
} from "lucide-react-native";
import * as Notifications from "expo-notifications";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function SettingsTab() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [timeSensitiveEnabled, setTimeSensitiveEnabled] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState(null);

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const handleNotificationPermission = async () => {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    setPermissionStatus(finalStatus);

    if (finalStatus === "granted") {
      Alert.alert(
        "✅ Notifications Enabled",
        "Social Pet can now remind you about feeding, walks, medication, and photo checks so Phoebe's care routine stays on track.",
      );
    } else {
      Alert.alert(
        "Permission Needed",
        "To receive reminders, please enable notifications in your device settings.",
        [
          { text: "Maybe Later", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              if (Platform.OS === "ios") {
                Notifications.openSettingsAsync();
              }
            },
          },
        ],
      );
    }
  };

  const handleQuietHoursConfig = () => {
    Alert.alert("Quiet Hours", "Configure quiet hours (coming soon)");
  };

  // DEV-only: fastest on-device proof that local notifications fire at all.
  const handleSendTestNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 Test notification",
          body: "If you see this, local notifications are working.",
        },
        // Typed DATE trigger — SDK 54 rejects a bare Date. channelId routes
        // Android to the "default" channel; iOS ignores it.
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(Date.now() + 10 * 1000),
          channelId: "default",
        },
      });
      Alert.alert(
        "Test scheduled",
        "A test notification will fire in ~10 seconds. Background the app to see the banner.",
      );
    } catch (error) {
      Alert.alert("Couldn't schedule test", String(error?.message ?? error));
    }
  };

  const SettingRow = ({
    icon: Icon,
    title,
    description,
    value,
    onValueChange,
    color,
  }) => (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: C.peach,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: (color || C.sage) + "20",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <Icon size={20} color={color || C.sage} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.warmBrown,
              marginBottom: 2,
            }}
          >
            {title}
          </Text>
          {description && (
            <Text style={{ fontSize: 12, color: C.mutedBrown, lineHeight: 18 }}>
              {description}
            </Text>
          )}
        </View>

        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: C.sand, true: (color || C.sage) + "60" }}
          thumbColor={value ? color || C.sage : C.peach}
          ios_backgroundColor={C.sand}
        />
      </View>
    </View>
  );

  const PermissionStatusCard = () => {
    if (!permissionStatus) return null;

    const isGranted = permissionStatus === "granted";
    const StatusIcon = isGranted ? CheckCircle : AlertCircle;
    const statusColor = isGranted ? C.sage : C.coral;
    const statusBg = isGranted ? "#E8F5E9" : "#FFF3F0";
    const statusBorder = isGranted ? "#C8E6C9" : "#FFCCC7";

    return (
      <View
        style={{
          backgroundColor: statusBg,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: statusBorder,
          marginBottom: 20,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <StatusIcon size={24} color={statusColor} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: isGranted ? "#2E7D32" : "#D32F2F",
              marginBottom: 2,
            }}
          >
            {isGranted ? "Notifications Enabled" : "Notifications Disabled"}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: isGranted ? "#558B2F" : "#B71C1C",
              lineHeight: 18,
            }}
          >
            {isGranted
              ? "You'll receive reminders for Phoebe's care routine"
              : "Enable notifications to receive reminders"}
          </Text>
        </View>
        {!isGranted && (
          <TouchableOpacity
            onPress={handleNotificationPermission}
            style={{
              backgroundColor: C.coral,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF" }}>
              Enable
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: C.warmBrown,
            marginBottom: 4,
          }}
        >
          Reminder Settings
        </Text>
        <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
          Customize how you receive reminders
        </Text>
      </View>

      {/* Permission Status */}
      <PermissionStatusCard />

      {/* DEV-only diagnostic — fastest on-device proof local notifications fire */}
      {__DEV__ && (
        <TouchableOpacity
          onPress={handleSendTestNotification}
          style={{
            backgroundColor: C.warmBrown,
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>
            Send test notification (10s)
          </Text>
        </TouchableOpacity>
      )}

      {/* Explanation */}
      <View
        style={{
          backgroundColor: "#E3F2FD",
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: "#BBDEFB",
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: "#1565C0",
            marginBottom: 8,
          }}
        >
          How reminders work
        </Text>
        <Text style={{ fontSize: 13, color: "#1976D2", lineHeight: 19 }}>
          Social Pet can remind you about feeding, walks, medication, and photo
          checks so Phoebe's care routine stays on track. Routines you create
          automatically generate reminders.
        </Text>
      </View>

      {/* Notification Settings */}
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: C.mutedBrown,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Preferences
      </Text>

      <SettingRow
        icon={Bell}
        title="Push Notifications"
        description="Receive notifications for reminders"
        value={notificationsEnabled}
        onValueChange={setNotificationsEnabled}
        color={C.coral}
      />

      <SettingRow
        icon={Clock}
        title="Time-Sensitive Alerts"
        description="Show prominent countdown for urgent reminders"
        value={timeSensitiveEnabled}
        onValueChange={setTimeSensitiveEnabled}
        color={C.coral}
      />

      <SettingRow
        icon={Volume2}
        title="Sound & Vibration"
        description="Play sound and vibrate for reminders"
        value={soundEnabled}
        onValueChange={setSoundEnabled}
        color={C.sage}
      />

      <SettingRow
        icon={Moon}
        title="Quiet Hours"
        description="Pause notifications during specific hours"
        value={quietHoursEnabled}
        onValueChange={setQuietHoursEnabled}
        color="#4DB8E8"
      />

      {quietHoursEnabled && (
        <TouchableOpacity
          onPress={handleQuietHoursConfig}
          style={{
            backgroundColor: "#E0F2FE",
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "#BAE6FD",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: "#0C4A6E",
              marginBottom: 4,
            }}
          >
            Configure Quiet Hours
          </Text>
          <Text style={{ fontSize: 12, color: "#0369A1" }}>
            Default: 10:00 PM - 7:00 AM · Tap to customize
          </Text>
        </TouchableOpacity>
      )}

      {/* Snooze Options */}
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: C.mutedBrown,
          marginBottom: 12,
          marginTop: 20,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Snooze
      </Text>

      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: C.peach,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 8,
          }}
        >
          Default Snooze Duration
        </Text>
        <Text style={{ fontSize: 13, color: C.mutedBrown, lineHeight: 19 }}>
          10 minutes, 30 minutes, 1 hour, Tonight, Tomorrow
        </Text>
      </View>

      {/* Info */}
      <View
        style={{
          marginTop: 20,
          backgroundColor: C.sand,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color: C.mutedBrown,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          💡 Time-sensitive reminders will show countdown cards and appear at
          the top of your notifications
        </Text>
      </View>
    </ScrollView>
  );
}
