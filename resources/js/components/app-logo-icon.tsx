import { ImgHTMLAttributes } from 'react';

export default function AppLogoIcon(props: ImgHTMLAttributes<HTMLImageElement>) {
    return <img src="/branding/nautibite-logo.svg" alt="NautiBite" {...props} />;
}
