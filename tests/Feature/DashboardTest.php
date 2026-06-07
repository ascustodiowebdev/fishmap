<?php

namespace Tests\Feature;

use App\Models\CatchLog;
use App\Models\NavigationRoute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page()
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_authenticated_users_can_visit_the_dashboard()
    {
        $this->actingAs($user = User::factory()->create());

        $this->get('/dashboard')->assertRedirect('/map');
    }

    public function test_privacy_page_can_be_rendered()
    {
        $this->get('/privacy')->assertOk();
    }

    public function test_free_users_cannot_save_more_than_the_free_spot_limit()
    {
        $user = User::factory()->create();
        CatchLog::query()->insert(
            collect(range(1, 5))->map(fn (int $index) => [
                'user_id' => $user->id,
                'species' => "Spot {$index}",
                'latitude' => 38.7 + ($index / 1000),
                'longitude' => -9.1 - ($index / 1000),
                'visibility' => 'private',
                'created_at' => now(),
                'updated_at' => now(),
            ])->all(),
        );

        $this->actingAs($user)
            ->from('/map')
            ->post(route('catch-logs.store'), $this->catchPayload())
            ->assertRedirect('/map')
            ->assertSessionHas('error');

        $this->assertSame(5, $user->catchLogs()->count());
    }

    public function test_pro_users_can_save_more_than_the_free_spot_limit()
    {
        $user = User::factory()->create(['pro_lifetime' => true]);
        Log::spy();

        CatchLog::query()->insert(
            collect(range(1, 5))->map(fn (int $index) => [
                'user_id' => $user->id,
                'species' => "Spot {$index}",
                'latitude' => 38.7 + ($index / 1000),
                'longitude' => -9.1 - ($index / 1000),
                'visibility' => 'private',
                'created_at' => now(),
                'updated_at' => now(),
            ])->all(),
        );

        $this->actingAs($user)
            ->post(route('catch-logs.store'), $this->catchPayload())
            ->assertRedirect(route('map'));

        $this->assertSame(6, $user->catchLogs()->count());
    }

    public function test_free_users_cannot_save_more_than_the_free_route_limit()
    {
        $user = User::factory()->create();
        NavigationRoute::query()->insert(
            collect(range(1, 3))->map(fn (int $index) => [
                'user_id' => $user->id,
                'name' => "Route {$index}",
                'visibility' => 'private',
                'started_at' => now(),
                'ended_at' => now()->addMinute(),
                'point_count' => 2,
                'start_latitude' => 38.7,
                'start_longitude' => -9.1,
                'end_latitude' => 38.71,
                'end_longitude' => -9.11,
                'created_at' => now(),
                'updated_at' => now(),
            ])->all(),
        );

        $this->actingAs($user)
            ->from('/map')
            ->post(route('navigation-routes.store'), $this->routePayload())
            ->assertRedirect('/map')
            ->assertSessionHas('error');

        $this->assertSame(3, $user->navigationRoutes()->count());
    }

    public function test_private_share_links_require_pro()
    {
        $user = User::factory()->create();
        $catchLog = CatchLog::query()->create([
            'user_id' => $user->id,
            'species' => 'Bass',
            'latitude' => 38.7,
            'longitude' => -9.1,
            'visibility' => 'private',
        ]);

        $this->actingAs($user)
            ->post(route('catch-logs.share', $catchLog))
            ->assertSessionHas('error');

        $this->assertNull($catchLog->refresh()->share_token);
    }

    public function test_admin_can_grant_manual_pro()
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $user = User::factory()->create();

        $this->actingAs($admin)
            ->patch(route('admin.users.pro.update', $user), ['mode' => 'month'])
            ->assertSessionHas('success');

        $this->assertTrue($user->refresh()->isPro());
        $this->assertNotNull($user->pro_expires_at);
    }

    private function catchPayload(): array
    {
        return [
            'species' => 'Bass',
            'bait_used' => null,
            'notes' => null,
            'photo_url' => null,
            'fish_length_cm' => null,
            'fish_weight_kg' => null,
            'caught_at' => now()->toIso8601String(),
            'latitude' => 38.72,
            'longitude' => -9.13,
            'visibility' => 'private',
        ];
    }

    private function routePayload(): array
    {
        return [
            'name' => 'Safe route',
            'visibility' => 'private',
            'started_at' => now()->toIso8601String(),
            'ended_at' => now()->addMinute()->toIso8601String(),
            'points' => [
                [
                    'latitude' => 38.72,
                    'longitude' => -9.13,
                    'recorded_at' => now()->toIso8601String(),
                ],
                [
                    'latitude' => 38.721,
                    'longitude' => -9.131,
                    'recorded_at' => now()->addSecond()->toIso8601String(),
                ],
            ],
        ];
    }
}
