# PeopleCare AI v2.5 — Separate Web + Android

## Decision
- `frontend/` remains the existing web dashboard/admin app. Existing routes/features are retained.
- `android-app/` is a separate independent React/Vite/Capacitor citizen app (its own package, source and build).
- `app/` remains the shared Flask API + ML/RAG/agent backend.
- Both clients can call the same backend using `VITE_API_BASE_URL`.

## Android app starter features
Mobile-first home, citizen navigation, report/emergency/blood/women safety/night help entry points, My Reports/Profile placeholders, and PeopleCare AI chat API connection. Safety-critical dispatch/assistance matching must be connected to verified services before representing it as live.

## Build Android
```bash
cd android-app
npm install
npm run build
npm run android:add  # once
npm run android:sync
npm run android:open
```
Use Android Studio to build APK. Configure `VITE_API_BASE_URL` to the PC/server LAN or deployed backend URL (not localhost) before building for a phone.

## Web app
The original `frontend/` remains intact and is still the admin/web app. Continue running it as before.
