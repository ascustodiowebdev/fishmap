import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Compass, Fish, Route } from 'lucide-react';

const features = [
    {
        title: 'Log every catch',
        description: 'Save species, bait, size, photos, and notes from each good spot.',
        icon: Fish,
    },
    {
        title: 'Mark useful water',
        description: 'Keep promising coordinates private now, then share the best ones later.',
        icon: Compass,
    },
    {
        title: 'Track routes next',
        description: 'The project is ready for route recording with OpenStreetMap and GPS.',
        icon: Route,
    },
];

export default function Welcome() {
    const { auth, name } = usePage<SharedData>().props;

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
                            <p className="mt-1 text-sm text-slate-600">A simple fishing log built for the phone first.</p>
                        </div>

                        <nav className="flex items-center gap-3">
                            {auth.user ? (
                                <Link
                                    href={route('dashboard')}
                                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                                >
                                    Open dashboard
                                </Link>
                            ) : (
                                <>
                                    <Link href={route('login')} className="text-sm font-medium text-slate-700 transition hover:text-slate-950">
                                        Log in
                                    </Link>
                                    <Link
                                        href={route('register')}
                                        className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:border-slate-400"
                                    >
                                        Create account
                                    </Link>
                                </>
                            )}
                        </nav>
                    </header>

                    <main className="flex flex-1 flex-col justify-center py-12 lg:py-16">
                        <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                            <div className="max-w-3xl">
                                <p className="mb-4 text-sm font-medium tracking-[0.24em] text-teal-800 uppercase">Personal project, portfolio-ready structure</p>
                                <h1
                                    className="text-5xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-6xl"
                                    style={{ fontFamily: 'Manrope, sans-serif' }}
                                >
                                    Save the spots, bait, and fish that matter.
                                </h1>
                                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                                    {name} starts as your private sea logbook: clean catch notes, calm visuals, and a clear path toward route tracking
                                    on OpenStreetMap.
                                </p>

                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <Link
                                        href={auth.user ? route('dashboard') : route('register')}
                                        className="rounded-full bg-teal-800 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-700"
                                    >
                                        {auth.user ? 'Go to Fishmap' : 'Start Fishmap'}
                                    </Link>
                                    <a
                                        href="#features"
                                        className="rounded-full border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                                    >
                                        See what is included
                                    </a>
                                </div>
                            </div>

                            <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
                                <div className="rounded-[1.5rem] bg-slate-950 p-5 text-slate-50">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-xs tracking-[0.22em] text-teal-200 uppercase">First version</p>
                                            <h2 className="mt-2 text-2xl font-semibold">Minimal and useful</h2>
                                        </div>
                                        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">v0.1</div>
                                    </div>

                                    <div className="mt-8 grid gap-3 text-sm">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                            <p className="text-slate-400">Ready now</p>
                                            <p className="mt-1 font-medium text-white">Auth, catch logging, clean dashboard</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                            <p className="text-slate-400">Next build</p>
                                            <p className="mt-1 font-medium text-white">Map pins, route recording, photo uploads</p>
                                        </div>
                                    </div>
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
