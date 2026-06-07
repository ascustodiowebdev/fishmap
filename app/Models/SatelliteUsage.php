<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SatelliteUsage extends Model
{
    protected $fillable = [
        'user_id',
        'month',
        'seconds_used',
    ];

    protected function casts(): array
    {
        return [
            'month' => 'date',
            'seconds_used' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
