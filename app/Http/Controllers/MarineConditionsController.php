<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class MarineConditionsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $latitude = round((float) $validated['latitude'], 3);
        $longitude = round((float) $validated['longitude'], 3);
        $timezone = 'Europe/Lisbon';
        $cacheKey = sprintf('marine-conditions:%s:%s', $latitude, $longitude);

        $payload = Cache::remember($cacheKey, now()->addMinutes(10), function () use ($latitude, $longitude, $timezone) {
            return $this->fetchMarineConditions($latitude, $longitude, $timezone);
        });

        return response()->json($payload);
    }

    /**
     * @return array<string, mixed>
     */
    protected function fetchMarineConditions(float $latitude, float $longitude, string $timezone): array
    {
        $wind = [
            'speed_kmh' => null,
            'gust_kmh' => null,
            'direction_deg' => null,
        ];
        $tide = [
            'state' => null,
            'next_high_at' => null,
            'next_low_at' => null,
            'next_high_m' => null,
            'next_low_m' => null,
            'coefficient' => null,
            'level_msl_m' => null,
        ];

        try {
            $windResponse = Http::timeout(8)->get('https://api.open-meteo.com/v1/forecast', [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'current' => 'wind_speed_10m,wind_gusts_10m,wind_direction_10m',
                'timezone' => $timezone,
                'wind_speed_unit' => 'kmh',
            ]);

            if ($windResponse->ok()) {
                $current = (array) $windResponse->json('current');
                $wind['speed_kmh'] = $this->toNullableFloat($current['wind_speed_10m'] ?? null);
                $wind['gust_kmh'] = $this->toNullableFloat($current['wind_gusts_10m'] ?? null);
                $wind['direction_deg'] = $this->toNullableFloat($current['wind_direction_10m'] ?? null);
            }
        } catch (Throwable) {
            // Keep null values; frontend handles unavailable conditions gracefully.
        }

        try {
            $tideResponse = Http::timeout(10)->get('https://marine-api.open-meteo.com/v1/marine', [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'hourly' => 'sea_level_height_msl',
                'current' => 'sea_level_height_msl',
                'timezone' => $timezone,
                'forecast_days' => 3,
            ]);

            if ($tideResponse->ok()) {
                $hourlyTimes = $tideResponse->json('hourly.time') ?? [];
                $hourlyLevels = $tideResponse->json('hourly.sea_level_height_msl') ?? [];
                $now = CarbonImmutable::now($timezone);
                $extremes = $this->findTideExtremes($hourlyTimes, $hourlyLevels, $now);

                $tide['next_high_at'] = $extremes['next_high_at'];
                $tide['next_low_at'] = $extremes['next_low_at'];
                $tide['next_high_m'] = $extremes['next_high_m'];
                $tide['next_low_m'] = $extremes['next_low_m'];
                $tide['coefficient'] = $extremes['coefficient'];
                $tide['state'] = $extremes['state'];
                $tide['level_msl_m'] = $this->toNullableFloat($tideResponse->json('current.sea_level_height_msl'));
            }
        } catch (Throwable) {
            // Keep null values; frontend handles unavailable conditions gracefully.
        }

        return [
            'source' => 'open-meteo',
            'fetched_at' => now($timezone)->toIso8601String(),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'wind' => $wind,
            'tide' => $tide,
        ];
    }

    /**
     * @param  mixed  $value
     */
    protected function toNullableFloat($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $floatValue = (float) $value;

        return is_finite($floatValue) ? $floatValue : null;
    }

    /**
     * @param  array<int, string>  $times
     * @param  array<int, mixed>  $levels
     * @return array<string, mixed>
     */
    protected function findTideExtremes(array $times, array $levels, CarbonImmutable $now): array
    {
        $series = [];

        foreach ($times as $index => $time) {
            $level = $this->toNullableFloat($levels[$index] ?? null);
            if ($level === null) {
                continue;
            }

            try {
                $moment = CarbonImmutable::parse($time, $now->timezone);
            } catch (Throwable) {
                continue;
            }

            $series[] = [
                'time' => $moment,
                'level' => $level,
            ];
        }

        if (count($series) < 4) {
            return [
                'state' => null,
                'next_high_at' => null,
                'next_low_at' => null,
                'next_high_m' => null,
                'next_low_m' => null,
                'coefficient' => null,
            ];
        }

        $extremes = [];
        for ($i = 1; $i < count($series) - 1; $i++) {
            $previous = $series[$i - 1]['level'];
            $current = $series[$i]['level'];
            $next = $series[$i + 1]['level'];

            if ($current >= $previous && $current >= $next) {
                $extremes[] = ['type' => 'high', 'time' => $series[$i]['time'], 'level' => $current];
            } elseif ($current <= $previous && $current <= $next) {
                $extremes[] = ['type' => 'low', 'time' => $series[$i]['time'], 'level' => $current];
            }
        }

        $nextHigh = null;
        $nextLow = null;
        foreach ($extremes as $extreme) {
            if ($extreme['time']->lessThan($now)) {
                continue;
            }

            if ($extreme['type'] === 'high' && $nextHigh === null) {
                $nextHigh = $extreme;
            }

            if ($extreme['type'] === 'low' && $nextLow === null) {
                $nextLow = $extreme;
            }

            if ($nextHigh !== null && $nextLow !== null) {
                break;
            }
        }

        $windowEnd = $now->addHours(24);
        $windowLevels = array_values(array_map(
            fn (array $item): float => $item['level'],
            array_filter($series, fn (array $item): bool => $item['time']->greaterThanOrEqualTo($now) && $item['time']->lessThanOrEqualTo($windowEnd))
        ));

        $coefficient = null;
        if (count($windowLevels) > 1) {
            $range = max($windowLevels) - min($windowLevels);
            // Heuristic normalization to a familiar 20-120 tide coefficient scale.
            $normalized = (int) round(($range / 4.0) * 100);
            $coefficient = max(20, min(120, $normalized));
        }

        $futureLevels = array_values(array_filter($series, fn (array $item): bool => $item['time']->greaterThanOrEqualTo($now)));
        $state = null;
        if (count($futureLevels) >= 2) {
            $delta = $futureLevels[1]['level'] - $futureLevels[0]['level'];
            $state = $delta > 0.005 ? 'rising' : ($delta < -0.005 ? 'falling' : 'slack');
        }

        return [
            'state' => $state,
            'next_high_at' => $nextHigh ? $nextHigh['time']->toIso8601String() : null,
            'next_low_at' => $nextLow ? $nextLow['time']->toIso8601String() : null,
            'next_high_m' => $nextHigh['level'] ?? null,
            'next_low_m' => $nextLow['level'] ?? null,
            'coefficient' => $coefficient,
        ];
    }
}

