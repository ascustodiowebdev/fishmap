<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\BugReportController;
use App\Http\Controllers\CatchLogController;
use App\Http\Controllers\MarineConditionsController;
use App\Http\Controllers\NavigationRouteController;
use App\Http\Controllers\SatelliteUsageController;
use App\Http\Controllers\SharedResourceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::get('/privacy', function () {
    return Inertia::render('privacy');
})->name('privacy');

Route::get('shared/spots/{token}', [SharedResourceController::class, 'catchLog'])->name('shared.catch-log');
Route::get('shared/routes/{token}', [SharedResourceController::class, 'navigationRoute'])->name('shared.navigation-route');

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
    Route::post('catch-logs/{catchLog}/share', [CatchLogController::class, 'share'])->name('catch-logs.share');
    Route::delete('catch-logs/{catchLog}/share', [CatchLogController::class, 'revokeShare'])->name('catch-logs.share.destroy');
    Route::post('navigation-routes', [NavigationRouteController::class, 'store'])->name('navigation-routes.store');
    Route::put('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'update'])->name('navigation-routes.update');
    Route::delete('navigation-routes/{navigationRoute}', [NavigationRouteController::class, 'destroy'])->name('navigation-routes.destroy');
    Route::post('navigation-routes/{navigationRoute}/share', [NavigationRouteController::class, 'share'])->name('navigation-routes.share');
    Route::delete('navigation-routes/{navigationRoute}/share', [NavigationRouteController::class, 'revokeShare'])->name('navigation-routes.share.destroy');
    Route::post('bug-reports', [BugReportController::class, 'store'])
        ->middleware(['throttle:6,1', 'throttle:20,60'])
        ->name('bug-reports.store');
    Route::get('marine-conditions', MarineConditionsController::class)->middleware('throttle:60,1')->name('marine-conditions');
    Route::post('satellite-usage', [SatelliteUsageController::class, 'store'])->middleware('throttle:30,1')->name('satellite-usage.store');
});

Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', [AdminController::class, 'index'])->name('index');
    Route::patch('maintenance', [AdminController::class, 'updateMaintenance'])->name('maintenance.update');
    Route::patch('registrations', [AdminController::class, 'updateRegistrations'])->name('registrations.update');
    Route::patch('pro-settings', [AdminController::class, 'updateProSettings'])->name('pro-settings.update');
    Route::get('bug-reports', [AdminController::class, 'bugReports'])->name('bug-reports.index');
    Route::patch('bug-reports/{bugReport}', [AdminController::class, 'updateBugReport'])->name('bug-reports.update');
    Route::patch('users/{user}/pro', [AdminController::class, 'updateUserPro'])->name('users.pro.update');
    Route::post('users/{user}/password-reset', [AdminController::class, 'sendPasswordReset'])->name('users.password-reset');
    Route::delete('users/{user}', [AdminController::class, 'destroyUser'])->name('users.destroy');
    Route::delete('catch-logs/{catchLog}', [AdminController::class, 'destroyCatchLog'])->name('catch-logs.destroy');
    Route::delete('catch-logs', [AdminController::class, 'bulkDestroyCatchLogs'])->name('catch-logs.bulk-destroy');
    Route::delete('navigation-routes/{navigationRoute}', [AdminController::class, 'destroyNavigationRoute'])->name('navigation-routes.destroy');
    Route::delete('navigation-routes', [AdminController::class, 'bulkDestroyNavigationRoutes'])->name('navigation-routes.bulk-destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
