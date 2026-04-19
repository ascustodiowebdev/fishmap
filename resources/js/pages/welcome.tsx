import { LanguageToggle } from '@/components/language-toggle';
import AppWordmark from '@/components/app-wordmark';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Compass, Fish, Route } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Welcome() {
    const { auth, name } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const [showMobileFeatures, setShowMobileFeatures] = useState(false);
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
        const onResize = () => {
            if (window.innerWidth >= 640) {
                setShowMobileFeatures(true);
            } else {
                setShowMobileFeatures(false);
            }
        };

        onResize();
        window.addEventListener('resize', onResize);

        return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
        <>
            <Head title="Home">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,166,191,0.18),_transparent_40%),linear-gradient(180deg,_#f5fbfc_0%,_#eef6f7_100%)] text-slate-950">
                <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                    <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="max-w-xs sm:max-w-sm">
                            <AppWordmark className="h-11 w-[190px] sm:h-13 sm:w-[230px]" />
                            <p className="mt-1 text-sm text-slate-600">{t('welcome.tagline')}</p>
                        </div>

                        <nav className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                            <LanguageToggle />
                            {!auth.user ? (
                                <>
                                    <Link href={route('login')} className="text-sm font-medium text-slate-700 transition hover:text-slate-950">
                                        {t('welcome.login')}
                                    </Link>
                                    <Link
                                        href={route('register')}
                                        className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:border-slate-400"
                                    >
                                        {t('welcome.create_account')}
                                    </Link>
                                </>
                            ) : (
                                <Link
                                    href={route('profile.edit')}
                                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:border-slate-400"
                                >
                                    {t('app.settings')}
                                </Link>
                            )}
                        </nav>
                    </header>

                    <main className="flex flex-1 flex-col justify-center py-10 sm:py-12 lg:py-16">
                        <section className="grid gap-10 lg:items-end">
                            <div className="max-w-3xl">
                                <p className="mb-4 text-sm font-medium tracking-[0.24em] text-teal-800 uppercase">{t('welcome.project_badge')}</p>
                                <h1
                                    className="text-4xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl"
                                    style={{ fontFamily: 'Manrope, sans-serif' }}
                                >
                                    {t('welcome.hero')}
                                </h1>
                                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:mt-6 sm:text-lg">
                                    {t('welcome.hero_copy', { name })}
                                </p>

                                <div className="mt-8 flex flex-col items-center gap-3 sm:items-start sm:flex-row">
                                    <Link
                                        href={auth.user ? route('map') : route('register')}
                                        className="rounded-full bg-teal-800 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-700"
                                    >
                                        {auth.user ? t('welcome.go') : t('welcome.start')}
                                    </Link>
                                    <a
                                        href="#features"
                                        onClick={(event) => {
                                            if (window.innerWidth < 640) {
                                                event.preventDefault();
                                                setShowMobileFeatures((current) => !current);
                                            }
                                        }}
                                        className="rounded-full border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 sm:hidden"
                                    >
                                        {t('welcome.included')}
                                    </a>
                                </div>
                            </div>
                        </section>

                        <section id="features" className={`${showMobileFeatures ? 'grid' : 'hidden'} mt-12 gap-4 md:mt-14 md:grid md:grid-cols-3`}>
                            {features.map((feature) => (
                                <article key={feature.title} className="rounded-[1.75rem] border border-slate-200/80 bg-white/80 p-6 shadow-sm">
                                    <feature.icon className="size-5 text-teal-800" />
                                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{feature.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                                </article>
                            ))}
                        </section>
                    </main>
                </div>
            </div>
        </>
    );
}
