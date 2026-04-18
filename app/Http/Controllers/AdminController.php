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
    public function index(): Response
    {
        $users = User::query()
            ->withCount(['catchLogs', 'navigationRoutes'])
            ->latest()
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_admin' => $user->is_admin,
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
            'users' => $users,
            'catchLogs' => $catchLogs,
            'navigationRoutes' => $navigationRoutes,
            'stats' => [
                'users' => $users->count(),
                'catches' => $catchLogs->count(),
                'routes' => $navigationRoutes->count(),
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

    public function destroyCatchLog(CatchLog $catchLog): RedirectResponse
    {
        $catchLog->delete();

        return back()->with('success', 'Catch pin deleted from the admin panel.');
    }

    public function destroyNavigationRoute(NavigationRoute $navigationRoute): RedirectResponse
    {
        $navigationRoute->delete();

        return back()->with('success', 'Navigation route deleted from the admin panel.');
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
