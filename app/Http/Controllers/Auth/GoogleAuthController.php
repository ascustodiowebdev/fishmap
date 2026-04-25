<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleAuthController extends Controller
{
    private const MOBILE_AUTH_COOKIE = 'google_auth_mobile';

    public function redirect(Request $request): RedirectResponse
    {
        $isMobileFlow = $request->boolean('mobile') || $this->isNativeAppRequest($request);
        $request->session()->put('google_auth_mobile', $isMobileFlow);
        Log::info('google_auth.redirect', [
            'is_mobile_flow' => $isMobileFlow,
            'mobile_query' => $request->boolean('mobile'),
            'native_request' => $this->isNativeAppRequest($request),
            'user_agent' => (string) $request->userAgent(),
        ]);

        $driver = Socialite::driver('google')
            ->scopes(['openid', 'profile', 'email']);

        if (! $isMobileFlow) {
            return $driver->redirect();
        }

        $state = 'fm_mobile:'.Str::random(48);
        $query = http_build_query([
            'client_id' => (string) config('services.google.client_id'),
            'redirect_uri' => (string) config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => $state,
            'include_granted_scopes' => 'true',
            'prompt' => 'select_account',
        ], '', '&', PHP_QUERY_RFC3986);
        $oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?'.$query;
        Log::info('google_auth.redirect.mobile_oauth', [
            'state_prefix' => Str::substr($state, 0, 18),
            'redirect_uri' => (string) config('services.google.redirect'),
        ]);

        $response = redirect()->away($oauthUrl);

        return $response->withCookie(cookie(
            self::MOBILE_AUTH_COOKIE,
            '1',
            10,
            '/',
            null,
            (bool) config('session.secure', false),
            true,
            false,
            (string) config('session.same_site', 'lax'),
        ));
    }

    public function callback(Request $request): RedirectResponse
    {
        $mobileState = (string) $request->query('state', '');
        $isMobileFromState = str_starts_with($mobileState, 'fm_mobile:');
        $isMobileFromSession = (bool) $request->session()->pull('google_auth_mobile', false);
        $isMobileFromCookie = $request->cookie(self::MOBILE_AUTH_COOKIE) === '1';
        $isMobileFlow = $isMobileFromState || $isMobileFromSession || $isMobileFromCookie;
        Log::info('google_auth.callback.start', [
            'is_mobile_flow' => $isMobileFlow,
            'mobile_from_state' => $isMobileFromState,
            'mobile_from_session' => $isMobileFromSession,
            'mobile_from_cookie' => $isMobileFromCookie,
            'state_prefix' => Str::substr($mobileState, 0, 18),
            'has_code' => $request->query('code') !== null,
            'user_agent' => (string) $request->userAgent(),
        ]);

        try {
            $driver = Socialite::driver('google');
            $googleUser = $isMobileFlow ? $driver->stateless()->user() : $driver->user();
        } catch (Throwable) {
            Log::warning('google_auth.callback.socialite_failed', [
                'is_mobile_flow' => $isMobileFlow,
                'state_prefix' => Str::substr($mobileState, 0, 18),
            ]);
            return redirect()->route('login')->with('error', __('Unable to authenticate with Google right now.'));
        }

        $email = $googleUser->getEmail();

        if (! $email) {
            Log::warning('google_auth.callback.missing_email', [
                'is_mobile_flow' => $isMobileFlow,
                'google_id' => $googleUser->getId(),
            ]);
            return redirect()->route('login')->with('error', __('Google account did not provide an email.'));
        }

        $user = User::query()
            ->where('google_id', $googleUser->getId())
            ->orWhere('email', $email)
            ->first();

        $isCreatingNewUser = ! $user;

        if ($isCreatingNewUser && ! AppSetting::getBoolean('registrations_open', true)) {
            return redirect()->route('login')->with('error', __('Registrations are currently closed.'));
        }

        if (! $user) {
            $user = User::create([
                'name' => $googleUser->getName() ?: Str::before($email, '@'),
                'email' => $email,
                'password' => Hash::make(Str::random(48)),
                'google_id' => $googleUser->getId(),
                'avatar_url' => $googleUser->getAvatar(),
                'email_verified_at' => now(),
            ]);
        } else {
            $user->forceFill([
                'google_id' => $user->google_id ?: $googleUser->getId(),
                'avatar_url' => $googleUser->getAvatar() ?: $user->avatar_url,
                'email_verified_at' => $user->email_verified_at ?: now(),
            ])->save();
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();
        Log::info('google_auth.callback.logged_in', [
            'is_mobile_flow' => $isMobileFlow,
            'user_id' => $user->id,
            'email' => $email,
        ]);

        if ($isMobileFlow) {
            $token = Str::random(80);
            Cache::put("mobile_google_login:{$token}", (int) $user->id, now()->addMinutes(5));
            Log::info('google_auth.callback.mobile_token_created', [
                'user_id' => $user->id,
                'token_preview' => $this->tokenPreview($token),
            ]);

            return redirect()
                ->route('auth.google.mobile.return', ['token' => $token])
                ->withoutCookie(self::MOBILE_AUTH_COOKIE);
        }

        return redirect()
            ->intended(route('map', absolute: false))
            ->withoutCookie(self::MOBILE_AUTH_COOKIE);
    }

    public function consumeMobileToken(Request $request): RedirectResponse
    {
        $token = (string) $request->query('token', '');
        Log::info('google_auth.mobile_consume.start', [
            'token_preview' => $this->tokenPreview($token),
            'session_id' => $request->session()->getId(),
            'already_authenticated' => Auth::check(),
            'current_user_id' => Auth::id(),
            'user_agent' => (string) $request->userAgent(),
        ]);

        if ($token === '') {
            Log::warning('google_auth.mobile_consume.empty_token');
            return redirect()->route('login')->with('error', __('Invalid mobile login token.'));
        }

        $cacheKey = "mobile_google_login:{$token}";
        $userId = Cache::pull($cacheKey);
        Log::info('google_auth.mobile_consume.cache_lookup', [
            'token_preview' => $this->tokenPreview($token),
            'cache_hit' => is_numeric($userId),
            'cached_user_id' => is_numeric($userId) ? (int) $userId : null,
        ]);

        if (! is_numeric($userId)) {
            Log::warning('google_auth.mobile_consume.token_expired', [
                'token_preview' => $this->tokenPreview($token),
            ]);
            return redirect()->route('login')->with('error', __('Mobile login token expired. Please try again.'));
        }

        $loggedIn = Auth::loginUsingId((int) $userId, remember: true);
        $request->session()->regenerate();
        Log::info('google_auth.mobile_consume.logged_in', [
            'token_preview' => $this->tokenPreview($token),
            'target_user_id' => (int) $userId,
            'login_result' => $loggedIn,
            'authenticated_after' => Auth::check(),
            'current_user_id' => Auth::id(),
            'session_id_after' => $request->session()->getId(),
        ]);

        return redirect()->route('map');
    }

    public function mobileReturn(Request $request): View
    {
        $token = (string) $request->query('token', '');
        $scheme = config('app.mobile_deep_link_scheme', 'com.ascustodiowebdev.fishmap');
        $androidPackage = config('app.mobile_android_package', 'com.ascustodiowebdev.fishmap');
        $deepLinkUrl = sprintf('%s://auth/google?token=%s', $scheme, urlencode($token));
        $intentUrl = sprintf(
            'intent://auth/google?token=%s#Intent;scheme=%s;package=%s;end',
            urlencode($token),
            urlencode($scheme),
            urlencode((string) $androidPackage),
        );
        Log::info('google_auth.mobile_return', [
            'token_preview' => $this->tokenPreview($token),
            'scheme' => $scheme,
            'android_package' => $androidPackage,
            'user_agent' => (string) $request->userAgent(),
        ]);

        return view('auth.google-mobile-return', [
            'deepLinkUrl' => $deepLinkUrl,
            'intentUrl' => $intentUrl,
        ]);
    }

    private function isNativeAppRequest(Request $request): bool
    {
        $userAgent = strtolower((string) $request->userAgent());
        $xRequestedWith = strtolower((string) $request->header('x-requested-with', ''));
        $androidPackage = strtolower((string) config('app.mobile_android_package', 'com.ascustodiowebdev.fishmap'));

        if (str_contains($userAgent, 'capacitor') || str_contains($userAgent, '; wv')) {
            return true;
        }

        if ($xRequestedWith !== '' && $xRequestedWith === $androidPackage) {
            return true;
        }

        return false;
    }

    private function tokenPreview(string $token): string
    {
        if ($token === '') {
            return 'empty';
        }

        return Str::substr($token, 0, 8).'...'.Str::substr($token, -6);
    }
}
