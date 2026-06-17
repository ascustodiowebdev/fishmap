import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { type BreadcrumbItem } from '@/types';

interface AppLayoutProps {
    children: React.ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    hideHeader?: boolean;
}

export default ({ children, breadcrumbs, hideHeader = false, ...props }: AppLayoutProps) => (
    <AppLayoutTemplate breadcrumbs={breadcrumbs} hideHeader={hideHeader} {...props}>
        {children}
    </AppLayoutTemplate>
);
