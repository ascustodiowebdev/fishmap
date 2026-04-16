<?php

namespace App\Http\Controllers;

use App\Models\CatchLog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class CatchLogController extends Controller
{
    public function index(): Response
    {
        $catchLogs = CatchLog::query()
            ->where('user_id', Auth::id())
            ->latest('caught_at')
            ->latest()
            ->get()
            ->map(fn (CatchLog $catchLog) => [
                'id' => $catchLog->id,
                'species' => $catchLog->species,
                'bait_used' => $catchLog->bait_used,
                'notes' => $catchLog->notes,
                'photo_url' => $catchLog->photo_url,
                'fish_length_cm' => $catchLog->fish_length_cm,
                'fish_weight_kg' => $catchLog->fish_weight_kg,
                'caught_at' => optional($catchLog->caught_at)?->toIso8601String(),
                'latitude' => $catchLog->latitude,
                'longitude' => $catchLog->longitude,
                'visibility' => $catchLog->visibility,
                'created_at' => $catchLog->created_at->toIso8601String(),
            ]);

        return Inertia::render('dashboard', [
            'catchLogs' => $catchLogs,
            'stats' => [
                'total_catches' => $catchLogs->count(),
                'public_spots' => $catchLogs->where('visibility', 'public')->count(),
                'latest_trip' => $catchLogs->first()['caught_at'] ?? null,
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'species' => ['required', 'string', 'max:120'],
            'bait_used' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'photo_url' => ['nullable', 'url', 'max:2048'],
            'fish_length_cm' => ['nullable', 'numeric', 'between:0,999.9'],
            'fish_weight_kg' => ['nullable', 'numeric', 'between:0,999.99'],
            'caught_at' => ['nullable', 'date'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'visibility' => ['required', 'in:private,friends,public'],
        ]);

        $request->user()->catchLogs()->create($validated);

        return redirect()
            ->route('dashboard')
            ->with('success', 'Catch saved to Fishmap.');
    }
}
