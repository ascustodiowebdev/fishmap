import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type CatchLog, type NavigationRoute, type NavigationRoutePoint, type SharedData, type User } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Bug, Crown, Fish, KeyRound, Route, Trash2, Users, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface AdminUser extends User {
    catch_logs_count: number;
    navigation_routes_count: number;
}

interface AdminCatchLog extends CatchLog {
    user: {
        id: number | null;
        name: string | null;
        email: string | null;
    };
    updated_at: string;
}

interface AdminNavigationRoute extends NavigationRoute {
    start_latitude: string | null;
    start_longitude: string | null;
    end_latitude: string | null;
    end_longitude: string | null;
    updated_at: string;
    user: {
        id: number | null;
        name: string | null;
        email: string | null;
    };
    points_preview_count: number;
    points: NavigationRoutePoint[];
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
    per_page: number;
    to: number | null;
    total: number;
}

interface AdminPageProps extends SharedData {
    maintenanceMode: boolean;
    registrationsOpen: boolean;
    perPage: number;
    proSettings: {
        monthly_price_eur: string;
        annual_price_eur: string;
        lifetime_price_eur: string;
        free_spot_limit: string;
        free_route_limit: string;
        free_satellite_hours_monthly: string;
    };
    users: Paginated<AdminUser>;
    catchLogs: Paginated<AdminCatchLog>;
    navigationRoutes: Paginated<AdminNavigationRoute>;
    stats: {
        users: number;
        catches: number;
        routes: number;
        bug_reports: number;
        open_bug_reports: number;
    };
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return 'Not set';
    }

    return new Date(value).toLocaleString();
}

function formatProStatus(user: AdminUser) {
    if (user.is_admin) {
        return 'Admin includes Pro';
    }

    if (user.pro_lifetime) {
        return 'Lifetime Pro';
    }

    if (user.is_pro && user.pro_expires_at) {
        return `Pro until ${formatDate(user.pro_expires_at)}`;
    }

    return 'Free account';
}

function StatCard({ title, value, icon: Icon, copy }: { title: string; value: string | number; icon: LucideIcon; copy: string }) {
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

export default function AdminIndex() {
    const { props } = usePage<AdminPageProps>();
    const { maintenanceMode, registrationsOpen, perPage, proSettings, users, catchLogs, navigationRoutes, stats, flash } = props;

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Admin',
            href: '/admin',
        },
    ];
    const [selectedCatchIds, setSelectedCatchIds] = useState<number[]>([]);
    const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);
    const [proSettingsForm, setProSettingsForm] = useState(proSettings);
    const allCatchIds = useMemo(() => catchLogs.data.map((item) => item.id), [catchLogs.data]);
    const allRouteIds = useMemo(() => navigationRoutes.data.map((item) => item.id), [navigationRoutes.data]);

    useEffect(() => {
        setProSettingsForm(proSettings);
    }, [proSettings]);

    const toggleMaintenance = () => {
        router.patch(
            route('admin.maintenance.update'),
            {
                enabled: !maintenanceMode,
            },
            {
                preserveScroll: true,
            },
        );
    };

    const toggleRegistrations = () => {
        router.patch(
            route('admin.registrations.update'),
            {
                enabled: !registrationsOpen,
            },
            {
                preserveScroll: true,
            },
        );
    };

    const saveProSettings = () => {
        router.patch(route('admin.pro-settings.update'), proSettingsForm, {
            preserveScroll: true,
        });
    };

    const updateUserPro = (user: AdminUser, mode: 'revoke' | 'month' | 'year' | 'lifetime') => {
        router.patch(
            route('admin.users.pro.update', user.id),
            { mode },
            {
                preserveScroll: true,
            },
        );
    };

    const sendPasswordReset = (user: AdminUser) => {
        if (!window.confirm(`Send a password reset link to ${user.email}?`)) {
            return;
        }

        router.post(
            route('admin.users.password-reset', user.id),
            {},
            {
                preserveScroll: true,
            },
        );
    };

    const deleteUser = (user: AdminUser) => {
        if (!window.confirm(`Delete user ${user.email} and all their pins and routes?`)) {
            return;
        }

        router.delete(route('admin.users.destroy', user.id), {
            preserveScroll: true,
        });
    };

    const deleteCatch = (catchLog: AdminCatchLog) => {
        if (!window.confirm(`Delete ${catchLog.species} from ${catchLog.user.name ?? 'this user'}?`)) {
            return;
        }

        router.delete(route('admin.catch-logs.destroy', catchLog.id), {
            preserveScroll: true,
        });
    };

    const deleteRoute = (navigationRoute: AdminNavigationRoute) => {
        if (!window.confirm(`Delete route "${navigationRoute.name}" from ${navigationRoute.user.name ?? 'this user'}?`)) {
            return;
        }

        router.delete(route('admin.navigation-routes.destroy', navigationRoute.id), {
            preserveScroll: true,
        });
    };

    const toggleCatchSelection = (id: number, checked: boolean) => {
        setSelectedCatchIds((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)));
    };

    const toggleRouteSelection = (id: number, checked: boolean) => {
        setSelectedRouteIds((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)));
    };

    const bulkDeleteCatches = () => {
        if (selectedCatchIds.length === 0) {
            return;
        }

        if (!window.confirm(`Delete ${selectedCatchIds.length} selected catch pin(s)?`)) {
            return;
        }

        router.delete(route('admin.catch-logs.bulk-destroy'), {
            preserveScroll: true,
            data: {
                ids: selectedCatchIds,
            },
            onSuccess: () => setSelectedCatchIds([]),
        });
    };

    const bulkDeleteRoutes = () => {
        if (selectedRouteIds.length === 0) {
            return;
        }

        if (!window.confirm(`Delete ${selectedRouteIds.length} selected route(s)?`)) {
            return;
        }

        router.delete(route('admin.navigation-routes.bulk-destroy'), {
            preserveScroll: true,
            data: {
                ids: selectedRouteIds,
            },
            onSuccess: () => setSelectedRouteIds([]),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Admin" />

            <div className="space-y-6 px-4 py-6">
                <Heading title="Admin panel" description="Manage maintenance mode, review all users, and moderate all catch pins and saved routes." />

                {(flash.success || flash.error) && (
                    <Card className={flash.error ? 'border-red-300/70 dark:border-red-900' : 'border-emerald-300/70 dark:border-emerald-900'}>
                        <CardContent className="pt-6">
                            <p className={flash.error ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                                {flash.error ?? flash.success}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard title="Users" value={stats.users} icon={Users} copy="Every account, excluding passwords." />
                    <StatCard title="Catch pins" value={stats.catches} icon={Fish} copy="All user-created fish spots are visible here." />
                    <StatCard title="Routes" value={stats.routes} icon={Route} copy="Review saved navigation routes and points." />
                    <StatCard title="Bug reports" value={stats.open_bug_reports} icon={Bug} copy={`${stats.bug_reports} total report(s).`} />
                </div>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Bug className="h-5 w-5" />
                                Bug reports
                            </CardTitle>
                            <CardDescription>Open the dedicated queue for early user bug reports and admin replies.</CardDescription>
                        </div>
                        <Button type="button" onClick={() => router.visit(route('admin.bug-reports.index'))}>
                            Open reports
                        </Button>
                    </CardHeader>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-slate-200/70 dark:border-slate-800">
                        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    <Wrench className="h-5 w-5" />
                                    Maintenance mode
                                </CardTitle>
                                <CardDescription>
                                    When enabled, only your admin account can access app pages like the map and settings.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant={maintenanceMode ? 'destructive' : 'secondary'}>{maintenanceMode ? 'Enabled' : 'Disabled'}</Badge>
                                <Button onClick={toggleMaintenance}>{maintenanceMode ? 'Turn off maintenance' : 'Turn on maintenance'}</Button>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="border-slate-200/70 dark:border-slate-800">
                        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    <Users className="h-5 w-5" />
                                    New registrations
                                </CardTitle>
                                <CardDescription>
                                    Control whether new users can create accounts while you test the live site with a smaller group.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant={registrationsOpen ? 'default' : 'secondary'}>{registrationsOpen ? 'Open' : 'Closed'}</Badge>
                                <Button onClick={toggleRegistrations} variant={registrationsOpen ? 'destructive' : 'default'}>
                                    {registrationsOpen ? 'Close registrations' : 'Open registrations'}
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>
                </div>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Crown className="h-5 w-5" />
                            Pro pricing and free limits
                        </CardTitle>
                        <CardDescription>
                            App-side settings for displayed pricing, manual Pro grants, and free usage limits. Google Play Billing prices still need
                            to match these products when billing is connected.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 lg:grid-cols-3">
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Monthly price (EUR)</span>
                            <input
                                value={proSettingsForm.monthly_price_eur}
                                onChange={(event) => setProSettingsForm((current) => ({ ...current, monthly_price_eur: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="decimal"
                            />
                        </label>
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Annual price (EUR)</span>
                            <input
                                value={proSettingsForm.annual_price_eur}
                                onChange={(event) => setProSettingsForm((current) => ({ ...current, annual_price_eur: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="decimal"
                            />
                        </label>
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Lifetime price (EUR)</span>
                            <input
                                value={proSettingsForm.lifetime_price_eur}
                                onChange={(event) => setProSettingsForm((current) => ({ ...current, lifetime_price_eur: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="decimal"
                                placeholder="Optional"
                            />
                        </label>
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Free fish spots</span>
                            <input
                                value={proSettingsForm.free_spot_limit}
                                onChange={(event) => setProSettingsForm((current) => ({ ...current, free_spot_limit: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="numeric"
                            />
                        </label>
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Free routes</span>
                            <input
                                value={proSettingsForm.free_route_limit}
                                onChange={(event) => setProSettingsForm((current) => ({ ...current, free_route_limit: event.target.value }))}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="numeric"
                            />
                        </label>
                        <label className="grid gap-2 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">Free satellite hours / month</span>
                            <input
                                value={proSettingsForm.free_satellite_hours_monthly}
                                onChange={(event) =>
                                    setProSettingsForm((current) => ({ ...current, free_satellite_hours_monthly: event.target.value }))
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                inputMode="decimal"
                            />
                        </label>
                        <div className="flex items-end lg:col-span-3">
                            <Button type="button" onClick={saveProSettings}>
                                Save Pro settings
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Users</CardTitle>
                        <CardDescription>
                            Showing {users.from ?? 0}-{users.to ?? 0} of {users.total} accounts, excluding passwords and remember tokens. {perPage}{' '}
                            per page.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {users.data.map((user) => (
                            <div key={user.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{user.name}</h3>
                                            {user.is_admin && <Badge>Admin</Badge>}
                                            <Badge variant={user.is_pro ? 'default' : 'secondary'}>{user.is_pro ? 'Pro' : 'Free'}</Badge>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
                                        <p className="text-xs font-medium text-teal-700 dark:text-teal-300">{formatProStatus(user)}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                            Created {formatDate(user.created_at)} / Updated {formatDate(user.updated_at)}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">{user.catch_logs_count} catches</div>
                                        <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
                                            {user.navigation_routes_count} routes
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {!user.is_admin && (
                                        <>
                                            <Button variant="outline" onClick={() => updateUserPro(user, 'month')}>
                                                Grant 1 month Pro
                                            </Button>
                                            <Button variant="outline" onClick={() => updateUserPro(user, 'year')}>
                                                Grant 1 year Pro
                                            </Button>
                                            <Button variant="outline" onClick={() => updateUserPro(user, 'lifetime')}>
                                                Grant lifetime Pro
                                            </Button>
                                            {user.is_pro ? (
                                                <Button variant="outline" onClick={() => updateUserPro(user, 'revoke')}>
                                                    Revoke Pro
                                                </Button>
                                            ) : null}
                                        </>
                                    )}
                                    <Button variant="outline" onClick={() => sendPasswordReset(user)}>
                                        <KeyRound className="mr-2 h-4 w-4" />
                                        Send reset password
                                    </Button>
                                    {!user.is_admin && (
                                        <Button variant="destructive" onClick={() => deleteUser(user)}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete user
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                        <PaginationControls pagination={users} />
                    </CardContent>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Catch pins</CardTitle>
                        <CardDescription>
                            Showing {catchLogs.from ?? 0}-{catchLogs.to ?? 0} of {catchLogs.total} catch pins for moderation. {perPage} per page.
                        </CardDescription>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => setSelectedCatchIds(allCatchIds)}>
                                Select page
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setSelectedCatchIds([])}>
                                Clear
                            </Button>
                            <Button type="button" variant="destructive" onClick={bulkDeleteCatches} disabled={selectedCatchIds.length === 0}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete selected ({selectedCatchIds.length})
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {catchLogs.data.map((catchLog) => (
                            <div key={catchLog.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{catchLog.species}</h3>
                                            <Badge variant={catchLog.visibility === 'public' ? 'default' : 'secondary'}>{catchLog.visibility}</Badge>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            Owner: {catchLog.user.name ?? 'Unknown'} / {catchLog.user.email ?? 'No email'}
                                        </p>
                                        <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-400">
                                            <p>Caught at: {formatDate(catchLog.caught_at)}</p>
                                            <p>
                                                Coordinates: {catchLog.latitude}, {catchLog.longitude}
                                            </p>
                                            <p>Bait: {catchLog.bait_used ?? 'Not set'}</p>
                                            <p>Length: {catchLog.fish_length_cm ?? 'Not set'} cm</p>
                                            <p>Weight: {catchLog.fish_weight_kg ?? 'Not set'} kg</p>
                                            <p>Photo: {catchLog.photo_url ?? 'No photo URL'}</p>
                                        </div>
                                        {catchLog.notes && <p className="text-sm text-slate-600 dark:text-slate-400">Notes: {catchLog.notes}</p>}
                                    </div>
                                    <Button variant="destructive" className="lg:self-start" onClick={() => deleteCatch(catchLog)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete pin
                                    </Button>
                                </div>
                                <div className="mt-3">
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedCatchIds.includes(catchLog.id)}
                                            onChange={(event) => toggleCatchSelection(catchLog.id, event.target.checked)}
                                        />
                                        Select for bulk delete
                                    </label>
                                </div>
                            </div>
                        ))}
                        <PaginationControls pagination={catchLogs} />
                    </CardContent>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Navigation routes</CardTitle>
                        <CardDescription>
                            Showing {navigationRoutes.from ?? 0}-{navigationRoutes.to ?? 0} of {navigationRoutes.total} saved routes for moderation.{' '}
                            {perPage} per page.
                        </CardDescription>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => setSelectedRouteIds(allRouteIds)}>
                                Select page
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setSelectedRouteIds([])}>
                                Clear
                            </Button>
                            <Button type="button" variant="destructive" onClick={bulkDeleteRoutes} disabled={selectedRouteIds.length === 0}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete selected ({selectedRouteIds.length})
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {navigationRoutes.data.map((navigationRoute) => (
                            <div key={navigationRoute.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{navigationRoute.name}</h3>
                                            <Badge variant={navigationRoute.visibility === 'public' ? 'default' : 'secondary'}>
                                                {navigationRoute.visibility}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            Owner: {navigationRoute.user.name ?? 'Unknown'} / {navigationRoute.user.email ?? 'No email'}
                                        </p>
                                        <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-400">
                                            <p>Started: {formatDate(navigationRoute.started_at)}</p>
                                            <p>Ended: {formatDate(navigationRoute.ended_at)}</p>
                                            <p>Point count: {navigationRoute.point_count}</p>
                                            <p>
                                                Start: {navigationRoute.start_latitude ?? '-'}, {navigationRoute.start_longitude ?? '-'}
                                            </p>
                                            <p>
                                                End: {navigationRoute.end_latitude ?? '-'}, {navigationRoute.end_longitude ?? '-'}
                                            </p>
                                        </div>
                                        <details className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
                                            <summary className="cursor-pointer text-sm font-medium">
                                                View first {navigationRoute.points_preview_count} recorded point(s)
                                            </summary>
                                            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm text-slate-600 dark:text-slate-400">
                                                {navigationRoute.points.map((point) => (
                                                    <div
                                                        key={`${navigationRoute.id}-${point.sequence ?? point.recorded_at}`}
                                                        className="rounded-lg bg-white px-3 py-2 dark:bg-slate-950"
                                                    >
                                                        #{point.sequence ?? '-'} / {point.latitude}, {point.longitude} /{' '}
                                                        {formatDate(point.recorded_at)}
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    </div>
                                    <Button variant="destructive" className="lg:self-start" onClick={() => deleteRoute(navigationRoute)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete route
                                    </Button>
                                </div>
                                <div className="mt-3">
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedRouteIds.includes(navigationRoute.id)}
                                            onChange={(event) => toggleRouteSelection(navigationRoute.id, event.target.checked)}
                                        />
                                        Select for bulk delete
                                    </label>
                                </div>
                            </div>
                        ))}
                        <PaginationControls pagination={navigationRoutes} />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
