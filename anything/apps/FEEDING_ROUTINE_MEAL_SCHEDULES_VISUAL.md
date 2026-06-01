# Feeding Routine Meal-Specific Schedules - Visual Guide

## Before vs After

---

## Old Feeding Routine Editor (Before)

```
┌─────────────────────────────────────────┐
│  ← 🍽️ Create Feeding Routine            │
│  Set Phoebe's meal schedule             │
├─────────────────────────────────────────┤
│                                         │
│  Meals                                  │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Meal 1                      [🗑️] │ │
│  │ [Breakfast________________]       │ │
│  │ [08:00____________________]       │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Meal 2                      [🗑️] │ │
│  │ [Dinner___________________]       │ │
│  │ [20:00____________________]       │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [+ Add Another Meal]                   │
│                                         │
│  ────────────────────────────────────── │
│                                         │
│  Repeat   ← GLOBAL FOR ALL MEALS        │
│  [Every day]         ✓                  │
│  [Weekdays]                             │
│  [Weekends]                             │
│  [Custom days]                          │
│                                         │
│  ────────────────────────────────────── │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Reminder enabled        [ON]    │   │
│  │ Time-sensitive          [ON]    │   │ ← GLOBAL
│  └─────────────────────────────────┘   │
│                                         │
│  Notes (optional)                       │
│  [General feeding notes__________]      │ ← GLOBAL
│                                         │
│  ────────────────────────────────────── │
│  [Create Routine]                       │
└─────────────────────────────────────────┘
```

**Problems:**
- ❌ All meals share the same repeat frequency
- ❌ Cannot set Breakfast to "Every day" and Dinner to "Custom days"
- ❌ All meals share the same reminder settings
- ❌ One global notes field for all meals
- ❌ Limited flexibility for varied feeding schedules

---

## New Feeding Routine Editor (After)

### Collapsed View
```
┌─────────────────────────────────────────┐
│  ← 🍽️ Edit Feeding Routine              │
│  Set meal-specific schedules            │
├─────────────────────────────────────────┤
│                                         │
│  Meals                    Tap to expand │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 🍽️ Breakfast           [🗑️]  ▼  │ │ ← Collapsed
│  │ 08:00 • Every day                 │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 🍽️ Dinner              [🗑️]  ▼  │ │ ← Collapsed
│  │ 20:00 • Custom days               │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [+ Add Another Meal]                   │
│                                         │
│  ────────────────────────────────────── │
│  [Save Changes]                         │
└─────────────────────────────────────────┘
```

### Expanded Meal Card
```
┌─────────────────────────────────────────┐
│  Meals                    Tap to expand │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 🍽️ Breakfast           [🗑️]  ▲  │ │ ← Expanded
│  │ 08:00 • Every day                 │ │
│  ├───────────────────────────────────┤ │
│  │ Meal Name                         │ │
│  │ [Breakfast________________]       │ │
│  │                                   │ │
│  │ Time                              │ │
│  │ [08:00____________________]       │ │
│  │                                   │ │
│  │ Repeat                            │ │
│  │ [Every day]         ✓             │ │
│  │ [Weekdays]                        │ │
│  │ [Weekends]                        │ │
│  │ [Custom days]                     │ │
│  │                                   │ │
│  │ ┌─────────────────────────────┐   │ │
│  │ │ Reminder enabled    [ON]    │   │ │ ← Per meal
│  │ │ Time-sensitive      [ON]    │   │ │ ← Per meal
│  │ └─────────────────────────────┘   │ │
│  │                                   │ │
│  │ Notes (optional)                  │ │
│  │ [Morning kibble with_________]    │ │ ← Per meal
│  │ [supplement__________________]    │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 🍽️ Dinner              [🗑️]  ▼  │ │ ← Collapsed
│  │ 20:00 • Custom days               │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [+ Add Another Meal]                   │
└─────────────────────────────────────────┘
```

**Benefits:**
- ✅ Each meal has its own schedule
- ✅ Each meal has its own reminder settings
- ✅ Each meal has its own notes
- ✅ Tap to expand/collapse
- ✅ Clean, organized interface

---

## Meal Card States

### 1. Collapsed Meal Card
```
┌─────────────────────────────────────┐
│ 🍽️ Breakfast             [🗑️]  ▼  │
│ 08:00 • Every day                   │
└─────────────────────────────────────┘
```

**Shows:**
- Meal name
- Time
- Frequency summary
- Remove button (if > 1 meal)
- Chevron down icon

**Interaction:**
- Tap anywhere → expands this meal, collapses others

---

### 2. Expanded Meal Card - Every Day
```
┌─────────────────────────────────────┐
│ 🍽️ Breakfast             [🗑️]  ▲  │
│ 08:00 • Every day                   │
├─────────────────────────────────────┤
│ Meal Name                           │
│ [Breakfast________________]         │
│                                     │
│ Time                                │
│ [08:00____________________]         │
│                                     │
│ Repeat                              │
│ [Every day]         ✓               │
│ [Weekdays]                          │
│ [Weekends]                          │
│ [Custom days]                       │
│                                     │
│ ┌─────────────────────────────┐     │
│ │ Reminder enabled      [ON]  │     │
│ │ Time-sensitive        [ON]  │     │
│ └─────────────────────────────┘     │
│                                     │
│ Notes (optional)                    │
│ [Morning kibble with___________]    │
│ [supplement____________________]    │
└─────────────────────────────────────┘
```

**Shows:**
- All fields editable
- Repeat options (Every day selected)
- No custom days selector (not needed)
- Toggles per meal
- Notes per meal
- Chevron up icon

---

### 3. Expanded Meal Card - Custom Days
```
┌─────────────────────────────────────┐
│ 🍽️ Dinner                [🗑️]  ▲  │
│ 20:00 • Custom days                 │
├─────────────────────────────────────┤
│ Meal Name                           │
│ [Dinner___________________]         │
│                                     │
│ Time                                │
│ [20:00____________________]         │
│                                     │
│ Repeat                              │
│ [Every day]                         │
│ [Weekdays]                          │
│ [Weekends]                          │
│ [Custom days]       ✓               │
│                                     │
│ Select Days                         │
│ ┌─────────────────────────────┐     │
│ │ (Mon)(Tue)[Wed](Thu)[Fri]   │     │ ← Wed, Fri selected
│ │ (Sat)(Sun)                  │     │
│ └─────────────────────────────┘     │
│                                     │
│ ┌─────────────────────────────┐     │
│ │ Reminder enabled      [ON]  │     │
│ │ Time-sensitive        [ON]  │     │
│ └─────────────────────────────┘     │
│                                     │
│ Notes (optional)                    │
│ [Wet food with joint___________]    │
│ [supplement____________________]    │
└─────────────────────────────────────┘
```

**Shows:**
- All fields editable
- Repeat options (Custom days selected)
- **Custom days selector visible** (Wed and Fri selected)
- Toggles per meal
- Notes per meal

---

## Custom Days Selector

### Day Buttons
```
Select Days
┌─────────────────────────────────────┐
│ [Mon][Tue][Wed][Thu][Fri][Sat][Sun] │
│  ⬜   ⬜   🟩   ⬜   🟩   ⬜   ⬜  │
│                                     │
│ Green = Selected                    │
│ Beige = Not selected                │
└─────────────────────────────────────┘
```

**Behavior:**
- Tap to toggle selection
- Multiple days can be selected
- Selected days = green background, white text
- Unselected days = beige background, brown text

**Examples:**

**Weekdays Only:**
```
[Mon][Tue][Wed][Thu][Fri][Sat][Sun]
 🟩  🟩  🟩  🟩  🟩  ⬜  ⬜
```

**Wednesday and Friday:**
```
[Mon][Tue][Wed][Thu][Fri][Sat][Sun]
 ⬜  ⬜  🟩  ⬜  🟩  ⬜  ⬜
```

**Weekend Only:**
```
[Mon][Tue][Wed][Thu][Fri][Sat][Sun]
 ⬜  ⬜  ⬜  ⬜  ⬜  🟩  🟩
```

---

## Complete Example: Mixed Schedule

### Breakfast - Every Day
```
┌─────────────────────────────────────┐
│ 🍽️ Breakfast             [🗑️]  ▲  │
│ 08:00 • Every day                   │
├─────────────────────────────────────┤
│ Meal Name                           │
│ [Breakfast________________]         │
│                                     │
│ Time                                │
│ [08:00____________________]         │
│                                     │
│ Repeat                              │
│ [Every day]         ✓               │
│ [Weekdays]                          │
│ [Weekends]                          │
│ [Custom days]                       │
│                                     │
│ ┌─────────────────────────────┐     │
│ │ Reminder enabled      [ON]  │     │
│ │ Time-sensitive        [ON]  │     │
│ └─────────────────────────────┘     │
│                                     │
│ Notes (optional)                    │
│ [Morning kibble_________________]   │
└─────────────────────────────────────┘
```

### Dinner - Wednesday and Friday Only
```
┌─────────────────────────────────────┐
│ 🍽️ Dinner                [🗑️]  ▲  │
│ 20:00 • Custom days                 │
├─────────────────────────────────────┤
│ Meal Name                           │
│ [Dinner___________________]         │
│                                     │
│ Time                                │
│ [20:00____________________]         │
│                                     │
│ Repeat                              │
│ [Every day]                         │
│ [Weekdays]                          │
│ [Weekends]                          │
│ [Custom days]       ✓               │
│                                     │
│ Select Days                         │
│ [Mon][Tue][Wed][Thu][Fri][Sat][Sun] │
│  ⬜   ⬜   🟩   ⬜   🟩   ⬜   ⬜  │
│                                     │
│ ┌─────────────────────────────┐     │
│ │ Reminder enabled      [ON]  │     │
│ │ Time-sensitive        [ON]  │     │
│ └─────────────────────────────┘     │
│                                     │
│ Notes (optional)                    │
│ [Wet food with supplement_______]   │
└─────────────────────────────────────┘
```

**Result:**
- Breakfast reminder every day at 8:00 AM
- Dinner reminder only on Wednesday and Friday at 8:00 PM

---

## Routine Card Display

### All Meals Same Frequency
```
┌─────────────────────────────────────┐
│ 🍽️  Feeding              [ON] ●    │
│ ┌─────────────────────────────┐     │
│ │ SCHEDULE                    │     │
│ │ Every day at 8:00 AM and    │     │
│ │ 8:00 PM                     │     │
│ └─────────────────────────────┘     │
│ ┌─────────────────────────────┐     │
│ │ NEXT                        │     │
│ │ Breakfast this morning at   │     │
│ │ 8:00 AM                     │     │
│ └─────────────────────────────┘     │
│ [Edit Routine >]                    │
└─────────────────────────────────────┘
```

**When:**
- All meals have `frequency: ROUTINE_FREQUENCY.DAILY`

**Shows:**
- Consolidated schedule summary
- All meal times in one line

---

### Mixed Frequencies
```
┌─────────────────────────────────────┐
│ 🍽️  Feeding              [ON] ●    │
│ ┌─────────────────────────────┐     │
│ │ SCHEDULE                    │     │
│ │ 2 meals with custom         │     │
│ │ schedules                   │     │
│ └─────────────────────────────┘     │
│ ┌─────────────────────────────┐     │
│ │ NEXT                        │     │
│ │ Breakfast this morning at   │     │
│ │ 8:00 AM                     │     │
│ └─────────────────────────────┘     │
│ [Edit Routine >]                    │
└─────────────────────────────────────┘
```

**When:**
- Meals have different frequencies (e.g., one Daily, one Custom)

**Shows:**
- Generic "X meals with custom schedules"
- Next reminder still shows soonest upcoming meal

---

## Next Reminder Logic

### Scenario 1: Tuesday 9:00 AM
```
Current: Tuesday 9:00 AM

Meals:
- Breakfast: Every day at 8:00 AM ← Already passed
- Dinner: Custom days (Wed, Fri) at 8:00 PM

Next Reminder:
"Dinner tomorrow at 8:00 PM"
(Wednesday is next custom day)
```

---

### Scenario 2: Wednesday 10:00 AM
```
Current: Wednesday 10:00 AM

Meals:
- Breakfast: Every day at 8:00 AM ← Already passed
- Dinner: Custom days (Wed, Fri) at 8:00 PM ← Today!

Next Reminder:
"Dinner this evening at 8:00 PM"
```

---

### Scenario 3: Thursday 3:00 PM
```
Current: Thursday 3:00 PM

Meals:
- Breakfast: Every day at 8:00 AM ← Already passed
- Dinner: Custom days (Wed, Fri) at 8:00 PM ← Next is Friday

Next Reminder:
"Dinner tomorrow at 8:00 PM"
(Friday is next custom day)
```

---

### Scenario 4: Some Meals Disabled
```
Meals:
- Breakfast: Every day, Reminder OFF
- Lunch: Weekdays, Reminder ON
- Dinner: Every day, Reminder ON

Next Reminder Logic:
- Skip Breakfast (disabled)
- Calculate Lunch next occurrence (if weekday)
- Calculate Dinner next occurrence
- Return soonest of Lunch or Dinner
```

---

## Add/Remove Meals

### Add Meal
```
┌─────────────────────────────────────┐
│  ┌───────────────────────────────┐  │
│  │ 🍽️ Breakfast        [🗑️]  ▼ │  │
│  │ 08:00 • Every day             │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 🍽️ Dinner           [🗑️]  ▼ │  │
│  │ 20:00 • Custom days           │  │
│  └───────────────────────────────┘  │
│                                     │
│  [+ Add Another Meal]    ← Tap     │
│                                     │
│  ────────────────────────────────── │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 🍽️ Snack            [🗑️]  ▲ │  │ ← NEW, auto-expanded
│  │ 15:00 • Every day             │  │
│  ├───────────────────────────────┤  │
│  │ (All fields ready to edit)    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Behavior:**
- New meal added at bottom
- Default values: "Snack", "15:00", Every day, ON, ON
- Auto-expands for immediate editing
- Other meals collapse

---

### Remove Meal
```
Before:
┌─────────────────────────────────────┐
│  🍽️ Breakfast          [🗑️]  ▼    │
│  🍽️ Lunch              [🗑️]  ▼    │ ← Remove
│  🍽️ Dinner             [🗑️]  ▼    │
└─────────────────────────────────────┘

Tap 🗑️ on Lunch

After:
┌─────────────────────────────────────┐
│  🍽️ Breakfast          [🗑️]  ▼    │
│  🍽️ Dinner             [🗑️]  ▼    │
└─────────────────────────────────────┘
```

**Minimum Enforcement:**
- Cannot remove last meal
- Alert: "You need at least one meal per day"

---

## Keyboard Behavior

### Before KeyboardAvoidingAnimatedView
```
┌─────────────────────────────────────┐
│  Notes (optional)                   │
│  [Morning kibble____________]       │ ← Input field
│                                     │
│  ────────────────────────────────── │
│  [Save Changes]                     │
└─────────────────────────────────────┘
        ↓ Keyboard opens
┌─────────────────────────────────────┐
│ ┌─────────────────────────────┐     │
│ │ 🅰 Q W E R T Y U I O P       │     │ ← KEYBOARD
│ │   A S D F G H J K L         │     │   COVERS
│ │    Z X C V B N M            │     │   INPUT
│ └─────────────────────────────┘     │
└─────────────────────────────────────┘
❌ Input hidden, can't see what you're typing
❌ Save button covered
```

---

### After KeyboardAvoidingAnimatedView
```
┌─────────────────────────────────────┐
│  Meal Name                          │
│  [Breakfast________________] ↑      │
│                               │      │
│  Time                         │      │
│  [08:00____________________]  │      │
│                               │      │ ← Content
│  Notes (optional)             │      │   shifts up
│  [Morning kibble____________] ← Visible │
│  ────────────────────────────────── │
│  [Save Changes]  ← Still visible    │
├─────────────────────────────────────┤
│ ┌─────────────────────────────┐     │
│ │ 🅰 Q W E R T Y U I O P       │     │
│ │   A S D F G H J K L         │     │
│ │    Z X C V B N M            │     │
│ └─────────────────────────────┘     │
└─────────────────────────────────────┘
✅ Input visible above keyboard
✅ Save button visible
✅ Can scroll to any input
```

---

## Summary

### What Changed
1. **Each meal has its own settings:**
   - Meal name, time, frequency, custom days, toggles, notes
2. **Expandable meal cards:**
   - Tap to expand/collapse
   - Only one expanded at a time
   - Clean, organized interface
3. **Keyboard-aware:**
   - Content shifts up when keyboard opens
   - Inputs always visible
   - Save button never covered
4. **Flexible scheduling:**
   - Breakfast every day
   - Dinner custom days (Wed, Fri)
   - Each meal independent

### User Benefits
- ✅ Full control over each meal's schedule
- ✅ No more one-size-fits-all frequency
- ✅ Clean, easy-to-use interface
- ✅ Keyboard doesn't hide inputs
- ✅ Add/remove meals easily
- ✅ Per-meal reminder settings
- ✅ Per-meal notes for specific instructions
