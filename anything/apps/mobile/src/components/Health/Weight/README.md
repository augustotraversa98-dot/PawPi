# Weight & Body Condition Tracker

## Overview
Helps owners and vets monitor long-term weight and body condition changes in a non-judgmental, educational way.

## Components

### WeightDashboard
- Shows current weight with visual emphasis
- Displays previous weight and change (amount + percentage)
- Shows 3-month trend direction (increasing/decreasing/stable)
- Target weight from vet (if available)
- Body Condition Score (if entered by vet)
- Placeholder for weight history chart
- "Add entry" button

### WeightModal
Two tabs:
1. **Add Entry**
   - Owner-friendly fields
   - Vet fields (optional, toggled)
2. **History**
   - List of all entries
   - Delete option per entry
   - Badges for owner vs vet entry

## Owner-Friendly Fields
- Current weight (lbs)
- Body shape visual estimate:
  - Too thin 🦴
  - Lean 🏃
  - Ideal-looking ✨
  - A little heavy 🍖
  - Heavy 🛋️
- Notes
- Photo upload (placeholder)

## Vet Fields (Optional)
- Body Condition Score (1-9 scale)
- Muscle Condition Score (normal, mild loss, moderate loss, severe loss)
- Target weight
- Vet notes

## Dashboard Display
- Current weight (large, prominent)
- Previous weight (smaller card)
- Change over time (trending up/down/stable with color-coded badge)
- Weight trend placeholder chart
- Vet target weight (if available)
- Body Condition Score interpretation (if available)

## Language & Tone
- **Non-shaming**: All language is neutral and educational
- **No health claims**: Does not say the dog is "unhealthy"
- **Educational disclaimer**: "Weight changes over time can be useful to discuss with your vet."

## Data Functions
Located in `/data/weightData.js`:
- `getWeightEntries()` - All entries, sorted by date
- `getCurrentWeight()` - Most recent entry
- `getPreviousWeight()` - Second most recent entry
- `getWeightChange()` - Change between current and previous
- `getTargetWeight()` - Most recent vet-entered target
- `getCurrentBCS()` - Most recent Body Condition Score
- `getWeightTrend()` - Last 6 months for charting
- `getWeightTrendDirection()` - Increasing/decreasing/stable over 3 months
- `addWeightEntry(entryData)` - Add new entry
- `updateWeightEntry(id, updates)` - Update existing entry
- `deleteWeightEntry(id)` - Remove entry
- `getTodayWeightLogs()` - For timeline integration

## Integration Points
- **Today's Timeline**: Weight entries show up in daily timeline
- **Vet Records**: Weight history can be referenced
- **Track Tab**: Accessible from main Health section

## Design Notes
- Uses same color palette as other health trackers
- Visual body shape selector with emojis and descriptions
- BCS interpretation shows automatically when score is entered
- Target weight prominently displayed when set by vet
- Clear distinction between owner and vet entries in history

## Usage
```jsx
import { WeightDashboard } from '@/components/Health/Weight';

<WeightDashboard />
```

The dashboard handles all state internally and opens the modal when needed.
