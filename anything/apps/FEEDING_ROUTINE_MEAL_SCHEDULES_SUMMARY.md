# Feeding Routine Meal-Specific Schedules - Technical Summary

## Overview
Enhanced the Feeding Routine editor to support meal-specific schedules. Each meal now has its own independent repeat frequency, custom days, reminder settings, time-sensitive toggle, and notes—replacing the previous global settings.

---

## Problem Solved

### Before
- ❌ One global repeat/frequency setting for the entire routine
- ❌ All meals shared the same reminder settings
- ❌ All meals shared the same time-sensitive toggle
- ❌ One global notes field for all meals
- ❌ Could not set Breakfast to "Every day" and Dinner to "Custom days"

### After
- ✅ Each meal has its own repeat frequency (Every day, Weekdays, Weekends, Custom days)
- ✅ Each meal has its own custom days selection (if Custom days selected)
- ✅ Each meal has its own reminder enabled toggle
- ✅ Each meal has its own time-sensitive toggle
- ✅ Each meal has its own notes field
- ✅ Can set different schedules per meal (e.g., Breakfast every day, Dinner Wed/Fri only)

---

## Changes Made

### 1. Feeding Routine Modal UI
**File:** `/apps/mobile/src/components/Health/Reminders/FeedingRoutineModal.jsx`

**New Meal Data Structure:**
```javascript
{
  name: "Breakfast",
  time: "08:00",
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [],
  reminderEnabled: true,
  timeSensitive: true,
  notes: "Morning kibble with supplement"
}
```

**UI Changes:**

**Expandable Meal Cards:**
- Collapsed state shows: Meal name, time, frequency summary
- Tap to expand/collapse
- ChevronDown/ChevronUp icon indicator
- Orange border when expanded

**Each Expanded Meal Card Contains:**
```
┌─────────────────────────────────────┐
│ 🍽️ Breakfast               ▼/▲     │
│ 08:00 • Every day                   │
├─────────────────────────────────────┤
│ Meal Name                           │
│ [Breakfast________________]         │
│                                     │
│ Time                                │
│ [08:00____________________]         │
│                                     │
│ Repeat                              │
│ [Every day]    ← Selected           │
│ [Weekdays]                          │
│ [Weekends]                          │
│ [Custom days]                       │
│                                     │
│ (If Custom days selected)           │
│ Select Days                         │
│ [Mon][Tue][Wed][Thu][Fri][Sat][Sun] │
│                                     │
│ ┌─────────────────────────────┐     │
│ │ Reminder enabled      [ON]  │     │
│ │ Time-sensitive        [ON]  │     │
│ └─────────────────────────────┘     │
│                                     │
│ Notes (optional)                    │
│ [Morning kibble with               │
│  supplement________________]        │
└─────────────────────────────────────┘
```

**Key Features:**
- Only one meal expanded at a time
- Newly added meals auto-expand
- "Tap to expand" hint in header
- Remove button per meal (min 1 meal required)
- Add meal button creates new meal with defaults
- Keyboard-aware scrolling via `KeyboardAvoidingAnimatedView`
- Save button fixed at bottom, doesn't cover inputs

**Repeat Frequency Options per Meal:**
1. **Every day** - Meal repeats daily
2. **Weekdays** - Meal only on Mon-Fri
3. **Weekends** - Meal only on Sat-Sun
4. **Custom days** - Meal only on selected days (shows day picker)

**Custom Days Selector:**
- Mon, Tue, Wed, Thu, Fri, Sat, Sun buttons
- Multiple selection allowed
- Green = selected, beige = unselected
- Days indexed as: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6

**Migration Logic:**
- Old routines without meal-specific settings → migrated on edit
- Falls back to routine-level settings for backward compatibility
- `frequency`, `days`, `notificationEnabled`, `timeSensitive` copied to each meal

---

### 2. Routine Data Logic
**File:** `/apps/mobile/src/data/routinesData.js`

**Updated Functions:**

**`getScheduleSummary(routine)`**
- Detects Feeding routines with meal-specific schedules
- If all meals have same frequency (e.g., all Daily), shows consolidated:
  - "Every day at 8:00 AM and 8:00 PM"
- If meals have different frequencies, shows:
  - "2 meals with custom schedules"

**`getNextReminderPreview(routine)`**
- Iterates through all meals
- Skips meals with `reminderEnabled: false`
- Calculates next occurrence for each enabled meal
- Returns the soonest upcoming meal
- Example: "Breakfast this morning at 8:00 AM"

**New Helper Function: `calculateNextOccurrence(time, frequency, days, fromDate)`**
- Reusable logic for calculating next occurrence
- Handles:
  - **Daily:** Next occurrence (today if future, else tomorrow)
  - **Weekdays:** Advances to next Mon-Fri
  - **Weekends:** Advances to next Sat-Sun
  - **Custom days:** Finds next day matching the custom days array
- Converts day indexing between our system (Mon=0) and JavaScript (Sun=0)

**Day Indexing Conversion:**
```javascript
// Our system: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
// JavaScript: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6

// Convert JS day to our day:
const ourDay = jsDay === 0 ? 6 : jsDay - 1;

// Custom days check:
if (days.includes(ourDay)) { ... }
```

**Save Structure:**
```javascript
{
  type: "feeding",
  meals: [
    {
      name: "Breakfast",
      time: "08:00",
      frequency: "daily",
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Morning kibble"
    },
    {
      name: "Dinner",
      time: "20:00",
      frequency: "custom",
      days: [2, 4], // Wed, Fri
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Wet food"
    }
  ],
  // Legacy fields for backward compatibility:
  times: ["08:00", "20:00"],
  frequency: "custom",
  days: [],
  notificationEnabled: true,
  timeSensitive: true,
  notes: "Morning kibble; Wet food"
}
```

---

### 3. Mock Data Update
**File:** `/apps/mobile/src/data/routinesData.js`

**Updated mockRoutines Feeding Example:**
```javascript
{
  id: "routine_feeding_1",
  type: ROUTINE_TYPES.FEEDING,
  isActive: true,
  meals: [
    {
      name: "Breakfast",
      time: "08:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Morning kibble with supplement"
    },
    {
      name: "Dinner",
      time: "20:00",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [2, 4], // Wednesday and Friday
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Wet food with joint supplement"
    }
  ],
  // ... legacy fields
}
```

---

## User Flow

### Creating a New Feeding Routine

**Step 1: Select Meal Count**
```
How many meals does Phoebe eat per day?
[1 meal per day]
[2 meals per day]
[3 meals per day]
[Custom]
```

**Step 2: Configure Each Meal**
```
Meals                    Tap to expand

🍽️ Breakfast               ▼
08:00 • Every day

🍽️ Dinner                  ▼
20:00 • Custom days

[+ Add Another Meal]
```

**Step 3: Expand and Edit**
- Tap a meal card to expand
- Edit name, time, frequency, days, toggles, notes
- Tap another meal to switch (current collapses)
- Add or remove meals as needed

**Step 4: Save**
- Tap "Create Routine" button
- Each meal's settings are saved independently

### Editing Existing Routine

**Opens directly to Step 2 (Details)**
- Shows all meals
- First meal expanded by default
- Old routines migrated to new structure
- Edit any meal independently

---

## Example Use Cases

### Use Case 1: Regular Daily Meals
```
Breakfast:
- Time: 8:00 AM
- Repeat: Every day
- Reminder: ON
- Time-sensitive: ON
- Notes: "Morning kibble"

Dinner:
- Time: 8:00 PM
- Repeat: Every day
- Reminder: ON
- Time-sensitive: ON
- Notes: "Evening kibble"
```

**Routine Card Shows:**
"Every day at 8:00 AM and 8:00 PM"

**Next Reminder Preview:**
"Breakfast this morning at 8:00 AM" (or "Dinner this evening at 8:00 PM")

---

### Use Case 2: Mixed Schedule
```
Breakfast:
- Time: 8:00 AM
- Repeat: Every day
- Reminder: ON
- Notes: "Always feed breakfast"

Lunch:
- Time: 12:00 PM
- Repeat: Weekdays
- Reminder: ON
- Notes: "Only when at home during work week"

Dinner:
- Time: 8:00 PM
- Repeat: Custom days (Wed, Fri)
- Reminder: ON
- Notes: "Wet food only twice a week"
```

**Routine Card Shows:**
"3 meals with custom schedules"

**Next Reminder Preview:**
Shows the next soonest meal based on current time and day

---

### Use Case 3: Some Meals Without Reminders
```
Breakfast:
- Time: 7:00 AM
- Repeat: Every day
- Reminder: ON
- Notes: "Set alarm"

Snack:
- Time: 3:00 PM
- Repeat: Every day
- Reminder: OFF  ← No reminder
- Notes: "Manual feeding"

Dinner:
- Time: 7:00 PM
- Repeat: Every day
- Reminder: ON
- Notes: "Set alarm"
```

**Routine Card Shows:**
"Every day at 7:00 AM and 7:00 PM" (Snack excluded from summary)

**Next Reminder Preview:**
Only shows Breakfast or Dinner (Snack skipped)

---

## Keyboard Handling

**Problem:** On mobile, opening the keyboard would hide text inputs, making it hard to edit notes, names, or times.

**Solution:** Wrapped modal content in `KeyboardAvoidingAnimatedView`

**Behavior:**
- Keyboard opens → content shifts up
- Save button stays at bottom, doesn't cover inputs
- ScrollView allows scrolling to any input
- Smooth animated transitions

**Component Used:**
```javascript
<KeyboardAvoidingAnimatedView 
  style={{ flex: 1, backgroundColor: C.cream }} 
  behavior="padding"
>
  {/* Header */}
  <ScrollView>
    {/* Meal cards */}
  </ScrollView>
  {/* Fixed save button */}
</KeyboardAvoidingAnimatedView>
```

---

## Backward Compatibility

**Old Routine Structure:**
```javascript
{
  meals: [
    { name: "Breakfast", time: "08:00" },
    { name: "Dinner", time: "20:00" }
  ],
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [0, 1, 2, 3, 4, 5, 6],
  notificationEnabled: true,
  timeSensitive: true,
  notes: "General notes"
}
```

**Migration on Edit:**
```javascript
const migratedMeals = editingRoutine.meals.map((meal) => ({
  name: meal.name || "Meal",
  time: meal.time || "12:00",
  frequency: meal.frequency || editingRoutine.frequency || ROUTINE_FREQUENCY.DAILY,
  days: meal.days || editingRoutine.days || [],
  reminderEnabled: meal.reminderEnabled ?? editingRoutine.notificationEnabled ?? true,
  timeSensitive: meal.timeSensitive ?? editingRoutine.timeSensitive ?? true,
  notes: meal.notes || ""
}));
```

**Result:**
- Old routines continue to work
- On edit, they're upgraded to new structure
- No data loss

---

## Testing Checklist

**UI Tests:**
- [ ] Create new Feeding routine with 1 meal
- [ ] Create new Feeding routine with 2 meals
- [ ] Create new Feeding routine with 3 meals
- [ ] Create custom Feeding routine (add meals manually)
- [ ] Expand/collapse meal cards
- [ ] Only one meal expanded at a time
- [ ] Edit meal name, time updates collapsed header
- [ ] Remove meal works (minimum 1 enforced)
- [ ] Add meal creates new card and auto-expands it

**Schedule Tests:**
- [ ] Set Breakfast to "Every day"
- [ ] Set Dinner to "Weekdays"
- [ ] Set Lunch to "Weekends"
- [ ] Set Snack to "Custom days" → Select Wed, Fri
- [ ] Custom days selection toggles correctly
- [ ] Multiple custom days can be selected

**Toggle Tests:**
- [ ] Set Breakfast reminder OFF, Dinner reminder ON
- [ ] Set Breakfast time-sensitive ON, Dinner time-sensitive OFF
- [ ] Independent toggles per meal work

**Notes Tests:**
- [ ] Add notes to Breakfast: "Morning kibble"
- [ ] Add notes to Dinner: "Wet food with supplement"
- [ ] Notes persist per meal
- [ ] Keyboard doesn't hide notes input

**Keyboard Tests:**
- [ ] Tap meal name input → keyboard opens, input visible
- [ ] Tap time input → keyboard opens, input visible
- [ ] Tap notes input → keyboard opens, input visible
- [ ] Scroll while keyboard open works
- [ ] Save button doesn't cover inputs when keyboard open

**Routine Card Tests:**
- [ ] Routine card shows "Every day at 8:00 AM and 8:00 PM" when all meals daily
- [ ] Routine card shows "2 meals with custom schedules" when mixed frequencies
- [ ] Next reminder preview shows next soonest meal
- [ ] Next reminder preview skips disabled meals

**Migration Tests:**
- [ ] Edit old Feeding routine (created before this update)
- [ ] Old routine migrates to new structure
- [ ] Old global settings copied to each meal
- [ ] Save works after migration

**Edge Cases:**
- [ ] Add 5+ meals, scroll works
- [ ] Remove all but 1 meal, enforced minimum works
- [ ] Set all meals to reminder OFF, routine still saves
- [ ] Set Custom days but select 0 days, still saves (edge case)

---

## Summary

**Goal:** Enable meal-specific schedules instead of one global schedule for all meals.

**Solution:**
1. Redesigned Feeding Routine modal with expandable meal cards
2. Added frequency, custom days, reminder toggles, and notes per meal
3. Updated routine summary and next reminder logic to handle meal-specific schedules
4. Added keyboard-aware scrolling to prevent input hiding
5. Maintained backward compatibility with old routines

**Result:**
- ✅ Breakfast can be "Every day"
- ✅ Dinner can be "Custom days: Wednesday and Friday"
- ✅ Each meal has independent notes
- ✅ Each meal has independent reminder settings
- ✅ Add/remove meals works smoothly
- ✅ Keyboard doesn't hide inputs
- ✅ Old routines migrate seamlessly

**User Benefit:** Full control over each meal's schedule, no more one-size-fits-all frequency settings.
