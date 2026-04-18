import { LanguageToggle } from '@/components/language-toggle';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Fish, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function randomPosition() {
    return {
        x: 12 + Math.random() * 70,
        y: 18 + Math.random() * 58,
        rotate: -12 + Math.random() * 24,
    };
}

export default function MaintenancePage() {
    const { auth } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const [score, setScore] = useState(0);
    const [fishPosition, setFishPosition] = useState(() => randomPosition());
    const [timeLeft, setTimeLeft] = useState(20);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        if (!isPlaying || timeLeft <= 0) {
            return;
        }

        const timer = window.setTimeout(() => {
            setTimeLeft((current) => current - 1);
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [isPlaying, timeLeft]);

    useEffect(() => {
        if (!isPlaying || timeLeft <= 0) {
            return;
        }

        const mover = window.setInterval(() => {
            setFishPosition(randomPosition());
        }, 850);

        return () => window.clearInterval(mover);
    }, [isPlaying, timeLeft]);

    const gameLabel = useMemo(() => {
        if (timeLeft <= 0) {
            return t('maintenance.final_score', { score });
        }

        if (!isPlaying) {
            return t('maintenance.game_idle');
        }

        return t('maintenance.game_live', { score, timeLeft });
    }, [isPlaying, score, t, timeLeft]);

    const startGame = () => {
        setScore(0);
        setTimeLeft(20);
        setFishPosition(randomPosition());
        setIsPlaying(true);
    };

    const hitFish = () => {
        if (!isPlaying || timeLeft <= 0) {
            return;
        }

        setScore((current) => current + 1);
        setFishPosition(randomPosition());
    };

    return (
        <>
            <Head title={t('maintenance.title')}>
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,166,191,0.2),_transparent_35%),linear-gradient(180deg,_#071218_0%,_#0b1820_45%,_#10212c_100%)] text-slate-50">
                <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                    <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="max-w-sm">
                            <p className="text-sm font-semibold tracking-[0.24em] text-teal-300 uppercase">Fishmap</p>
                            <p className="mt-1 text-sm text-slate-300">{t('maintenance.tagline')}</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <LanguageToggle />
                            {auth.user?.is_admin ? (
                                <Link
                                    href={route('map')}
                                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                                >
                                    {t('maintenance.enter_admin')}
                                </Link>
                            ) : (
                                <Link
                                    href={route('home')}
                                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                                >
                                    {t('maintenance.back_home')}
                                </Link>
                            )}
                        </div>
                    </header>

                    <main className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <section className="max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-400/10 px-4 py-2 text-sm text-teal-100">
                                <Wrench className="h-4 w-4" />
                                {t('maintenance.badge')}
                            </div>

                            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: 'Manrope, sans-serif' }}>
                                {t('maintenance.heading')}
                            </h1>

                            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">{t('maintenance.copy')}</p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <Button type="button" className="rounded-full bg-teal-500 px-5 py-3 text-slate-950 hover:bg-teal-400" onClick={startGame}>
                                    {timeLeft <= 0 ? t('maintenance.play_again') : isPlaying ? t('maintenance.restart_game') : t('maintenance.play_game')}
                                </Button>
                                <Link
                                    href={route('home')}
                                    className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/5"
                                >
                                    {t('maintenance.return_home')}
                                </Link>
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur sm:p-6">
                            <div className="rounded-[1.5rem] bg-[#0a1720] p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-[0.24em] text-teal-300 uppercase">{t('maintenance.game_title')}</p>
                                        <p className="mt-1 text-sm text-slate-300">{gameLabel}</p>
                                    </div>
                                    <div className="rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-white">{t('maintenance.points', { score })}</div>
                                </div>

                                <div className="relative mt-5 h-[340px] overflow-hidden rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(71,166,191,0.18),_transparent_30%),linear-gradient(180deg,_#9ad1e3_0%,_#7fb8cf_40%,_#4f95b2_100%)]">
                                    <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,_rgba(255,255,255,0),_rgba(9,44,57,0.35)_65%,_rgba(7,31,42,0.75)_100%)]" />

                                    <button
                                        type="button"
                                        onClick={hitFish}
                                        className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-[0_12px_30px_rgba(5,150,105,0.35)] transition hover:scale-105"
                                        style={{
                                            left: `${fishPosition.x}%`,
                                            top: `${fishPosition.y}%`,
                                            transform: `translate(-50%, -50%) rotate(${fishPosition.rotate}deg)`,
                                        }}
                                    >
                                        <Fish className="h-7 w-7" />
                                    </button>
                                </div>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </>
    );
}
