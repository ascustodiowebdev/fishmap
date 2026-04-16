import AppLogoIcon from './app-logo-icon';

export default function AppLogo() {
    return (
        <>
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-xl shadow-sm">
                <AppLogoIcon className="size-5 text-white dark:text-[#03131a]" />
            </div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="mb-0.5 truncate leading-none font-semibold">Fishmap</span>
                <span className="text-muted-foreground truncate text-xs">Catch logs and routes</span>
            </div>
        </>
    );
}
