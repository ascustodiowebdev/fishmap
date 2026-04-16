<?php

namespace App\Http\Controllers;

use App\Models\CatchLog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class CatchLogController extends Controller
{
    public function index(): Response
    {
        $catchLogs = CatchLog::query()
            ->with('user:id,name')
            ->where(function ($query) {
                $query
                    ->where('user_id', Auth::id())
                    ->orWhere('visibility', 'public');
            })
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
                'owner_name' => $catchLog->user?->name,
                'is_owner' => $catchLog->user_id === Auth::id(),
                'created_at' => $catchLog->created_at->toIso8601String(),
            ]);

        $ownCatchLogs = $catchLogs->where('is_owner', true);

        return Inertia::render('dashboard', [
            'catchLogs' => $catchLogs,
            'stats' => [
                'total_catches' => $ownCatchLogs->count(),
                'public_spots' => $ownCatchLogs->where('visibility', 'public')->count(),
                'latest_trip' => $ownCatchLogs->first()['caught_at'] ?? null,
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateCatchLog($request);

        Log::info('Fishmap catch save request validated.', [
            'user_id' => $request->user()?->id,
            'species' => $validated['species'],
            'visibility' => $validated['visibility'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
        ]);

        $request->user()->catchLogs()->create($validated);

        return redirect()
            ->route('dashboard')
            ->with('success', __('messages.catch_saved'));
    }

    public function update(Request $request, CatchLog $catchLog): RedirectResponse
    {
        abort_unless($catchLog->user_id === Auth::id(), 403);

        $validated = $this->validateCatchLog($request);

        $catchLog->update($validated);

        return redirect()
            ->route('dashboard')
            ->with('success', __('messages.catch_updated'));
    }

    public function destroy(CatchLog $catchLog): RedirectResponse
    {
        abort_unless($catchLog->user_id === Auth::id(), 403);

        $catchLog->delete();

        return redirect()
            ->route('dashboard')
            ->with('success', __('messages.catch_deleted'));
    }

    /**
     * @return array<string, mixed>
     */
    protected function validateCatchLog(Request $request): array
    {
        return $request->validate([
            'species' => ['required', 'string', 'max:120'],
            'bait_used' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'photo_url' => ['nullable', 'url', 'max:2048'],
            'fish_length_cm' => ['nullable', 'numeric', 'between:0,999.9'],
            'fish_weight_kg' => ['nullable', 'numeric', 'between:0,999.99'],
            'caught_at' => ['nullable', 'date'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'visibility' => ['required', 'in:private,public'],
        ]);
    }
}
