import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User | null;
}

export interface Flash {
    success?: string | null;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    flash: Flash;
    [key: string]: unknown;
}

export interface CatchLog {
    id: number;
    species: string;
    bait_used: string | null;
    notes: string | null;
    photo_url: string | null;
    fish_length_cm: string | null;
    fish_weight_kg: string | null;
    caught_at: string | null;
    latitude: string | null;
    longitude: string | null;
    visibility: 'private' | 'friends' | 'public';
    created_at: string;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
