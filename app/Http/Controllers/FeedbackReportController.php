<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class FeedbackReportController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        if (filled($request->input('website'))) {
            return back()->with('success', __('messages.feedback_received'));
        }

        $validated = $request->validate([
            'category' => ['required', 'in:bug,gps,map,account,idea,other'],
            'subject' => ['required', 'string', 'min:4', 'max:160'],
            'message' => ['required', 'string', 'min:10', 'max:3000'],
            'client_platform' => ['nullable', 'string', 'max:80'],
            'client_context' => ['nullable', 'string', 'max:160'],
            'website' => ['nullable', 'string', 'max:0'],
        ]);

        $appKey = (string) config('app.key');
        $userAgent = (string) $request->userAgent();
        $ipAddress = (string) $request->ip();

        $request->user()->feedbackReports()->create([
            'category' => $validated['category'],
            'subject' => Str::squish($validated['subject']),
            'message' => trim($validated['message']),
            'status' => 'open',
            'client_platform' => $validated['client_platform'] ?? null,
            'client_context' => $validated['client_context'] ?? null,
            'user_agent_hash' => $userAgent !== '' ? hash_hmac('sha256', $userAgent, $appKey) : null,
            'ip_hash' => $ipAddress !== '' ? hash_hmac('sha256', $ipAddress, $appKey) : null,
        ]);

        return back()->with('success', __('messages.feedback_received'));
    }
}
