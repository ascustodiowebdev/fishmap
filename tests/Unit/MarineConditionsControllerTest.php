<?php

namespace Tests\Unit;

use App\Http\Controllers\MarineConditionsController;
use Carbon\CarbonImmutable;
use ReflectionMethod;
use Tests\TestCase;

class MarineConditionsControllerTest extends TestCase
{
    public function test_it_selects_the_next_low_tide_when_the_tide_is_falling(): void
    {
        $controller = new MarineConditionsController();
        $now = CarbonImmutable::parse('2026-06-04 10:00:00', 'Europe/Lisbon');
        $events = [
            ['type' => 'high', 'height' => 2.8, 'at' => $now->setTime(8, 15)],
            ['type' => 'low', 'height' => 0.7, 'at' => $now->setTime(13, 35)],
            ['type' => 'high', 'height' => 2.9, 'at' => $now->setTime(20, 10)],
        ];

        $selection = $this->invokeProtected($controller, 'selectUpcomingTideEvents', [$events, $now]);

        $this->assertSame('falling', $selection['state']);
        $this->assertSame('low', $selection['next_event']['type']);
        $this->assertSame('13:35', $selection['next_event']['at']->format('H:i'));
    }

    public function test_it_classifies_low_tides_by_height_not_table_position(): void
    {
        $controller = new MarineConditionsController();

        $cutoff = $this->invokeProtected($controller, 'lowTideHeightCutoff', [[
            ['height' => 2.7],
            ['height' => 0.6],
            ['height' => 2.9],
            ['height' => 0.8],
        ]]);

        $this->assertSame(0.8, $cutoff);
    }

    /**
     * @param  array<int, mixed>  $arguments
     */
    private function invokeProtected(object $object, string $method, array $arguments): mixed
    {
        $reflection = new ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invokeArgs($object, $arguments);
    }
}
