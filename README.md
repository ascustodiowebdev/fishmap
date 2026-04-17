# Fishmap

Fishmap is a mobile-first Laravel web app for logging fishing catches and exploring fishing spots on a live map.

The goal of the project is to help anglers save useful fishing information in one place:

- where the fish was caught
- fish species and size
- bait used
- time of day
- notes and photo reference

The app is being built as a personal project first, with a strong focus on clean Git/GitHub workflow and portfolio quality.

## Current Status

Fishmap is currently in early development.

Working right now:

- authentication
- user dashboard
- catch logging
- OpenStreetMap / satellite map integration
- map-first dashboard layout
- clickable catch locations on the map

In progress:

- smoother map interactions
- better add-catch flow from the map
- improved current-location behavior

Planned next:

- direct photo uploads
- route recording on the water
- saved route history
- better mobile-first catch entry
- sharing and privacy improvements

## Stack

- Laravel 12
- React 19
- Inertia.js
- TypeScript
- Tailwind CSS 4
- Leaflet
- React Leaflet
- SQLite for local development
- Laravel Herd on Windows

## Features

### 1. Catch Logging

Users can save:

- species
- bait used
- fish length
- fish weight
- catch date and time
- notes
- optional photo URL
- visibility setting

### 2. Map-First Experience

The dashboard is centered around a live interactive map.

Current goals:

- center on the user location
- view existing catch spots
- select a catch spot directly from the map
- use a realistic satellite-style layer when a MapTiler API key is configured

## Local Development

### Requirements

- Windows 11
- Laravel Herd
- PHP 8.4+
- Composer
- Node.js
- npm

### Setup

Clone the repository and install dependencies:

```powershell
composer install
npm.cmd install
```

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Generate the application key:

```powershell
php artisan key:generate
```

Create the SQLite database file if needed:

```powershell
New-Item -ItemType File -Path .\database\database.sqlite -Force
```

Run migrations:

```powershell
php artisan migrate
```

Start the frontend:

```powershell
npm.cmd run dev
```

Then open the app through Herd:

- `https://fishmap.test`
- or `http://fishmap.test` depending on your local setup

## Environment Variables

Important local variables:

```env
APP_NAME=Fishmap
APP_URL=http://fishmap.test
VITE_MAPTILER_KEY=
```

Notes:

- `.env` is ignored by Git
- `.env.example` is safe to commit
- satellite / realistic map tiles require a MapTiler API key

## Map Notes

Fishmap uses Leaflet for mapping.

Important detail:

- OpenStreetMap does not provide native Google-style satellite imagery
- satellite view is provided through MapTiler when `VITE_MAPTILER_KEY` is configured

Without that key, the app falls back to the standard OpenStreetMap layer.

## Git Workflow

This project is being developed with small, meaningful checkpoints.

Example workflow:

```powershell
git status
git add .
git commit -m "Add feature"
git push
```

## Screenshots

Screenshots will be added as the UI matures.

Suggested future additions:

- landing page
- map dashboard
- add catch modal
- mobile view

## Roadmap

- Improve map performance and loading behavior
- Improve Windows and mobile geolocation accuracy handling
- Add direct photo upload support
- Add route tracking with GPS points
- Add saved trip views
- Add public/private/friends sharing flows
- Improve mobile interactions for anglers on the water

## Author

Built by [ascustodiowebdev](https://github.com/ascustodiowebdev) as a portfolio and personal product project.
