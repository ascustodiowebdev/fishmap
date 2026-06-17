<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
        );
        $response->headers->set(
            'Content-Security-Policy',
            implode('; ', [
                "default-src 'self'",
                "base-uri 'self'",
                "frame-ancestors 'none'",
                "form-action 'self'",
                "object-src 'none'",
                "script-src 'self' 'unsafe-inline'",
                "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
                "font-src 'self' https://fonts.bunny.net",
                "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://t1.openseamap.org https://api.maptiler.com https://*.maptiler.com https://ows.emodnet-bathymetry.eu https://*.googleusercontent.com",
                "connect-src 'self' https://api.open-meteo.com https://tides4fishing.com https://tabuademares.com https://rest.emodnet-bathymetry.eu https://ows.emodnet-bathymetry.eu https://api.maptiler.com https://*.maptiler.com",
            ]),
        );

        if ($request->isSecure() || str_starts_with((string) config('app.url'), 'https://')) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
