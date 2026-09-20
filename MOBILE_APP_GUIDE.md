# Mobile App Deployment Guide — Android & iOS

## Prerequisites

- Node.js 18+ installed
- npm or bun installed
- **Android**: Android Studio with SDK 33+
- **iOS**: macOS with Xcode 15+

---

## Step 1: Deploy Backend First

Before building mobile apps, your backend must be live:

1. Upload `backend/` folder to `public_html/api/` on your hPanel server
2. Visit **`https://yourdomain.com/api/install.php`** in your browser
3. Follow the 4-step installer:
   - **Step 1**: Enter MySQL credentials → creates database
   - **Step 2**: Auto-creates all tables, indexes & demo data
   - **Step 3**: Set admin email/password → auto-generates `database.php`, `jwt.php`, and upload directories
   - **Step 4**: Done! Delete `install.php` from server
4. **No manual SQL import needed — the installer does everything**

---

## Step 2: Export & Clone

1. Click **"Export to GitHub"** in Lovable
2. Clone the repo: `git clone <your-repo-url>`
3. `cd <project-folder>`

## Step 3: Set Backend API URL

Create a `.env` file:
```
VITE_API_BASE_URL=https://your-domain.com/api
```

## Step 4: Firebase Push Notifications (Optional)

1. Create a Firebase project at https://console.firebase.google.com
2. Add `.env` variables:
```
VITE_FIREBASE_API_KEY=your-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456
VITE_FIREBASE_APP_ID=1:123456:web:abc
VITE_FIREBASE_VAPID_KEY=your-vapid-key
```
3. For Android: Download `google-services.json` from Firebase Console → place in `android/app/`
4. For iOS: Download `GoogleService-Info.plist` → place in `ios/App/App/`

## Step 5: Install Dependencies & Add Platforms

```bash
npm install

# Add native platforms
npx cap add android
npx cap add ios
```

## Step 6: Configure for Production

Edit `capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'com.yourdomain.handyhomes',
  appName: 'HandyHomes',
  webDir: 'dist',
  // REMOVE the server.url line for production builds
  // server: { url: '...' }  ← DELETE THIS
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};
```

> **Important**: For production APK/IPA, remove `server.url` so the app uses bundled files.

## Step 7: Build & Sync

```bash
npm run build
npx cap sync
```

## Step 8: Run on Device/Emulator

### Android
```bash
npx cap run android
# OR open in Android Studio:
npx cap open android
```

In Android Studio:
- Select device/emulator → Click **Run** (▶)
- To generate APK: **Build → Build Bundle/APK → Build APK**
- Signed APK for Play Store: **Build → Generate Signed Bundle/APK**

### iOS
```bash
npx cap run ios
# OR open in Xcode:
npx cap open ios
```

In Xcode:
- Select your team in **Signing & Capabilities**
- Add **Push Notifications** capability
- Select device → Click **Run** (▶)
- To archive for App Store: **Product → Archive**

---

## Checklist Before Publishing

- [ ] Backend deployed and `install.php` run successfully
- [ ] `install.php` **deleted** from server after setup
- [ ] Backend API URL configured in `.env`
- [ ] `capacitor.config.ts` — `server.url` removed for production
- [ ] Firebase config set (if using push notifications)
- [ ] `npm run build && npx cap sync` completed
- [ ] App icon & splash screen customized
- [ ] Tested on real device
