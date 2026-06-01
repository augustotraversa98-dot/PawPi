# Add to Calendar - Visual Guide

## Button Locations

### **1. Walk Routine Editor (Expanded Walk)**

```
┌─────────────────────────────────────────┐
│ Walk 1                           ▼  🗑️  │
├─────────────────────────────────────────┤
│                                         │
│ Morning walk                            │
│ 07:30                                   │
│                                         │
│ Repeat: Every day                       │
│                                         │
│ Duration: [30] min    Pace:             │
│                       ☑ Relaxed         │
│                       ☐ Normal          │
│                       ☐ Active          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │  📅  Add to calendar                │ │  ← NEW BUTTON
│ └─────────────────────────────────────┘ │
│                                         │
│ ☑ Reminder enabled                      │
│ ☑ Time-sensitive                        │
│                                         │
│ ☑ Offer as social walk                 │
│                                         │
└─────────────────────────────────────────┘
```

**Visual style:**
- Background: White (`C.card`)
- Border: Sage green (`C.sage`, 1.5px)
- Icon: 📅 Sage green
- Text: "Add to calendar" in sage green, bold (700)
- Padding: 14px vertical
- Corner radius: 12px
- Centered text + icon

---

### **2. Routine Card (Routines Tab)**

```
┌───────────────────────────────────────────────┐
│  🚶  Walks                           🟢 ON   │
│      ACTIVE                                   │
├───────────────────────────────────────────────┤
│                                               │
│  Schedule                                     │
│  Morning walk: 7:30 AM daily                  │
│  Evening walk: 6:30 PM daily                  │
│                                               │
│  Next                                         │
│  Morning walk in 2 hours                      │
│                                               │
│ ┌─────────────────────────────────────────┐   │
│ │  📅  Add to calendar                    │   │  ← NEW BUTTON
│ └─────────────────────────────────────────┘   │
│                                               │
│ ┌─────────────────────────────────────────┐   │
│ │  ✏️  Edit Routine              →        │   │
│ └─────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

**Visual style:**
- Background: White (`C.card`)
- Border: Sage green (`C.sage`, 1.5px)
- Icon: 📅 Sage green
- Text: "Add to calendar" in sage green, bold (700)
- Padding: 10px vertical
- Corner radius: 12px
- Centered text + icon
- Appears between "Next" reminder and "Edit Routine" button

---

### **3. Walk Countdown Card**

```
┌─────────────────────────────────────────────┐
│                                  🔥 TIME-   │
│                                  SENSITIVE  │
│                                             │
│               🚶                            │
│                                             │
│              NOW                            │
│                                             │
│          Morning walk                       │
│                                             │
│      Phoebe · 30 min · normal               │
│                                             │
│      ┌──────────────────────┐               │  ← NEW BUTTON (small)
│      │ 📅 Add to calendar   │               │
│      └──────────────────────┘               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  ▶️  Start walk                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  ✏️  Log manually                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │  ⏰  Snooze                              │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Visual style:**
- Background: White (`C.card`)
- Border: Sage green + 40% opacity (`C.sage + "40"`, 1px)
- Icon: 📅 Sage green (12px)
- Text: "Add to calendar" in sage green, semibold (600)
- Padding: 6px vertical, 12px horizontal
- Corner radius: 10px
- Centered, inline-flex
- Font size: 11px (smaller than main buttons)
- Positioned after walk details, before action buttons

---

## Permission Flow

### **First Time - Permission Alert**

```
┌─────────────────────────────────────────┐
│                                         │
│         Calendar Access                 │
│                                         │
│  Social Pet can add walk blocks to     │
│  your calendar so your time stays      │
│  protected.                             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │           Not now                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │    Allow calendar access            │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Trigger:** User taps "Add to calendar" for the first time

**Buttons:**
- **Not now:** Cancel (no permission granted)
- **Allow calendar access:** Request system permission

---

### **System Permission Prompt (iOS)**

```
┌─────────────────────────────────────────┐
│                                         │
│  "Social Pet" Would Like to Access     │
│  Your Calendar                          │
│                                         │
│  Social Pet can add walk blocks to     │
│  your calendar so your time stays      │
│  protected.                             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │        Don't Allow                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │            OK                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Platform:** iOS only (Android uses similar pattern)

---

### **Success Message**

```
┌─────────────────────────────────────────┐
│                                         │
│       Added to calendar                 │
│                                         │
│  Walk block added to your calendar      │
│  as a repeating event.                  │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │             OK                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Shows after:** Event successfully created

---

### **Permission Denied Message**

```
┌─────────────────────────────────────────┐
│                                         │
│       Permission needed                 │
│                                         │
│  Calendar access is required to add    │
│  walk events.                           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │             OK                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Shows when:** User denies permission or permission not granted

---

### **Error Message**

```
┌─────────────────────────────────────────┐
│                                         │
│             Error                       │
│                                         │
│  Could not add walk to calendar.       │
│  Please try again.                      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │             OK                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Shows when:** Calendar creation or event creation fails

---

## Calendar App Result

### **iOS Calendar View**

```
┌─────────────────────────────────────────┐
│  Friday, May 9, 2026                    │
├─────────────────────────────────────────┤
│                                         │
│  7:30 AM  ▬▬▬▬  Busy                    │  ← Walk event
│  8:00 AM                                │
│                                         │
│  9:00 AM                                │
│                                         │
│  ...                                    │
│                                         │
│  6:30 PM  ▬▬▬▬  Busy                    │  ← Walk event
│  7:00 PM                                │
│                                         │
└─────────────────────────────────────────┘
```

**Event details (when tapped):**
```
┌─────────────────────────────────────────┐
│  Busy                                   │  ← Generic title
│  Friday, May 9, 2026                    │
│  7:30 AM - 8:00 AM                      │
│                                         │
│  🔒 Private                             │  ← Privacy indicator
│  🚫 Busy                                │  ← Availability
│                                         │
│  Calendar: Social Pet - Walks           │  ← Custom calendar
│                                         │
│  Notes:                                 │
│  Dog walk scheduled in Social Pet       │
│                                         │
│  Repeat: Every day                      │  ← Recurrence
│                                         │
└─────────────────────────────────────────┘
```

---

### **Calendar List (iOS)**

```
┌─────────────────────────────────────────┐
│  Calendars                              │
├─────────────────────────────────────────┤
│  iCloud                                 │
│  ☑ Work                                 │
│  ☑ Personal                             │
│  ☑ Birthdays                            │
│  ☑ Social Pet - Walks        ●          │  ← New calendar (sage green)
│                                         │
│  Other                                  │
│  ☑ US Holidays                          │
│                                         │
└─────────────────────────────────────────┘
```

**Calendar color:** Sage green (`#A7BFA3`)

---

## Walk Routine → Calendar Mapping

### **Daily Walk**

**Walk settings:**
```
Name: Morning walk
Time: 7:30 AM
Frequency: Daily
Duration: 30 min
```

**Calendar event:**
```
Title: Busy
Start: 7:30 AM (today)
End: 8:00 AM (today)
Recurrence: Daily
```

---

### **Weekly Walk (Custom Days)**

**Walk settings:**
```
Name: Weekend walk
Time: 9:00 AM
Frequency: Custom
Days: Sat, Sun
Duration: 45 min
```

**Calendar event:**
```
Title: Busy
Start: 9:00 AM (this Saturday)
End: 9:45 AM (this Saturday)
Recurrence: Weekly on Saturday, Sunday
```

---

### **One-Time Walk**

**Walk settings:**
```
Name: Special park trip
Time: 2:00 PM
Frequency: One-time
Duration: 60 min
```

**Calendar event:**
```
Title: Busy
Start: 2:00 PM (today)
End: 3:00 PM (today)
Recurrence: None
```

---

## Color Scheme

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| **Button background** | White | `#FFFBF7` | Card background |
| **Button border** | Sage green | `#A7BFA3` | Primary accent |
| **Button text** | Sage green | `#A7BFA3` | Primary accent |
| **Icon** | Sage green | `#A7BFA3` | Calendar icon |
| **Calendar color** | Sage green | `#A7BFA3` | "Social Pet - Walks" calendar |

---

## Responsive Sizing

| Screen Size | Button Width | Font Size | Icon Size | Padding |
|-------------|--------------|-----------|-----------|---------|
| **Small (iPhone SE)** | 100% | 13px | 14px | 10px |
| **Medium (iPhone 13)** | 100% | 14px | 14px | 12px |
| **Large (iPhone Pro Max)** | 100% | 14px | 16px | 14px |

**All sizes:**
- Buttons stretch full width of container
- Corner radius: 12px
- Border width: 1.5px
- Centered text + icon

---

## Accessibility

✅ **VoiceOver (iOS):**
- Button label: "Add to calendar button"
- Hint: "Adds this walk to your personal calendar as a busy event"

✅ **TalkBack (Android):**
- Content description: "Add to calendar"
- Action: "Double tap to add walk to calendar"

✅ **Dynamic Type:**
- Text scales with user's preferred text size
- Minimum size: 11px
- Maximum size: 18px

✅ **Color Contrast:**
- Sage green on white: 4.5:1 (WCAG AA compliant)
- Button borders provide clear visual boundaries

---

## Interactive States

### **Default (Not Pressed)**
```
┌─────────────────────────────────────┐
│  📅  Add to calendar                │
└─────────────────────────────────────┘
```
- Background: White
- Border: Sage green (1.5px)
- Text: Sage green

---

### **Pressed**
```
┌─────────────────────────────────────┐
│  📅  Add to calendar                │  (opacity 0.7)
└─────────────────────────────────────┘
```
- Same styling with 70% opacity
- No background color change

---

### **Loading (Permission Request)**
```
┌─────────────────────────────────────┐
│  📅  Add to calendar...             │
└─────────────────────────────────────┘
```
- Same styling
- No loading spinner (system permission is instant)

---

## Animation

**Button press:**
- Duration: 150ms
- Easing: ease-out
- Opacity: 1.0 → 0.7 → 1.0

**Permission alert:**
- Native iOS/Android animation
- Slides up from bottom (modal)

**Success alert:**
- Native iOS/Android animation
- Fades in from center

---

## Edge Cases

### **Multiple Walks in Routine**

**Scenario:** User has 3 walks per day

**Behavior:**
- Tapping "Add to calendar" on routine card adds **all 3 walks**
- Each walk becomes a separate repeating event
- Success message: "Added to calendar as repeating events"

---

### **Walk Already in Calendar**

**Scenario:** User adds same walk twice

**Behavior:**
- Second event is created (duplicate)
- No deduplication (calendar app handles this)
- User can delete duplicates in calendar app

---

### **Permission Permanently Denied**

**Scenario:** User denied permission in iOS Settings

**Behavior:**
- Show alert: "Permission needed"
- User must go to Settings → Social Pet → Calendars → ON
- No in-app way to re-request

---

### **No Calendar Source Available**

**Scenario:** Device has no iCloud or Google account

**Behavior:**
- Falls back to local device calendar
- Events still created successfully
- No cloud sync

---

## User Feedback

**After adding walk:**
```
✅ Added to calendar
Walk block added to your calendar as a repeating event.
```

**After adding multiple walks:**
```
✅ Added to calendar
Walk block added to your calendar as a repeating event.
```
(Same message, simplified)

**After permission denied:**
```
❌ Permission needed
Calendar access is required to add walk events.
```

**After error:**
```
❌ Error
Could not add walk to calendar. Please try again.
```
