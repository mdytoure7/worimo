"use client";

// Bouton cœur : ajoute/retire l'annonce des favoris.
// Utilisable partout (feed, carte, détail) — stoppe la propagation pour
// fonctionner à l'intérieur d'un <Link>. Redirige vers la connexion si anonyme.

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { loadFavoriteIds, toggleFavorite } from "@/lib/favorites";

export default function FavoriteButton({
  propertyId,
  className = "rounded-full bg-black/50 p-2 backdrop-blur transition hover:bg-black/70",
  iconClassName = "h-5 w-5",
}: {
  propertyId: string;
  className?: string;
  iconClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadFavoriteIds().then((ids) => {
      if (mounted) setActive(ids?.has(propertyId) ?? false);
    });
    return () => {
      mounted = false;
    };
  }, [propertyId]);

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    const result = await toggleFavorite(propertyId);
    setBusy(false);
    if (result === "auth-required") {
      router.push(`/connexion?next=${encodeURIComponent(pathname)}`);
    } else if (result === "added") {
      setActive(true);
    } else if (result === "removed") {
      setActive(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={active}
      className={`${className} ${active ? "text-primary" : "text-white"}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        className={iconClassName}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
    </button>
  );
}
