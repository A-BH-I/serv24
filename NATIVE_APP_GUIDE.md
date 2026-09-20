# Serv24 — Native App Deployment Guide (Android & iOS)

This guide walks you through building production-ready Android (.apk/.aab) and iOS (.ipa) apps from the Serv24 codebase using Capacitor + Android Studio + Xcode.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Build toolchain |
| npm | 9+ | Package manager |
| Android Studio | Hedgehog+ | Android builds |
| Xcode | 15+ (macOS only) | iOS builds |
| Java JDK | 17 | Android SDK requirement |
| CocoaPods | Latest | iOS dependency manager |

---

## Step 1: Deploy Backend First

Your PHP backend must be live before the app works:

1. Upload `backend/` folder to `public_html/api/` on your hPanel server
2. Visit `https://serv24.in/api/install.php` in your browser
3. Complete the 4-step installer (database, tables, admin account, done)
4. **Delete `install.php`** from server after setup
5. Verify API is working: visit `https://serv24.in/api/` — should return JSON

---

## Step 2: Export & Clone Project

```bash
# 1. Click "Export to GitHub" in Lovable editor
# 2. Clone your repo
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

---

## Step 3: Configure Environment

Create a `.env` file in the project root:

```env
VITE_API_BASE_URL=https://serv24.in/api
```

### Firebase Push Notifications (Optional but Recommended)

If you want push notifications:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_VAPID_KEY=your-vapid-key
```

---

## Step 4: Install Dependencies & Add Platforms

```bash
# Install all npm packages
npm install

# Add native platforms
npx cap add android
npx cap add ios
```

---

## Step 5: Build & Sync

```bash
# Build the web app
npm run build

# Sync web assets + plugins to native projects
npx cap sync
```

> **Run `npx cap sync` every time you make code changes!**

---

## Step 6: App Icon & Splash Screen Setup

### Android (Manual Setup in Android Studio)

#### App Icon
1. Open Android Studio → right-click `app/src/main/res` → **New → Image Asset**
2. Select **Launcher Icons (Adaptive and Legacy)**
3. Upload your 1024×1024 icon PNG
4. Click **Next → Finish** — generates all density variants automatically

#### Splash Screen
1. Place your splash logo in `android/app/src/main/res/drawable/splash_logo.png`
2. Edit `android/app/src/main/res/values/styles.xml`:

```xml
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="android:statusBarColor">#FFFFFF</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="AppTheme">
        <item name="android:windowBackground">@drawable/splash_screen</item>
    </style>
</resources>
```

3. Create `android/app/src/main/res/drawable/splash_screen.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/white" />
    <item
        android:gravity="center"
        android:width="200dp"
        android:height="200dp"
        android:drawable="@drawable/splash_logo" />
</layer-list>
```

### iOS (Xcode)

1. Open `ios/App/App.xcworkspace` in Xcode
2. Click **App → Assets.xcassets → AppIcon**
3. Drag your 1024×1024 icon — Xcode auto-generates all sizes
4. For splash: click **LaunchScreen.storyboard** → add your logo image

---

## Step 7: Android Configuration

### Open in Android Studio

```bash
npx cap open android
```

### Set App ID & Version

Edit `android/app/build.gradle`:

```groovy
android {
    namespace "in.serv24.app"
    defaultConfig {
        applicationId "in.serv24.app"
        minSdkVersion 23
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
    }
}
```

### Firebase Setup (for Push Notifications)

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. Add Android app with package name `in.serv24.app`
3. Download `google-services.json`
4. Place it in `android/app/google-services.json`
5. Verify `android/app/build.gradle` includes:

```groovy
apply plugin: 'com.google.gms.google-services'
```

6. Verify `android/build.gradle` (project-level) includes:

```groovy
classpath 'com.google.gms:google-services:4.4.0'
```

### Internet & Network Permissions

Verify `android/app/src/main/AndroidManifest.xml` has:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Generate Signed APK / AAB for Play Store

1. **Build → Generate Signed Bundle/APK**
2. Choose **Android App Bundle (.aab)** for Play Store
3. Create a new keystore or use existing:
   - **Key store path**: Create a `.jks` file (SAVE THIS SECURELY!)
   - **Key alias**: `serv24`
   - **Password**: Choose a strong password
4. Select **release** build variant
5. Click **Finish**
6. Output: `android/app/build/outputs/bundle/release/app-release.aab`

> ⚠️ **CRITICAL**: Back up your keystore file and passwords! You need the SAME keystore for all future updates.

### Test APK (for direct install / testing)

1. **Build → Build Bundle/APK → Build APK**
2. Output: `android/app/build/outputs/apk/release/app-release.apk`
3. Transfer to device and install (enable "Install from unknown sources")

---

## Step 8: iOS Configuration

### Open in Xcode

```bash
npx cap open ios
```

### Prerequisites

```bash
# Install CocoaPods if not already installed
sudo gem install cocoapods

# Install iOS dependencies
cd ios/App && pod install && cd ../..
```

### Configure Signing

1. Open `ios/App/App.xcworkspace` in Xcode
2. Click the **App** project in the navigator
3. Go to **Signing & Capabilities** tab
4. Select your **Team** (Apple Developer account)
5. Set **Bundle Identifier**: `in.serv24.app`
6. Xcode will auto-generate provisioning profiles

### Set Version

In Xcode → App target → **General** tab:
- **Display Name**: `Serv24`
- **Bundle Identifier**: `in.serv24.app`
- **Version**: `1.0.0`
- **Build**: `1`

### Firebase Setup (for Push Notifications)

1. In Firebase Console → Add iOS app with bundle ID `in.serv24.app`
2. Download `GoogleService-Info.plist`
3. Drag it into `ios/App/App/` folder in Xcode (check "Copy items if needed")
4. In Xcode → **Signing & Capabilities** → click **+ Capability**:
   - Add **Push Notifications**
   - Add **Background Modes** → check **Remote notifications**

### Build for App Store

1. Select **Any iOS Device (arm64)** as the build target
2. **Product → Archive**
3. After archiving, the **Organizer** window opens
4. Click **Distribute App**
5. Choose **App Store Connect** → follow the wizard
6. Upload to App Store Connect

### Test on Device

1. Connect your iPhone via USB
2. Select your device as the build target
3. Click **Run** (▶) — app installs and launches on device

---

## Step 9: Production Checklist

### Before Publishing

- [ ] Backend deployed and `install.php` deleted
- [ ] `.env` file has correct `VITE_API_BASE_URL=https://serv24.in/api`
- [ ] `npm run build && npx cap sync` completed successfully
- [ ] App icon set (1024×1024 source) in both platforms
- [ ] Splash screen configured with Serv24 branding
- [ ] Firebase configured (if using push notifications)
  - [ ] `google-services.json` in `android/app/`
  - [ ] `GoogleService-Info.plist` in `ios/App/App/`
- [ ] Tested on real Android device
- [ ] Tested on real iOS device
- [ ] All API endpoints working (login, register, bookings, etc.)
- [ ] Push notifications working on both platforms
- [ ] Back button works correctly on Android (double-tap to exit)
- [ ] No internet banner appears when offline
- [ ] Deep links / navigation works properly

### App Store Listing Requirements

#### Google Play Store
- **App title**: Serv24 — Home Services at Your Doorstep
- **Short description** (80 chars): Book trusted home service pros — plumbers, electricians, cleaners & more
- **Full description**: (Use your landing page content)
- **Screenshots**: At least 2 phone screenshots (1080×1920 recommended)
- **Feature graphic**: 1024×500 PNG
- **Privacy policy URL**: `https://serv24.in/register` (links to privacy policy)
- **Category**: House & Home
- **Content rating**: Complete the questionnaire (Everyone)
- **Target audience**: 18+

#### Apple App Store
- **App name**: Serv24
- **Subtitle**: Home Services at Your Doorstep
- **Screenshots**: 6.7" (1290×2796) and 6.5" (1284×2778) required
- **Description**: (Use your landing page content)
- **Keywords**: home services, plumber, electrician, cleaner, booking, handyman
- **Privacy policy URL**: `https://serv24.in/register`
- **Category**: Lifestyle
- **Age rating**: 4+

---

## Step 10: Updating the App

When you make changes in Lovable:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Build the web app
npm run build

# 4. Sync to native platforms
npx cap sync

# 5. Open in IDE and rebuild
npx cap open android   # or: npx cap open ios
```

Then generate a new signed APK/AAB or archive for the store.

**Remember to increment `versionCode` and `versionName` in `build.gradle` (Android) or Version/Build in Xcode (iOS) for each store update.**

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| White screen on app launch | Run `npm run build && npx cap sync` — web assets not synced |
| API calls failing | Check `.env` has correct `VITE_API_BASE_URL`; ensure `cleartext: true` in capacitor.config.ts for HTTP |
| Push notifications not working | Verify Firebase config files are in correct locations |
| Back button closes app immediately | The app handles double-tap-to-exit automatically |
| Splash screen won't hide | The app auto-hides splash after 2 seconds |
| iOS build fails with signing error | Check Apple Developer team is selected in Xcode |
| Android build fails | Ensure JDK 17 is installed; check `JAVA_HOME` path |
| Offline banner not showing | `@capacitor/network` plugin needs `npx cap sync` after install |
| Google Sign-In not working | Ensure Google OAuth Client ID is set in admin panel → Settings → Integrations |

---

## Native App Features Included

| Feature | Description |
|---------|-------------|
| **Splash Screen** | White branded splash on launch, auto-hides after 2s |
| **Status Bar** | Light style with white background |
| **Back Button (Android)** | Navigates back in history; double-tap on root exits app |
| **No Internet Detection** | Red banner appears when offline, auto-dismisses on reconnect |
| **Push Notifications** | Firebase Cloud Messaging for both platforms |
| **Bottom Navigation** | Native-feel tab bar for clients and providers |
| **Pull to Refresh** | Swipe down to refresh content on any page |
| **Haptic Feedback** | Available via `@capacitor/haptics` plugin |

---

## File Structure Reference

```
project-root/
├── android/                    # Android Studio project (after cap add)
│   └── app/
│       ├── google-services.json    # Firebase config (you add this)
│       ├── build.gradle            # App-level gradle config
│       └── src/main/
│           ├── AndroidManifest.xml
│           └── res/
│               └── drawable/       # Splash screen resources
├── ios/                        # Xcode project (after cap add)
│   └── App/
│       ├── App.xcworkspace         # Open this in Xcode
│       ├── App/
│       │   └── GoogleService-Info.plist  # Firebase config (you add this)
│       └── Podfile
├── capacitor.config.ts         # Capacitor configuration
├── .env                        # API URL + Firebase keys (you create this)
├── dist/                       # Built web assets (after npm run build)
└── src/
    └── lib/
        ├── native-app.ts       # Back button, splash, network detection
        └── push-notifications.ts # FCM + native push
```

---

**Need help?** Contact support@serv24.in
