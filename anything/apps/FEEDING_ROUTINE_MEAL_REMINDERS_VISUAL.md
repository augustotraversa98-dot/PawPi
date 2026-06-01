# Feeding Routine Meal-Specific Reminders - Visual Guide

## 📋 Table of Contents
1. [Meal-Specific Schedule Setup](#meal-specific-schedule-setup)
2. [Reminder Generation Flow](#reminder-generation-flow)
3. [Health Today Display](#health-today-display)
4. [Editing Effects](#editing-effects)
5. [Real-World Examples](#real-world-examples)

---

## 1️⃣ Meal-Specific Schedule Setup

### Create Feeding Routine

```
┌─────────────────────────────────────────┐
│  🍽️ Create Feeding Routine              │
├─────────────────────────────────────────┤
│                                         │
│  How many meals per day?                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   1 meal per day                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ✓ 2 meals per day               │ ◄─── Selected
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   3 meals per day               │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Configure Each Meal

```
┌─────────────────────────────────────────────────────────────┐
│  🍽️ Edit Feeding Routine                                    │
│  Set meal-specific schedules                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📌 MEAL 1 (EXPANDED)                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Breakfast                              8:00 AM • Daily│ │
│  │                                              🗑️ ▼      │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │                                                       │ │
│  │  Meal Name                                            │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Breakfast                                        │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Time                                                 │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ 08:00                                            │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Repeat                                               │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ ✓ Every day          ◄── Breakfast daily         │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Weekdays                                       │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Weekends                                       │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Custom days                                    │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Reminder enabled           ───────────● ON      │ │ │
│  │  │ Time-sensitive             ───────────● ON      │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Notes                                                │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Morning kibble with supplement                   │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  📌 MEAL 2 (COLLAPSED)                                      │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Dinner             20:00 • Custom days       🗑️ ▼     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ + Add Another Meal                                    │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐ │
│  │           Save Changes                                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Expand Dinner to Configure Custom Days

```
┌─────────────────────────────────────────────────────────────┐
│  📌 MEAL 2 (EXPANDED)                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Dinner                           20:00 • Custom days  │ │
│  │                                              🗑️ ▲      │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │                                                       │ │
│  │  Meal Name                                            │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Dinner                                           │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Time                                                 │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ 20:00                                            │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Repeat                                               │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Every day                                      │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Weekdays                                       │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │   Weekends                                       │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ ✓ Custom days      ◄── Dinner only Wed/Fri      │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Select Days                                          │ │
│  │   Mon   Tue  (Wed)  Thu  (Fri)  Sat   Sun           │ │
│  │   ●──   ●──   ●✓    ●──   ●✓    ●──   ●──           │ │
│  │                ▲                 ▲                    │ │
│  │                └─ Selected ──────┘                    │ │
│  │                                                       │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Reminder enabled           ───────────● ON      │ │ │
│  │  │ Time-sensitive             ───────────● ON      │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  Notes                                                │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ Wet food with joint supplement                   │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ Reminder Generation Flow

### Input: Feeding Routine

```javascript
{
  id: "42",
  type: "feeding",
  petId: "123",
  isActive: true,
  meals: [
    {
      id: "meal_1",
      name: "Breakfast",
      time: "08:00",
      frequency: "daily",
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Morning kibble with supplement"
    },
    {
      id: "meal_2",
      name: "Dinner",
      time: "20:00",
      frequency: "custom",
      days: [2, 4], // Wednesday, Friday
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Wet food with joint supplement"
    }
  ]
}
```

### Process: Loop Through Each Meal

```
generateFeedingReminders(routine, now, endDate)
│
├── For each meal in routine.meals
│   │
│   ├── Check: meal.reminderEnabled === true?
│   │   ├── ✅ Yes → Continue
│   │   └── ❌ No → Skip this meal
│   │
│   ├── Get active days: getMealActiveDays(meal)
│   │   ├── meal.frequency === "daily" → [0,1,2,3,4,5,6]
│   │   ├── meal.frequency === "weekdays" → [0,1,2,3,4]
│   │   ├── meal.frequency === "weekends" → [5,6]
│   │   └── meal.frequency === "custom" → meal.days (e.g., [2,4])
│   │
│   ├── For each date from now to endDate
│   │   ├── Check: dayOfWeek in activeDays?
│   │   │   ├── ✅ Yes → Create reminder
│   │   │   │   ├── id: `reminder_${routineId}_${mealId}_${date}`
│   │   │   │   ├── title: meal.name
│   │   │   │   ├── description: meal.notes
│   │   │   │   ├── timeSensitive: meal.timeSensitive
│   │   │   │   ├── notificationEnabled: meal.reminderEnabled
│   │   │   │   └── scheduledAt: date + meal.time
│   │   │   └── ❌ No → Skip this date
│   │   └── Move to next date
│   │
│   └── Move to next meal
│
└── Return all generated reminders
```

### Output: Generated Reminders (Next 7 Days)

**Week View:**
```
Monday May 11, 2026
├── reminder_42_meal_1_2026-05-11  →  Breakfast 08:00 AM ✅
└── (no Dinner, not Wed/Fri)

Tuesday May 12, 2026
├── reminder_42_meal_1_2026-05-12  →  Breakfast 08:00 AM ✅
└── (no Dinner, not Wed/Fri)

Wednesday May 13, 2026
├── reminder_42_meal_1_2026-05-13  →  Breakfast 08:00 AM ✅
└── reminder_42_meal_2_2026-05-13  →  Dinner 20:00 PM ✅

Thursday May 14, 2026
├── reminder_42_meal_1_2026-05-14  →  Breakfast 08:00 AM ✅
└── (no Dinner, not Wed/Fri)

Friday May 15, 2026
├── reminder_42_meal_1_2026-05-15  →  Breakfast 08:00 AM ✅
└── reminder_42_meal_2_2026-05-15  →  Dinner 20:00 PM ✅

Saturday May 16, 2026
├── reminder_42_meal_1_2026-05-16  →  Breakfast 08:00 AM ✅
└── (no Dinner, not Wed/Fri)

Sunday May 17, 2026
├── reminder_42_meal_1_2026-05-17  →  Breakfast 08:00 AM ✅
└── (no Dinner, not Wed/Fri)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Reminders: 9
  • Breakfast: 7 (every day)
  • Dinner: 2 (only Wed + Fri)
```

---

## 3️⃣ Health Today Display

### Today = Wednesday, 10:00 AM

```
┌─────────────────────────────────────────────────────────────┐
│  Health Today                                               │
│  Wednesday, May 13, 2026                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 Due Soon  (2)                                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🍽️ Dinner                                             │ │
│  │  In 10 hours                                           │ │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ │
│  │  ┌───────────────────────────────────────────────────┐│ │
│  │  │  ✓ Log food                                        ││ │
│  │  └───────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  📅 Next Up                          Manage routines ›     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🍽️ Dinner                                             │ │
│  │  Today at 8:00 PM                                      │ │
│  │  ┌───────────────────────────────────────────────────┐│ │
│  │  │  ✓ Log food                                        ││ │
│  │  └───────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  📊 Today's Progress                                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🍽️ Fed 1 time   🚶 1 walk   💊 Medication given      │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Today = Thursday, 10:00 AM

```
┌─────────────────────────────────────────────────────────────┐
│  Health Today                                               │
│  Thursday, May 14, 2026                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📅 Next Up                          Manage routines ›     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  📅  All clear for now                                 │ │
│  │  No reminders scheduled in the next few hours          │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ❌ No Dinner reminder shown (not scheduled for Thursday)  │
│                                                             │
│  📊 Today's Progress                                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🍽️ Fed 1 time   🚶 1 walk   💊 Medication given      │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Today = Friday, 7:30 PM

```
┌─────────────────────────────────────────────────────────────┐
│  Health Today                                               │
│  Friday, May 15, 2026                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 Due Soon  (1)                                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  🍽️ Dinner                                             │ │
│  │  In 30 minutes                                         │ │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ │
│  │  ┌───────────────────────────────────────────────────┐│ │
│  │  │  ✓ Log food                                        ││ │
│  │  └───────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ✅ Dinner reminder shown (scheduled for Friday)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4️⃣ Editing Effects

### Scenario: Change Dinner from "Every day" to "Custom Wed/Fri"

**Before Edit:**
```
Dinner Settings:
  • Repeat: Every day
  • Days: [] (all days)

Generated Reminders (next 7 days):
  Mon: Dinner 20:00 ✅
  Tue: Dinner 20:00 ✅
  Wed: Dinner 20:00 ✅
  Thu: Dinner 20:00 ✅
  Fri: Dinner 20:00 ✅
  Sat: Dinner 20:00 ✅
  Sun: Dinner 20:00 ✅
  
Total: 7 Dinner reminders
```

**User Action:**
```
┌─────────────────────────────────────────┐
│  Tap "Edit Routine"                     │
│  Expand Dinner meal card                │
│  Change "Every day" → "Custom days"     │
│  Select: Wed ✓  Fri ✓                   │
│  Tap "Save Changes"                     │
└─────────────────────────────────────────┘
```

**Update Flow:**
```
handleSaveRoutine(routine)
│
├── updateRoutine(id, { meals: [...] })
│   │
│   ├── PUT /api/routines
│   │   └── Database: UPDATE feeding_schedule JSONB
│   │
│   ├── removeFutureRemindersByRoutine(id)
│   │   └── Remove: Mon, Tue, Wed, Thu, Fri, Sat, Sun (all future)
│   │
│   └── generateRemindersFromRoutine(routine)
│       │
│       └── Create: Wed, Fri only
│
└── Alert: "✅ Saved - Routine saved"
```

**After Edit:**
```
Dinner Settings:
  • Repeat: Custom days
  • Days: [2, 4] (Wed, Fri)

Generated Reminders (next 7 days):
  Mon: ❌ (removed)
  Tue: ❌ (removed)
  Wed: Dinner 20:00 ✅ (regenerated)
  Thu: ❌ (removed)
  Fri: Dinner 20:00 ✅ (regenerated)
  Sat: ❌ (removed)
  Sun: ❌ (removed)
  
Total: 2 Dinner reminders
```

**Completed Past Logs:**
```
✅ Preserved:
  • May 11 Dinner 20:00 (completed)
  • May 12 Dinner 20:00 (completed)
  • May 13 Dinner 20:00 (completed)

❌ Not affected by edit
```

---

## 5️⃣ Real-World Examples

### Example 1: Senior Dog (Breakfast daily, Dinner Wed/Fri)

**Why:** Senior dog needs smaller, more frequent meals on certain days.

**Setup:**
```
Breakfast:
  • Time: 08:00
  • Repeat: Every day
  • Notes: "Morning kibble + joint supplement"

Dinner:
  • Time: 20:00
  • Repeat: Custom days (Wed, Fri)
  • Notes: "Wet food + meds"
```

**Calendar View:**
```
Sun  Mon  Tue  Wed  Thu  Fri  Sat
 B    B    B   B+D   B   B+D   B
```

**Reminder Count (7 days):**
- Breakfast: 7
- Dinner: 2
- **Total: 9**

---

### Example 2: Puppy (3 meals daily Mon-Fri, 2 meals weekends)

**Why:** Puppy needs more frequent feeding on weekdays when owner is home.

**Setup:**
```
Breakfast:
  • Time: 07:00
  • Repeat: Every day
  • Notes: "Morning kibble"

Lunch:
  • Time: 12:00
  • Repeat: Weekdays (Mon-Fri)
  • Notes: "Midday snack"

Dinner:
  • Time: 19:00
  • Repeat: Every day
  • Notes: "Evening meal"
```

**Calendar View:**
```
Sun  Mon  Tue  Wed  Thu  Fri  Sat
B+D  B+L+D B+L+D B+L+D B+L+D B+L+D B+D
```

**Reminder Count (7 days):**
- Breakfast: 7
- Lunch: 5 (Mon-Fri only)
- Dinner: 7
- **Total: 19**

---

### Example 3: Working Dog (Breakfast + Dinner daily, Lunch Wed only)

**Why:** Working dog gets extra meal on heavy training day (Wednesday).

**Setup:**
```
Breakfast:
  • Time: 06:00
  • Repeat: Every day
  • Notes: "High-protein kibble"

Lunch:
  • Time: 13:00
  • Repeat: Custom days (Wed)
  • Notes: "Training day extra meal"

Dinner:
  • Time: 18:00
  • Repeat: Every day
  • Notes: "Evening meal + recovery supplement"
```

**Calendar View:**
```
Sun  Mon  Tue  Wed  Thu  Fri  Sat
B+D  B+D  B+D B+L+D  B+D  B+D  B+D
```

**Reminder Count (7 days):**
- Breakfast: 7
- Lunch: 1 (Wed only)
- Dinner: 7
- **Total: 15**

---

### Example 4: Disabled Meal Reminder

**Why:** Owner feeds Breakfast manually every morning, doesn't need reminder.

**Setup:**
```
Breakfast:
  • Time: 08:00
  • Repeat: Every day
  • Reminder enabled: OFF  ◄──────── Disabled
  • Notes: "Morning kibble"

Dinner:
  • Time: 20:00
  • Repeat: Every day
  • Reminder enabled: ON
  • Notes: "Evening meal"
```

**Generated Reminders (7 days):**
```
Mon: Dinner 20:00 ✅
Tue: Dinner 20:00 ✅
Wed: Dinner 20:00 ✅
Thu: Dinner 20:00 ✅
Fri: Dinner 20:00 ✅
Sat: Dinner 20:00 ✅
Sun: Dinner 20:00 ✅

❌ No Breakfast reminders (disabled)
```

**Reminder Count (7 days):**
- Breakfast: 0 (disabled)
- Dinner: 7
- **Total: 7**

---

### Example 5: Time-Sensitive vs Standard

**Why:** Breakfast is flexible, but Dinner needs to be on time due to medication.

**Setup:**
```
Breakfast:
  • Time: 08:00
  • Repeat: Every day
  • Time-sensitive: OFF  ◄──────── Standard reminder
  • Notes: "Morning meal"

Dinner:
  • Time: 20:00
  • Repeat: Every day
  • Time-sensitive: ON  ◄──────── Countdown card
  • Notes: "Evening meal + meds"
```

**Health Today Display (7:30 PM):**
```
┌─────────────────────────────────────────┐
│  🔴 Due Soon  (1)                       │
│  ┌───────────────────────────────────┐ │
│  │  🍽️ Dinner                         │ │
│  │  In 30 minutes                     │ │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ │
│  │  ┌───────────────────────────────┐│ │
│  │  │  ✓ Log food                    ││ │
│  │  └───────────────────────────────┘│ │
│  └───────────────────────────────────┘ │
│                                         │
│  📅 Next Up                             │
│  ┌───────────────────────────────────┐ │
│  │  🍽️ Breakfast                      │ │
│  │  Tomorrow at 8:00 AM               │ │
│  │  ┌───────────────────────────────┐│ │
│  │  │  ✓ Log food                    ││ │
│  │  └───────────────────────────────┘│ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Difference:**
- Dinner → Countdown card (time-sensitive)
- Breakfast → Next Up list (standard)

---

## 🎯 Key Takeaways

1. **Each meal = independent schedule**
   - Breakfast daily, Dinner Wed/Fri ✅

2. **Meal-specific settings respected**
   - Title, notes, time-sensitive, reminder enabled ✅

3. **No duplicates**
   - Unique ID per meal + date ✅

4. **Editing updates correctly**
   - Removes old, generates new ✅

5. **Health Today shows relevant reminders**
   - Only next 1-3 within 6 hours ✅
   - Time-sensitive in countdown cards ✅
