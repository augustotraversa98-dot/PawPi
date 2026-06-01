# Apple Health / Apple Watch Walk Tracking - Visual Guide

## 🎨 Complete UI Flow

---

## 1. Settings → Walk Tracking Section

**Location:** More → Settings → Walk Tracking

```
┌────────────────────────────────────────────────┐
│  ⚙️  Settings                                  │
│  ← Back                                        │
└────────────────────────────────────────────────┘

  NOTIFICATIONS
  ┌─────────────────────────────────────────────┐
  │ 🔔  Feed Reminders               [ON]       │
  │ 🔒  Health Alerts                [ON]       │
  │ 👁️  Community Updates            [OFF]      │
  └─────────────────────────────────────────────┘

  WALK TRACKING
  ┌─────────────────────────────────────────────┐
  │                                             │
  │  Connected tracking                         │
  │  Connect Apple Health or Apple Watch to     │
  │  make walk distance and pace more accurate. │
  │                                             │
  │  ┌─────────────────────────────────────┐   │
  │  │  ❤️   Apple Health         →        │   │
  │  │      Automatic distance and step    │   │
  │  │      tracking                       │   │
  │  │      [COMING SOON]                  │   │
  │  └─────────────────────────────────────┘   │
  │                                             │
  │  ┌─────────────────────────────────────┐   │
  │  │  ⌚   Apple Watch           →        │   │
  │  │      Real-time pace and heart rate  │   │
  │  │      [COMING SOON]                  │   │
  │  └─────────────────────────────────────┘   │
  │                                             │
  │  ┌─────────────────────────────────────┐   │
  │  │  ✏️   Manual tracking        ✓       │   │
  │  │      Enter walk details yourself    │   │
  │  └─────────────────────────────────────┘   │
  │                                             │
  │  ┌─────────────────────────────────────┐   │
  │  │  💡 Tip: Apple Health and Watch     │   │
  │  │  tracking will be available soon.   │   │
  │  │  For now, manual tracking works     │   │
  │  │  great!                             │   │
  │  └─────────────────────────────────────┘   │
  │                                             │
  └─────────────────────────────────────────────┘

  PRIVACY & DATA
  ┌─────────────────────────────────────────────┐
  │ 🔒  Account Privacy              Public     │
  │ 🌐  Language                     English    │
  └─────────────────────────────────────────────┘
```

---

## 2. Apple Health Permission Flow

**Trigger:** User taps "Apple Health" option

### Step 1: Rationale Alert

```
┌────────────────────────────────────┐
│                                    │
│        Apple Health Access         │
│                                    │
│  Social Pet can use walk distance  │
│  and activity data to help keep    │
│  your pet's walk history accurate. │
│                                    │
│  ┌──────────────────────────────┐ │
│  │          Not now              │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │           Allow               │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

### Step 2: Coming Soon Message (Temporary)

```
┌────────────────────────────────────┐
│                                    │
│          Coming Soon               │
│                                    │
│  Apple Health integration is       │
│  coming soon. For now, use manual  │
│  tracking.                         │
│                                    │
│  ┌──────────────────────────────┐ │
│  │             OK                │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

### Step 3: Future HealthKit Permission (When Ready)

```
┌────────────────────────────────────┐
│                                    │
│    "Social Pet" Would Like to      │
│      Access Your Health Data       │
│                                    │
│  Walking + Running Distance        │
│  Steps                             │
│  Active Energy                     │
│                                    │
│  Social Pet will not share your    │
│  health data without your          │
│  permission.                       │
│                                    │
│  ┌──────────────────────────────┐ │
│  │        Don't Allow            │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │           Allow               │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

---

## 3. Walk Activity Modal with Tracking Settings

**Location:** Health → Track → Log walk manually

```
┌────────────────────────────────────────────────┐
│  Log Walk                                  ✕   │
└────────────────────────────────────────────────┘

  Walk details

  Duration (minutes)
  ┌─────────────────────────────────────────────┐
  │  20                                         │
  └─────────────────────────────────────────────┘

  Distance (miles)
  ┌─────────────────────────────────────────────┐
  │  1.0                                        │
  └─────────────────────────────────────────────┘

  Pace
  ┌──────────┬──────────┬──────────┐
  │ Relaxed  │  Normal  │  Active  │
  │          │    ✓     │          │
  └──────────┴──────────┴──────────┘

  Energy after walk
  ┌──────────┬──────────┬──────────┐
  │   Low    │  Normal  │   High   │
  │          │    ✓     │          │
  └──────────┴──────────┴──────────┘

  Potty events
  💩 Poo                💦 Pee
  ┌───┬───┬───┬───┐    ┌───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │    │ 0 │ 1 │ 2 │ 3 │
  │ ✓ │   │   │   │    │ ✓ │   │   │   │
  └───┴───┴───┴───┘    └───┴───┴───┴───┘

  Route (optional)
  ┌─────────────────────────────────────────────┐
  │  e.g., Park loop, Trail run                │
  └─────────────────────────────────────────────┘

  Notes (optional)
  ┌─────────────────────────────────────────────┐
  │  Any observations?                          │
  │                                             │
  │                                             │
  └─────────────────────────────────────────────┘

  ───────────────────────────────────────────────

  Tracking settings

  Connected tracking
  Connect Apple Health or Apple Watch to
  make walk distance and pace more accurate.

  ┌─────────────────────────────────────────────┐
  │  ❤️   Apple Health         →                │
  │      Automatic distance and step tracking   │
  │      [COMING SOON]                          │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  ⌚   Apple Watch           →                │
  │      Real-time pace and heart rate          │
  │      [COMING SOON]                          │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  ✏️   Manual tracking        ✓               │
  │      Enter walk details yourself            │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  💡 Tip: Apple Health and Watch tracking   │
  │  will be available soon. For now, manual    │
  │  tracking works great!                      │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │               Log Walk                      │
  └─────────────────────────────────────────────┘

  ← Back
```

---

## 4. Walk Completion - Tracking Source Display

**Location:** Post-walk feedback confirmation

### Manual Tracking

```
┌────────────────────────────────────┐
│                                    │
│         ┌────────────┐             │
│         │            │             │
│         │     ✓      │             │
│         │            │             │
│         └────────────┘             │
│                                    │
│       Walk logged!                 │
│                                    │
│     Great job, Phoebe!             │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  ✏️  Tracked manually         │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

### Apple Health Tracking (Future)

```
┌────────────────────────────────────┐
│                                    │
│         ┌────────────┐             │
│         │            │             │
│         │     ✓      │             │
│         │            │             │
│         └────────────┘             │
│                                    │
│       Walk logged!                 │
│                                    │
│     Great job, Phoebe!             │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  ❤️  Tracked with Apple Health│ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  📊 5,420 steps               │ │
│  │  📏 1.2 miles                 │ │
│  │  ⏱️  15:32 pace (min/mi)      │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

### Apple Watch Tracking (Future)

```
┌────────────────────────────────────┐
│                                    │
│         ┌────────────┐             │
│         │            │             │
│         │     ✓      │             │
│         │            │             │
│         └────────────┘             │
│                                    │
│       Walk logged!                 │
│                                    │
│     Great job, Phoebe!             │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  ⌚ Tracked with Apple Watch  │ │
│  │     Series 8                  │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  📊 5,420 steps               │ │
│  │  📏 1.2 miles                 │ │
│  │  ⏱️  15:32 pace (min/mi)      │ │
│  │  ❤️  Avg HR: 112 bpm          │ │
│  └──────────────────────────────┘ │
│                                    │
└────────────────────────────────────┘
```

---

## 5. Walk History - Source Icons

**Location:** Health → Walk Activity Dashboard

```
┌────────────────────────────────────────────────┐
│  Recent Walks                                  │
└────────────────────────────────────────────────┘

  Today
  ┌─────────────────────────────────────────────┐
  │  🚶 Morning Walk              ✏️  Manual     │
  │  8:30 AM · 25 min · 1.2 mi                  │
  └─────────────────────────────────────────────┘

  Yesterday
  ┌─────────────────────────────────────────────┐
  │  🚶 Evening Walk              ⌚  Apple Watch│
  │  6:45 PM · 30 min · 1.5 mi · 5,823 steps    │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  🚶 Lunch Walk                ❤️  Health     │
  │  12:15 PM · 15 min · 0.8 mi · 2,104 steps   │
  └─────────────────────────────────────────────┘
```

---

## 6. Tracking Source Badge Colors

**Visual differentiation:**

```
┌─────────────────────────────────────┐
│  ✏️  Tracked manually                │  ← Muted brown (#8B7355)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ❤️  Tracked with Apple Health      │  ← Coral (#FF6F61)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ⌚  Tracked with Apple Watch        │  ← Sage green (#A7BFA3)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  📍  Tracked with GPS                │  ← Terracotta (#B75D32)
└─────────────────────────────────────┘
```

---

## 7. Future: Walk Detail View with Health Data

**Location:** Tap on walk in history

```
┌────────────────────────────────────────────────┐
│  Morning Walk                              ✕   │
│  ← Back                                        │
└────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  ⌚  Tracked with Apple Watch Series 8       │
  └─────────────────────────────────────────────┘

  Overview
  ┌─────────────────────────────────────────────┐
  │  Duration         Distance         Pace     │
  │  25 min          1.2 mi           15:32     │
  │                                              │
  │  Steps           Avg Speed        Calories  │
  │  5,420           2.88 mph         142 kcal  │
  └─────────────────────────────────────────────┘

  Heart Rate
  ┌─────────────────────────────────────────────┐
  │  Average          Peak             Resting  │
  │  112 bpm         145 bpm          68 bpm    │
  │                                              │
  │  [Heart rate graph over time]               │
  └─────────────────────────────────────────────┘

  Route
  ┌─────────────────────────────────────────────┐
  │  [Map view with GPS trace]                  │
  │  Park loop                                  │
  └─────────────────────────────────────────────┘

  Notes
  ┌─────────────────────────────────────────────┐
  │  Stopped at the dog park for 5 minutes.    │
  │  Phoebe had lots of energy today!          │
  └─────────────────────────────────────────────┘
```

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                    User Actions                     │
└─────────────────────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
      Manual Mode            Apple Health/Watch
           │                       │
           ▼                       ▼
  ┌──────────────────┐    ┌──────────────────┐
  │ User enters:     │    │ HealthKit gets:  │
  │ • Duration       │    │ • Distance       │
  │ • Distance       │    │ • Steps          │
  │ • Pace           │    │ • Speed          │
  │ • Notes          │    │ • Heart Rate     │
  └──────────────────┘    └──────────────────┘
           │                       │
           └───────────┬───────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │   Create Walk Log    │
           │                      │
           │  {                   │
           │    petId,            │
           │    duration,         │
           │    distance,         │
           │    pace,             │
           │    steps,            │
           │    averageSpeed,     │
           │    source,           │
           │    sourceDevice      │
           │  }                   │
           └──────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │  POST /api/health/   │
           │      walk-logs       │
           └──────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │  health_walk_logs    │
           │      (Database)      │
           └──────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │   Timeline Event     │
           │   Created            │
           └──────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │  Confirmation Screen │
           │  with tracking badge │
           └──────────────────────┘
```

---

## 9. Tracking Icons Reference

```
┌──────────┬─────────────────────┬────────────────┐
│  Icon    │  Source             │  Color         │
├──────────┼─────────────────────┼────────────────┤
│  ❤️      │  Apple Health       │  Coral         │
│  ⌚      │  Apple Watch        │  Sage          │
│  📍      │  GPS                │  Terracotta    │
│  ✏️      │  Manual             │  Muted Brown   │
└──────────┴─────────────────────┴────────────────┘
```

---

## 10. Settings Page Integration

**Full context:**

```
┌────────────────────────────────────────────────┐
│  ⚙️  Settings                              ✕   │
│  ← Back                                        │
└────────────────────────────────────────────────┘

  NOTIFICATIONS
  [Notification settings card]

  WALK TRACKING                    ← NEW SECTION
  ┌─────────────────────────────────────────────┐
  │  [WalkTrackingSettings component]           │
  └─────────────────────────────────────────────┘

  PRIVACY & DATA
  [Privacy settings card]

  SUPPORT
  [Support settings card]

  🐾
  Social Pet v1.0.0
  Made with 🐾 for dog parents
```

---

## 🎨 Design Tokens

### Colors
- **Coral:** `#FF6F61` (Primary actions, Apple Health badge)
- **Sage:** `#A7BFA3` (Success, Apple Watch badge)
- **Terracotta:** `#B75D32` (GPS badge)
- **Warm Brown:** `#3B241B` (Primary text)
- **Muted Brown:** `#8B7355` (Secondary text, manual badge)
- **Peach:** `#FFE5D9` (Borders, dividers)
- **Sand:** `#F5EDE4` (Backgrounds)
- **Cream:** `#FFF7EF` (Page background)

### Typography
- **Headers:** 18-22px, 800 weight
- **Body:** 14-15px, 600 weight
- **Labels:** 13-14px, 600 weight
- **Captions:** 12-13px, 400-600 weight

### Spacing
- **Section gap:** 20-22px
- **Card padding:** 14-16px
- **Element gap:** 12-16px
- **Border radius:** 12-18px

---

**Status:** All UI components are production-ready and visually consistent with Social Pet's design system. 🎉
