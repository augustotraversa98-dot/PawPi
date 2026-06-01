# Social Pet Health Database Implementation Summary

## ✅ Completed Work

### Database Tables Created
All new health tracking tables have been successfully added to the database:

1. **health_pee_logs** ✅
   - Tracks urination frequency, volume, color, accidents, difficulty, pain, blood, and thirst
   - Indexed on pet_id, owner_user_id, logged_at

2. **health_vomit_logs** ✅
   - Tracks vomiting episodes, appearance, food relation, appetite, energy, diarrhea, photos
   - Supports optional photo_url for visual documentation
   - Indexed on pet_id, owner_user_id, logged_at

3. **health_mobility_logs** ✅
   - Tracks limping, stiffness, difficulty standing/stairs, pain signs
   - **Note:** Table ready but no UI exists yet
   - Indexed on pet_id, owner_user_id, logged_at

4. **health_weight_logs** ✅
   - Tracks weight measurements, units, body shape estimates, photos
   - Supports optional photo_url
   - Indexed on pet_id, owner_user_id, logged_at

5. **health_timeline_events** ✅
   - Unified timeline table for all health events (optional future use)
   - Event types: food, poo, pee, vomit, walk, mobility, general_check, photo_check, weight
   - Indexed on pet_id, owner_user_id, event_time, event_type

### API Routes Created
New backend routes for health tracking with UI:

- **`/api/health/pee-logs`** (GET, POST) ✅
- **`/api/health/vomit-logs`** (GET, POST) ✅
- **`/api/health/weight-logs`** (GET, POST) ✅

All routes:
- Authenticate user via session
- Fetch user_profiles.id from auth_users.id
- Save owner_user_id = user_profiles.id
- Filter queries by pet_id and owner_user_id

### React Query Hooks Created

**Save Hooks** (`/apps/mobile/src/hooks/useHealthTracking.js`):
- `useLogPee()` ✅
- `useLogVomit()` ✅
- `useLogWeight()` ✅

**Fetch Hooks** (`/apps/mobile/src/hooks/useFetchHealthData.js`):
- `usePoeLogs()` ✅
- `useVomitLogs()` ✅
- `useWeightLogs()` ✅

All hooks:
- Use `useCurrentPet()` to get current pet
- Invalidate queries on success
- Show error alerts on failure
- Return loading/error states

---

## ⚠️ Remaining Work

### UI Components to Update (3 items)

The following tracker modals exist but still use mock data:

1. **PeeTrackerModal** (`/apps/mobile/src/components/Health/Pee/PeeTrackerModal.jsx`)
   - Current: Uses `addPeeLog()` from `@/data/peeData`
   - **Action needed:** Replace with `useLogPee()` hook
   - Add loading indicators during save

2. **VomitTrackerModal** (`/apps/mobile/src/components/Health/Vomit/VomitTrackerModal.jsx`)
   - Current: Uses `addVomitLog()` from `@/data/vomitData`
   - **Action needed:** 
     - Import `useLogVomit()` hook
     - Import `useUpload()` for photo handling
     - Upload photo first, then save URL to database

3. **WeightModal** (`/apps/mobile/src/components/Health/Weight/WeightModal.jsx`)
   - Current: Uses `addWeightEntry()` from `@/data/weightData`
   - **Action needed:**
     - Import `useLogWeight()` hook
     - Import `useUpload()` for optional photo
     - Update history tab to fetch from database via `useWeightLogs()`

---

## 🔑 Important ID Rules

### Always Use Correct IDs
✅ **Correctly implemented in all API routes and hooks:**

```javascript
// User ID
const userProfileRows = await sql(
  "SELECT id FROM user_profiles WHERE auth_user_id = $1",
  [session.user.id]
);
const userProfileId = userProfileRows[0].id;
// Save as owner_user_id = userProfileId

// Pet ID  
const { data: currentPet } = useCurrentPet();
// Save as pet_id = currentPet.id
```

**Never use:**
- ❌ `session.user.id` as `owner_user_id`
- ❌ `auth_users.id` in health tables

**Always use:**
- ✅ `user_profiles.id` as `owner_user_id`
- ✅ `pets.id` as `pet_id`

---

## 📋 Quick Connection Guide

To connect a tracker modal to the database:

```javascript
// 1. Import hooks
import { useLogPee } from "@/hooks/useHealthTracking";
import { useUpload } from "@/utils/useUpload";

// 2. Initialize in component
const logPeeMutation = useLogPee();
const { uploadImage } = useUpload();

// 3. Handle form submission
const handleSubmit = async () => {
  try {
    // Upload photo if exists
    let uploadedPhotoUrl = null;
    if (localPhotoUri) {
      setIsUploading(true);
      uploadedPhotoUrl = await uploadImage(localPhotoUri);
      setIsUploading(false);
    }

    // Save to database
    await logPeeMutation.mutateAsync({
      frequency: "normal",
      volume: "medium",
      color: "yellow",
      photoUrl: uploadedPhotoUrl,
      notes: "...",
    });

    // Success - queries auto-refresh
    onClose();
  } catch (error) {
    console.error("Save failed:", error);
  }
};

// 4. Show loading state
const isBusy = logPeeMutation.isPending || isUploading;
<Button disabled={isBusy}>
  {isBusy ? <ActivityIndicator /> : "Save"}
</Button>
```

---

## ✅ Acceptance Criteria Status

- ✅ Missing health tables created in public schema
- ✅ Existing tables not duplicated or renamed
- ✅ All tables use pet_id and owner_user_id
- ✅ owner_user_id = user_profiles.id (not auth_users.id)
- ✅ Proper indexes added for performance
- ✅ Foreign key constraints to pets and user_profiles
- ✅ API routes created for tables with existing UI
- ✅ React Query hooks for save & fetch
- ⚠️ UI updates pending for: Pee, Vomit, Weight trackers

---

## 📂 File Locations

### API Routes
```
/apps/web/src/app/api/health/
├── pee-logs/route.js ← NEW
├── vomit-logs/route.js ← NEW
└── weight-logs/route.js ← NEW
```

### Hooks
```
/apps/mobile/src/hooks/
├── useHealthTracking.js (updated with pee, vomit, weight)
└── useFetchHealthData.js (updated with pee, vomit, weight)
```

### UI Components (Need Updates)
```
/apps/mobile/src/components/Health/
├── Pee/PeeTrackerModal.jsx ← Update needed
├── Vomit/VomitTrackerModal.jsx ← Update needed
└── Weight/WeightModal.jsx ← Update needed
```
