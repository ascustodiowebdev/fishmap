import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useTranslator } from '@/lib/i18n';
import { type NavItem, type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Home, MapPinned, Shield } from 'lucide-react';
import AppLogo from './app-logo';

const footerNavItems: NavItem[] = [];

export function AppSidebar() {
    const { t } = useTranslator();
    const { auth } = usePage<SharedData>().props;
    const mainNavItems: NavItem[] = [
        {
            title: 'Home',
            url: '/',
            icon: Home,
        },
        {
            title: t('app.catches'),
            url: '/map',
            icon: MapPinned,
        },
        ...(auth.user?.is_admin
            ? [
                  {
                      title: t('app.admin'),
                      url: '/admin',
                      icon: Shield,
                  } satisfies NavItem,
              ]
            : []),
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg">
                            <AppLogo />
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
