<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bug_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('category', 40)->default('bug');
            $table->string('subject', 160);
            $table->text('message');
            $table->string('status', 30)->default('open');
            $table->text('admin_response')->nullable();
            $table->foreignId('admin_responder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('admin_responded_at')->nullable();
            $table->string('client_platform', 80)->nullable();
            $table->string('client_context', 160)->nullable();
            $table->string('user_agent_hash', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bug_reports');
    }
};
