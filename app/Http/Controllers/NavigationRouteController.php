<?php

namespace App\Http\Controllers;

use App\Models\NavigationRoute;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class NavigationRouteController extends Controller
{
    private const MAX_ROUTE_POINTS = 2000;

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateRouteMeta($request, true);

        $points = collect($validated['points'])->values();
        $firstPoint = $points->first();
        $lastPoint = $points->last();

        $route = $request->user()->navigationRoutes()->create([
            'name' => ($validated['name'] ?? null) ?: 'Route '.Carbon::parse($validated['started_at'])->format('d/m/Y H:i'),
            'visibility' => $validated['visibility'],
            'started_at' => $validated['started_at'],
            'ended_at' => $validated['ended_at'],
            'point_count' => $points->count(),
            'start_latitude' => $firstPoint['latitude'],
            'start_longitude' => $firstPoint['longitude'],
            'end_latitude' => $lastPoint['latitude'],
            'end_longitude' => $lastPoint['longitude'],
        ]);

        $route->points()->createMany(
            $points->map(fn (array $point, int $index) => [
                'sequence' => $index + 1,
                'latitude' => $point['latitude'],
                'longitude' => $point['longitude'],
                'recorded_at' => $point['recorded_at'],
            ])->all(),
        );

        return redirect()
            ->route('map')
            ->with('success', __('messages.route_saved'));
    }

    public function update(Request $request, NavigationRoute $navigationRoute): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user && ($navigationRoute->user_id === $user->id || (bool) $user->is_admin), 403);

        $validated = $this->validateRouteMeta($request, false);

        DB::transaction(function () use ($navigationRoute, $validated) {
            $updatePayload = [
                'name' => ($validated['name'] ?? null) ?: 'Route '.Carbon::parse($validated['started_at'])->format('d/m/Y H:i'),
                'visibility' => $validated['visibility'],
                'started_at' => $validated['started_at'],
                'ended_at' => $validated['ended_at'],
            ];

            if (isset($validated['points']) && is_array($validated['points'])) {
                $points = collect($validated['points'])->values();
                $firstPoint = $points->first();
                $lastPoint = $points->last();

                $updatePayload = array_merge($updatePayload, [
                    'point_count' => $points->count(),
                    'start_latitude' => $firstPoint['latitude'],
                    'start_longitude' => $firstPoint['longitude'],
                    'end_latitude' => $lastPoint['latitude'],
                    'end_longitude' => $lastPoint['longitude'],
                ]);

                $navigationRoute->points()->delete();
                $navigationRoute->points()->createMany(
                    $points->map(fn (array $point, int $index) => [
                        'sequence' => $index + 1,
                        'latitude' => $point['latitude'],
                        'longitude' => $point['longitude'],
                        'recorded_at' => $point['recorded_at'],
                    ])->all(),
                );
            }

            $navigationRoute->update($updatePayload);
        });

        return redirect()
            ->route('map')
            ->with('success', __('messages.route_updated'));
    }

    public function destroy(Request $request, NavigationRoute $navigationRoute): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user && ($navigationRoute->user_id === $user->id || (bool) $user->is_admin), 403);

        $navigationRoute->delete();

        return redirect()
            ->route('map')
            ->with('success', __('messages.route_deleted'));
    }

    /**
     * @return array<string, mixed>
     */
    protected function validateRouteMeta(Request $request, bool $includePoints): array
    {
        $rules = [
            'name' => ['nullable', 'string', 'max:160'],
            'visibility' => ['required', 'in:private,public'],
            'started_at' => ['required', 'date'],
            'ended_at' => ['required', 'date', 'after_or_equal:started_at'],
        ];

        if ($includePoints) {
            $rules = [
                ...$rules,
                'points' => ['required', 'array', 'min:2', 'max:'.self::MAX_ROUTE_POINTS],
                'points.*.latitude' => ['required', 'numeric', 'between:-90,90'],
                'points.*.longitude' => ['required', 'numeric', 'between:-180,180'],
                'points.*.recorded_at' => ['required', 'date'],
            ];
        } else {
            $rules = [
                ...$rules,
                'points' => ['sometimes', 'array', 'min:2', 'max:'.self::MAX_ROUTE_POINTS],
                'points.*.latitude' => ['required_with:points', 'numeric', 'between:-90,90'],
                'points.*.longitude' => ['required_with:points', 'numeric', 'between:-180,180'],
                'points.*.recorded_at' => ['required_with:points', 'date'],
            ];
        }

        return $request->validate($rules);
    }
}
