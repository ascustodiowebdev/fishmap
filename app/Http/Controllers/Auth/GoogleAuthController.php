<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleAuthController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        $request->session()->put('google_auth_mobile', $request->boolean('mobile'));

        return Socialite::driver('google')
            ->scopes(['openid', 'profile', 'email'])
            ->redirect();
    }

    public function callback(): RedirectResponse
    {
        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (Throwable) {
            return redirect()->route('login')->with('error', __('Unable to authenticate with Google right now.'));
        }

        $email = $googleUser->getEmail();

        if (! $email) {
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

        $isMobileFlow = (bool) request()->session()->pull('google_auth_mobile', false);

        Auth::login($user, remember: true);
        request()->session()->regenerate();

        if ($isMobileFlow) {
            $token = Str::random(80);
            Cache::put("mobile_google_login:{$token}", (int) $user->id, now()->addMinutes(5));

            $scheme = config('app.mobile_deep_link_scheme', 'com.ascustodiowebdev.fishmap');

            return redirect()->away(sprintf('%s://auth/google?token=%s', $scheme, urlencode($token)));
        }

        return redirect()->intended(route('map', absolute: false));
    }

    public function consumeMobileToken(Request $request): RedirectResponse
    {
        $token = (string) $request->query('token', '');

        if ($token === '') {
            return redirect()->route('login')->with('error', __('Invalid mobile login token.'));
        }

        $cacheKey = "mobile_google_login:{$token}";
        $userId = Cache::pull($cacheKey);

        if (! is_numeric($userId)) {
            return redirect()->route('login')->with('error', __('Mobile login token expired. Please try again.'));
        }

        Auth::loginUsingId((int) $userId, remember: true);
        $request->session()->regenerate();

        return redirect()->route('map');
    }
}

