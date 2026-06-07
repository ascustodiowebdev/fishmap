<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use App\Models\CatchLog;
use App\Models\NavigationRoute;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    private const ADMIN_LIST_LIMIT = 200;
    private const ADMIN_BULK_DELETE_LIMIT = 200;

    public function index(): Response
    {
        $userCount = User::query()->count();
        $catchLogCount = CatchLog::query()->count();
        $navigationRouteCount = NavigationRoute::query()->count();

        $users = User::query()
            ->withCount(['catchLogs', 'navigationRoutes'])
            ->latest()
            ->limit(self::ADMIN_LIST_LIMIT)
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_admin' => $user->is_admin,
                'is_pro' => $user->isPro(),
                'pro_lifetime' => (bool) $user->pro_lifetime,
                'pro_expires_at' => optional($user->pro_expires_at)?->toIso8601String(),
                'email_verified_at' => optional($user->email_verified_at)?->toIso8601String(),
                'created_at' => $user->created_at->toIso8601String(),
                'updated_at' => $user->updated_at->toIso8601String(),
                'catch_logs_count' => $user->catch_logs_count,
                'navigation_routes_count' => $user->navigation_routes_count,
            ]);

        $catchLogs = CatchLog::query()
            ->with('user:id,name,email')
            ->latest('caught_at')
            ->latest()
            ->limit(self::ADMIN_LIST_LIMIT)
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
                'updated_at' => $catchLog->updated_at->toIso8601String(),
                'user' => [
                    'id' => $catchLog->user?->id,
                    'name' => $catchLog->user?->name,
                    'email' => $catchLog->user?->email,
                ],
            ]);

        $navigationRoutes = NavigationRoute::query()
            ->with('user:id,name,email', 'points:id,navigation_route_id,sequence,latitude,longitude,recorded_at')
            ->latest('started_at')
            ->latest()
            ->limit(self::ADMIN_LIST_LIMIT)
            ->get()
            ->map(fn (NavigationRoute $route) => [
                'id' => $route->id,
                'name' => $route->name,
                'visibility' => $route->visibility,
                'started_at' => optional($route->started_at)?->toIso8601String(),
                'ended_at' => optional($route->ended_at)?->toIso8601String(),
                'point_count' => $route->point_count,
                'start_latitude' => $route->start_latitude,
                'start_longitude' => $route->start_longitude,
                'end_latitude' => $route->end_latitude,
                'end_longitude' => $route->end_longitude,
                'created_at' => $route->created_at->toIso8601String(),
                'updated_at' => $route->updated_at->toIso8601String(),
                'user' => [
                    'id' => $route->user?->id,
                    'name' => $route->user?->name,
                    'email' => $route->user?->email,
                ],
                'points' => $route->points->map(fn ($point) => [
                    'sequence' => $point->sequence,
                    'latitude' => (string) $point->latitude,
                    'longitude' => (string) $point->longitude,
                    'recorded_at' => optional($point->recorded_at)?->toIso8601String(),
                ])->values(),
            ]);

        return Inertia::render('admin/index', [
            'maintenanceMode' => AppSetting::getBoolean('maintenance_mode'),
            'registrationsOpen' => AppSetting::getBoolean('registrations_open', true),
            'proSettings' => [
                'monthly_price_eur' => AppSetting::getString('pro_monthly_price_eur', '3.99'),
                'annual_price_eur' => AppSetting::getString('pro_annual_price_eur', '29.99'),
                'lifetime_price_eur' => AppSetting::getString('pro_lifetime_price_eur', ''),
                'free_spot_limit' => AppSetting::getString('free_spot_limit', '5'),
                'free_route_limit' => AppSetting::getString('free_route_limit', '3'),
                'free_satellite_hours_monthly' => (string) round(AppSetting::getInt('free_satellite_seconds_monthly', 10800) / 3600, 2),
            ],
            'users' => $users,
            'catchLogs' => $catchLogs,
            'navigationRoutes' => $navigationRoutes,
            'listLimit' => self::ADMIN_LIST_LIMIT,
            'stats' => [
                'users' => $userCount,
                'catches' => $catchLogCount,
                'routes' => $navigationRouteCount,
            ],
        ]);
    }

    public function updateMaintenance(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        AppSetting::setValue('maintenance_mode', $validated['enabled'] ? '1' : '0');

        return back()->with('success', $validated['enabled']
            ? 'Maintenance mode is now active. Only the admin can access app pages.'
            : 'Maintenance mode has been turned off.');
    }

    public function updateRegistrations(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        AppSetting::setValue('registrations_open', $validated['enabled'] ? '1' : '0');

        return back()->with('success', $validated['enabled']
            ? 'New registrations are now enabled.'
            : 'New registrations are now disabled.');
    }

    public function updateProSettings(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'monthly_price_eur' => ['required', 'numeric', 'min:0', 'max:999'],
            'annual_price_eur' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'lifetime_price_eur' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'free_spot_limit' => ['required', 'integer', 'min:0', 'max:1000'],
            'free_route_limit' => ['required', 'integer', 'min:0', 'max:1000'],
            'free_satellite_hours_monthly' => ['required', 'numeric', 'min:0', 'max:744'],
        ]);

        AppSetting::setValue('pro_monthly_price_eur', number_format((float) $validated['monthly_price_eur'], 2, '.', ''));
        AppSetting::setValue('pro_annual_price_eur', isset($validated['annual_price_eur']) && $validated['annual_price_eur'] !== null
            ? number_format((float) $validated['annual_price_eur'], 2, '.', '')
            : '');
        AppSetting::setValue('pro_lifetime_price_eur', isset($validated['lifetime_price_eur']) && $validated['lifetime_price_eur'] !== null
            ? number_format((float) $validated['lifetime_price_eur'], 2, '.', '')
            : '');
        AppSetting::setValue('free_spot_limit', $validated['free_spot_limit']);
        AppSetting::setValue('free_route_limit', $validated['free_route_limit']);
        AppSetting::setValue('free_satellite_seconds_monthly', (int) round((float) $validated['free_satellite_hours_monthly'] * 3600));

        return back()->with('success', 'Pro pricing and free limits updated.');
    }

    public function updateUserPro(Request $request, User $user): RedirectResponse
    {
        $validated = $request->validate([
            'mode' => ['required', 'in:revoke,month,year,lifetime'],
        ]);

        $payload = match ($validated['mode']) {
            'month' => [
                'pro_lifetime' => false,
                'pro_expires_at' => now()->addMonth(),
                'pro_granted_at' => now(),
                'pro_granted_by_admin_id' => $request->user()?->id,
            ],
            'year' => [
                'pro_lifetime' => false,
                'pro_expires_at' => now()->addYear(),
                'pro_granted_at' => now(),
                'pro_granted_by_admin_id' => $request->user()?->id,
            ],
            'lifetime' => [
                'pro_lifetime' => true,
                'pro_expires_at' => null,
                'pro_granted_at' => now(),
                'pro_granted_by_admin_id' => $request->user()?->id,
            ],
            default => [
                'pro_lifetime' => false,
                'pro_expires_at' => null,
                'pro_granted_at' => null,
                'pro_granted_by_admin_id' => null,
            ],
        };

        $user->forceFill($payload)->save();

        return back()->with('success', "Pro status updated for {$user->email}.");
    }

    public function destroyCatchLog(CatchLog $catchLog): RedirectResponse
    {
        $catchLog->delete();

        return back()->with('success', 'Catch pin deleted from the admin panel.');
    }

    public function bulkDestroyCatchLogs(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.self::ADMIN_BULK_DELETE_LIMIT],
            'ids.*' => ['integer', 'exists:catch_logs,id'],
        ]);

        $count = CatchLog::query()
            ->whereIn('id', $validated['ids'])
            ->delete();

        return back()->with('success', "{$count} catch pin(s) deleted from the admin panel.");
    }

    public function destroyNavigationRoute(NavigationRoute $navigationRoute): RedirectResponse
    {
        $navigationRoute->delete();

        return back()->with('success', 'Navigation route deleted from the admin panel.');
    }

    public function bulkDestroyNavigationRoutes(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.self::ADMIN_BULK_DELETE_LIMIT],
            'ids.*' => ['integer', 'exists:navigation_routes,id'],
        ]);

        $count = NavigationRoute::query()
            ->whereIn('id', $validated['ids'])
            ->delete();

        return back()->with('success', "{$count} navigation route(s) deleted from the admin panel.");
    }

    public function sendPasswordReset(User $user): RedirectResponse
    {
        Password::sendResetLink([
            'email' => $user->email,
        ]);

        return back()->with('success', "Password reset link sent to {$user->email}.");
    }

    public function destroyUser(Request $request, User $user): RedirectResponse
    {
        if ($request->user()?->id === $user->id) {
            return back()->with('error', 'You cannot delete your own admin account from the admin panel.');
        }

        $user->delete();

        return back()->with('success', "User {$user->email} was deleted.");
    }
}
