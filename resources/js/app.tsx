import '../css/app.css';
import 'leaflet/dist/leaflet.css';

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { route as routeFn } from 'ziggy-js';
import { initializeTheme } from './hooks/use-appearance';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        function MobileAuthBridge() {
            useEffect(() => {
                const isNativeApp =
                    Capacitor.isNativePlatform() ||
                    (typeof navigator !== 'undefined' && /\b(wv|Capacitor)\b/i.test(navigator.userAgent));

                if (!isNativeApp) {
                    return;
                }

                const handleUrl = (rawUrl: string) => {
                    try {
                        const url = new URL(rawUrl);

                        if (url.protocol !== 'com.ascustodiowebdev.fishmap:') {
                            return;
                        }

                        const host = url.hostname.toLowerCase();
                        const path = url.pathname.replace(/\/+$/, '');
                        const isGoogleCallback =
                            (host === 'auth' && (path === '/google' || path === '')) ||
                            (host === 'google' && (path === '' || path === '/'));

                        if (!isGoogleCallback) {
                            return;
                        }

                        const token = url.searchParams.get('token');

                        if (!token) {
                            return;
                        }

                        const storageKey = 'fishmap_mobile_auth_token';
                        const consumedToken = window.sessionStorage.getItem(storageKey);

                        if (consumedToken === token) {
                            return;
                        }

                        window.sessionStorage.setItem(storageKey, token);

                        const consumeUrl = `/auth/google/mobile-consume?token=${encodeURIComponent(token)}`;
                        window.location.assign(consumeUrl);
                    } catch {
                        // Ignore malformed deep-links.
                    }
                };

                const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
                    handleUrl(url);
                });

                void CapacitorApp.getLaunchUrl().then((launch) => {
                    if (launch?.url) {
                        handleUrl(launch.url);
                    }
                });

                return () => {
                    void listenerPromise.then((listener) => listener.remove());
                };
            }, []);

            return null;
        }

        root.render(
            <>
                <MobileAuthBridge />
                <App {...props} />
            </>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
