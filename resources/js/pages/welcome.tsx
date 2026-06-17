import AppWordmark from '@/components/app-wordmark';
import { LanguageToggle } from '@/components/language-toggle';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Capacitor } from '@capacitor/core';
import { Head, Link, usePage } from '@inertiajs/react';
import { Compass, Fish, Route } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Welcome() {
    const { auth, name, appState } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const [showAndroidDownload, setShowAndroidDownload] = useState(false);
    const features = [
        {
            title: t('welcome.feature_1_title'),
            description: t('welcome.feature_1_copy'),
            icon: Fish,
        },
        {
            title: t('welcome.feature_2_title'),
            description: t('welcome.feature_2_copy'),
            icon: Compass,
        },
        {
            title: t('welcome.feature_3_title'),
            description: t('welcome.feature_3_copy'),
            icon: Route,
        },
    ];

    useEffect(() => {
        const userAgent = window.navigator.userAgent;
        const isNativeApp = Capacitor.isNativePlatform() || /\b(wv|Capacitor)\b/i.test(userAgent);
        const isAndroidBrowser = /Android/i.test(userAgent) && !isNativeApp;

        setShowAndroidDownload(isAndroidBrowser);
    }, []);

    return (
        <>
            <Head title="Home">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,166,191,0.18),_transparent_40%),linear-gradient(180deg,_#f5fbfc_0%,_#eef6f7_100%)] text-slate-950 dark:bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.14),_transparent_38%),linear-gradient(180deg,_#0f172a_0%,_#081217_100%)] dark:text-slate-50">
                <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                    <header className="pb-5">
                        <nav className="flex w-full items-center justify-end gap-3 lg:justify-center">
                            <LanguageToggle />
                            {!auth.user ? (
                                <>
                                    <Link
                                        href={route('login')}
                                        className="text-sm font-medium text-slate-700 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                                    >
                                        {t('welcome.login')}
                                    </Link>
                                    {appState.registrations_open ? (
                                        <Link
                                            href={route('register')}
                                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500"
                                        >
                                            {t('welcome.create_account')}
                                        </Link>
                                    ) : null}
                                </>
                            ) : (
                                <Link
                                    href={route('profile.edit')}
                                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500"
                                >
                                    {t('app.settings')}
                                </Link>
                            )}
                        </nav>
                        <div className="mt-7 flex justify-center sm:mt-8 lg:mt-10">
                            <AppWordmark className="h-[7.5rem] w-[225px] sm:h-[9.5rem] sm:w-[285px] lg:h-48 lg:w-[360px]" />
                        </div>
                    </header>

                    <main className="flex flex-1 flex-col justify-center py-8 sm:py-12 lg:py-14">
                        <section className="grid gap-10 text-center lg:items-end">
                            <div className="mx-auto max-w-3xl">
                                <p className="mb-4 text-sm font-medium tracking-[0.24em] text-teal-800 uppercase">{t('welcome.project_badge')}</p>
                                <h1
                                    className="text-4xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl dark:text-white"
                                    style={{ fontFamily: 'Manrope, sans-serif' }}
                                >
                                    {t('welcome.hero')}
                                </h1>
                                <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:mt-6 sm:text-lg dark:text-slate-300">
                                    {t('welcome.hero_copy', { name })}
                                </p>

                                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                                    <Link
                                        href={auth.user ? route('map') : route('login')}
                                        className="rounded-full bg-teal-800 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-700"
                                    >
                                        {auth.user ? t('welcome.go') : t('welcome.start')}
                                    </Link>
                                    {showAndroidDownload ? (
                                        <a
                                            href="/downloads/nautibite-android.apk"
                                            className="rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-50 dark:hover:border-slate-500"
                                        >
                                            {t('welcome.android_install_button')}
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                        </section>

                        <section id="features" className="mt-10 grid gap-4 sm:mt-12 md:mt-14 md:grid-cols-3">
                            {features.map((feature) => (
                                <article
                                    key={feature.title}
                                    className="rounded-[1.75rem] border border-slate-200/80 bg-white/80 p-5 text-left shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900/80"
                                >
                                    <feature.icon className="size-5 text-teal-800 dark:text-teal-300" />
                                    <h3 className="mt-5 text-lg font-semibold text-slate-950 dark:text-white">{feature.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{feature.description}</p>
                                </article>
                            ))}
                        </section>
                    </main>

                    <footer className="border-t border-slate-200/80 py-5 text-sm text-slate-600 dark:border-slate-800/80 dark:text-slate-300">
                        <Link href={route('privacy')} className="font-medium transition hover:text-slate-950 dark:hover:text-white">
                            {t('welcome.privacy')}
                        </Link>
                    </footer>
                </div>
            </div>
        </>
    );
}
