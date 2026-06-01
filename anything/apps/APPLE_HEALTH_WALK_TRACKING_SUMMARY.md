# Apple Health / Apple Watch Walk Tracking - Summary

## ✅ Complete

Apple Health and Apple Watch tracking **placeholders** have been added to Social Pet. The UI, data model, and permission flows are ready — full HealthKit integration will be activated when the platform supports it.

---

## 📦 New Files Created

```
/apps/mobile/src/
├── utils/
│   └── healthKitIntegration.js           # HealthKit utilities (213 lines)
└── components/Health/WalkActivity/
    └── WalkTrackingSettings.jsx          # Tracking settings UI (248 lines)
```

---

## 🗄️ Database Updates

**Table:** `health_walk_logs`

| New Column | Type | Default | Description |
|------------|------|---------|-------------|
| `average_speed` | NUMERIC(5,2) | NULL | Average speed in mph/km/h |
| `steps` | INTEGER | NULL | Step count from Health/Watch |
| `source` | TEXT | `'manual'` | Tracking source (manual, apple_health, apple_watch, gps) |
| `source_device` | TEXT | NULL | Device name (e.g., "Apple Watch Series 8") |

---

## 🎨 UI Components

### 1. **Walk Tracking Settings** 🏃‍♂️

**Location:** Settings → Walk Tracking section

**Options:**
- ✅ **Apple Health** — Automatic distance and step tracking
- ⌚ **Apple Watch** — Real-time pace and heart rate
- ✏️ **Manual tracking** — Enter walk details yourself

**Permission Flow:**
1. User taps "Apple Health" or "Apple Watch"
2. Shows rationale: *"Social Pet can use walk distance and activity data to help keep your pet's walk history accurate."*
3. User chooses:
   - **Allow** → (Coming soon message shown for now)
   - **Not now** → Stays on manual tracking

**Visual:**
```
┌────────────────────────────────────────────┐
│ ❤️  Apple Health                          │
│     Automatic distance and step tracking   │
│     [COMING SOON]                          │
├────────────────────────────────────────────┤
│ ⌚  Apple Watch                            │
│     Real-time pace and heart rate          │
│     [COMING SOON]                          │
├────────────────────────────────────────────┤
│ ✏️  Manual tracking               ✓        │
│     Enter walk details yourself            │
└────────────────────────────────────────────┘

💡 Tip: Apple Health and Watch tracking will be
   available soon. For now, manual tracking works great!
```

---

### 2. **Walk Completion Source Display** ✅

**Location:** Post-walk feedback confirmation screen

**Shows tracking source:**
```
┌────────────────────────────────────┐
│         ✓ Walk logged!             │
│     Great job, Phoebe!             │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ ✏️ Tracked manually           │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘
```

**Source icons:**
- ❤️ Apple Health
- ⌚ Apple Watch
- 📍 GPS
- ✏️ Manual

---

### 3. **Walk Activity Modal Settings** ⚙️

**Location:** Health → Track → Log walk manually → Tracking settings

Embedded tracking settings panel in the walk log form, so users can switch tracking modes mid-workflow.

---

## 🔧 Backend Updates

**API:** `/api/health/walk-logs`

**New POST fields:**
```javascript
{
  // ... existing fields ...
  steps: 5420,                    // Optional step count
  averageSpeed: 3.2,              // Optional speed (mph)
  source: "manual",               // Tracking source
  sourceDevice: "Apple Watch S8"  // Optional device name
}
```

---

## 📱 Integration Utilities

### `healthKitIntegration.js`

**Functions:**

| Function | Description | Status |
|----------|-------------|--------|
| `isHealthKitAvailable()` | Check if HealthKit is available | Returns `false` (stub) |
| `isAppleWatchConnected()` | Check if Watch is connected | Returns `false` (stub) |
| `requestHealthKitPermission()` | Request Health permissions | Shows "Coming Soon" alert |
| `getWalkData(start, end)` | Get walk data from HealthKit | Returns empty placeholder |
| `getTrackingPreference()` | Get saved tracking mode | Returns `"manual"` |
| `setTrackingPreference(mode)` | Save tracking mode | Placeholder (logs to console) |
| `getTrackingSourceDisplay(src)` | Format source for display | ✅ Working |
| `getTrackingSourceIcon(src)` | Get icon for source | ✅ Working |
| `formatDistance(dist, unit)` | Format distance string | ✅ Working |
| `formatSteps(steps)` | Format step count | ✅ Working |
| `calculatePace(dist, time)` | Calculate pace (min/mi) | ✅ Working |
| `calculateAverageSpeed(dist, time)` | Calculate speed (mph) | ✅ Working |

---

## 🧩 How It Works

### Current (Manual Tracking)

1. User logs walk manually
2. Enters duration, distance, pace
3. Walk saved with `source: 'manual'`
4. Confirmation shows "✏️ Tracked manually"

### Future (Apple Health/Watch)

1. User enables Apple Health in settings
2. Grants HealthKit permissions
3. Starts walk → HealthKit records data
4. Finishes walk → App queries HealthKit for:
   - Distance
   - Steps
   - Average speed/pace
   - Heart rate (if Watch)
5. Walk saved with:
   - `source: 'apple_health'` or `'apple_watch'`
   - `sourceDevice: "Apple Watch Series 8"`
   - `steps: 5420`
   - `averageSpeed: 3.2`
6. Confirmation shows "⌚ Tracked with Apple Watch"

---

## 🔐 Permission Copy

**Rationale:**
> Social Pet can use walk distance and activity data to help keep your pet's walk history accurate.

**Buttons:**
- **Allow** → Grant HealthKit permissions
- **Not now** → Stay on manual tracking

**Rules:**
- ✅ Permissions **only** requested when user taps tracking option
- ✅ **Never** auto-requested on app launch
- ✅ Manual tracking **always** works (no dependencies)

---

## ✅ Acceptance Criteria

| Requirement | Status |
|-------------|--------|
| Walk settings show Apple Health / Apple Watch placeholders | ✅ Done |
| Manual tracking still works | ✅ Done |
| Walk logs can store tracking source | ✅ Done |
| App does not fail if HealthKit is unavailable | ✅ Done |
| No permissions are requested automatically | ✅ Done |
| Tracking source displayed on walk completion | ✅ Done |
| Database supports tracking fields | ✅ Done |
| Settings page includes tracking section | ✅ Done |

---

## 🚀 Next Steps (When HealthKit is Ready)

### 1. **Install HealthKit Package**
```bash
expo install expo-health
```

### 2. **Update `healthKitIntegration.js`**
Replace stub functions with real HealthKit API calls:

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
    ],
  });
  return status === 'granted';
}

export async function getWalkData(startTime, endTime) {
  const distance = await Health.queryAsync({
    type: Health.HealthDataType.DISTANCE_WALKING_RUNNING,
    startDate: startTime,
    endDate: endTime,
  });

  const steps = await Health.queryAsync({
    type: Health.HealthDataType.STEP_COUNT,
    startDate: startTime,
    endDate: endTime,
  });

  // ... calculate average speed, pace, etc.

  return {
    available: true,
    distance: totalDistance,
    distanceUnit: 'miles',
    steps: totalSteps,
    averageSpeed: calculateAverageSpeed(totalDistance, duration),
    pace: calculatePace(totalDistance, duration),
    source: 'apple_health',
    sourceDevice: await getDeviceName(),
  };
}
```

### 3. **Update Walk Flow**
In `StartWalkModal.jsx`, when user finishes walk:
```javascript
const walkData = await getWalkData(walkStartTime, new Date());
if (walkData.available) {
  // Use HealthKit data
  onWalkComplete({
    ...walkData,
    durationMinutes,
  });
} else {
  // Fall back to manual
  onWalkComplete({
    source: 'manual',
    durationMinutes,
  });
}
```

### 4. **Add Persistent Tracking Preference**
Use `expo-async-storage` to persist user's tracking choice:
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setTrackingPreference(preference) {
  await AsyncStorage.setItem('walk_tracking_preference', preference);
}

export async function getTrackingPreference() {
  const pref = await AsyncStorage.getItem('walk_tracking_preference');
  return pref || 'manual';
}
```

---

## 📝 Implementation Notes

### Safe Degradation
- ✅ All HealthKit code is **optional**
- ✅ Manual tracking is the **default** and **always works**
- ✅ No crashes if HealthKit unavailable

### User Experience
- Settings make it clear tracking is "coming soon"
- No broken promises or dead-end buttons
- Manual tracking feels complete and polished

### Data Model
- Database supports all tracking fields
- API accepts tracking metadata
- Frontend displays tracking source

---

## 🎯 Summary

**What's ready:**
- ✅ UI placeholders for Apple Health / Apple Watch
- ✅ Permission rationale and flow
- ✅ Database schema for tracking data
- ✅ Tracking source display on walk completion
- ✅ Settings page integration
- ✅ Manual tracking (fully working)

**What's next:**
- ⏳ Real HealthKit integration (when platform supported)
- ⏳ Persistent tracking preferences
- ⏳ Apple Watch complications (future feature)

**Status:** Ready for production. HealthKit integration can be activated when platform support is available — no breaking changes required.
