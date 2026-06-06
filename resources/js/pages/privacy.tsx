import { LanguageToggle } from '@/components/language-toggle';
import AppWordmark from '@/components/app-wordmark';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { AlertTriangle, Database, MapPinned, ShieldCheck } from 'lucide-react';

const content = {
    en: {
        title: 'Privacy, GPS data, and navigation safety',
        updated: 'Last updated: 6 June 2026',
        intro:
            'Fishmap is a fishing logbook and navigation aid. It can help you record fish spots, routes, and live GPS guidance, but it is not an official nautical chart, certified navigation system, rescue service, or substitute for safe seamanship.',
        back: 'Back to Fishmap',
        sections: [
            {
                icon: ShieldCheck,
                title: 'Privacy and account data',
                body: [
                    'When you create or use an account, Fishmap may store your name, email address, authentication data, app preferences, and saved content such as fish spots, notes, photos or photo links, route names, privacy settings, and timestamps.',
                    'Private spots and private routes are intended to be visible only to your account. Public spots or public routes may be visible to other Fishmap users, including their names, coordinates, timestamps, and any details you choose to publish.',
                ],
            },
            {
                icon: MapPinned,
                title: 'GPS, route recording, and background location',
                body: [
                    'If you enable location, Fishmap uses GPS or device location services to show your current position, speed, heading, maximum speed, and route guidance. When you record a route, Fishmap stores route points with latitude, longitude, and time.',
                    'If the app is allowed to keep tracking while the screen is locked, location updates may continue in the background so an active recording or navigation session can keep working. You can stop route recording or navigation from inside the app, and you can revoke location permissions in your device settings.',
                    'Some consent and display preferences may be stored locally on your device or browser, for example whether you have accepted this safety notice.',
                ],
            },
            {
                icon: Database,
                title: 'Marine conditions and external data',
                body: [
                    'Fishmap may request weather, wind, tide, and map data from external providers. These services may receive approximate coordinates, request metadata, IP address, or other technical information required to return the data.',
                    'Tide, wind, depth, map, and routing information can be delayed, incomplete, unavailable, or inaccurate. Treat them as general guidance only.',
                ],
            },
            {
                icon: AlertTriangle,
                title: 'Navigation safety and limitation of responsibility',
                body: [
                    'Always look around you, monitor sea state, weather, traffic, depth, hazards, local rules, and official navigation information. Use official nautical charts, instruments, local notices, and your own judgment.',
                    'GPS can drift, freeze, lose signal, report delayed positions, or display incorrect speed or heading. Saved routes may not reflect current hazards, tides, obstacles, restricted areas, or safe water depth.',
                    'By using Fishmap, you accept that navigation decisions remain your responsibility. Fishmap and its operators are not responsible for accidents, groundings, collisions, loss of equipment, personal injury, data loss, missed catches, fines, damages, or other losses resulting from use of the app or reliance on its information.',
                    'In an emergency, use official emergency channels and equipment. Do not rely on Fishmap as an emergency or rescue service.',
                ],
            },
        ],
    },
    pt: {
        title: 'Privacidade, dados GPS e segurança na navegação',
        updated: 'Última atualização: 6 de junho de 2026',
        intro:
            'O Fishmap é um diário de pesca e uma ajuda à navegação. Pode ajudar-te a guardar fish spots, rotas e guidance GPS em direto, mas não é uma carta náutica oficial, sistema certificado de navegação, serviço de emergência, nem substitui uma navegação prudente.',
        back: 'Voltar ao Fishmap',
        sections: [
            {
                icon: ShieldCheck,
                title: 'Privacidade e dados da conta',
                body: [
                    'Quando crias ou usas uma conta, o Fishmap pode guardar o teu nome, email, dados de autenticação, preferências da app e conteúdo guardado, incluindo fish spots, notas, fotos ou links de fotos, nomes de rotas, definições de privacidade e datas/horas.',
                    'Fish spots e rotas privadas destinam-se a ficar visíveis apenas na tua conta. Fish spots ou rotas públicas podem ficar visíveis para outros utilizadores do Fishmap, incluindo nomes, coordenadas, datas/horas e detalhes que escolhas publicar.',
                ],
            },
            {
                icon: MapPinned,
                title: 'GPS, gravação de rotas e localização em background',
                body: [
                    'Se ativares a localização, o Fishmap usa GPS ou os serviços de localização do dispositivo para mostrar posição atual, velocidade, rumo, velocidade máxima e guidance de rota. Quando gravas uma rota, o Fishmap guarda pontos de rota com latitude, longitude e hora.',
                    'Se a app tiver permissão para continuar a seguir a localização com o ecrã bloqueado, os updates podem continuar em background para manter uma gravação ou navegação ativa. Podes parar a gravação ou navegação dentro da app e podes retirar permissões de localização nas definições do dispositivo.',
                    'Algumas preferências e consentimentos podem ser guardados localmente no dispositivo ou browser, por exemplo se já aceitaste este aviso de segurança.',
                ],
            },
            {
                icon: Database,
                title: 'Condições marítimas e dados externos',
                body: [
                    'O Fishmap pode pedir dados de meteorologia, vento, marés e mapas a fornecedores externos. Esses serviços podem receber coordenadas aproximadas, metadados do pedido, endereço IP ou outra informação técnica necessária para devolver os dados.',
                    'Informação de marés, vento, profundidade, mapas e rotas pode estar atrasada, incompleta, indisponível ou errada. Usa-a apenas como orientação geral.',
                ],
            },
            {
                icon: AlertTriangle,
                title: 'Segurança na navegação e limitação de responsabilidade',
                body: [
                    'Deves olhar sempre para o que te rodeia, acompanhar estado do mar, meteorologia, tráfego, profundidade, obstáculos, regras locais e informação oficial de navegação. Usa cartas náuticas oficiais, instrumentos, avisos locais e o teu próprio julgamento.',
                    'O GPS pode ter deriva, bloquear, perder sinal, dar posição atrasada ou mostrar velocidade/rumo incorretos. Rotas guardadas podem não refletir perigos atuais, marés, obstáculos, zonas restritas ou profundidade segura.',
                    'Ao usar o Fishmap, aceitas que as decisões de navegação são da tua responsabilidade. O Fishmap e os seus responsáveis não se responsabilizam por acidentes, encalhes, colisões, perda de equipamento, ferimentos, perda de dados, capturas perdidas, multas, danos ou outros prejuízos resultantes do uso da app ou da confiança na informação apresentada.',
                    'Em emergência, usa canais e equipamentos oficiais de emergência. Não uses o Fishmap como serviço de emergência ou salvamento.',
                ],
            },
        ],
    },
};

export default function Privacy() {
    const { auth } = usePage<SharedData>().props;
    const { locale } = useTranslator();
    const page = content[locale];

    return (
        <>
            <Head title={page.title}>
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-[#f5fbfc] text-slate-950">
                <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
                    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
                        <Link href={route('home')} className="max-w-[220px]">
                            <AppWordmark className="h-11 w-[190px]" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <LanguageToggle />
                            <Link
                                href={auth.user ? route('map') : route('home')}
                                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
                            >
                                {page.back}
                            </Link>
                        </div>
                    </header>

                    <main className="py-8 sm:py-12">
                        <p className="text-sm font-semibold tracking-[0.18em] text-teal-800 uppercase">{page.updated}</p>
                        <h1 className="mt-4 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-5xl">{page.title}</h1>
                        <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">{page.intro}</p>

                        <div className="mt-10 grid gap-5">
                            {page.sections.map((section) => (
                                <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-xl bg-teal-50 p-2 text-teal-800">
                                            <section.icon className="size-5" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-semibold text-slate-950">{section.title}</h2>
                                            <div className="mt-3 grid gap-3 text-sm leading-7 text-slate-600 sm:text-base">
                                                {section.body.map((paragraph) => (
                                                    <p key={paragraph}>{paragraph}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
