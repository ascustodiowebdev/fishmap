<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use App\Models\BugReport;
use App\Models\CatchLog;
use App\Models\NavigationRoute;
use App\Models\SatelliteUsage;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class CatchLogController extends Controller
{
    private const DEFAULT_FREE_SPOT_LIMIT = 5;

    private const DEFAULT_FREE_ROUTE_LIMIT = 3;

    private const DEFAULT_FREE_SATELLITE_SECONDS = 10800;

    public function index(): Response
    {
        $viewer = Auth::user();
        $viewerId = $viewer?->id;
        $viewerIsAdmin = (bool) ($viewer?->is_admin ?? false);
        $viewerIsPro = (bool) ($viewer?->isPro() ?? false);

        $catchLogsQuery = CatchLog::query()
            ->with('user:id,name')
            ->latest('caught_at')
            ->latest();

        if (! $viewerIsAdmin) {
            $catchLogsQuery->where(function ($query) {
                $query
                    ->where('user_id', Auth::id())
                    ->orWhere('visibility', 'public');
            });
        }

        $catchLogs = $catchLogsQuery
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
                'share_token' => $catchLog->user_id === $viewerId || $viewerIsAdmin ? $catchLog->share_token : null,
                'share_url' => ($catchLog->user_id === $viewerId || $viewerIsAdmin) && $catchLog->share_token
                    ? route('shared.catch-log', $catchLog->share_token)
                    : null,
                'owner_name' => $catchLog->user?->name,
                'is_owner' => $catchLog->user_id === $viewerId,
                'created_at' => $catchLog->created_at->toIso8601String(),
            ]);

        $ownCatchLogs = $catchLogs->where('is_owner', true);

        $bugReports = BugReport::query()
            ->where('user_id', $viewerId)
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (BugReport $report) => [
                'id' => $report->id,
                'category' => $report->category,
                'subject' => $report->subject,
                'message' => $report->message,
                'status' => $report->status,
                'admin_response' => $report->admin_response,
                'admin_responded_at' => optional($report->admin_responded_at)?->toIso8601String(),
                'created_at' => $report->created_at->toIso8601String(),
                'updated_at' => $report->updated_at->toIso8601String(),
            ]);

        $navigationRoutesQuery = NavigationRoute::query()
            ->with('user:id,name', 'points:id,navigation_route_id,latitude,longitude,recorded_at,sequence')
            ->latest('started_at')
            ->limit(50);

        if (! $viewerIsAdmin) {
            $navigationRoutesQuery->where(function ($query) {
                $query
                    ->where('user_id', Auth::id())
                    ->orWhere('visibility', 'public');
            });
        }

        $navigationRoutes = $navigationRoutesQuery
            ->get()
            ->map(fn (NavigationRoute $route) => [
                'id' => $route->id,
                'name' => $route->name,
                'visibility' => $route->visibility,
                'share_token' => $route->user_id === $viewerId || $viewerIsAdmin ? $route->share_token : null,
                'share_url' => ($route->user_id === $viewerId || $viewerIsAdmin) && $route->share_token
                    ? route('shared.navigation-route', $route->share_token)
                    : null,
                'started_at' => optional($route->started_at)?->toIso8601String(),
                'ended_at' => optional($route->ended_at)?->toIso8601String(),
                'point_count' => $route->point_count,
                'owner_name' => $route->user?->name,
                'is_owner' => $route->user_id === $viewerId,
                'can_manage' => $route->user_id === $viewerId || $viewerIsAdmin,
                'points' => $route->points->map(fn ($point) => [
                    'latitude' => (string) $point->latitude,
                    'longitude' => (string) $point->longitude,
                    'recorded_at' => optional($point->recorded_at)?->toIso8601String(),
                ])->values(),
            ]);

        return Inertia::render('dashboard', [
            'catchLogs' => $catchLogs,
            'navigationRoutes' => $navigationRoutes,
            'bugReports' => $bugReports,
            'subscription' => $this->subscriptionPayload($viewer, $ownCatchLogs->count(), NavigationRoute::query()->where('user_id', $viewerId)->count(), $viewerIsPro),
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
        $user = $request->user();

        if (! $user->isPro()) {
            $limit = AppSetting::getInt('free_spot_limit', self::DEFAULT_FREE_SPOT_LIMIT);
            if ($user->catchLogs()->count() >= $limit) {
                return back()->with('error', "Free accounts can save up to {$limit} fish spots. Upgrade to Pro to save more.");
            }
        }

        Log::info('NautiBite catch save request validated.', [
            'user_id' => $user?->id,
            'species' => $validated['species'],
            'visibility' => $validated['visibility'],
        ]);

        $user->catchLogs()->create($validated);

        return redirect()
            ->route('map')
            ->with('success', __('messages.catch_saved'));
    }

    public function share(Request $request, CatchLog $catchLog): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user && ($catchLog->user_id === $user->id || (bool) $user->is_admin), 403);

        if (! $user->isPro()) {
            return back()->with('error', 'Private sharing is available for Pro users.');
        }

        if (! $catchLog->share_token) {
            $catchLog->forceFill([
                'share_token' => Str::random(48),
                'shared_at' => now(),
            ])->save();
        }

        return back()->with('success', 'Private fish spot sharing link is ready.');
    }

    public function revokeShare(Request $request, CatchLog $catchLog): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user && ($catchLog->user_id === $user->id || (bool) $user->is_admin), 403);

        $catchLog->forceFill([
            'share_token' => null,
            'shared_at' => null,
        ])->save();

        return back()->with('success', 'Private fish spot sharing link was revoked.');
    }

    public function update(Request $request, CatchLog $catchLog): RedirectResponse
    {
        abort_unless($catchLog->user_id === Auth::id(), 403);

        $validated = $this->validateCatchLog($request);

        $catchLog->update($validated);

        return redirect()
            ->route('map')
            ->with('success', __('messages.catch_updated'));
    }

    public function destroy(CatchLog $catchLog): RedirectResponse
    {
        abort_unless($catchLog->user_id === Auth::id(), 403);

        $catchLog->delete();

        return redirect()
            ->route('map')
            ->with('success', __('messages.catch_deleted'));
    }

    /**
     * @return array<string, mixed>
     */
    private function subscriptionPayload(?User $viewer, int $spotCount, int $routeCount, bool $viewerIsPro): array
    {
        $freeSatelliteSeconds = AppSetting::getInt('free_satellite_seconds_monthly', self::DEFAULT_FREE_SATELLITE_SECONDS);
        $satelliteUsage = $viewer
            ? SatelliteUsage::query()
                ->where('user_id', $viewer->id)
                ->whereDate('month', now('Europe/Lisbon')->startOfMonth()->toDateString())
                ->value('seconds_used')
            : 0;

        return [
            'is_pro' => $viewerIsPro,
            'pro_lifetime' => (bool) ($viewer?->pro_lifetime ?? false),
            'pro_expires_at' => optional($viewer?->pro_expires_at)?->toIso8601String(),
            'limits' => [
                'spots' => AppSetting::getInt('free_spot_limit', self::DEFAULT_FREE_SPOT_LIMIT),
                'routes' => AppSetting::getInt('free_route_limit', self::DEFAULT_FREE_ROUTE_LIMIT),
                'satellite_seconds_monthly' => $freeSatelliteSeconds,
            ],
            'usage' => [
                'spots' => $spotCount,
                'routes' => $routeCount,
                'satellite_seconds' => (int) ($satelliteUsage ?? 0),
            ],
            'pricing' => [
                'monthly_eur' => AppSetting::getString('pro_monthly_price_eur', '3.99'),
                'annual_eur' => AppSetting::getString('pro_annual_price_eur', '29.99'),
                'lifetime_eur' => AppSetting::getString('pro_lifetime_price_eur', ''),
            ],
        ];
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
            'photo_url' => ['nullable', 'url:http,https', 'max:2048'],
            'fish_length_cm' => ['nullable', 'numeric', 'between:0,999.9'],
            'fish_weight_kg' => ['nullable', 'numeric', 'between:0,999.99'],
            'caught_at' => ['nullable', 'date'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'visibility' => ['required', 'in:private,public'],
        ]);
    }
}
