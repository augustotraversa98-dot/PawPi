# Walk Routine Editor UX — Implementation Guide

This document explains the technical implementation of the Walk Routine editor improvements.

---

## Architecture

The Walk Routine editor was refactored into modular components during this update:

```
WalkRoutineModal (main container)
├── WalkCountSelector (step 1: choose number of walks)
└── WalkItem (each walk card) ★ PRIMARY CHANGES HERE
    ├── FrequencySelector
    ├── CustomDaysSelector
    ├── DurationPaceSelector
    ├── ReminderSettings
    ├── SocialWalkToggle
    └── SocialWalkSettings
```

**Key changes:**
- `WalkItem.jsx` — New collapsed/expanded states
- `WalkRoutineModal.jsx` — Added KeyboardAvoidingView

---

## Component: WalkItem

**File:** `/apps/mobile/src/components/Health/Reminders/WalkItem.jsx`

### Props

```javascript
{
  walk: Object,           // Walk data (name, time, frequency, etc.)
  index: Number,          // Walk index (for display)
  isExpanded: Boolean,    // Controlled expansion state
  canRemove: Boolean,     // Whether this walk can be deleted
  onToggleExpanded: Function,  // Callback to toggle expansion
  onRemove: Function,     // Callback to delete walk
  onChange: Function,     // Callback for field changes
}
```

### State Logic (Controlled)

**Parent component (`WalkRoutineModal`) controls expansion:**

```javascript
const [expandedWalkIndex, setExpandedWalkIndex] = useState(null);

const toggleWalkExpanded = (index) => {
  setExpandedWalkIndex(expandedWalkIndex === index ? null : index);
};
```

**Why controlled?** Only one walk should be expanded at a time for clarity.

---

### Collapsed State Implementation

```javascript
{!isExpanded && (
  <>
    {/* Header */}
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text>Walk {index + 1}</Text>
      {canRemove && <TouchableOpacity onPress={handleRemove}><Trash2 /></TouchableOpacity>}
    </View>

    {/* Summary */}
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 18, fontWeight: "800" }}>
        {walk.name || "Walk"}
      </Text>
      <Text style={{ fontSize: 14 }}>
        {walk.time} · {getFrequencyDisplay(walk)} · {walk.durationMinutes || 30} min
      </Text>
      <Text style={{ fontSize: 13, textTransform: "capitalize" }}>
        {walk.pace || "normal"} pace
      </Text>
    </View>

    {/* Edit Details Button */}
    <TouchableOpacity onPress={onToggleExpanded} style={{ /* full row style */ }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Edit3 size={14} />
          <Text style={{ fontWeight: "700" }}>Edit walk details</Text>
        </View>
        <Text style={{ fontSize: 11 }}>Repeat days, pace, social walk, notes</Text>
      </View>
      <ChevronDown size={20} />
    </TouchableOpacity>
  </>
)}
```

**Key features:**
- Walk name is prominent (18px, bold)
- Summary line shows key info at a glance
- Full row is tappable (not just the chevron)
- Descriptive text explains what's inside

---

### Expanded State Implementation

```javascript
{isExpanded && (
  <>
    {/* Header with badge */}
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Text>Walk {index + 1}</Text>
        <Text style={{ 
          backgroundColor: C.sage + "20",
          color: C.sage,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        }}>
          Walk details
        </Text>
      </View>
      {canRemove && <TouchableOpacity onPress={handleRemove}><Trash2 /></TouchableOpacity>}
    </View>

    {/* SECTION: Basic Info */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ 
        fontSize: 12, 
        fontWeight: "700", 
        color: C.sage,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}>
        Basic Info
      </Text>
      {/* Walk name and time inputs */}
    </View>

    {/* SECTION: Schedule */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ /* section label style */ }}>Schedule</Text>
      <FrequencySelector />
      {walk.frequency === ROUTINE_FREQUENCY.CUSTOM && <CustomDaysSelector />}
    </View>

    {/* SECTION: Walk Details */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ /* section label style */ }}>Walk Details</Text>
      <DurationPaceSelector />
    </View>

    {/* SECTION: Reminders */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ /* section label style */ }}>Reminders</Text>
      <ReminderSettings />
    </View>

    {/* SECTION: Social Walk */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ /* section label style */ }}>Social Walk</Text>
      <SocialWalkToggle />
      <SocialWalkSettings />
    </View>

    {/* SECTION: Calendar */}
    <View style={{ marginBottom: 20 }}>
      <Text style={{ /* section label style */ }}>Calendar</Text>
      <TouchableOpacity onPress={handleAddToCalendar}>
        <CalendarIcon /> Add to calendar
      </TouchableOpacity>
    </View>

    {/* SECTION: Notes */}
    <View style={{ marginBottom: 16 }}>
      <Text style={{ /* section label style */ }}>Notes</Text>
      <TextInput multiline />
    </View>

    {/* Done Editing Button */}
    <TouchableOpacity onPress={onToggleExpanded}>
      <Text>Done editing</Text>
      <ChevronUp size={18} />
    </TouchableOpacity>
  </>
)}
```

**Key features:**
- Section labels (uppercase, sage color, letter-spacing)
- Logical grouping (20px margin between sections)
- "Walk details" badge in header
- "Done editing" button at bottom

---

## Helper Function: getFrequencyDisplay

```javascript
const getFrequencyDisplay = (walk) => {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) return "Every day";
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKDAYS) return "Weekdays";
  if (walk.frequency === ROUTINE_FREQUENCY.WEEKENDS) return "Weekends";
  if (walk.frequency === ROUTINE_FREQUENCY.CUSTOM) {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (walk.days && walk.days.length > 0) {
      return walk.days.map(d => dayNames[d]).join(", ");
    }
    return "Custom days";
  }
  return "Every day";
};
```

**Purpose:** Format frequency for display in collapsed summary.

**Examples:**
- `DAILY` → `"Every day"`
- `WEEKDAYS` → `"Weekdays"`
- `CUSTOM` with `[0, 2, 4]` → `"Mon, Wed, Fri"`
- `CUSTOM` with `[]` → `"Custom days"`

---

## Component: WalkRoutineModal

**File:** `/apps/mobile/src/components/Health/Reminders/WalkRoutineModal.jsx`

### Keyboard Handling

**Before:**
```javascript
<Modal visible={visible}>
  <View style={{ flex: 1 }}>
    <ScrollView>
      {walks.map(...)}
    </ScrollView>
    <View>
      <TouchableOpacity onPress={handleSave}>Save</TouchableOpacity>
    </View>
  </View>
</Modal>
```

**Problems:**
- Keyboard covers inputs
- Save button can overlap active input
- No auto-scrolling

---

**After:**
```javascript
<Modal visible={visible}>
  <KeyboardAvoidingView 
    style={{ flex: 1 }} 
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    keyboardVerticalOffset={0}
  >
    <View style={{ flex: 1 }}>
      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {walks.map(...)}
      </ScrollView>
      <View>
        <TouchableOpacity onPress={handleSave}>Save</TouchableOpacity>
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

**Improvements:**
- ✅ `KeyboardAvoidingView` wrapper (iOS: padding behavior)
- ✅ `paddingBottom: 100` in ScrollView (breathing room)
- ✅ `keyboardShouldPersistTaps="handled"` (dismiss keyboard on outside tap)
- ✅ Save button never covers inputs

---

## Visual Feedback: Border Color

```javascript
<View
  style={{
    borderWidth: 1.5,
    borderColor: isExpanded ? C.sage : C.peach,
  }}
>
```

**Collapsed:** `#FFE5D9` (peach) — neutral
**Expanded:** `#A7BFA3` (sage) — active/editing

**Purpose:** Immediate visual feedback when entering edit mode.

---

## Typography Hierarchy

### Collapsed State

```javascript
// Walk name
{ fontSize: 18, fontWeight: "800", color: C.warmBrown }

// Summary (time, frequency, duration)
{ fontSize: 14, color: C.mutedBrown }

// Pace
{ fontSize: 13, color: C.mutedBrown, textTransform: "capitalize" }

// "Edit walk details" label
{ fontSize: 14, fontWeight: "700", color: C.warmBrown }

// Descriptive text
{ fontSize: 11, color: C.mutedBrown }
```

### Expanded State

```javascript
// Section labels (BASIC INFO, SCHEDULE, etc.)
{ 
  fontSize: 12, 
  fontWeight: "700", 
  color: C.sage,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

// Input labels (Walk name, Walk time, etc.)
{ fontSize: 13, fontWeight: "600", color: C.warmBrown }

// Input text
{ fontSize: 15, color: C.warmBrown }
```

**Hierarchy:**
1. Section labels (uppercase, green)
2. Input labels (bold, brown)
3. Input values (regular, brown)

---

## Spacing System

```javascript
// Between sections
marginBottom: 20

// Inside sections (between label and input)
marginBottom: 10

// Between inputs in same section
marginBottom: 12

// Card padding
padding: 16

// Card margin bottom (between walk cards)
marginBottom: 12

// ScrollView bottom padding (for keyboard)
paddingBottom: 100
```

**Why 100px bottom padding?**
- Ensures last input is always accessible when keyboard is open
- Accounts for iOS safe area + keyboard height
- Prevents "fighting" with keyboard

---

## State Management

### Walk Data Structure

```javascript
{
  name: "Morning walk",
  time: "07:30",
  frequency: ROUTINE_FREQUENCY.DAILY,
  days: [],  // Only used if frequency === CUSTOM
  durationMinutes: 30,
  pace: "normal",
  reminderEnabled: true,
  timeSensitive: true,
  socialWalkEnabled: false,
  visibility: "friends_only",
  maxPets: 4,
  meetingArea: "",
  meetingLocationDetails: "",
  approvalRequired: true,
  notesForGuests: "",
  notes: "",
}
```

### Parent State

```javascript
const [walks, setWalks] = useState([...]);
const [expandedWalkIndex, setExpandedWalkIndex] = useState(null);

const handleWalkChange = (index, field, value) => {
  const updated = [...walks];
  updated[index] = { ...updated[index], [field]: value };
  setWalks(updated);
};

const toggleWalkExpanded = (index) => {
  setExpandedWalkIndex(expandedWalkIndex === index ? null : index);
};
```

**Why controlled expansion?**
- Only one walk should be expanded at a time
- Clearer UX
- Easier to implement keyboard avoidance

---

## Performance Considerations

### Component Memoization

Not needed for this component because:
- User rarely has more than 2-3 walks
- Editing is infrequent
- Re-renders are fast

If needed in the future:
```javascript
const MemoizedWalkItem = React.memo(WalkItem);
```

### Keyboard Handling

`keyboardShouldPersistTaps="handled"` ensures:
- Taps on buttons/inputs work while keyboard is open
- Tapping outside inputs dismisses keyboard
- No double-tap needed

---

## Edge Cases Handled

### 1. Delete Last Walk

```javascript
const handleRemove = () => {
  if (!canRemove) {
    Alert.alert("Minimum Walks", "You need at least one walk");
    return;
  }
  onRemove();
};
```

**Prevention:** User must always have at least one walk.

### 2. Custom Days with No Selection

```javascript
if (walk.days && walk.days.length > 0) {
  return walk.days.map(d => dayNames[d]).join(", ");
}
return "Custom days";  // Fallback
```

**Display:** Shows "Custom days" if no days selected yet.

### 3. Missing Walk Data

```javascript
{walk.name || "Walk"}
{walk.time}
{walk.durationMinutes || 30} min
{walk.pace || "normal"} pace
```

**Fallbacks:** Sensible defaults for all fields.

### 4. Keyboard Dismissal

```javascript
keyboardShouldPersistTaps="handled"
```

**Behavior:**
- Tapping input: Opens keyboard
- Tapping button: Executes action
- Tapping outside: Dismisses keyboard

---

## Testing Checklist

### Collapsed State
- [ ] Walk summary displays correctly
- [ ] Frequency formats properly (Daily, Weekdays, Weekends, Custom)
- [ ] Custom days show comma-separated list
- [ ] "Edit walk details" row is fully tappable
- [ ] Chevron down is visible
- [ ] Delete button appears only when multiple walks exist

### Expanded State
- [ ] Section labels are visible and styled correctly
- [ ] All inputs are editable
- [ ] Custom days selector appears when Custom is selected
- [ ] Reminder toggles work
- [ ] Social walk toggle works
- [ ] Calendar button works
- [ ] Notes textarea expands
- [ ] "Done editing" button collapses card
- [ ] Chevron up is visible

### Keyboard Handling
- [ ] Keyboard opens when input is tapped
- [ ] Active input remains visible
- [ ] Screen auto-scrolls if needed
- [ ] Save button never covers inputs
- [ ] Tapping outside dismisses keyboard
- [ ] Tapping buttons works while keyboard is open

### Visual Feedback
- [ ] Collapsed border is peach
- [ ] Expanded border is sage
- [ ] "Walk details" badge appears when expanded
- [ ] Border changes smoothly during transition

---

## Migration Notes

**No breaking changes.** All existing walk data structures are compatible.

**Backwards compatibility:**
- Old walk objects missing new fields use defaults
- Frequency display handles all legacy values
- No database migration needed

**User impact:**
- Existing routines work as-is
- UI is immediately improved
- No re-setup required

---

## Future Improvements

### 1. Animation
Add smooth expand/collapse animation:
```javascript
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
```

### 2. Drag to Reorder
Allow users to reorder walks:
```javascript
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

### 3. Duplicate Walk
Quick action to copy a walk:
```javascript
const handleDuplicate = (index) => {
  const duplicated = { ...walks[index], name: walks[index].name + " (copy)" };
  setWalks([...walks, duplicated]);
};
```

### 4. Walk Templates
Save common walk configurations:
```javascript
const WALK_TEMPLATES = {
  morning: { time: "07:30", durationMinutes: 30, pace: "normal" },
  evening: { time: "18:30", durationMinutes: 20, pace: "relaxed" },
};
```

---

## Summary

**Files changed:**
- `WalkItem.jsx` — New collapsed/expanded states
- `WalkRoutineModal.jsx` — KeyboardAvoidingView

**Key improvements:**
- ✅ Obvious expandability
- ✅ Clear visual hierarchy
- ✅ Smooth keyboard handling
- ✅ Better spacing and organization
- ✅ Visual feedback (border colors, badge)

**Result:** The Walk Routine editor is now intuitive, discoverable, and delightful to use. 🎉
