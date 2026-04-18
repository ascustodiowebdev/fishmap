<?php

namespace App\Http\Middleware;

use App\Models\AppSetting;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RestrictDuringMaintenance
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! AppSetting::getBoolean('maintenance_mode')) {
            return $next($request);
        }

        if ($request->routeIs('maintenance')) {
            return $next($request);
        }

        if ($request->user()?->isAdmin()) {
            return $next($request);
        }

        if ($request->expectsJson()) {
            abort(503, 'Fishmap is currently in maintenance mode.');
        }

        return redirect()
            ->route('maintenance');
    }
}
