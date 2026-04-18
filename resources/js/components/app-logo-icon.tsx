import { ImgHTMLAttributes } from 'react';

export default function AppLogoIcon(props: ImgHTMLAttributes<HTMLImageElement>) {
    return <img src="/branding/fishmap-logo.svg" alt="Fishmap" {...props} />;
}
