<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeedbackReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'category',
        'subject',
        'message',
        'status',
        'admin_response',
        'admin_responder_id',
        'admin_responded_at',
        'client_platform',
        'client_context',
        'user_agent_hash',
        'ip_hash',
    ];

    protected function casts(): array
    {
        return [
            'admin_responded_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function adminResponder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_responder_id');
    }
}
