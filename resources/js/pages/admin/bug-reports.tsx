import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Bug, CheckCircle2, MessageSquare, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AdminBugReport {
    id: number;
    category: string;
    subject: string;
    message: string;
    status: 'open' | 'reviewing' | 'fixed' | 'closed';
    admin_response: string | null;
    admin_responded_at: string | null;
    client_platform: string | null;
    client_context: string | null;
    created_at: string;
    updated_at: string;
    user: {
        id: number | null;
        name: string | null;
        email: string | null;
    };
    admin_responder: {
        id: number | null;
        name: string | null;
        email: string | null;
    };
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    from: number | null;
    last_page: number;
    links: PaginationLink[];
    to: number | null;
    total: number;
}

interface BugReportsPageProps extends SharedData {
    bugReports: Paginated<AdminBugReport>;
    stats: {
        total: number;
        open: number;
        fixed: number;
    };
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return 'Not set';
    }

    return new Date(value).toLocaleString();
}

function paginationLabel(label: string) {
    return label.replace('&laquo;', 'Previous').replace('&raquo;', 'Next').trim();
}

function PaginationControls<T>({ pagination }: { pagination: Paginated<T> }) {
    if (pagination.last_page <= 1) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mr-auto text-sm text-slate-500 dark:text-slate-400">
                Page {pagination.current_page} of {pagination.last_page}
            </p>
            {pagination.links.map((link, index) => (
                <Button
                    key={`${link.label}-${index}`}
                    type="button"
                    variant={link.active ? 'default' : 'outline'}
                    disabled={!link.url}
                    onClick={() => {
                        if (link.url) {
                            router.visit(link.url, {
                                preserveScroll: true,
                                preserveState: true,
                            });
                        }
                    }}
                >
                    {paginationLabel(link.label)}
                </Button>
            ))}
        </div>
    );
}

function statusVariant(status: AdminBugReport['status']) {
    if (status === 'fixed') {
        return 'default';
    }

    if (status === 'closed') {
        return 'secondary';
    }

    return 'destructive';
}

function StatCard({ title, value, copy, icon: Icon }: { title: string; value: number; copy: string; icon: typeof Bug }) {
    return (
        <Card className="border-slate-200/70 dark:border-slate-800">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardDescription>{title}</CardDescription>
                    <Icon className="h-4 w-4 text-slate-500" />
                </div>
                <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-slate-500 dark:text-slate-400">{copy}</p>
            </CardContent>
        </Card>
    );
}

export default function AdminBugReports() {
    const { props } = usePage<BugReportsPageProps>();
    const { bugReports, stats, flash } = props;
    const [forms, setForms] = useState<Record<number, { status: AdminBugReport['status']; admin_response: string }>>({});

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Admin',
            href: '/admin',
        },
        {
            title: 'Bug reports',
            href: '/admin/bug-reports',
        },
    ];

    useEffect(() => {
        setForms(
            bugReports.data.reduce<Record<number, { status: AdminBugReport['status']; admin_response: string }>>((nextForms, report) => {
                nextForms[report.id] = {
                    status: report.status,
                    admin_response: report.admin_response ?? '',
                };

                return nextForms;
            }, {}),
        );
    }, [bugReports.data]);

    const updateForm = (reportId: number, patch: Partial<{ status: AdminBugReport['status']; admin_response: string }>) => {
        setForms((current) => ({
            ...current,
            [reportId]: {
                status: current[reportId]?.status ?? 'open',
                admin_response: current[reportId]?.admin_response ?? '',
                ...patch,
            },
        }));
    };

    const saveReport = (report: AdminBugReport) => {
        const form = forms[report.id] ?? {
            status: report.status,
            admin_response: report.admin_response ?? '',
        };

        router.patch(route('admin.bug-reports.update', report.id), form, {
            preserveScroll: true,
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bug reports" />

            <div className="space-y-6 px-4 py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <Heading title="Bug reports" description="Review early user reports and send short responses back to the app." />
                    <Button asChild variant="outline">
                        <Link href={route('admin.index')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to admin
                        </Link>
                    </Button>
                </div>

                {(flash.success || flash.error) && (
                    <Card className={flash.error ? 'border-red-300/70 dark:border-red-900' : 'border-emerald-300/70 dark:border-emerald-900'}>
                        <CardContent className="pt-6">
                            <p className={flash.error ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                                {flash.error ?? flash.success}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard title="Open" value={stats.open} icon={Bug} copy="Open or currently being reviewed." />
                    <StatCard title="Fixed" value={stats.fixed} icon={CheckCircle2} copy="Marked as fixed by admin." />
                    <StatCard title="Total" value={stats.total} icon={MessageSquare} copy="All reports submitted by users." />
                </div>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Bug className="h-5 w-5" />
                            Reports
                        </CardTitle>
                        <CardDescription>
                            Showing {bugReports.from ?? 0}-{bugReports.to ?? 0} of {bugReports.total} report(s).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {bugReports.data.length === 0 ? (
                            <p className="rounded-2xl border border-slate-200/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                                No bug reports yet.
                            </p>
                        ) : null}

                        {bugReports.data.map((report) => {
                            const form = forms[report.id] ?? {
                                status: report.status,
                                admin_response: report.admin_response ?? '',
                            };

                            return (
                                <div key={report.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{report.subject}</h3>
                                                <Badge variant={statusVariant(report.status)}>{report.status}</Badge>
                                                <Badge variant="secondary">{report.category}</Badge>
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                                From {report.user.name ?? 'Unknown'} / {report.user.email ?? 'No email'} /{' '}
                                                {formatDate(report.created_at)}
                                            </p>
                                            <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                {report.message}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                                Context: {report.client_platform ?? 'unknown'} / {report.client_context ?? 'no client context'}
                                            </p>
                                            {report.admin_response ? (
                                                <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100">
                                                    Current response: {report.admin_response}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
                                        <label className="grid gap-2 text-sm">
                                            <span className="font-medium text-slate-700 dark:text-slate-200">Status</span>
                                            <select
                                                value={form.status}
                                                onChange={(event) =>
                                                    updateForm(report.id, { status: event.target.value as AdminBugReport['status'] })
                                                }
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                            >
                                                <option value="open">Open</option>
                                                <option value="reviewing">Reviewing</option>
                                                <option value="fixed">Fixed</option>
                                                <option value="closed">Closed</option>
                                            </select>
                                        </label>
                                        <label className="grid gap-2 text-sm">
                                            <span className="font-medium text-slate-700 dark:text-slate-200">Response visible to user</span>
                                            <textarea
                                                value={form.admin_response}
                                                onChange={(event) => updateForm(report.id, { admin_response: event.target.value })}
                                                className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                                placeholder="Write a short response or workaround."
                                                maxLength={5000}
                                            />
                                        </label>
                                        <Button type="button" onClick={() => saveReport(report)}>
                                            <Wrench className="mr-2 h-4 w-4" />
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}

                        <PaginationControls pagination={bugReports} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
