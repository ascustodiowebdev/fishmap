import { Head, useForm, usePage } from '@inertiajs/react';
import { Capacitor } from '@capacitor/core';
import { LoaderCircle } from 'lucide-react';
import { FormEventHandler } from 'react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/auth-layout';
import { useTranslator } from '@/lib/i18n';
import { type SharedData } from '@/types';

interface LoginForm {
    email: string;
    password: string;
    remember: boolean;
}

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
}

export default function Login({ status, canResetPassword }: LoginProps) {
    const { t } = useTranslator();
    const { appState, flash } = usePage<SharedData>().props;
    const { data, setData, post, processing, errors, reset } = useForm<LoginForm>({
        email: '',
        password: '',
        remember: false,
    });
    const googleAuthUrl = Capacitor.isNativePlatform()
        ? route('auth.google.redirect', { mobile: 1 })
        : route('auth.google.redirect');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthLayout title={t('auth.login_title')} description={t('auth.login_copy')}>
            <Head title={t('auth.login')} />

            <form className="flex flex-col gap-6" onSubmit={submit}>
                <div className="grid gap-6">
                    <a
                        href={googleAuthUrl}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
                            <path
                                fill="#EA4335"
                                d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3 14.6 2 12 2 6.9 2 2.8 6.3 2.8 11.5S6.9 21 12 21c6.9 0 9.2-4.8 9.2-7.2 0-.5 0-.9-.1-1.3H12z"
                            />
                        </svg>
                        {t('auth.continue_google')}
                    </a>

                    <div className="relative text-center text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span className="bg-background relative z-10 px-2">{t('auth.or')}</span>
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200 dark:bg-slate-700" />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="email">{t('auth.email')}</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            autoFocus
                            tabIndex={1}
                            autoComplete="email"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            placeholder={t('auth.email_placeholder')}
                        />
                        <InputError message={errors.email} />
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center">
                            <Label htmlFor="password">{t('auth.password')}</Label>
                            {canResetPassword && (
                                <TextLink href={route('password.request')} className="ml-auto text-sm" tabIndex={5}>
                                    {t('auth.forgot')}
                                </TextLink>
                            )}
                        </div>
                        <Input
                            id="password"
                            type="password"
                            required
                            tabIndex={2}
                            autoComplete="current-password"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder={t('auth.password')}
                        />
                        <InputError message={errors.password} />
                    </div>

                    <div className="flex items-center space-x-3">
                        <Checkbox id="remember" name="remember" tabIndex={3} />
                        <Label htmlFor="remember">{t('auth.remember')}</Label>
                    </div>

                    <Button type="submit" className="mt-4 w-full" tabIndex={4} disabled={processing}>
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {t('auth.login')}
                    </Button>
                </div>

                {appState.registrations_open ? (
                    <div className="text-muted-foreground text-center text-sm">
                        {t('auth.no_account')}{' '}
                        <TextLink href={route('register')} tabIndex={5}>
                            {t('auth.sign_up')}
                        </TextLink>
                    </div>
                ) : null}
            </form>

            {status && <div className="mb-4 text-center text-sm font-medium text-green-600">{status}</div>}
            {flash.error && <div className="mb-4 text-center text-sm font-medium text-rose-600">{flash.error}</div>}
        </AuthLayout>
    );
}
