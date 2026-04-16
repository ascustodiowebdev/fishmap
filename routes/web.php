<?php

use App\Http\Controllers\CatchLogController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [CatchLogController::class, 'index'])->name('dashboard');
    Route::post('catch-logs', [CatchLogController::class, 'store'])->name('catch-logs.store');
    Route::put('catch-logs/{catchLog}', [CatchLogController::class, 'update'])->name('catch-logs.update');
    Route::delete('catch-logs/{catchLog}', [CatchLogController::class, 'destroy'])->name('catch-logs.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
