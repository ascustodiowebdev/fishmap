# TidePilot

TidePilot is a mobile-first navigation and fishing logbook.

It helps anglers keep practical trip records in one place:
- fish spots with species, size, weight, bait, date/time, and privacy
- route recording on the map
- real-time GPS guidance to return to a saved route line

The goal is simple: keep a usable onboard diary and reduce navigation risk around familiar and unfamiliar water.

## Core Features

- Email/password auth and Google login
- Fish spot logging (public/private)
- Route recording and route management
- Real-time route guidance with GPS
- EN/PT interface
- Admin moderation panel (pins, routes, users)
- Maintenance mode and registration controls

## Stack

- Laravel 12
- Inertia.js
- React + TypeScript
- Vite
- Tailwind CSS
- Leaflet + React Leaflet (OpenStreetMap/OpenSeaMap)
- SQLite (development)
- Capacitor (Android) + Geolocation plugin

## Local Development

```powershell
composer install
npm.cmd install
Copy-Item .env.example .env
php artisan key:generate
New-Item -ItemType File -Path .\database\database.sqlite -Force
php artisan migrate
npm.cmd run dev
```

Run backend:

```powershell
php artisan serve --host=127.0.0.1 --port=8000
```

Optional external HTTPS testing:

```powershell
ngrok http 127.0.0.1:8000
```

## Android Build (Debug APK)

```powershell
npm.cmd run build
npx.cmd cap sync android
cd android
.\gradlew.bat assembleDebug
adb -s <DEVICE_SERIAL> install -r app\build\outputs\apk\debug\app-debug.apk
```
