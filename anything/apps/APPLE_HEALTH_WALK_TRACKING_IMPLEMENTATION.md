# Apple Health / Apple Watch Walk Tracking - Implementation Guide

## 📋 Complete Technical Reference

This document provides the complete technical implementation for Apple Health and Apple Watch walk tracking placeholders in Social Pet.

---

## 🗄️ Database Schema Changes

### Table: `health_walk_logs`

**New columns added:**

```sql
ALTER TABLE health_walk_logs 
ADD COLUMN IF NOT EXISTS average_speed NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS steps INTEGER,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS source_device TEXT;
```

**Column definitions:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `average_speed` | NUMERIC(5,2) | YES | NULL | Average walking speed in mph or km/h |
| `steps` | INTEGER | YES | NULL | Total step count from HealthKit or Watch |
| `source` | TEXT | YES | `'manual'` | Tracking source: `manual`, `apple_health`, `apple_watch`, `gps`, `unknown` |
| `source_device` | TEXT | YES | NULL | Device identifier (e.g., "Apple Watch Series 8", "iPhone 14 Pro") |

**Existing relevant columns:**

| Column | Type | Description |
|--------|------|-------------|
| `distance` | NUMERIC(10,2) | Distance in miles or kilometers |
| `distance_unit` | TEXT | Unit of distance (`miles` or `kilometers`) |
| `pace` | TEXT | Walking pace: `relaxed`, `normal`, `active`, or calculated (e.g., "15:32") |

---

## 📁 File Structure

```
/apps/
├── mobile/src/
│   ├── utils/
│   │   └── healthKitIntegration.js          # HealthKit integration (213 lines)
│   └── components/Health/WalkActivity/
│       ├── WalkActivityModal.jsx            # Updated with tracking settings
│       ├── PostWalkFeedbackModal.jsx        # Updated with source display
│       └── WalkTrackingSettings.jsx         # New tracking settings UI (248 lines)
│
├── web/src/app/api/health/
│   └── walk-logs/
│       └── route.js                         # Updated API with tracking fields
│
└── (tabs)/more/
    └── settings.jsx                         # Updated with tracking section
```

---

## 🔧 Backend API Changes

### POST `/api/health/walk-logs`

**Updated request body:**

```javascript
{
  // Existing fields
  petId: 123,
  startTime: "2026-05-09T08:30:00.000Z",
  durationMinutes: 25,
  distance: 1.2,
  distanceUnit: "miles",
  pace: "normal",
  energyAfter: "normal",
  pottyEvents: { pee: 1, poo: 0 },
  routeOrLocation: "Park loop",
  notes: "Great walk!",

  // NEW: Tracking fields
  steps: 5420,                    // Optional: step count
  averageSpeed: 2.88,             // Optional: speed in mph
  source: "manual",               // Required: tracking source
  sourceDevice: "Apple Watch S8"  // Optional: device name
}
```

**Valid `source` values:**
- `"manual"` — User entered data manually
- `"apple_health"` — Data from Apple Health app
- `"apple_watch"` — Data from Apple Watch
- `"gps"` — GPS-based tracking
- `"unknown"` — Unknown source

**Response:**

```javascript
{
  "log": {
    "id": 456,
    "pet_id": 123,
    "owner_user_id": 789,
    "start_time": "2026-05-09T08:30:00.000Z",
    "duration_minutes": 25,
    "distance": 1.2,
    "distance_unit": "miles",
    "pace": "normal",
    "energy_after": "normal",
    "potty_events": { "pee": 1, "poo": 0 },
    "route_or_location": "Park loop",
    "notes": "Great walk!",
    "steps": 5420,
    "average_speed": 2.88,
    "source": "manual",
    "source_device": "Apple Watch S8",
    "created_at": "2026-05-09T08:55:00.000Z",
    "updated_at": "2026-05-09T08:55:00.000Z"
  }
}
```

**Implementation:**

```javascript
// /apps/web/src/app/api/health/walk-logs/route.js

export async function POST(request) {
  // ... auth and validation ...

  const {
    petId,
    startTime,
    durationMinutes,
    distance,
    distanceUnit,
    pace,
    energyAfter,
    pottyEvents,
    routeOrLocation,
    notes,
    steps,              // NEW
    averageSpeed,       // NEW
    source,             // NEW
    sourceDevice,       // NEW
  } = body;

  const result = await sql`
    INSERT INTO health_walk_logs (
      pet_id,
      owner_user_id,
      start_time,
      duration_minutes,
      distance,
      distance_unit,
      pace,
      energy_after,
      potty_events,
      route_or_location,
      notes,
      steps,
      average_speed,
      source,
      source_device
    ) VALUES (
      ${petId},
      ${ownerUserId},
      ${walkStartTime || sql`NOW()`},
      ${durationMinutes || null},
      ${distance || null},
      ${distanceUnit || "miles"},
      ${pace || null},
      ${energyAfter || null},
      ${pottyEvents ? JSON.stringify(pottyEvents) : null},
      ${routeOrLocation || null},
      ${notes || null},
      ${steps || null},
      ${averageSpeed || null},
      ${source || "manual"},
      ${sourceDevice || null}
    )
    RETURNING *
  `;

  // ... timeline event creation ...
}
```

---

## 🛠️ HealthKit Integration Utilities

### `/apps/mobile/src/utils/healthKitIntegration.js`

**Key functions:**

#### 1. Check Availability

```javascript
import { isHealthKitAvailable, isAppleWatchConnected } from '@/utils/healthKitIntegration';

// Check if HealthKit is available
const available = await isHealthKitAvailable();
// Returns: false (stub for now)

// Check if Apple Watch is connected
const connected = await isAppleWatchConnected();
// Returns: false (stub for now)
```

#### 2. Request Permissions

```javascript
import { requestHealthKitPermission } from '@/utils/healthKitIntegration';

// Request HealthKit access
const granted = await requestHealthKitPermission();
// Shows rationale alert → Returns false (stub for now)
```

**Permission rationale:**
> Social Pet can use walk distance and activity data to help keep your pet's walk history accurate.

#### 3. Get Walk Data

```javascript
import { getWalkData } from '@/utils/healthKitIntegration';

const walkData = await getWalkData(startTime, endTime);

// Returns (stub for now):
// {
//   available: false,
//   distance: null,
//   distanceUnit: "miles",
//   steps: null,
//   averageSpeed: null,
//   pace: null,
//   source: "manual",
//   sourceDevice: null
// }
```

**When HealthKit is ready, this will return:**

```javascript
{
  available: true,
  distance: 1.2,
  distanceUnit: "miles",
  steps: 5420,
  averageSpeed: 2.88,
  pace: "15:32",  // min/mile
  source: "apple_health",
  sourceDevice: "iPhone 14 Pro"
}
```

#### 4. Display Utilities

```javascript
import {
  getTrackingSourceDisplay,
  getTrackingSourceIcon,
  formatDistance,
  formatSteps,
  formatPace,
} from '@/utils/healthKitIntegration';

// Get display text for source
getTrackingSourceDisplay("manual");
// Returns: "Tracked manually"

getTrackingSourceDisplay("apple_health");
// Returns: "Tracked with Apple Health"

getTrackingSourceDisplay("apple_watch");
// Returns: "Tracked with Apple Watch"

// Get icon for source
getTrackingSourceIcon("manual");        // Returns: "✏️"
getTrackingSourceIcon("apple_health");  // Returns: "❤️"
getTrackingSourceIcon("apple_watch");   // Returns: "⌚"
getTrackingSourceIcon("gps");           // Returns: "📍"

// Format metrics
formatDistance(1.2, "miles");   // Returns: "1.20 mi"
formatSteps(5420);              // Returns: "5,420 steps"
formatPace("15:32", "miles");   // Returns: "15:32 min/mi"
```

#### 5. Calculation Utilities

```javascript
import {
  calculatePace,
  calculateAverageSpeed,
  milesToKilometers,
  kilometersToMiles,
} from '@/utils/healthKitIntegration';

// Calculate pace from distance and duration
const pace = calculatePace(1.2, 25);
// Returns: "20:50" (min/mile)

// Calculate average speed
const speed = calculateAverageSpeed(1.2, 25);
// Returns: 2.88 (mph)

// Convert units
const km = milesToKilometers(1.2);    // Returns: 1.93
const mi = kilometersToMiles(5.0);    // Returns: 3.11
```

---

## 🎨 UI Components

### 1. WalkTrackingSettings Component

**Location:** `/apps/mobile/src/components/Health/WalkActivity/WalkTrackingSettings.jsx`

**Usage:**

```javascript
import WalkTrackingSettings from '@/components/Health/WalkActivity/WalkTrackingSettings';

<WalkTrackingSettings />
```

**Props:** None (self-contained)

**Features:**
- Displays 3 tracking options (Apple Health, Apple Watch, Manual)
- Shows "COMING SOON" badge for unavailable options
- Handles permission requests
- Persists user preference (placeholder)
- Responsive to device capabilities

**State:**
```javascript
const [selectedTracking, setSelectedTracking] = useState("manual");
const [healthKitAvailable, setHealthKitAvailable] = useState(false);
const [watchConnected, setWatchConnected] = useState(false);
```

**Tracking options:**

```javascript
const trackingOptions = [
  {
    id: "apple_health",
    name: "Apple Health",
    description: "Automatic distance and step tracking",
    icon: Heart,
    available: true,
    comingSoon: !healthKitAvailable,
  },
  {
    id: "apple_watch",
    name: "Apple Watch",
    description: "Real-time pace and heart rate",
    icon: Watch,
    available: true,
    comingSoon: !watchConnected,
  },
  {
    id: "manual",
    name: "Manual tracking",
    description: "Enter walk details yourself",
    icon: Edit3,
    available: true,
    comingSoon: false,
  },
];
```

---

### 2. WalkActivityModal Updates

**File:** `/apps/mobile/src/components/Health/WalkActivity/WalkActivityModal.jsx`

**Changes:**
- Imported `WalkTrackingSettings` component
- Added new section in walk log form:

```javascript
{/* Tracking Settings */}
<View
  style={{
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.peach,
  }}
>
  <Text
    style={{
      fontSize: 18,
      fontWeight: "700",
      color: C.warmBrown,
      marginBottom: 16,
    }}
  >
    Tracking settings
  </Text>
  <WalkTrackingSettings />
</View>
```

**Location:** Between walk details form and submit button

---

### 3. PostWalkFeedbackModal Updates

**File:** `/apps/mobile/src/components/Health/WalkActivity/PostWalkFeedbackModal.jsx`

**Changes:**
- Imported tracking utilities
- Added tracking source display in confirmation screen
- Updated walk log mutations to include tracking data

**Tracking source display:**

```javascript
const trackingSource = walkData?.source || "manual";
const trackingSourceDisplay = getTrackingSourceDisplay(trackingSource);
const trackingSourceIcon = getTrackingSourceIcon(trackingSource);

// In confirmation screen
<View
  style={{
    backgroundColor: C.sand,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.peach,
  }}
>
  <Text
    style={{
      fontSize: 13,
      color: C.mutedBrown,
      textAlign: "center",
    }}
  >
    {trackingSourceIcon} {trackingSourceDisplay}
  </Text>
</View>
```

**Updated mutation payloads:**

```javascript
const handleNormalWalk = () => {
  const normalWalkLog = {
    // ... existing fields ...
    source: trackingSource,
    sourceDevice: walkData.sourceDevice || null,
    steps: walkData.steps || null,
    averageSpeed: walkData.averageSpeed || null,
  };
  logWalkMutation.mutate(normalWalkLog);
};

const handleDetailedSubmit = () => {
  const detailedWalkLog = {
    // ... existing fields ...
    source: trackingSource,
    sourceDevice: walkData.sourceDevice || null,
    steps: walkData.steps || null,
    averageSpeed: walkData.averageSpeed || null,
  };
  logWalkMutation.mutate(detailedWalkLog);
};
```

---

### 4. Settings Page Updates

**File:** `/apps/mobile/src/app/(tabs)/more/settings.jsx`

**Changes:**
- Added new "WALK TRACKING" section
- Imported `WalkTrackingSettings` component
- Positioned between NOTIFICATIONS and PRIVACY & DATA

```javascript
<Text
  style={{
    fontSize: 11,
    fontWeight: "800",
    color: C.mutedBrown,
    marginBottom: 10,
    letterSpacing: 0.8,
  }}
>
  WALK TRACKING
</Text>
<SectionCard>
  <View style={{ paddingVertical: 6 }}>
    <WalkTrackingSettings />
  </View>
</SectionCard>
```

---

## 🔮 Future: Full HealthKit Integration

### Step 1: Install Package

```bash
npx expo install expo-health
```

or if using a different HealthKit library:

```bash
npx expo install react-native-health
```

### Step 2: Update iOS Permissions

**File:** `app.json` or `app.config.js`

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSHealthShareUsageDescription": "Social Pet needs access to your walking distance and step count to automatically log your dog walks.",
        "NSHealthUpdateUsageDescription": "Social Pet needs to write walk data to your Health app."
      }
    },
    "plugins": [
      [
        "expo-health",
        {
          "healthSharePermission": "Allow Social Pet to read walk data from Health",
          "healthUpdatePermission": "Allow Social Pet to write walk data to Health"
        }
      ]
    ]
  }
}
```

### Step 3: Implement HealthKit Functions

Replace stubs in `/apps/mobile/src/utils/healthKitIntegration.js`:

```javascript
import * as Health from 'expo-health';

export async function isHealthKitAvailable() {
  return await Health.isAvailableAsync();
}

export async function requestHealthKitPermission() {
  const { status } = await Health.requestPermissionsAsync({
    read: [
      Health.HealthDataType.DISTANCE_WALKING_RUNNING,
      Health.HealthDataType.STEP_COUNT,
      Health.HealthDataType.ACTIVE_ENERGY_BURNED,
      Health.HealthDataType.HEART_RATE,
    ],
  });
  return status === 'granted';
}

export async function getWalkData(startTime, endTime) {
  try {
    const distanceData = await Health.queryAsync({
      type: Health.HealthDataType.DISTANCE_WALKING_RUNNING,
      startDate: startTime,
      endDate: endTime,
    });

    const stepsData = await Health.queryAsync({
      type: Health.HealthDataType.STEP_COUNT,
      startDate: startTime,
      endDate: endTime,
    });

    const totalDistance = distanceData.reduce((sum, d) => sum + d.value, 0);
    const totalSteps = stepsData.reduce((sum, s) => sum + s.value, 0);
    
    const durationMinutes = (endTime - startTime) / 60000;
    const avgSpeed = calculateAverageSpeed(totalDistance, durationMinutes);
    const pace = calculatePace(totalDistance, durationMinutes);

    return {
      available: true,
      distance: totalDistance,
      distanceUnit: 'miles',
      steps: totalSteps,
      averageSpeed: avgSpeed,
      pace,
      source: 'apple_health',
      sourceDevice: await getDeviceName(),
    };
  } catch (error) {
    console.error('[HealthKit] Error getting walk data:', error);
    return {
      available: false,
      distance: null,
      distanceUnit: 'miles',
      steps: null,
      averageSpeed: null,
      pace: null,
      source: 'manual',
      sourceDevice: null,
    };
  }
}

async function getDeviceName() {
  // Get device model from expo-device
  const Device = require('expo-device');
  return Device.modelName || 'iPhone';
}
```

### Step 4: Update StartWalkModal

In `/apps/mobile/src/components/Health/WalkActivity/StartWalkModal.jsx`:

```javascript
import { getWalkData, getTrackingPreference } from '@/utils/healthKitIntegration';

const handleFinishWalk = async () => {
  const actualDurationMinutes = Math.round(elapsedSeconds / 60);
  const trackingMode = getTrackingPreference();

  let walkData = {
    walk,
    startTime: startTimeRef.current,
    durationMinutes: actualDurationMinutes,
    pace,
    notes: walkNotes,
    source: 'manual',
  };

  // Try to get HealthKit data if enabled
  if (trackingMode === 'apple_health' || trackingMode === 'apple_watch') {
    const healthData = await getWalkData(
      startTimeRef.current,
      new Date()
    );

    if (healthData.available) {
      walkData = {
        ...walkData,
        ...healthData,
      };
    }
  }

  onWalkComplete(walkData);
};
```

### Step 5: Persist Tracking Preference

Use `expo-async-storage`:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setTrackingPreference(preference) {
  try {
    await AsyncStorage.setItem('walk_tracking_preference', preference);
    return true;
  } catch (error) {
    console.error('[HealthKit] Error saving preference:', error);
    return false;
  }
}

export async function getTrackingPreference() {
  try {
    const pref = await AsyncStorage.getItem('walk_tracking_preference');
    return pref || 'manual';
  } catch (error) {
    console.error('[HealthKit] Error loading preference:', error);
    return 'manual';
  }
}
```

---

## 🧪 Testing Checklist

### Manual Tracking (Current)
- [ ] User can log walk manually
- [ ] Walk saves with `source: 'manual'`
- [ ] Confirmation shows "✏️ Tracked manually"
- [ ] Walk appears in history with manual badge

### Settings
- [ ] Settings page shows "WALK TRACKING" section
- [ ] All 3 tracking options visible
- [ ] "COMING SOON" badges displayed correctly
- [ ] Manual tracking is selected by default
- [ ] Tapping Apple Health shows permission rationale
- [ ] "Not now" dismisses alert without changes
- [ ] "Allow" shows "Coming Soon" message

### Walk Activity Modal
- [ ] "Tracking settings" section appears in walk log form
- [ ] WalkTrackingSettings component renders correctly
- [ ] Tracking preference persists across modal open/close

### Post-Walk Feedback
- [ ] Confirmation screen shows tracking source
- [ ] Icon and text match tracking source
- [ ] Walk log includes source in API call

### Database
- [ ] Walk logs save with new tracking fields
- [ ] `source` defaults to 'manual' if not provided
- [ ] `steps`, `average_speed`, `source_device` nullable

### API
- [ ] POST `/api/health/walk-logs` accepts new fields
- [ ] GET `/api/health/walk-logs` returns new fields
- [ ] Timeline event created successfully

---

## 🐛 Troubleshooting

### Issue: "COMING SOON" badges not showing

**Cause:** `isHealthKitAvailable()` returning `true` instead of `false`

**Fix:** Ensure stub functions in `healthKitIntegration.js` return `false`

---

### Issue: Walk logs not saving tracking source

**Cause:** Backend not receiving `source` field

**Fix:** Verify API route includes `source` in destructuring and INSERT:

```javascript
const { source, sourceDevice, steps, averageSpeed } = body;

await sql`
  INSERT INTO health_walk_logs (..., source, source_device, steps, average_speed)
  VALUES (..., ${source || "manual"}, ${sourceDevice || null}, ${steps || null}, ${averageSpeed || null})
`;
```

---

### Issue: Database error "column does not exist"

**Cause:** Migration not applied

**Fix:** Run migration again:

```sql
ALTER TABLE health_walk_logs 
ADD COLUMN IF NOT EXISTS average_speed NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS steps INTEGER,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS source_device TEXT;
```

Verify columns exist:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'health_walk_logs' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

---

### Issue: Permission alert not showing

**Cause:** Alert already dismissed or permission already granted/denied

**Fix:** Reset iOS simulator permissions:
1. Settings → General → Reset → Reset Location & Privacy
2. Or run: `xcrun simctl privacy <device_id> reset all`

---

## 📚 References

### HealthKit Documentation
- [Apple HealthKit Framework](https://developer.apple.com/documentation/healthkit)
- [Expo Health (if available)](https://docs.expo.dev/)
- [react-native-health](https://github.com/agencyenterprise/react-native-health)

### Relevant Apple HKQuantityTypes
- `HKQuantityTypeIdentifierDistanceWalkingRunning`
- `HKQuantityTypeIdentifierStepCount`
- `HKQuantityTypeIdentifierActiveEnergyBurned`
- `HKQuantityTypeIdentifierHeartRate`

### Watch Connectivity
- [WatchConnectivity Framework](https://developer.apple.com/documentation/watchconnectivity)
- Real-time data sync with Apple Watch

---

## ✅ Summary

**Current Status:**
- ✅ Database schema ready for tracking data
- ✅ API supports tracking fields
- ✅ UI placeholders for Apple Health / Watch
- ✅ Permission flow designed (stubbed)
- ✅ Tracking source display on completion
- ✅ Manual tracking fully functional
- ✅ Settings integration complete

**Ready for:**
- ⏳ Full HealthKit integration when platform supports it
- ⏳ Apple Watch connectivity
- ⏳ Real-time data sync
- ⏳ Persistent tracking preferences

**No breaking changes required** when HealthKit is activated — simply replace stub functions with real implementations.
