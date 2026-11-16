# Android app setup (Capacitor)

## One-time setup
1. Install Android Studio and its Android SDK.
2. Open CMD in `frontend`.
3. Run `npm install`.
4. Run `npm install @capacitor/android`.
5. Run `npx cap add android`.

## Connect the phone to the computer backend
- Put phone and computer on the same Wi-Fi.
- Find the computer IPv4 address with `ipconfig` (Wi-Fi adapter IPv4).
- Create `frontend/.env` from `.env.example` and set `VITE_API_BASE_URL=http://YOUR_PC_IP:5000` (example `http://192.168.1.10:5000`).
- Allow Python/Flask through Windows Firewall on private networks.
- Start Flask using the project backend command; it now listens on `0.0.0.0:5000`.

## Build and open Android
From `frontend` CMD:
```cmd
npm run android:sync
npx cap open android
```
In `android/app/src/main/AndroidManifest.xml`, add `android:usesCleartextTraffic="true"` to the `<application ...>` tag for this local HTTP demo (use HTTPS for production).

In Android Studio, select a device/emulator and press Run. For an APK: Build > Build APK(s).

## Important
The app requires the Flask backend and configured AI provider (Ollama or cloud API) to be running/reachable. Speech recognition support depends on Android/browser speech services and microphone permission. This project is a demo, not an emergency dispatch service.
