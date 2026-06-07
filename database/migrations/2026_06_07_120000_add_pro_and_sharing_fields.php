<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('pro_lifetime')->default(false)->after('is_admin');
            $table->timestamp('pro_expires_at')->nullable()->after('pro_lifetime');
            $table->timestamp('pro_granted_at')->nullable()->after('pro_expires_at');
            $table->foreignId('pro_granted_by_admin_id')->nullable()->after('pro_granted_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('catch_logs', function (Blueprint $table) {
            $table->string('share_token', 64)->nullable()->unique()->after('visibility');
            $table->timestamp('shared_at')->nullable()->after('share_token');
        });

        Schema::table('navigation_routes', function (Blueprint $table) {
            $table->string('share_token', 64)->nullable()->unique()->after('visibility');
            $table->timestamp('shared_at')->nullable()->after('share_token');
        });

        Schema::create('satellite_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('month');
            $table->unsignedInteger('seconds_used')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'month']);
        });

        DB::table('app_settings')->upsert([
            ['key' => 'pro_monthly_price_eur', 'value' => '3.99'],
            ['key' => 'pro_annual_price_eur', 'value' => '29.99'],
            ['key' => 'pro_lifetime_price_eur', 'value' => ''],
            ['key' => 'free_spot_limit', 'value' => '5'],
            ['key' => 'free_route_limit', 'value' => '3'],
            ['key' => 'free_satellite_seconds_monthly', 'value' => '10800'],
        ], ['key'], ['value']);
    }

    public function down(): void
    {
        Schema::dropIfExists('satellite_usages');

        Schema::table('navigation_routes', function (Blueprint $table) {
            $table->dropColumn(['share_token', 'shared_at']);
        });

        Schema::table('catch_logs', function (Blueprint $table) {
            $table->dropColumn(['share_token', 'shared_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pro_granted_by_admin_id');
            $table->dropColumn(['pro_lifetime', 'pro_expires_at', 'pro_granted_at']);
        });
    }
};
