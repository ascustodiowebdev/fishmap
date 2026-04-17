import { LanguageToggle } from '@/components/language-toggle';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Compass, Fish, Route } from 'lucide-react';

export default function Welcome() {
    const { auth, name } = usePage<SharedData>().props;
    const { t } = useTranslator();
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

    return (
        <>
            <Head title="Home">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,166,191,0.18),_transparent_40%),linear-gradient(180deg,_#f5fbfc_0%,_#eef6f7_100%)] text-slate-950">
                <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 lg:px-8">
                    <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
                        <div>
                            <p className="text-sm font-semibold tracking-[0.24em] text-teal-800 uppercase">Fishmap</p>
                            <p className="mt-1 text-sm text-slate-600">{t('welcome.tagline')}</p>
                        </div>

                        <nav className="flex items-center gap-3">
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

                    <main className="flex flex-1 flex-col justify-center py-12 lg:py-16">
                        <section className="grid gap-10 lg:items-end">
                            <div className="max-w-3xl">
                                <p className="mb-4 text-sm font-medium tracking-[0.24em] text-teal-800 uppercase">{t('welcome.project_badge')}</p>
                                <h1
                                    className="text-5xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-6xl"
                                    style={{ fontFamily: 'Manrope, sans-serif' }}
                                >
                                    {t('welcome.hero')}
                                </h1>
                                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                                    {t('welcome.hero_copy', { name })}
                                </p>

                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <Link
                                        href={auth.user ? route('dashboard') : route('register')}
                                        className="rounded-full bg-teal-800 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-700"
                                    >
                                        {auth.user ? t('welcome.go') : t('welcome.start')}
                                    </Link>
                                    <a
                                        href="#features"
                                        className="rounded-full border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                                    >
                                        {t('welcome.included')}
                                    </a>
                                </div>
                            </div>
                        </section>

                        <section id="features" className="mt-14 grid gap-4 md:grid-cols-3">
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
