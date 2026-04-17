<?php

namespace App\Http\Controllers;

use App\Models\NavigationRoute;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class NavigationRouteController extends Controller
{
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
            ->route('dashboard')
            ->with('success', __('messages.route_saved'));
    }

    public function update(Request $request, NavigationRoute $navigationRoute): RedirectResponse
    {
        abort_unless($navigationRoute->user_id === $request->user()?->id, 403);

        $validated = $this->validateRouteMeta($request, false);

        $navigationRoute->update([
            'name' => ($validated['name'] ?? null) ?: 'Route '.Carbon::parse($validated['started_at'])->format('d/m/Y H:i'),
            'visibility' => $validated['visibility'],
            'started_at' => $validated['started_at'],
            'ended_at' => $validated['ended_at'],
        ]);

        return redirect()
            ->route('dashboard')
            ->with('success', __('messages.route_updated'));
    }

    public function destroy(Request $request, NavigationRoute $navigationRoute): RedirectResponse
    {
        abort_unless($navigationRoute->user_id === $request->user()?->id, 403);

        $navigationRoute->delete();

        return redirect()
            ->route('dashboard')
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
                'points' => ['required', 'array', 'min:2'],
                'points.*.latitude' => ['required', 'numeric', 'between:-90,90'],
                'points.*.longitude' => ['required', 'numeric', 'between:-180,180'],
                'points.*.recorded_at' => ['required', 'date'],
            ];
        }

        return $request->validate($rules);
    }
}
