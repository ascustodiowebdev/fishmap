<?php

use App\Http\Controllers\CatchLogController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\NavigationRouteController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::get('/maintenance', function () {
    return Inertia::render('maintenance');
})->name('maintenance');

Route::post('locale', function (Request $request) {
    $validated = $request->validate([
        'locale' => ['required', 'in:en,pt'],
    ]);

    $request->session()->put('locale', $validated['locale']);

    return back();
})->name('locale.update');

Route::middleware(['auth', 'maintenance'])->group(function () {
    Route::redirect('dashboard', 'map');
    Route::get('map', [CatchLogController::class, 'index'])->name('map');
    Route::post('catch-logs', [CatchLogController::class, 'store'])->name('catch-logs.store');
    Route::put('catch-logs/{catchLog}', [CatchLogController::class, 'update'])->name('catch-logs.update');
    Route::delete('catch-logs/{catchLog}', [CatchLogController::class, 'destroy'])->name('catch-logs.destroy');
    Route::post('navigation-routes', [NavigationRouteController::class, 'store'])->name('navigation-routes.store');
    Route::put('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'update'])->name('navigation-routes.update');
    Route::delete('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'destroy'])->name('navigation-routes.destroy');
});

Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', [AdminController::class, 'index'])->name('index');
    Route::patch('maintenance', [AdminController::class, 'updateMaintenance'])->name('maintenance.update');
    Route::patch('registrations', [AdminController::class, 'updateRegistrations'])->name('registrations.update');
    Route::post('users/{user}/password-reset', [AdminController::class, 'sendPasswordReset'])->name('users.password-reset');
    Route::delete('users/{user}', [AdminController::class, 'destroyUser'])->name('users.destroy');
    Route::delete('catch-logs/{catchLog}', [AdminController::class, 'destroyCatchLog'])->name('catch-logs.destroy');
    Route::delete('navigation-routes/{navigationRoute}', [AdminController::class, 'destroyNavigationRoute'])->name('navigation-routes.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
