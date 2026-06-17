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

    public function test_it_extracts_today_portuguese_tide_summary(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-06-05 11:15:00', 'Europe/Lisbon'));

        $controller = new MarineConditionsController();
        $events = $this->invokeProtected($controller, 'extractPortugueseTodayTideEvents', [
            'A primeira preia-mar foi às 6:33 e a seguinte preia-mar será às 18:47. A única baixa-mar será às 12:07.',
            'Europe/Lisbon',
        ]);
        $selection = $this->invokeProtected($controller, 'selectUpcomingTideEvents', [
            $events,
            CarbonImmutable::parse('2026-06-05 11:15:00', 'Europe/Lisbon'),
        ]);

        CarbonImmutable::setTestNow();

        $this->assertSame('falling', $selection['state']);
        $this->assertSame('low', $selection['next_event']['type']);
        $this->assertSame('12:07', $selection['next_event']['at']->format('H:i'));
        $this->assertSame('18:47', $selection['next_high']['at']->format('H:i'));
    }

    public function test_it_rejects_stale_fallback_tide_events(): void
    {
        $controller = new MarineConditionsController();
        $now = CarbonImmutable::parse('2026-06-05 11:15:00', 'Europe/Lisbon');
        $event = ['type' => 'low', 'height' => 1.2, 'at' => $now->addDays(5)->setTime(4, 46)];

        $this->assertFalse($this->invokeProtected($controller, 'hasUpcomingTideWithinWindow', [$event, $now]));
    }

    public function test_it_keeps_next_low_after_todays_low_has_passed(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-06-05 14:00:00', 'Europe/Lisbon'));

        $controller = new MarineConditionsController();
        $events = $this->invokeProtected($controller, 'extractTabuaMonthlyTideEvents', [
            '5 Sex 6:12 20:47 6:33 2,7 m 12:07 1,2 m 18:47 2,9 m 53 medio 6 Seg 6:11 20:48 0:43 1,2 m 7:16 2,6 m 12:54 1,3 m 19:31 2,8 m 50 medio',
            'Europe/Lisbon',
        ]);
        $selection = $this->invokeProtected($controller, 'selectUpcomingTideEvents', [
            $events,
            CarbonImmutable::parse('2026-06-05 14:00:00', 'Europe/Lisbon'),
        ]);

        CarbonImmutable::setTestNow();

        $this->assertSame('rising', $selection['state']);
        $this->assertSame('high', $selection['next_event']['type']);
        $this->assertSame('18:47', $selection['next_event']['at']->format('H:i'));
        $this->assertSame('2026-06-06 00:43', $selection['next_low']['at']->format('Y-m-d H:i'));
        $this->assertSame(1.2, $selection['next_low']['height']);
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
