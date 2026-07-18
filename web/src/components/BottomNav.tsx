"use client";

// Barre de navigation basse façon TikTok/Instagram — Accueil, Rechercher,
// Publier (bouton central mis en avant), Favoris, Profil. Présente sur les
// écrans principaux (feed, recherche, favoris, profil) ; absente des flux
// dédiés qui ont déjà leur propre barre d'action (publication, admin).

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  center?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", icon: HomeIcon },
  { href: "/recherche", label: "Rechercher", icon: SearchIcon },
  { href: "/publier", label: "Publier", icon: PlusIcon, center: true },
  { href: "/favoris", label: "Favoris", icon: HeartIcon },
  { href: "/profil", label: "Profil", icon: ProfileIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-night/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.center) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark"
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium transition ${
                active ? "text-primary" : "text-white/60 hover:text-white/80"
              }`}
            >
              <Icon className="h-5 w-5" filled={active} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { className?: string; filled?: boolean };

function HomeIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.06l-.97-.97V19.5a2.25 2.25 0 0 1-2.25 2.25h-2.25a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-2.25a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 1-.75.75H6.75A2.25 2.25 0 0 1 4.5 19.5v-6.87l-.97.97a.75.75 0 1 1-1.06-1.06l8.69-8.69Z"
      />
    </svg>
  );
}

function SearchIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
    </svg>
  );
}

function HeartIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
      />
    </svg>
  );
}

function ProfileIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 19.5a5.5 5.5 0 1 0-11 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
