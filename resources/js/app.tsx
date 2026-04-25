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
                if (!Capacitor.isNativePlatform()) {
                    return;
                }

                const handleUrl = (rawUrl: string) => {
                    try {
                        const url = new URL(rawUrl);

                        if (url.protocol !== 'com.ascustodiowebdev.fishmap:' || url.hostname !== 'auth' || url.pathname !== '/google') {
                            return;
                        }

                        const token = url.searchParams.get('token');

                        if (!token) {
                            return;
                        }

                        window.location.assign(`/auth/google/mobile-consume?token=${encodeURIComponent(token)}`);
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
