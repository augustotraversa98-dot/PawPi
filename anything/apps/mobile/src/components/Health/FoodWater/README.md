# Food & Water Tracker

A comprehensive nutrition tracking system for the Health section that supports both quick logging and detailed logging.

## Components

### FoodWaterTrackerModal
Main modal for logging food and water intake.

**Features:**
- Multi-step flow: Type selection → Quick choice (food only) → Detailed form
- Quick log: "Same as usual" saves default meal instantly
- Detailed food form with comprehensive fields
- Water tracking with thirst indicators
- Confirmation screen after saving

**Props:**
- `visible` (boolean): Controls modal visibility
- `onClose` (function): Callback when modal is closed
- `initialType` (string): "food" or "water" - sets initial tracker type

### FoodWaterDashboard
Dashboard card showing today's nutrition summary.

**Displays:**
- Last meal with time, type, and appetite
- Meals logged today count
- Snacks logged today count
- Water logged today count
- Next feeding reminder
- Appetite trend warnings (if low appetite detected)

**Features:**
- Click-to-log: Opens tracker modal on tap
- Color-coded stats by category
- Safe, non-diagnostic language for warnings

## Data Model

### Food Log Entry
```javascript
{
  id: "fw001",
  petId: "phoebe",
  type: "food",
  timestamp: "2026-05-06T07:15:00Z",
  mealType: "breakfast", // breakfast, lunch, dinner, snack, treat
  foodName: "Royal Canin Adult Dog Food",
  amount: "1 cup",
  appetite: "normal", // low, normal, high
  finishedMeal: "yes", // yes, partially, no
  vomiting: false,
  notes: "",
  isDefault: true
}
```

### Water Log Entry
```javascript
{
  id: "fw003",
  petId: "phoebe",
  type: "water",
  timestamp: "2026-05-06T09:00:00Z",
  waterIntake: "normal", // low, normal, high
  moreThirsty: false,
  lessThirsty: false,
  notes: ""
}
```

## Integration Points

### Today Tab (`HealthToday.jsx`)
- **FoodWaterDashboard** displays nutrition summary at the top
- **Today's Timeline** includes food and water logs dynamically
- Timeline shows meal emoji, type, food name, and appetite

### Track Tab (`HealthTrack.jsx`)
- **Food & Treats** tracker opens modal in "food" mode
- **Water Intake** tracker opens modal in "water" mode

## Helper Functions (`/apps/mobile/src/data/foodWaterData.js`)

- `getTodayFoodLogs()` - Returns today's food entries
- `getTodayWaterLogs()` - Returns today's water entries
- `getMealsToday()` - Returns breakfast/lunch/dinner only
- `getSnacksToday()` - Returns snacks and treats only
- `getLastMeal()` - Returns most recent food entry
- `getRecentAppetiteTrend()` - Analyzes last 5 meals for appetite patterns
- `getNextFeedingTime()` - Returns next scheduled feeding
- `addFoodLog(data)` - Adds new food entry
- `addWaterLog(data)` - Adds new water entry

## Safety Language

All copy uses safe, non-diagnostic language:

✅ **Good:**
- "Reduced appetite may be worth monitoring"
- "Contact your vet if it continues or comes with other symptoms"
- "Based on your logs"
- "Track visible changes over time"

❌ **Avoided:**
- "Your dog is sick"
- "This is normal"
- "No need to worry"
- "Diagnosis"

## Default Meal Configuration

Default meals are defined in `defaultMeal` object for quick logging:

- **Breakfast**: 1 cup Royal Canin, normal appetite, finished
- **Lunch**: 0.5 cup Royal Canin, normal appetite, finished
- **Dinner**: 1 cup Royal Canin, normal appetite, finished

## Appetite Trend Detection

The system monitors the last 5 meals and shows warnings:

- **Low appetite pattern**: 3+ low appetite meals → Warning card
- **Monitoring**: 1-2 low appetite meals → Info note
- **Normal**: 0 low appetite meals → No warning

## Usage Example

```javascript
import FoodWaterDashboard from "@/components/Health/FoodWater/FoodWaterDashboard";

// In your component
<FoodWaterDashboard />
```

```javascript
import FoodWaterTrackerModal from "@/components/Health/FoodWater/FoodWaterTrackerModal";

// In your component
const [modalVisible, setModalVisible] = useState(false);
const [modalType, setModalType] = useState("food");

<FoodWaterTrackerModal
  visible={modalVisible}
  onClose={() => setModalVisible(false)}
  initialType={modalType}
/>
```
