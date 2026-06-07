<?php

namespace App\Http\Controllers;

use App\Models\CatchLog;
use App\Models\NavigationRoute;
use Inertia\Inertia;
use Inertia\Response;

class SharedResourceController extends Controller
{
    public function catchLog(string $token): Response
    {
        $catchLog = CatchLog::query()
            ->with('user:id,name')
            ->where('share_token', $token)
            ->firstOrFail();

        return Inertia::render('shared/resource', [
            'kind' => 'spot',
            'resource' => [
                'id' => $catchLog->id,
                'title' => $catchLog->species,
                'owner_name' => $catchLog->user?->name,
                'notes' => $catchLog->notes,
                'bait_used' => $catchLog->bait_used,
                'photo_url' => $catchLog->photo_url,
                'caught_at' => optional($catchLog->caught_at)?->toIso8601String(),
                'latitude' => (string) $catchLog->latitude,
                'longitude' => (string) $catchLog->longitude,
                'points' => [],
            ],
        ]);
    }

    public function navigationRoute(string $token): Response
    {
        $route = NavigationRoute::query()
            ->with('user:id,name', 'points:id,navigation_route_id,sequence,latitude,longitude,recorded_at')
            ->where('share_token', $token)
            ->firstOrFail();

        return Inertia::render('shared/resource', [
            'kind' => 'route',
            'resource' => [
                'id' => $route->id,
                'title' => $route->name,
                'owner_name' => $route->user?->name,
                'started_at' => optional($route->started_at)?->toIso8601String(),
                'ended_at' => optional($route->ended_at)?->toIso8601String(),
                'point_count' => $route->point_count,
                'latitude' => (string) $route->start_latitude,
                'longitude' => (string) $route->start_longitude,
                'points' => $route->points->map(fn ($point) => [
                    'sequence' => $point->sequence,
                    'latitude' => (string) $point->latitude,
                    'longitude' => (string) $point->longitude,
                    'recorded_at' => optional($point->recorded_at)?->toIso8601String(),
                ])->values(),
            ],
        ]);
    }
}
