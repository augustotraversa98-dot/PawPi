# Walk Routine Editor UX — Visual Guide

This document shows the before and after designs for the Walk Routine editor improvements.

---

## Overview

**Goal:** Make expandable walk cards obvious and improve visual hierarchy.

**Changes:**
1. **Collapsed state:** Show summary + clear "Edit walk details" button
2. **Expanded state:** Section labels and better organization
3. **Keyboard handling:** Save button never covers inputs

---

## 🎨 Collapsed Walk Card

### Before (Hidden Expandability)

```
┌──────────────────────────────────────────┐
│  Walk 1                      [v] [trash] │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Morning walk                       │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 07:30                              │ │
│  └────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

**Problems:**
- ❌ Small chevron icon (not obvious)
- ❌ No indication of what's inside
- ❌ Looks like a form, not an expandable card
- ❌ No summary of walk settings

---

### After (Clear & Discoverable)

```
┌──────────────────────────────────────────┐
│  Walk 1                         [trash]  │
│                                          │
│  Morning walk                            │ ← Large, bold name
│  7:30 AM · Every day · 30 min            │ ← Summary line
│  Normal pace                             │ ← Pace
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 📝 Edit walk details              ↓│ │ ← FULL TAPPABLE ROW
│  │ Repeat days, pace, social walk…   │ │ ← Descriptive text
│  └────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

**Improvements:**
- ✅ Clear summary at a glance
- ✅ Obvious "Edit walk details" button
- ✅ Full row is tappable
- ✅ Descriptive text explains what's inside
- ✅ Chevron down indicator

---

## 📝 Expanded Walk Card

### Before (Flat List)

```
┌──────────────────────────────────────────┐
│  Walk 1                      [^] [trash] │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Walk name                          │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 07:30                              │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Repeat                                  │
│  • Every day                             │
│  • Weekdays                              │
│  • Weekends                              │
│  • Custom days                           │
│                                          │
│  Duration (min)        Pace              │
│  [30]                  • Relaxed         │
│                        • Normal          │
│                        • Active          │
│                                          │
│  [Add to calendar]                       │
│                                          │
│  Reminder enabled         [toggle]       │
│  Time-sensitive           [toggle]       │
│                                          │
│  Offer as social walk     [toggle]       │
│                                          │
│  Notes (optional)                        │
│  ┌────────────────────────────────────┐ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

**Problems:**
- ❌ Everything in one flat list
- ❌ Hard to scan
- ❌ No visual hierarchy
- ❌ Not obvious which settings are related

---

### After (Organized Sections)

```
┌──────────────────────────────────────────┐
│  Walk 1  [Walk details]         [trash]  │ ← Header + badge
│                                          │
│  BASIC INFO                              │ ← Section label
│  Walk name                               │
│  ┌────────────────────────────────────┐ │
│  │ Morning walk                       │ │
│  └────────────────────────────────────┘ │
│  Walk time                               │
│  ┌────────────────────────────────────┐ │
│  │ 07:30                              │ │
│  └────────────────────────────────────┘ │
│                                          │
│  SCHEDULE                                │ ← Section label
│  Repeat                                  │
│  • Every day                             │
│  • Weekdays                              │
│  • Weekends                              │
│  • Custom days                           │
│                                          │
│  WALK DETAILS                            │ ← Section label
│  Duration (min)        Pace              │
│  ┌────────────┐        • Relaxed         │
│  │ 30         │        • Normal          │
│  └────────────┘        • Active          │
│                                          │
│  REMINDERS                               │ ← Section label
│  ┌────────────────────────────────────┐ │
│  │ Reminder enabled         [toggle]  │ │
│  │ Time-sensitive           [toggle]  │ │
│  └────────────────────────────────────┘ │
│                                          │
│  SOCIAL WALK                             │ ← Section label
│  ┌────────────────────────────────────┐ │
│  │ Offer as social walk     [toggle]  │ │
│  │ Allow friends or nearby pets…      │ │
│  └────────────────────────────────────┘ │
│  [Social walk settings if enabled…]     │
│                                          │
│  CALENDAR                                │ ← Section label
│  ┌────────────────────────────────────┐ │
│  │ 📅 Add to calendar                 │ │
│  └────────────────────────────────────┘ │
│                                          │
│  NOTES                                   │ ← Section label
│  ┌────────────────────────────────────┐ │
│  │ Route, preferences...              │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Done editing                      ↑│ │ ← Collapse button
│  └────────────────────────────────────┘ │
│                                          │
└──────────────────────────────────────────┘
```

**Improvements:**
- ✅ Clear section labels (uppercase, green)
- ✅ Logical grouping of related settings
- ✅ Better spacing between sections
- ✅ "Walk details" badge in header
- ✅ "Done editing" button to collapse
- ✅ Easier to scan and navigate

---

## 🎯 Frequency Display Logic

The collapsed state shows a smart summary of the repeat frequency:

| Setting | Display |
|---------|---------|
| Every day | `Every day` |
| Weekdays | `Weekdays` |
| Weekends | `Weekends` |
| Custom: Mon, Wed, Fri | `Mon, Wed, Fri` |
| Custom: No days selected | `Custom days` |

**Example collapsed cards:**

```
┌──────────────────────────────────────────┐
│  Morning walk                            │
│  7:30 AM · Every day · 30 min            │ ← "Every day"
│  Normal pace                             │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Work week walk                          │
│  12:00 PM · Weekdays · 20 min            │ ← "Weekdays"
│  Relaxed pace                            │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Trail hike                              │
│  9:00 AM · Sat, Sun · 60 min             │ ← "Sat, Sun"
│  Active pace                             │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Park walk                               │
│  6:00 PM · Mon, Wed, Fri · 25 min        │ ← "Mon, Wed, Fri"
│  Normal pace                             │
└──────────────────────────────────────────┘
```

---

## ⌨️ Keyboard Handling

### Before (Keyboard Covers Inputs)

```
┌──────────────────────────────────────────┐
│  [Walk name input]                       │
│  [Walk time input]                       │
│  ...                                     │
│  [Notes textarea - partially visible]   │ ← User is typing here
│                                          │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ Save Changes                         │ │ ← COVERS THE INPUT
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
│                                          │
│  [Keyboard]                              │
│                                          │
└──────────────────────────────────────────┘
```

**Problems:**
- ❌ Save button covers active input
- ❌ Can't see what you're typing
- ❌ Frustrating UX

---

### After (Keyboard-Aware Scrolling)

```
┌──────────────────────────────────────────┐
│  [Walk name input]                       │
│  [Walk time input]                       │
│  ...                                     │
│  [Notes textarea - fully visible]       │ ← User is typing here
│  Route, preferences... █                │
│                                          │
│  [Done editing ↑]                        │
│                                          │
│  [Extra space for scrolling...]         │
│                                          │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ Save Changes                         │ │ ← ALWAYS VISIBLE
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
│                                          │
│  [Keyboard]                              │
│                                          │
└──────────────────────────────────────────┘
```

**Improvements:**
- ✅ Active input always visible
- ✅ Screen auto-scrolls when keyboard opens
- ✅ Save button never covers inputs
- ✅ `paddingBottom: 100` in ScrollView for breathing room
- ✅ Smooth, delightful UX

---

## 🎨 Visual Design Details

### Colors

| Element | Color | Purpose |
|---------|-------|---------|
| Collapsed border | `#FFE5D9` (peach) | Neutral, inactive |
| Expanded border | `#A7BFA3` (sage) | Active, editing mode |
| Section labels | `#A7BFA3` (sage) | Hierarchy, structure |
| "Walk details" badge | Sage background + text | Visual feedback |

### Typography

| Element | Font Size | Weight | Color |
|---------|-----------|--------|-------|
| Walk name (collapsed) | 18px | 800 | `#3B241B` (warmBrown) |
| Summary text | 14px | 400 | `#8B7355` (mutedBrown) |
| "Edit walk details" | 14px | 700 | `#3B241B` (warmBrown) |
| Section labels | 12px | 700 | `#A7BFA3` (sage) |
| Input labels | 13px | 600 | `#3B241B` (warmBrown) |

### Spacing

| Element | Spacing |
|---------|---------|
| Between sections | 20px |
| Inside sections | 10-12px |
| Card padding | 16px |
| Card margin bottom | 12px |
| Section label margin bottom | 10px |

---

## 📱 User Flow

### Viewing Walks (Collapsed)

1. User opens Walk Routine editor
2. Sees list of walks with clear summaries
3. Can quickly scan all walks at once
4. Immediately knows: name, time, frequency, duration, pace

### Editing a Walk (Expanded)

1. User taps "Edit walk details" row
2. Card expands smoothly
3. Border changes to green (visual feedback)
4. "Walk details" badge appears in header
5. Settings grouped by section
6. User makes changes
7. Taps "Done editing"
8. Card collapses
9. Summary updates automatically

### Keyboard Interaction

1. User taps walk name or notes input
2. Keyboard appears
3. Screen auto-scrolls to keep input visible
4. User types comfortably
5. Taps "Done" on keyboard
6. Keyboard dismisses
7. Save button always accessible

---

## 🎯 Design Goals Achieved

| Goal | Before | After |
|------|--------|-------|
| Discoverability | ❌ Hidden | ✅ Obvious |
| Scannability | ❌ Hard to scan | ✅ Easy to scan |
| Hierarchy | ❌ Flat list | ✅ Organized sections |
| Visual feedback | ❌ Minimal | ✅ Border color, badge |
| Keyboard UX | ❌ Covers inputs | ✅ Smooth, aware |
| Consistency | ❌ Mixed patterns | ✅ Clear states |

---

## 🚀 Before/After Summary

### Before
- Small chevron icon
- No summary visible
- Flat list of settings
- Keyboard issues
- Not obvious it's expandable

### After
- **Collapsed:** Clear summary + "Edit walk details" button
- **Expanded:** Section labels, logical grouping, "Done editing" button
- **Keyboard:** Auto-scrolling, save button always accessible
- **Visual polish:** Border colors, badges, better spacing

**Result:** The Walk Routine editor is now intuitive, discoverable, and delightful. Users know exactly what they can do and how to do it. 🎉
