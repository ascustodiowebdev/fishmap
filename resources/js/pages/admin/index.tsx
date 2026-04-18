import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type CatchLog, type NavigationRoute, type NavigationRoutePoint, type SharedData, type User } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Shield, Users, Fish, Route, Wrench, Trash2, KeyRound } from 'lucide-react';

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
    points: NavigationRoutePoint[];
}

interface AdminPageProps extends SharedData {
    maintenanceMode: boolean;
    users: AdminUser[];
    catchLogs: AdminCatchLog[];
    navigationRoutes: AdminNavigationRoute[];
    stats: {
        users: number;
        catches: number;
        routes: number;
    };
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return 'Not set';
    }

    return new Date(value).toLocaleString();
}

function StatCard({
    title,
    value,
    icon: Icon,
    copy,
}: {
    title: string;
    value: string | number;
    icon: typeof Shield;
    copy: string;
}) {
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

export default function AdminIndex() {
    const { props } = usePage<AdminPageProps>();
    const { maintenanceMode, users, catchLogs, navigationRoutes, stats, flash } = props;

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Admin',
            href: '/admin',
        },
    ];

    const toggleMaintenance = () => {
        router.patch(route('admin.maintenance.update'), {
            enabled: !maintenanceMode,
        }, {
            preserveScroll: true,
        });
    };

    const sendPasswordReset = (user: AdminUser) => {
        if (!window.confirm(`Send a password reset link to ${user.email}?`)) {
            return;
        }

        router.post(route('admin.users.password-reset', user.id), {}, {
            preserveScroll: true,
        });
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Admin" />

            <div className="space-y-6 px-4 py-6">
                <Heading
                    title="Admin panel"
                    description="Manage maintenance mode, review all users, and moderate all catch pins and saved routes."
                />

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
                    <StatCard title="Users" value={stats.users} icon={Users} copy="Every account, excluding passwords." />
                    <StatCard title="Catch pins" value={stats.catches} icon={Fish} copy="All user-created fish spots are visible here." />
                    <StatCard title="Routes" value={stats.routes} icon={Route} copy="Review saved navigation routes and points." />
                </div>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Wrench className="h-5 w-5" />
                                Maintenance mode
                            </CardTitle>
                            <CardDescription>When enabled, only your admin account can access app pages like the map and settings.</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge variant={maintenanceMode ? 'destructive' : 'secondary'}>
                                {maintenanceMode ? 'Enabled' : 'Disabled'}
                            </Badge>
                            <Button onClick={toggleMaintenance}>
                                {maintenanceMode ? 'Turn off maintenance' : 'Turn on maintenance'}
                            </Button>
                        </div>
                    </CardHeader>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Users</CardTitle>
                        <CardDescription>All account data except passwords and remember tokens.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {users.map((user) => (
                            <div key={user.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{user.name}</h3>
                                            {user.is_admin && <Badge>Admin</Badge>}
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                            Created {formatDate(user.created_at)} • Updated {formatDate(user.updated_at)}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
                                            {user.catch_logs_count} catches
                                        </div>
                                        <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
                                            {user.navigation_routes_count} routes
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
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
                    </CardContent>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Catch pins</CardTitle>
                        <CardDescription>Moderate fake spots quickly without exposing passwords or secrets.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {catchLogs.map((catchLog) => (
                            <div key={catchLog.id} className="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{catchLog.species}</h3>
                                            <Badge variant={catchLog.visibility === 'public' ? 'default' : 'secondary'}>{catchLog.visibility}</Badge>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            Owner: {catchLog.user.name ?? 'Unknown'} • {catchLog.user.email ?? 'No email'}
                                        </p>
                                        <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                                            <p>Caught at: {formatDate(catchLog.caught_at)}</p>
                                            <p>Coordinates: {catchLog.latitude}, {catchLog.longitude}</p>
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
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="border-slate-200/70 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-xl">Navigation routes</CardTitle>
                        <CardDescription>Inspect saved route metadata and points, then remove bad or fake paths if needed.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {navigationRoutes.map((navigationRoute) => (
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
                                            Owner: {navigationRoute.user.name ?? 'Unknown'} • {navigationRoute.user.email ?? 'No email'}
                                        </p>
                                        <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                                            <p>Started: {formatDate(navigationRoute.started_at)}</p>
                                            <p>Ended: {formatDate(navigationRoute.ended_at)}</p>
                                            <p>Point count: {navigationRoute.point_count}</p>
                                            <p>
                                                Start: {navigationRoute.start_latitude ?? '—'}, {navigationRoute.start_longitude ?? '—'}
                                            </p>
                                            <p>
                                                End: {navigationRoute.end_latitude ?? '—'}, {navigationRoute.end_longitude ?? '—'}
                                            </p>
                                        </div>
                                        <details className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
                                            <summary className="cursor-pointer text-sm font-medium">View recorded points</summary>
                                            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm text-slate-600 dark:text-slate-400">
                                                {navigationRoute.points.map((point) => (
                                                    <div key={`${navigationRoute.id}-${point.sequence ?? point.recorded_at}`} className="rounded-lg bg-white px-3 py-2 dark:bg-slate-950">
                                                        #{point.sequence ?? '—'} • {point.latitude}, {point.longitude} • {formatDate(point.recorded_at)}
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
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
