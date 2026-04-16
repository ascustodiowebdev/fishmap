<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatchLog extends Model
{
    /** @use HasFactory<\Database\Factories\CatchLogFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'species',
        'bait_used',
        'notes',
        'photo_url',
        'fish_length_cm',
        'fish_weight_kg',
        'caught_at',
        'latitude',
        'longitude',
        'visibility',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'caught_at' => 'datetime',
            'fish_length_cm' => 'decimal:1',
            'fish_weight_kg' => 'decimal:2',
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
