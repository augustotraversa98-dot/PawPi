# Routines Foundation - Visual Guide

## 🎯 What You Have Now

The Routines system is **fully implemented** inside Health → Reminders. Here's what exists:

---

## 📱 Screen Flow

```
Health Tab (bottom nav)
    ↓
Health → Reminders (select from top)
    ↓
┌─────────────────────────────────────────┐
│  Upcoming  │  Routines  │  Settings     │  ← 3 Tabs
└─────────────────────────────────────────┘
```

---

## 1️⃣ **Routines Tab** (Main Dashboard)

### Header Section
```
╔══════════════════════════════════════════╗
║  Phoebe's Routines                       ║
║  Set Phoebe's care schedule so Social    ║
║  Pet knows when to remind you            ║
╚══════════════════════════════════════════╝
```

### Routine Cards (Example: Feeding)
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🍽️  Feeding                    [ON] ┃
┃     ACTIVE                            ┃
┃                                        ┃
┃  ┌────────────────────────────────┐  ┃
┃  │ Schedule                       │  ┃
┃  │ Every day at 8:00 AM and       │  ┃
┃  │ 8:00 PM                        │  ┃
┃  └────────────────────────────────┘  ┃
┃                                        ┃
┃  ┌────────────────────────────────┐  ┃
┃  │ Next                           │  ┃
┃  │ Dinner today at 8:00 PM        │  ┃
┃  └────────────────────────────────┘  ┃
┃                                        ┃
┃  [ Edit Routine → ]                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Empty State (No Routines Yet)
```
┌────────────────────────────────────────┐
│                                        │
│              📅                        │
│                                        │
│        No routines yet                 │
│                                        │
│  Set Phoebe's care schedule so Social  │
│  Pet knows when to remind you          │
│                                        │
│    ┌──────────────────────────┐       │
│    │  + Create First Routine  │       │
│    └──────────────────────────┘       │
│                                        │
└────────────────────────────────────────┘
```

### With Routines (Scrollable List)
```
╔══════════════════════════════════════════╗
║  Phoebe's Routines                       ║
║  Set Phoebe's care schedule...           ║
╚══════════════════════════════════════════╝

┌─ 🍽️ Feeding ──────────────────[ON]─┐
│ Every day at 8:00 AM and 8:00 PM    │
│ Next: Dinner today at 8:00 PM       │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌─ 🚶 Walks ─────────────────────[ON]─┐
│ Every day at 7:30 AM and 6:30 PM    │
│ Next: Evening walk today at 6:30 PM │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌─ 📸 Photo Check ───────────────[ON]─┐
│ Paws weekly on Sunday at 10:00 AM   │
│ Next: Paws photo Sunday at 10:00 AM │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌─ 💊 Medication ────────────────[ON]─┐
│ Daily at 9:00 PM                    │
│ Next: Tonight at 9:00 PM            │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌─ ✅ General Check ─────────────[ON]─┐
│ Weekly on Sunday at 6:00 PM         │
│ Next: General Check Sunday at 6 PM  │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌─ ⚖️ Weight Check ──────────────[ON]─┐
│ Weekly on Saturday at 9:00 AM       │
│ Next: Weight Check Saturday at 9 AM │
│ [Edit Routine →]                    │
└─────────────────────────────────────┘

┌────────────────────────────────────┐
│ 💡 Routines automatically generate │
│ reminders. Turn them on/off        │
│ anytime without losing your        │
│ schedule                           │
└────────────────────────────────────┘

                                    [+]
                              (Floating)
```

---

## 2️⃣ **Upcoming Tab** (Generated Reminders)

### Time-Sensitive Countdown Cards
```
╔══════════════════════════════════════════╗
║  🔔 Due Soon                             ║
╚══════════════════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                        ┃
┃              🍽️                        ┃
┃                                        ┃
┃         Breakfast                      ┃
┃                                        ┃
┃          8:23:14                       ┃
┃     until breakfast time               ┃
┃                                        ┃
┃  ┌──────────┐        ┌──────────┐     ┃
┃  │    ✓     │        │    ⏰    │     ┃
┃  │   Done   │        │  Snooze  │     ┃
┃  └──────────┘        └──────────┘     ┃
┃                                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Grouped Reminders
```
╔══════════════════════════════════════════╗
║  🔔 Now                             [2]  ║
╚══════════════════════════════════════════╝

┌─ 🍽️ Feeding ────────────────────────┐
│ Breakfast                            │
│ Feed Phoebe her morning meal         │
│ DUE NOW               [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

┌─ 🚶 Walks ──────────────────────────┐
│ Morning walk                         │
│ Take Phoebe for morning walk         │
│ DUE NOW               [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

╔══════════════════════════════════════════╗
║  📅 Today                           [3]  ║
╚══════════════════════════════════════════╝

┌─ 💊 Medication ─────────────────────┐
│ Apoquel                              │
│ 1 tablet - Give with evening meal    │
│ TONIGHT AT 9:00 PM    [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

┌─ 🍽️ Feeding ────────────────────────┐
│ Dinner                               │
│ Feed Phoebe her evening meal         │
│ TODAY AT 8:00 PM      [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

┌─ 🚶 Walks ──────────────────────────┐
│ Evening walk                         │
│ Take Phoebe for evening walk         │
│ TODAY AT 6:30 PM      [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

╔══════════════════════════════════════════╗
║  🌅 Tomorrow                        [2]  ║
╚══════════════════════════════════════════╝

┌─ 🍽️ Feeding ────────────────────────┐
│ Breakfast                            │
│ Feed Phoebe her morning meal         │
│ TOMORROW AT 8:00 AM   [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

┌─ 🚶 Walks ──────────────────────────┐
│ Morning walk                         │
│ Take Phoebe for morning walk         │
│ TOMORROW AT 7:30 AM   [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

╔══════════════════════════════════════════╗
║  📆 This Week                       [2]  ║
╚══════════════════════════════════════════╝

┌─ 📸 Photo Check ────────────────────┐
│ Paws photo                           │
│ Take a photo of paws                 │
│ SUNDAY AT 10:00 AM    [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘

┌─ ✅ General Check ──────────────────┐
│ General Check                        │
│ Daily health check                   │
│ SUNDAY AT 6:00 PM     [✓] [⏰] [🗑️] │
└──────────────────────────────────────┘
```

### Empty State
```
┌────────────────────────────────────────┐
│                                        │
│              🔔                        │
│                                        │
│    No reminders scheduled              │
│                                        │
│  Create a routine to generate          │
│  reminders automatically               │
│                                        │
└────────────────────────────────────────┘
```

---

## 3️⃣ **Settings Tab** (Notification Preferences)

```
╔══════════════════════════════════════════╗
║  Reminder Settings                       ║
║  Customize how you receive reminders     ║
╚══════════════════════════════════════════╝

┌────────────────────────────────────────┐
│ ✅ Notifications Enabled               │
│ You'll receive reminders for Phoebe's  │
│ care routine                           │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 💡 How reminders work                  │
│                                        │
│ Social Pet can remind you about        │
│ feeding, walks, medication, and photo  │
│ checks so Phoebe's care routine stays  │
│ on track. Routines you create          │
│ automatically generate reminders.      │
└────────────────────────────────────────┘

PREFERENCES

┌─ 🔔 Push Notifications ───────[ON]─┐
│ Receive notifications for reminders  │
└─────────────────────────────────────┘

┌─ ⏰ Time-Sensitive Alerts ────[ON]─┐
│ Show prominent countdown for urgent  │
│ reminders                            │
└─────────────────────────────────────┘

┌─ 🔊 Sound & Vibration ────────[ON]─┐
│ Play sound and vibrate for reminders │
└─────────────────────────────────────┘

┌─ 🌙 Quiet Hours ───────────[OFF]───┐
│ Pause notifications during specific  │
│ hours                                │
└─────────────────────────────────────┘

SNOOZE

┌────────────────────────────────────┐
│ Default Snooze Duration            │
│ 10 minutes, 30 minutes, 1 hour,    │
│ Tonight, Tomorrow                  │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ 💡 Time-sensitive reminders will   │
│ show countdown cards and appear at │
│ the top of your notifications      │
└────────────────────────────────────┘
```

---

## 🎨 **Routine Types & Colors**

```
🍽️  Feeding              Coral (#FF6F61)
🚶  Walks                Sage (#A7BFA3)
💊  Medication           Terracotta (#B75D32)
📸  Photo Check          Blue (#4DB8E8)
✅  General Check        Sandy Brown (#F4A460)
⚖️  Weight Check         Terracotta (#B75D32)
🛡️  Preventive Care      Sage (#A7BFA3)
💉  Vaccine              Coral (#FF6F61)
🩺  Vet Appointment      Blue (#4DB8E8)
```

---

## ⚙️ **Routine Creation Flow**

### 1. Tap "Create First Routine" or Floating + Button
```
┌────────────────────────────────────────┐
│  Select Routine Type                   │
├────────────────────────────────────────┤
│                                        │
│  🍽️  Feeding                           │
│     Regular meal schedule              │
│                                        │
│  🚶  Walks                             │
│     Daily walk routine                 │
│                                        │
│  💊  Medication                        │
│     Medication schedule                │
│                                        │
│  📸  Photo Check                       │
│     Visual health monitoring           │
│                                        │
│  ✅  General Check                     │
│     Daily health check                 │
│                                        │
│  ⚖️  Weight Check                      │
│     Weight monitoring                  │
│                                        │
│  🛡️  Preventive Care                   │
│     Flea, tick, heartworm prevention   │
│                                        │
│  💉  Vaccine                           │
│     Vaccination schedule               │
│                                        │
│  🩺  Vet Appointment                   │
│     Scheduled vet visits               │
│                                        │
└────────────────────────────────────────┘
```

### 2. Example: Feeding Routine Modal
```
┌────────────────────────────────────────┐
│  Feeding Routine                       │
├────────────────────────────────────────┤
│                                        │
│  How many meals per day?               │
│  ○ 1 meal  ● 2 meals  ○ 3 meals       │
│                                        │
│  Meal 1: Breakfast                     │
│  Time: 8:00 AM                         │
│                                        │
│  Meal 2: Dinner                        │
│  Time: 8:00 PM                         │
│                                        │
│  Frequency                             │
│  ● Every day                           │
│  ○ Weekdays only                       │
│  ○ Weekends only                       │
│  ○ Custom schedule                     │
│                                        │
│  🔔 Notification               [ON]    │
│  ⏰ Time-sensitive            [ON]    │
│                                        │
│  Notes (optional)                      │
│  ┌──────────────────────────────┐     │
│  │                              │     │
│  └──────────────────────────────┘     │
│                                        │
│           [ Save Routine ]             │
│                                        │
└────────────────────────────────────────┘
```

### 3. Example: Photo Check Routine Modal
```
┌────────────────────────────────────────┐
│  Photo Check Routine                   │
├────────────────────────────────────────┤
│                                        │
│  Which body area?                      │
│                                        │
│  🐾 Paws        👂 Ears                │
│  👁️ Eyes        🦷 Teeth               │
│  🧴 Skin/Fur    😊 Face                │
│  🔍 Full Body   📋 Other               │
│                                        │
│  Frequency                             │
│  ● Weekly                              │
│  ○ Every 2 weeks                       │
│  ○ Monthly                             │
│                                        │
│  Preferred day: Sunday                 │
│  Time: 10:00 AM                        │
│                                        │
│  🔔 Notification               [ON]    │
│  ⏰ Time-sensitive            [OFF]   │
│                                        │
│  Notes (optional)                      │
│  ┌──────────────────────────────┐     │
│  │                              │     │
│  └──────────────────────────────┘     │
│                                        │
│           [ Save Routine ]             │
│                                        │
└────────────────────────────────────────┘
```

---

## 🔄 **How It Works**

### Routine → Reminders Flow
```
User creates Routine
        ↓
Routine saved to store
        ↓
Reminder generator runs
        ↓
Creates reminders for next 30 days
        ↓
Reminders appear in Upcoming tab
        ↓
User completes/snoozes reminders
        ↓
Routine regenerates future reminders
```

### Toggle Behavior
```
Routine: [ON] → [OFF]
        ↓
Future reminders disabled
        ↓
Card becomes 60% opacity
        ↓
Schedule preserved

Routine: [OFF] → [ON]
        ↓
Future reminders regenerated
        ↓
Card returns to full opacity
        ↓
Reminders appear in Upcoming
```

### Edit Behavior
```
User edits routine
        ↓
Changes saved
        ↓
Future reminders removed
        ↓
New reminders generated
        ↓
Past/completed reminders unchanged
        ↓
Updated schedule shows on card
```

---

## 🎯 **Key Features**

✅ **9 Routine Types** - Feeding, Walks, Medication, Photo Check, General Check, Weight Check, Preventive, Vaccine, Vet Appointment

✅ **Smart Scheduling** - Daily, Weekdays, Weekends, Weekly, Monthly, Custom

✅ **Multiple Times** - Set multiple times per day (e.g., Breakfast & Dinner)

✅ **Next Reminder Preview** - See exactly when the next reminder will fire

✅ **Toggle On/Off** - Disable without losing schedule

✅ **Time-Sensitive Alerts** - Countdown cards for urgent reminders

✅ **Automatic Generation** - Reminders created automatically from routines

✅ **Snooze Options** - 10 min, 30 min, 1 hour, Tonight, Tomorrow

✅ **Notification Permissions** - Request and manage iOS notification access

✅ **Quiet Hours** - Pause notifications during sleep

✅ **Beautiful Design** - Warm colors, rounded cards, modern mobile-first UI

---

## 🧪 **Try It Out**

1. **Open app** → Health tab → Reminders
2. **Tap Routines tab** → See "Phoebe's Routines"
3. **Tap "+ Create First Routine"** → Select type (e.g., Feeding)
4. **Configure schedule** → Set times, frequency
5. **Save routine** → See routine card appear
6. **Switch to Upcoming tab** → See generated reminders
7. **Toggle routine off** → Card becomes faded, reminders disabled
8. **Toggle routine on** → Card becomes active, reminders regenerate
9. **Tap Edit Routine** → Modify schedule, save
10. **Go to Settings tab** → Configure notification preferences

---

## 📊 **What's Next**

### Database Integration (Coming Soon)
- Save routines to database
- Sync across devices
- Backup and restore

### Push Notifications (Coming Soon)
- Schedule push notifications
- Handle notification taps
- Badge count on app icon

### Analytics (Future)
- Completion rate
- Missed reminders
- Streak tracking

---

## ✨ **Summary**

You now have a **fully functional Routines system** with:
- Beautiful 3-tab interface
- 9 routine types with custom modals
- Smart reminder generation
- Time-sensitive countdown cards
- Notification permission handling
- Toggle on/off without data loss
- Edit routine functionality
- Empty states and helpful info boxes
- Warm, modern, mobile-first design

**The foundation is complete and ready to use!** 🎉
