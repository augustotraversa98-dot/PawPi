# General Check Components

A guided visual health check system that helps pet owners perform routine health assessments.

## Components

### `GeneralCheckDashboard.jsx`
Displays the most recent general check summary including:
- Overall status (all usual vs. areas with changes)
- Last check timestamp
- Areas with noted changes
- Quick access to start a new check

### `GeneralCheckModal.jsx`
Guided step-by-step health check flow covering:
- Eyes
- Ears  
- Teeth & Mouth
- Skin & Fur
- Paws
- Face
- Mood
- Energy

For each area, owners can:
- Mark as "Looks usual" or "Something changed"
- Select specific changes (redness, swelling, discharge, etc.)
- Add photos (camera or library)
- Add notes
- See AI placeholder (coming soon)

## Data File

### `generalCheckData.js`
Manages general check data including:
- Check history storage
- Area configuration
- Change option definitions
- Helper functions for querying and formatting

## Features

### Safety & Education
- Context-appropriate safety warnings
- AI placeholder with educational messaging
- Recommendations based on severity of changes

### Photo Integration
- Connects with Photo Check system
- Stores photos by body area
- Photo history over time

### Timeline Integration
- Saved checks appear in Today's Timeline
- Available in Health History

## Usage

```jsx
import { GeneralCheckDashboard } from '@/components/Health/GeneralCheck';

<GeneralCheckDashboard />
```

## Design Philosophy

- Guided, not overwhelming
- Visual and emoji-driven
- Quick to complete
- Educational and safety-focused
- Not a medical diagnostic tool
