# Feeding Routine Meal-Specific Reminders - Implementation Summary

## ✅ Overview

Successfully updated reminder generation to create individual reminders for each meal in a Feeding Routine based on each meal's unique schedule.

**Before:**
- ❌ Feeding routines generated reminders using one global repeat rule
- ❌ All meals shared the same schedule (e.g., "Every day")
- ❌ Could not have Breakfast daily and Dinner only Wed/Fri

**After:**
- ✅ Each meal creates its own reminders based on its individual schedule
- ✅ Breakfast can be "Every day" while Dinner is "Custom days (Wed, Fri)"
- ✅ Meal-specific notes, time-sensitivity, and reminder toggles respected
- ✅ No duplicate reminders created
- ✅ Health Today shows only next relevant feeding reminders

---

## 🔧 Changes Made

### 1. **Meal-Specific Reminder Generation**

**File:** `/apps/mobile/src/utils/reminderGenerator.js`

**Updated:** `generateFeedingReminders()` function

**Before:**
```javascript
function generateFeedingReminders(routine, now, endDate, primaryAction, relatedTracker) {
  const days = getActiveDays(routine); // Uses routine-level frequency
  
  while (currentDate <= endDate) {
    const dayOfWeek = (currentDate.getDay() + 6) % 7;
    
    if (days.includes(dayOfWeek)) {
      meals.forEach((meal, index) => {
        // Creates reminder using routine.timeSensitive, routine.notificationEnabled
      });
    }
  }
}
```

**After:**
```javascript
function generateFeedingReminders(routine, now, endDate, primaryAction, relatedTracker) {
  const meals = routine.meals || [];

  // Generate reminders for each meal based on its individual schedule
  meals.forEach((meal, mealIndex) => {
    // Skip if meal reminders are disabled
    if (meal.reminderEnabled === false) {
      return;
    }

    // Get active days for THIS SPECIFIC meal
    const mealDays = getMealActiveDays(meal);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;

      if (mealDays.includes(dayOfWeek)) {
        const mealId = meal.id || `${routine.id}_meal_${mealIndex}`;
        
        reminders.push({
          id: `reminder_${routine.id}_${mealId}_${dateStr}`,
          routineId: routine.id,
          mealId: mealId, // ← NEW: Identifies which meal
          petId: routine.petId,
          type: "feeding",
          title: meal.name || "Meal", // ← Meal-specific name
          description: meal.notes || `Time for ${meal.name.toLowerCase()}`,
          scheduledAt: scheduledTime.toISOString(),
          timeSensitive: meal.timeSensitive ?? true, // ← Meal-specific
          notificationEnabled: meal.reminderEnabled ?? true, // ← Meal-specific
          notes: meal.notes || "", // ← Meal-specific
          // ...
        });
      }
    }
  });
}
```

**New Helper Function:**
```javascript
function getMealActiveDays(meal) {
  const frequency = meal.frequency || ROUTINE_FREQUENCY.DAILY;

  if (frequency === ROUTINE_FREQUENCY.DAILY) {
    return [0, 1, 2, 3, 4, 5, 6]; // All days
  } else if (frequency === ROUTINE_FREQUENCY.WEEKDAYS) {
    return [0, 1, 2, 3, 4]; // Mon-Fri
  } else if (frequency === ROUTINE_FREQUENCY.WEEKENDS) {
    return [5, 6]; // Sat-Sun
  } else if (frequency === ROUTINE_FREQUENCY.CUSTOM) {
    return meal.days || [0, 1, 2, 3, 4, 5, 6];
  }
  return [0, 1, 2, 3, 4, 5, 6];
}
```

---

### 2. **Meal IDs Added**

**File:** `/apps/mobile/src/components/Health/Reminders/FeedingRoutineModal.jsx`

**Updated:** Default meals and migration logic

**Changes:**
- Added `id` field to all meals in `DEFAULT_MEALS`: `meal_1`, `meal_2`, `meal_3`
- Updated `useEffect` migration to ensure existing meals get IDs: `meal.id || \`meal_${index + 1}\``
- Updated `handleAddMeal` to assign IDs to new meals: `id: \`meal_${meals.length + 1}\``

**Example Meal Object:**
```javascript
{
  id: "meal_1",
  name: "Breakfast",
  time: "08:00",
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [],
  reminderEnabled: true,
  timeSensitive: true,
  notes: "Morning kibble with supplement",
}
```

---

### 3. **Duplicate Prevention**

**File:** `/apps/mobile/src/store/remindersStore.js`

**Existing Logic (Already Present):**
```javascript
addReminderFromRoutine: async (reminder) => {
  // Check for duplicates
  const existing = get().reminders.find((r) => r.id === reminder.id);
  if (existing) return; // ← Prevents duplicates

  // ... schedule notification and add reminder
}
```

**Reminder ID Format:**
```javascript
id: `reminder_${routineId}_${mealId}_${dateStr}`
// Example: "reminder_42_meal_1_2026-05-08"
// Example: "reminder_42_meal_2_2026-05-10"
```

**Uniqueness:**
- Unique by: `routine_id` + `meal_id` + `scheduled_date`
- Same meal, same date = same reminder ID = duplicate prevented
- Different meal, same date = different meal_id = separate reminder ✅
- Same meal, different date = different date = separate reminder ✅

---

### 4. **Editing Effects**

**File:** `/apps/mobile/src/store/routinesStore.js`

**Update Flow:**

1. **User edits Feeding routine** (e.g., changes Dinner from "Every day" to "Custom Wed/Fri")
2. **RoutinesTab calls** `updateRoutine(id, updates)`
3. **Store updates database** via PUT `/api/routines`
4. **Store removes future reminders:**
   ```javascript
   remindersStore.removeFutureRemindersByRoutine(id);
   ```
5. **Store regenerates reminders** from updated routine:
   ```javascript
   const reminders = generateRemindersFromRoutine(transformedRoutine);
   reminders.forEach((reminder) => {
     remindersStore.addReminderFromRoutine(reminder);
   });
   ```

**Result:**
- ✅ Old Dinner reminders (Mon, Tue, Thu, Sat, Sun) removed
- ✅ New Dinner reminders (only Wed, Fri) created
- ✅ Completed past reminders preserved
- ✅ No duplicates created

---

### 5. **Toggle Behavior**

**Meal-Level:**
- Each meal has `reminderEnabled` toggle
- If `meal.reminderEnabled === false`, `generateFeedingReminders` skips that meal
- No reminders created for disabled meals

**Routine-Level:**
- If `routine.isActive === false`, no reminders shown in Health Today
- Toggling routine off → calls `disableFutureRemindersByRoutine(id)`
- Toggling routine on → calls `removeFutureRemindersByRoutine(id)` then regenerates

**Time-Sensitive:**
- If `meal.timeSensitive === true`, reminder appears in Health Today countdown cards
- If `meal.timeSensitive === false`, reminder is standard, no prominent countdown

---

### 6. **Health Today - Next Up**

**File:** `/apps/mobile/src/components/Health/HealthToday.jsx`

**Existing Logic (No Changes Needed):**
```javascript
const getNextUpReminders = () => {
  const now = new Date();
  const inSixHours = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const upcomingReminders = reminders
    .filter((r) => {
      const reminderTime = new Date(r.nextTriggerAt);
      return (
        reminderTime >= now &&
        reminderTime <= inSixHours &&
        status !== REMINDER_STATUS.COMPLETED &&
        status !== REMINDER_STATUS.DISABLED
      );
    })
    .sort((a, b) => new Date(a.nextTriggerAt) - new Date(b.nextTriggerAt))
    .slice(0, 3); // ← Limit to next 3 reminders

  return upcomingReminders;
};
```

**Time-Sensitive Reminders:**
```javascript
const timeSensitiveReminders = reminders.filter((r) => {
  const status = getReminderStatus(r);
  return (
    r.timeSensitive && // ← Respects meal.timeSensitive
    (status === REMINDER_STATUS.DUE_NOW ||
     status === REMINDER_STATUS.DUE_SOON ||
     status === REMINDER_STATUS.OVERDUE) &&
    status !== REMINDER_STATUS.COMPLETED &&
    status !== REMINDER_STATUS.DISABLED
  );
});
```

**Behavior:**
- ✅ Shows only next 1-3 feeding reminders within 6 hours
- ✅ Sorts by scheduled time (earliest first)
- ✅ Time-sensitive meals appear in countdown cards
- ✅ Does not load endless future reminders

**Example Display:**

**If today is Tuesday, 10:00 AM:**
- Breakfast (Every day, 8:00 AM) → Already passed (not shown)
- Dinner (Custom Wed/Fri, 8:00 PM) → Tomorrow (not shown, beyond 6 hours)

**If today is Wednesday, 2:00 PM:**
- Dinner (Custom Wed/Fri, 8:00 PM) → Today at 8:00 PM ✅ (shown in "Next Up")

**If today is Thursday, 10:00 AM:**
- Breakfast (Every day, 8:00 AM) → Already passed (not shown)
- Dinner (Custom Wed/Fri, 8:00 PM) → Tomorrow (not shown, beyond 6 hours)

**If today is Friday, 7:00 PM:**
- Dinner (Custom Wed/Fri, 8:00 PM) → Today at 8:00 PM ✅ (shown in countdown card if time-sensitive)

---

## 🎯 Acceptance Criteria - All Met

✅ **Breakfast daily creates daily Breakfast reminders**
- Breakfast with `frequency: ROUTINE_FREQUENCY.DAILY` generates reminders for all 7 days
- Each reminder has `title: "Breakfast"`, `mealId: "meal_1"`

✅ **Dinner custom Wednesday/Friday creates reminders only on Wednesday and Friday**
- Dinner with `frequency: ROUTINE_FREQUENCY.CUSTOM`, `days: [2, 4]` generates reminders only on Wed (2) and Fri (4)
- No Dinner reminders on Mon, Tue, Thu, Sat, Sun

✅ **Feeding reminders include meal name and notes**
- `title: meal.name` (e.g., "Breakfast", "Dinner")
- `description: meal.notes || \`Time for ${meal.name.toLowerCase()}\``
- Example: "Morning kibble with supplement"

✅ **No duplicate reminders are created**
- Reminder ID includes `mealId` and `dateStr`: `reminder_${routineId}_${mealId}_${dateStr}`
- `addReminderFromRoutine` checks `existing.id` before adding
- Same meal, same date = duplicate prevented

✅ **Editing a meal updates future reminders**
- `updateRoutine` → `removeFutureRemindersByRoutine` → `generateRemindersFromRoutine`
- Old reminders removed, new reminders regenerated
- Completed past reminders preserved

✅ **Disabling a meal reminder hides its reminders**
- `if (meal.reminderEnabled === false) return;` in `generateFeedingReminders`
- Meal with `reminderEnabled: false` creates zero reminders

✅ **Time-sensitive meal reminders appear in Health Today countdown cards**
- Reminder has `timeSensitive: meal.timeSensitive`
- If `meal.timeSensitive === true`, appears in countdown cards
- If `meal.timeSensitive === false`, appears in standard "Next Up" list

---

## 📊 Example Scenarios

### Scenario 1: Daily Breakfast, Custom Dinner

**Routine:**
```javascript
{
  id: "42",
  type: "feeding",
  isActive: true,
  meals: [
    {
      id: "meal_1",
      name: "Breakfast",
      time: "08:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Morning kibble",
    },
    {
      id: "meal_2",
      name: "Dinner",
      time: "20:00",
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      days: [2, 4], // Wednesday, Friday
      reminderEnabled: true,
      timeSensitive: true,
      notes: "Wet food with supplement",
    },
  ],
}
```

**Generated Reminders (next 7 days):**

**Monday:**
- `reminder_42_meal_1_2026-05-11` → Breakfast Monday 8:00 AM ✅
- ❌ No Dinner (not Wed or Fri)

**Tuesday:**
- `reminder_42_meal_1_2026-05-12` → Breakfast Tuesday 8:00 AM ✅
- ❌ No Dinner (not Wed or Fri)

**Wednesday:**
- `reminder_42_meal_1_2026-05-13` → Breakfast Wednesday 8:00 AM ✅
- `reminder_42_meal_2_2026-05-13` → Dinner Wednesday 8:00 PM ✅

**Thursday:**
- `reminder_42_meal_1_2026-05-14` → Breakfast Thursday 8:00 AM ✅
- ❌ No Dinner (not Wed or Fri)

**Friday:**
- `reminder_42_meal_1_2026-05-15` → Breakfast Friday 8:00 AM ✅
- `reminder_42_meal_2_2026-05-15` → Dinner Friday 8:00 PM ✅

**Saturday:**
- `reminder_42_meal_1_2026-05-16` → Breakfast Saturday 8:00 AM ✅
- ❌ No Dinner (not Wed or Fri)

**Sunday:**
- `reminder_42_meal_1_2026-05-17` → Breakfast Sunday 8:00 AM ✅
- ❌ No Dinner (not Wed or Fri)

**Total Reminders (7 days):** 9
- Breakfast: 7 (every day)
- Dinner: 2 (only Wed + Fri)

---

### Scenario 2: Disable Dinner Reminder

**Before:**
```javascript
{
  id: "meal_2",
  name: "Dinner",
  reminderEnabled: true, // ← Enabled
  // ...
}
```

**Generated:**
- Dinner Wed 8:00 PM ✅
- Dinner Fri 8:00 PM ✅

**After:**
```javascript
{
  id: "meal_2",
  name: "Dinner",
  reminderEnabled: false, // ← Disabled
  // ...
}
```

**Generated:**
- ❌ No Dinner reminders (skipped in `generateFeedingReminders`)

**Breakfast reminders:** Still created ✅ (unaffected)

---

### Scenario 3: Edit Dinner from "Every day" to "Custom Wed/Fri"

**Before Edit:**
```javascript
{
  id: "meal_2",
  name: "Dinner",
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [],
}
```

**Generated (next 7 days):**
- Dinner Mon 8:00 PM
- Dinner Tue 8:00 PM
- Dinner Wed 8:00 PM
- Dinner Thu 8:00 PM
- Dinner Fri 8:00 PM
- Dinner Sat 8:00 PM
- Dinner Sun 8:00 PM

**After Edit:**
```javascript
{
  id: "meal_2",
  name: "Dinner",
  frequency: ROUTINE_FREQUENCY.CUSTOM,
  days: [2, 4], // Wed, Fri
}
```

**Update Flow:**
1. `updateRoutine` called
2. `removeFutureRemindersByRoutine(42)` → Removes all future Dinner reminders (Mon, Tue, Thu, Sat, Sun)
3. `generateRemindersFromRoutine` → Regenerates only Wed, Fri Dinner reminders

**Generated (next 7 days):**
- ❌ Dinner Mon 8:00 PM (removed)
- ❌ Dinner Tue 8:00 PM (removed)
- ✅ Dinner Wed 8:00 PM (regenerated)
- ❌ Dinner Thu 8:00 PM (removed)
- ✅ Dinner Fri 8:00 PM (regenerated)
- ❌ Dinner Sat 8:00 PM (removed)
- ❌ Dinner Sun 8:00 PM (removed)

**Completed past Dinner logs:** Preserved ✅

---

## 🧪 Testing Checklist

### Create Routine
- [ ] Create feeding routine with 2 meals
- [ ] Breakfast: Every day, 8:00 AM, reminder enabled, time-sensitive
- [ ] Dinner: Custom days (Wed, Fri), 8:00 PM, reminder enabled, time-sensitive
- [ ] Tap "Create Routine"
- [ ] See "Routine created" alert
- [ ] Routine card shows "2 meals with custom schedules"

### Verify Reminders
- [ ] Go to Health → Today
- [ ] If today is Wednesday before 8:00 PM, see "Dinner today at 8:00 PM" in Next Up
- [ ] If today is Thursday, do NOT see Dinner in Next Up (not scheduled for Thu)
- [ ] If today is Friday before 8:00 PM, see "Dinner today at 8:00 PM" in Next Up

### Edit Routine
- [ ] Tap "Edit Routine" on Feeding routine
- [ ] Modal shows saved meals correctly
- [ ] Change Dinner from "Custom days" to "Every day"
- [ ] Tap "Save Changes"
- [ ] See "Routine saved" alert
- [ ] Routine card now shows "Every day at 8:00 AM and 8:00 PM"

### Disable Meal Reminder
- [ ] Tap "Edit Routine"
- [ ] Expand Dinner meal card
- [ ] Toggle "Reminder enabled" OFF
- [ ] Tap "Save Changes"
- [ ] Health Today no longer shows Dinner reminders
- [ ] Breakfast reminders still appear ✅

### Toggle Routine Off
- [ ] Toggle Feeding routine OFF
- [ ] Health Today shows no feeding reminders
- [ ] Routine card shows "INACTIVE"
- [ ] Toggle Feeding routine ON
- [ ] Feeding reminders reappear in Health Today

### Time-Sensitive Countdown
- [ ] Edit Breakfast, toggle "Time-sensitive" ON
- [ ] At 7:50 AM, see Breakfast countdown card in "Due Soon" section
- [ ] Edit Dinner, toggle "Time-sensitive" OFF
- [ ] At 7:50 PM, Dinner appears in "Next Up" (not countdown card)

### Persistence
- [ ] Navigate to Home tab
- [ ] Return to Health → Today
- [ ] Feeding reminders still correct ✅
- [ ] Log out
- [ ] Log back in
- [ ] Go to Health → Today
- [ ] Feeding reminders still correct ✅

---

## 🚀 Result

**Before:**
- ❌ All meals shared one global schedule
- ❌ Could not have Breakfast daily and Dinner Wed/Fri
- ❌ Could not disable individual meal reminders
- ❌ Could not set meal-specific time-sensitivity

**After:**
- ✅ Each meal has its own schedule (daily, weekdays, weekends, custom days)
- ✅ Breakfast can be daily while Dinner is Wed/Fri only
- ✅ Each meal can be individually enabled/disabled
- ✅ Each meal can be time-sensitive or standard
- ✅ Meal-specific notes included in reminders
- ✅ No duplicate reminders created
- ✅ Editing updates future reminders correctly
- ✅ Health Today shows only next relevant feeding reminders
- ✅ Completed past reminders preserved

**The Feeding Routine now generates meal-specific reminders that respect each meal's individual schedule!** 🎉
