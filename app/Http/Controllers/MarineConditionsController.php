<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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
            'provider' => 'open-meteo',
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
            $officialTide = $this->fetchOfficialTide($latitude, $longitude, $timezone);
            if ($officialTide !== null) {
                $tide = array_merge($tide, $officialTide);
            }
        } catch (Throwable) {
            // Fall back to model-based tide values below.
        }

        // Intentionally do not fill tide from model fallback to avoid presenting non-official
        // values as if they were local tide-table values for Portugal.

        $hasOfficialSource = in_array($tide['provider'] ?? null, ['tabuademares', 'tides4fishing'], true);

        return [
            'source' => $hasOfficialSource ? 'official' : 'unavailable',
            'fetched_at' => now($timezone)->toIso8601String(),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'wind' => $wind,
            'tide' => $tide,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function fetchOfficialTide(float $latitude, float $longitude, string $timezone): ?array
    {
        return $this->fetchTides4FishingTide($latitude, $longitude, $timezone)
            ?? $this->fetchTabuaDeMaresTide($latitude, $longitude, $timezone);
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function fetchTides4FishingTide(float $latitude, float $longitude, string $timezone): ?array
    {
        $slug = $this->resolveTabuaSlug($latitude, $longitude);
        $html = $this->fetchRemoteHtml(sprintf('https://tides4fishing.com/pt/%s', $slug));
        if ($html === '') {
            return null;
        }
        $normalized = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $normalized = preg_replace('/\s+/u', ' ', $normalized ?? '') ?? '';

        $now = CarbonImmutable::now($timezone);
        $events = $this->extractTides4FishingTableEvents($html, $timezone);
        $selection = $this->selectUpcomingTideEvents($events, $now);

        $nextHigh = $selection['next_high'];
        $nextLow = $selection['next_low'];
        $nextEvent = $selection['next_event'];

        if ($nextHigh === null || $nextLow === null) {
            $normalized = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $normalized = preg_replace('/\s+/u', ' ', $normalized ?? '') ?? '';
            $fallbackEvents = $this->extractTides4FishingSummaryEvents($normalized, $now);
            if ($nextHigh === null) {
                $nextHigh = $fallbackEvents['next_high'];
            }
            if ($nextLow === null) {
                $nextLow = $fallbackEvents['next_low'];
            }
            $selection = $this->selectUpcomingTideEvents(array_filter([$nextHigh, $nextLow]), $now);
            $nextEvent = $selection['next_event'];
        }

        if ($nextHigh === null && $nextLow === null) {
            return null;
        }

        preg_match('/txt_coeficiente_valor[^0-9]{0,40}([0-9]{1,3})/iu', $html, $coefClassMatch);
        preg_match('/coeficiente[^0-9]{0,40}([0-9]{1,3})/iu', $normalized, $coefTextMatch);
        $coefficient = isset($coefClassMatch[1])
            ? (int) $coefClassMatch[1]
            : (isset($coefTextMatch[1]) ? (int) $coefTextMatch[1] : null);

        return [
            'state' => $selection['state'],
            'next_event_type' => $nextEvent['type'] ?? null,
            'next_event_at' => $nextEvent ? $nextEvent['at']->toIso8601String() : null,
            'next_event_m' => $nextEvent['height'] ?? null,
            'next_high_at' => $nextHigh ? $nextHigh['at']->toIso8601String() : null,
            'next_low_at' => $nextLow ? $nextLow['at']->toIso8601String() : null,
            'next_high_m' => $nextHigh['height'] ?? null,
            'next_low_m' => $nextLow['height'] ?? null,
            'coefficient' => $coefficient,
            'provider' => 'tides4fishing',
        ];
    }

    /**
     * @return array<int, array{type:string,height:?float,at:CarbonImmutable}>
     */
    protected function extractTides4FishingTableEvents(string $html, string $timezone): array
    {
        $events = [];
        if (! preg_match_all('/onclick="Day\\(\'([0-9]{4}-[0-9]{2}-[0-9]{2})\'\\);"/u', $html, $dayMatches, PREG_OFFSET_CAPTURE)) {
            return $events;
        }

        $seen = [];
        $matchCount = count($dayMatches[0]);
        for ($i = 0; $i < $matchCount; $i++) {
            $date = (string) $dayMatches[1][$i][0];
            $offset = (int) $dayMatches[0][$i][1];
            $chunk = substr($html, $offset, 4500);
            if (! is_string($chunk) || $chunk === '') {
                continue;
            }

            if (! preg_match_all('/tabla_mareas_marea_hora([^"]*)"[^>]*>\\s*([0-9]{1,2}:[0-9]{2}).*?tabla_mareas_marea_altura_numero">\\s*([0-9]+[.,][0-9]+)/su', $chunk, $eventMatches, PREG_SET_ORDER)) {
                continue;
            }

            foreach (array_slice($eventMatches, 0, 4) as $match) {
                $time = (string) ($match[2] ?? '');
                $height = $this->toNullableFloat(str_replace(',', '.', (string) ($match[3] ?? '')));
                if ($time === '' || $height === null) {
                    continue;
                }
                [$hours, $minutes] = array_map('intval', explode(':', $time));
                try {
                    $at = CarbonImmutable::parse($date, $timezone)->setTime($hours, $minutes);
                } catch (Throwable) {
                    continue;
                }

                $hourClass = (string) ($match[1] ?? '');
                $type = str_contains($hourClass, 'bajamar') ? 'low' : 'high';
                $eventKey = $at->toIso8601String().'|'.$type;
                if (isset($seen[$eventKey])) {
                    continue;
                }
                $seen[$eventKey] = true;
                $events[] = ['type' => $type, 'height' => $height, 'at' => $at];
            }
        }

        usort($events, fn (array $a, array $b): int => $a['at']->lessThan($b['at']) ? -1 : 1);

        return $events;
    }

    /**
     * @return array{next_high:?array{type:string,height:?float,at:CarbonImmutable},next_low:?array{type:string,height:?float,at:CarbonImmutable}}
     */
    protected function extractTides4FishingSummaryEvents(string $normalized, CarbonImmutable $now): array
    {
        if ($normalized === '') {
            return ['next_high' => null, 'next_low' => null];
        }

        preg_match('/first high tide (?:was|will be) at (\d{1,2}:\d{2}).*?next high tide (?:at|will be at) (\d{1,2}:\d{2})/iu', $normalized, $highMatch);
        preg_match('/first low tide (?:was|will be) at (\d{1,2}:\d{2}).*?next low tide (?:at|will be at) (\d{1,2}:\d{2})/iu', $normalized, $lowMatch);
        preg_match('/heights today are ([0-9]+[.,][0-9]+)\s*m,\s*([0-9]+[.,][0-9]+)\s*m,\s*([0-9]+[.,][0-9]+)\s*m\s*(?:and|e)\s*([0-9]+[.,][0-9]+)\s*m/iu', $normalized, $heightMatch);

        if (! isset($highMatch[1], $highMatch[2], $lowMatch[1], $lowMatch[2])) {
            return ['next_high' => null, 'next_low' => null];
        }

        $h1 = $this->toNullableFloat(str_replace(',', '.', (string) ($heightMatch[1] ?? '')));
        $l1 = $this->toNullableFloat(str_replace(',', '.', (string) ($heightMatch[2] ?? '')));
        $h2 = $this->toNullableFloat(str_replace(',', '.', (string) ($heightMatch[3] ?? '')));
        $l2 = $this->toNullableFloat(str_replace(',', '.', (string) ($heightMatch[4] ?? '')));
        $today = $now->startOfDay();
        $events = [];
        foreach ([
            ['type' => 'high', 'time' => (string) $highMatch[1], 'height' => $h1],
            ['type' => 'low', 'time' => (string) $lowMatch[1], 'height' => $l1],
            ['type' => 'high', 'time' => (string) $highMatch[2], 'height' => $h2],
            ['type' => 'low', 'time' => (string) $lowMatch[2], 'height' => $l2],
        ] as $event) {
            [$hours, $minutes] = array_map('intval', explode(':', $event['time']));
            $events[] = [
                'type' => $event['type'],
                'height' => $event['height'],
                'at' => $today->setTime($hours, $minutes),
            ];
        }

        usort($events, fn (array $a, array $b): int => $a['at']->lessThan($b['at']) ? -1 : 1);
        $nextHigh = null;
        $nextLow = null;
        foreach ($events as $event) {
            if ($event['at']->lessThan($now)) {
                continue;
            }
            if ($event['type'] === 'high' && $nextHigh === null) {
                $nextHigh = $event;
            }
            if ($event['type'] === 'low' && $nextLow === null) {
                $nextLow = $event;
            }
        }

        return ['next_high' => $nextHigh, 'next_low' => $nextLow];
    }

    /**
     * @param  array<int, array{type:string,height:?float,at:CarbonImmutable}>  $events
     * @return array{next_high:?array{type:string,height:?float,at:CarbonImmutable},next_low:?array{type:string,height:?float,at:CarbonImmutable},next_event:?array{type:string,height:?float,at:CarbonImmutable},state:?string}
     */
    protected function selectUpcomingTideEvents(array $events, CarbonImmutable $now): array
    {
        $events = array_values(array_filter($events, fn (array $event): bool => isset($event['type'], $event['at']) && $event['at'] instanceof CarbonImmutable));
        usort($events, fn (array $a, array $b): int => $a['at']->lessThan($b['at']) ? -1 : 1);

        $nextHigh = null;
        $nextLow = null;
        $nextEvent = null;

        foreach ($events as $event) {
            if ($event['at']->lessThan($now)) {
                continue;
            }

            $nextEvent ??= $event;

            if ($event['type'] === 'high' && $nextHigh === null) {
                $nextHigh = $event;
            }

            if ($event['type'] === 'low' && $nextLow === null) {
                $nextLow = $event;
            }
        }

        $state = match ($nextEvent['type'] ?? null) {
            'high' => 'rising',
            'low' => 'falling',
            default => null,
        };

        return [
            'next_high' => $nextHigh,
            'next_low' => $nextLow,
            'next_event' => $nextEvent,
            'state' => $state,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function fetchTabuaDeMaresTide(float $latitude, float $longitude, string $timezone): ?array
    {
        $slug = $this->resolveTabuaSlug($latitude, $longitude);
        $html = $this->fetchRemoteHtml(sprintf('https://tabuademares.com/pt/%s', $slug));
        if ($html === '') {
            return null;
        }

        preg_match_all('/(\d{1,2}:\d{2})\s*<\/[^>]*>\s*<[^>]*>\s*([0-9]+,[0-9])\s*m/ui', $html, $matches, PREG_SET_ORDER);
        if (count($matches) < 2) {
            return null;
        }

        $events = [];
        foreach ($matches as $match) {
            $time = trim((string) Arr::get($match, 1, ''));
            $heightRaw = str_replace(',', '.', (string) Arr::get($match, 2, ''));
            $height = $this->toNullableFloat($heightRaw);
            if ($time === '' || $height === null) {
                continue;
            }

            $events[] = [
                'time' => $time,
                'height' => $height,
            ];
        }

        if (count($events) < 2) {
            return null;
        }

        $today = CarbonImmutable::now($timezone)->startOfDay();
        $now = CarbonImmutable::now($timezone);

        $heightCutoff = $this->lowTideHeightCutoff($events);

        $normalized = array_map(function (array $event) use ($today, $heightCutoff): array {
            [$hours, $minutes] = array_map('intval', explode(':', (string) $event['time']));
            return [
                'type' => $heightCutoff !== null && $event['height'] <= $heightCutoff ? 'low' : 'high',
                'height' => $event['height'],
                'at' => $today->setTime($hours, $minutes),
            ];
        }, $events);

        $selection = $this->selectUpcomingTideEvents($normalized, $now);
        $nextHigh = $selection['next_high'];
        $nextLow = $selection['next_low'];
        $nextEvent = $selection['next_event'];

        preg_match('/coeficiente[^0-9]{0,40}([0-9]{1,3})/ui', $html, $coefMatch);
        $coefficient = isset($coefMatch[1]) ? (int) $coefMatch[1] : null;

        return [
            'state' => $selection['state'],
            'next_event_type' => $nextEvent['type'] ?? null,
            'next_event_at' => $nextEvent ? $nextEvent['at']->toIso8601String() : null,
            'next_event_m' => $nextEvent['height'] ?? null,
            'next_high_at' => $nextHigh ? $nextHigh['at']->toIso8601String() : null,
            'next_low_at' => $nextLow ? $nextLow['at']->toIso8601String() : null,
            'next_high_m' => $nextHigh['height'] ?? null,
            'next_low_m' => $nextLow['height'] ?? null,
            'coefficient' => $coefficient,
            'provider' => 'tabuademares',
        ];
    }

    /**
     * @param  array<int, array{height:float}>  $events
     */
    protected function lowTideHeightCutoff(array $events): ?float
    {
        $heights = array_values(array_filter(array_map(fn (array $event): ?float => $this->toNullableFloat($event['height'] ?? null), $events), fn (?float $height): bool => $height !== null));

        if (count($heights) < 2) {
            return null;
        }

        sort($heights, SORT_NUMERIC);
        $lowCount = max(1, (int) floor(count($heights) / 2));

        return $heights[$lowCount - 1] ?? null;
    }

    protected function resolveTabuaSlug(float $latitude, float $longitude): string
    {
        // Faro/Olhao area first (primary Fishmap usage); fallback keeps working for Portugal.
        if ($latitude >= 36.7 && $latitude <= 37.5 && $longitude >= -8.4 && $longitude <= -7.6) {
            return 'faro/faro';
        }

        return 'faro/faro';
    }

    protected function fetchRemoteHtml(string $url): string
    {
        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Fishmap/1.0',
                    'Accept-Language' => 'en-US,en;q=0.9,pt-PT;q=0.8',
                ])
                ->get($url);

            if ($response->ok()) {
                return (string) $response->body();
            }
        } catch (Throwable) {
            // Fallback below.
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 10,
                'header' => implode("\r\n", [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Fishmap/1.0',
                    'Accept-Language: en-US,en;q=0.9,pt-PT;q=0.8',
                ]),
            ],
        ]);

        $body = @file_get_contents($url, false, $context);

        return is_string($body) ? $body : '';
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
