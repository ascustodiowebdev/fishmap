<?php

use App\Http\Controllers\CatchLogController;
use App\Http\Controllers\NavigationRouteController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::post('locale', function (Request $request) {
    $validated = $request->validate([
        'locale' => ['required', 'in:en,pt'],
    ]);

    $request->session()->put('locale', $validated['locale']);

    return back();
})->name('locale.update');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [CatchLogController::class, 'index'])->name('dashboard');
    Route::post('catch-logs', [CatchLogController::class, 'store'])->name('catch-logs.store');
    Route::put('catch-logs/{catchLog}', [CatchLogController::class, 'update'])->name('catch-logs.update');
    Route::delete('catch-logs/{catchLog}', [CatchLogController::class, 'destroy'])->name('catch-logs.destroy');
    Route::post('navigation-routes', [NavigationRouteController::class, 'store'])->name('navigation-routes.store');
    Route::put('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'update'])->name('navigation-routes.update');
    Route::delete('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'destroy'])->name('navigation-routes.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
