<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'is_admin',
        'pro_lifetime',
        'pro_expires_at',
        'pro_granted_at',
        'pro_granted_by_admin_id',
        'google_id',
        'avatar_url',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'is_admin' => 'boolean',
            'pro_lifetime' => 'boolean',
            'pro_expires_at' => 'datetime',
            'pro_granted_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isAdmin(): bool
    {
        return (bool) $this->is_admin;
    }

    public function isPro(): bool
    {
        return $this->isAdmin()
            || (bool) $this->pro_lifetime
            || ($this->pro_expires_at !== null && $this->pro_expires_at->isFuture());
    }

    public function catchLogs(): HasMany
    {
        return $this->hasMany(CatchLog::class);
    }

    public function navigationRoutes(): HasMany
    {
        return $this->hasMany(NavigationRoute::class);
    }

    public function satelliteUsages(): HasMany
    {
        return $this->hasMany(SatelliteUsage::class);
    }

    public function bugReports(): HasMany
    {
        return $this->hasMany(BugReport::class);
    }
}
