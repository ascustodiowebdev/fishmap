<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use App\Models\SatelliteUsage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class SatelliteUsageController extends Controller
{
    private const DEFAULT_FREE_SATELLITE_SECONDS = 10800;

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'seconds' => ['required', 'integer', 'min:1', 'max:300'],
        ]);

        $user = $request->user();
        $limit = AppSetting::getInt('free_satellite_seconds_monthly', self::DEFAULT_FREE_SATELLITE_SECONDS);

        if ($user->isPro()) {
            return back();
        }

        $usage = SatelliteUsage::query()->firstOrCreate(
            [
                'user_id' => $user->id,
                'month' => now('Europe/Lisbon')->startOfMonth()->toDateString(),
            ],
            ['seconds_used' => 0],
        );

        $secondsToAdd = min((int) $validated['seconds'], max(0, $limit - $usage->seconds_used));

        if ($secondsToAdd > 0) {
            $usage->increment('seconds_used', $secondsToAdd);
        }

        return back();
    }
}
