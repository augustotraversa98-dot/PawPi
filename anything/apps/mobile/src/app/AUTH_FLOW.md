# Social Pet Authentication & Onboarding Flow

## Overview

Social Pet now has a complete authentication and onboarding flow that ensures users create an account before setting up their pet profile.

---

## 🔄 User Journey

### **1. First-Time Users**

```
App Launch
  ↓
Welcome Screen
  ↓
User taps "Create account"
  ↓
Auth WebView → Sign Up
  ↓
Account Created
  ↓
Pet Onboarding
  ↓
Main App (Community Feed)
```

### **2. Returning Users (With Account & Pet Profile)**

```
App Launch
  ↓
Auto-Login
  ↓
Main App (Community Feed)
```

### **3. Returning Users (With Account, No Pet Profile)**

```
App Launch
  ↓
Auto-Login
  ↓
Pet Onboarding
  ↓
Main App (Community Feed)
```

### **4. Vets & Businesses**

```
Welcome Screen
  ↓
Tap "Access for vets & businesses"
  ↓
Vet/Business Access Placeholder
  ↓
Select Type: Vet / Shelter / Business
  ↓
Request Early Access
  ↓
Success Message
```

---

## 📱 Screens

### **1. Welcome Screen** (`/welcome`)

**Purpose:** Entry point for unauthenticated users

**Design:**
- Clean, warm, cream background (#FFF7EF)
- Large paw emoji logo 🐾
- App name: "Social Pet"
- Tagline: "Your pet's daily care, moments, and community — all in one place."
- Primary button: "Create account" (Coral #FF6F61)
- Secondary button: "Log in" (Sand with coral border)
- Small link in top-right: "Access for vets & businesses"

**Actions:**
- "Create account" → Opens auth WebView in signup mode
- "Log in" → Opens auth WebView in signin mode
- "Forgot password?" → Opens auth WebView in forgot-password mode (added 2026-07-28; before this it
  was only reachable via the link inside the sign-in page, which a locked-out owner had to guess)
- "Access for vets & businesses" → `/vet-business-access`

---

### **2. Vet & Business Access Placeholder** (`/vet-business-access`)

**Purpose:** Placeholder for future vet/business features

**Design:**
- Header: "Access for vets & businesses"
- Subtitle explaining upcoming features
- 3 selectable cards:
  - 🩺 Vet clinic
  - 🏠 Shelter
  - 🛍️ Pet business
- Primary button: "Request early access"
- Secondary button: "Back to user login"

**Actions:**
- Select type + "Request early access" → Shows alert (placeholder for future waitlist)
- "Back to user login" → Returns to welcome screen

---

### **3. Pet Onboarding** (`/onboarding`)

**Purpose:** Collect pet profile information

**Fields:**
- Pet photo (optional)
- Dog name* (required)
- Breed* (required)
- Age
- Gender
- Weight
- Birthday
- Notes (allergies, preferences, conditions)

**Keyboard Fix:**
- Uses `React.memo` for InputField component
- Individual `useCallback` handlers for each field
- `keyboardShouldPersistTaps="handled"` on ScrollView
- Prevents keyboard dismissal on every keystroke

**Actions:**
- "Meet the community 🐾" → Saves pet profile to AsyncStorage → Main app

---

### **4. Authentication Web Pages** (WebView for mobile)

Located in `/apps/web/src/app/account/`:

#### **Sign Up** (`/account/signup`)
- Full name (required)
- Email (required)
- Password (min 6 characters, required)
- Confirm password (required)
- Validation for matching passwords
- Redirects to `/onboarding` after success

#### **Sign In** (`/account/signin`)
- Email (required)
- Password (required)
- "Forgot password?" link
- Redirects to main app or onboarding based on pet profile status

#### **Forgot Password** (`/account/forgot-password`) — REAL (2026-07-28)
- Email input → `POST /api/account/forgot-password`
- Always the same "if an account exists for that email, we've sent a link" response — deliberately
  uniform, so the endpoint can't be used to discover which addresses have accounts
- Mints a **single-use, 30-minute** token (migration `0069`, stored only as a sha256 hash) and emails
  a link to `/account/reset-password?token=…`
- Reachable from the sign-in page **and** from the mobile Welcome screen's "Forgot password?" link
  (`open({ mode: "forgot-password" })` — the auth modal maps `mode` straight onto `/account/<mode>`)
- Needs `EMAIL_API_KEY` to actually deliver mail; until it's set the flow degrades cleanly and the
  intended send is logged server-side

#### **Set a new password** (`/account/reset-password?token=…`)
- The target of the emailed link (opens in any browser — no deep link / associated domain needed)
- New password + confirm, with the same live strength meter as sign-up (the shared 2.32
  `passwordStrength` util, imported not duplicated)
- `POST /api/account/reset-password` → validates the token (unused + unexpired), argon2-hashes the
  password, burns the token **and** the account's other outstanding tokens + DB sessions
- Every rejection (unknown / used / expired) returns one identical message
- **Known limit:** sessions are JWT-based, so a JWT already issued to a signed-in device stays valid
  until it expires

#### **Logout** (`/account/logout`)
- Confirmation screen
- "Sign Out" button
- Redirects to welcome screen

---

## 🔐 Authentication Flow Details

### **Mobile WebView Flow**

Social Pet uses a **WebView-based authentication** system:

1. **User taps "Create account" or "Log in"**
   - `useAuth().signIn({ mode: "signup" })` or `useAuth().signIn({ mode: "signin" })`
   - Opens AuthModal with WebView

2. **WebView loads web auth page**
   - `/account/signup` or `/account/signin`
   - User enters credentials

3. **Authentication succeeds**
   - Web page receives session cookie
   - Redirects to `/auth/expo-web-success?next=/onboarding`

4. **Token exchange**
   - `/auth/expo-web-success` exchanges cookie for JWT
   - Sends JWT back to mobile app via postMessage (Expo web) or fetch (device)

5. **Mobile stores JWT**
   - Saved to AsyncStorage
   - User is now authenticated

6. **Redirect**
   - New users → `/onboarding`
   - Existing users → Checks pet profile status
     - Has pet profile → `/(tabs)` (main app)
     - No pet profile → `/onboarding`

### **Entry Point Logic** (`/apps/mobile/src/app/index.jsx`)

```javascript
// Wait for auth to be ready
if (!isReady || loading) {
  return <ActivityIndicator />;
}

// Not authenticated → Welcome screen
if (!auth) {
  return <Redirect href="/welcome" />;
}

// Authenticated but no pet profile → Onboarding
if (!hasCompletedOnboarding) {
  return <Redirect href="/onboarding" />;
}

// Authenticated with pet profile → Main app
return <Redirect href="/(tabs)" />;
```

---

## 🎨 Design System

### **Colors**
```javascript
{
  coral: "#FF6F61",      // Primary action buttons
  cream: "#FFF7EF",      // Background
  warmBrown: "#3B241B",  // Primary text
  mutedBrown: "#7A6254", // Secondary text
  sand: "#F8EBDD",       // Input backgrounds, secondary buttons
  peach: "#FFD9B3",      // Borders
}
```

### **Typography**
- **Headers:** 32-36px, 800 weight, warmBrown
- **Subheaders:** 18px, 500 weight, mutedBrown
- **Body:** 14-16px, 400 weight, mutedBrown
- **Buttons:** 17px, 800 weight, white

### **Components**
- **Buttons:** Rounded 18px, shadow with coral tint
- **Input fields:** Rounded 14px, sand background, peach border
- **Cards:** Rounded 20px, white background, subtle shadow

---

## ✅ Acceptance Criteria

- ✅ First-time users see Welcome screen
- ✅ Users can create an account
- ✅ Users can log in
- ✅ Users can recover password (real flow — token + email, see above)
- ✅ Vets & businesses access exists as placeholder
- ✅ New users continue to pet onboarding after account creation
- ✅ Existing users go to main app if they have a pet profile
- ✅ Existing users go to onboarding if they don't have a pet profile
- ✅ Keyboard doesn't disappear when typing in onboarding form

---

## 🚀 Future Enhancements

### **Vet & Business Portal**
- Dedicated login flow
- Clinic/shelter/business dashboards
- Patient/animal record management
- Integration with user pet profiles

### ~~**Password Reset**~~ — DONE (2026-07-28)
Built end to end: `POST /api/account/forgot-password` + `POST /api/account/reset-password`, the
`password_reset_tokens` table (migration `0069`), and a vendor-agnostic email seam
(`api/utils/email`, Resend by default) that degrades cleanly until `EMAIL_API_KEY` is set.

### **Social Login**
- Google OAuth integration
- Apple Sign In integration

### **User Profile Expansion**
- Multiple pets per user
- User profile settings
- Privacy controls
- Notification preferences

---

## 🐛 Troubleshooting

### **Keyboard disappears when typing**
**Fixed:** InputField component is now memoized with `React.memo` and individual `useCallback` handlers prevent unnecessary re-renders.

### **Authentication state not persisting**
**Check:** AsyncStorage for JWT token. Auth is loaded via `useAuth` hook which reads from AsyncStorage.

### **Pet onboarding shows even though I completed it**
**Check:** AsyncStorage key `has_completed_onboarding` should be set to `"true"`.

### **WebView shows blank page**
**Check:** Web auth pages are correctly deployed and accessible at `/account/signup` and `/account/signin`.

---

## 📝 Technical Notes

### **AsyncStorage Keys**
- `auth_token` - JWT authentication token
- `has_completed_onboarding` - `"true"` if user completed pet profile
- `pet_profile` - JSON string of pet profile data

### **Auth State Management**
- Managed by `useAuth` hook from `/apps/mobile/src/utils/auth/useAuth.js`
- Token automatically included in API requests
- Auth state available via `const { auth, isReady } = useAuth()`

### **Web Pages for Mobile**
- Mobile authentication uses WebView to show web pages
- This is expected behavior (not a bug)
- Works correctly on actual devices
- Expo web development shows iframe for better DX

---

## 🎉 Summary

Social Pet now has a complete, production-ready authentication flow:

1. ✅ **Welcome screen** for first-time users
2. ✅ **Email/password authentication** via WebView
3. ✅ **Password recovery** — real single-use token + emailed reset link
4. ✅ **Pet profile onboarding** after account creation
5. ✅ **Smart routing** based on auth + onboarding status
6. ✅ **Vet/business access placeholder** for future expansion
7. ✅ **Fixed keyboard issues** in onboarding form

The app is ready for users to sign up, create their pet's profile, and join the Social Pet community! 🐾
