# Photo Check System

The Photo Check system helps pet owners track visible changes in their pet's health over time by uploading recurring photos of specific body areas.

## ⚠️ Important: Safe Language

The Photo Check system uses safe, non-diagnostic language throughout:

### ✅ DO say:
- "Track visible changes"
- "Compare over time"
- "Share with your vet"
- "Based on your logs"
- "Worth monitoring"
- "Consider contacting your veterinarian"
- "This is not a diagnosis"

### ❌ DO NOT say:
- "Your dog is healthy"
- "Your dog is unhealthy"
- "Diagnosis"
- "AI diagnosis"
- "No need to visit a vet"
- "The app can determine if the pet is healthy"

## Components

### PhotoCheckModal
The main modal for capturing/selecting photos for specific body areas.

**Features:**
- Select body area (Paws, Ears, Eyes, Teeth, Skin/Fur, Face, Full body, Other)
- Take photo or choose from gallery
- Preview photo before saving
- Add optional notes
- Area-specific prompts and guidance

**Props:**
- `visible` (boolean): Controls modal visibility
- `onClose` (function): Called when modal is closed
- `onSave` (function): Called when photo is saved with photoData object

### PhotoHistory
Displays all photo checks organized by body area in an expandable accordion view.

**Features:**
- Groups photos by body area
- Shows photo count and last upload date for each area
- Expandable photo grid with timestamps and notes
- Indicates photos included in Vet Summary
- "Compare over time" placeholder for future feature

### PhotoCheckSchedule
Settings component for configuring photo check frequency by body area.

**Features:**
- Configure frequency for each body area (Off, Weekly, Every 2 weeks, Monthly)
- Shows suggested frequencies
- Color-coded by body area
- Safety disclaimers

## Body Areas

The system supports tracking these body areas:

| Area | Default Frequency | Color | Prompt |
|------|------------------|-------|---------|
| Paws | Weekly | #FFB74D | Any redness, swelling, cuts, limping, or excessive licking? |
| Eyes | Weekly | #64B5F6 | Any redness, cloudiness, discharge, or squinting? |
| Ears | Every 2 weeks | #9575CD | Any smell, discharge, redness, scratching, or head shaking? |
| Teeth | Monthly | #4DB6AC | Any tartar, bad breath, gum redness, or broken teeth? |
| Skin / Fur | Monthly | #FF8A65 | Any redness, hair loss, wounds, bumps, fleas, ticks, or itching? |
| Face | Monthly | #FF6F61 | Any swelling, wounds, discharge, or asymmetry? |
| Full body | Monthly | #A7BFA3 | Useful for tracking body shape, posture, coat, and visible changes |
| Other | Off | #B75D32 | Any other visible changes you want to track? |

## Data Model

### Photo Check Object
```javascript
{
  id: "pc001",
  petId: "phoebe",
  bodyArea: "paws", // One of: paws, ears, eyes, teeth, skin_fur, face, full_body, other
  imageUrl: "https://...",
  notes: "Optional notes",
  createdAt: "2026-05-06T08:30:00Z",
  includedInVetSummary: false
}
```

### Photo Check Schedule Object
```javascript
{
  frequency: "weekly", // One of: off, weekly, every_2_weeks, monthly
  nextDueDate: "2026-05-06",
  lastUploadDate: "2026-04-29"
}
```

## Integration Points

### Today Tab
- Displays "This week's photo check" card when a photo check is due
- Shows body area name, due status, and action buttons
- Opens PhotoCheckModal for capture/selection

### Track Tab
- Photo Check appears as first tracker in the list
- Opens PhotoCheckModal when tapped

### Insights Tab
- Shows PhotoHistory component at the top
- Displays all photo checks organized by body area

### Vet Record Tab
- Includes collapsible PhotoHistory section
- Shows photos that can be included in vet summaries

### Reminders Tab
- Shows photo check reminders when due
- Displays with distinctive blue styling
- Integrates with other health reminders

## Guidance Copy

The system provides helpful guidance throughout:

**General Guidance:**
> "Try to use similar lighting and angle each time. Photos can help you and your vet compare visible changes over time."

**Safety Copy:**
> "Photo Check helps you track visible changes over time. It does not diagnose or replace veterinary care."

## Future Features

- ✅ Photo capture and history
- ✅ Scheduled reminders
- ✅ Vet summary integration
- 🔄 Side-by-side photo comparison
- 🔄 Annotations on photos
- 🔄 Export photo timeline as PDF

## Usage Example

```javascript
import PhotoCheckModal from "@/components/Health/PhotoCheck/PhotoCheckModal";

function MyComponent() {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSave = (photoData) => {
    console.log("Photo saved:", photoData);
    // Save to database/state
  };

  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        <Text>Take Photo Check</Text>
      </TouchableOpacity>
      
      <PhotoCheckModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </>
  );
}
```
