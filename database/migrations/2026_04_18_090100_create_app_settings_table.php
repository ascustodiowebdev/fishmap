<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
        });

        DB::table('app_settings')->insert([
            'key' => 'maintenance_mode',
            'value' => '0',
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
    }
};
