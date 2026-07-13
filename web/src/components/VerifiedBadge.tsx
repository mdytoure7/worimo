import type { Verification } from "@/lib/types";

/**
 * Badge de vérification foncière — l'élément différenciant de Worimo.
 * verified : badge vert plein. in_review : badge discret "en cours".
 * Sinon : rien (on n'affiche jamais un faux "vérifié").
 */
export default function VerifiedBadge({
  verification,
  size = "md",
}: {
  verification: Verification | null;
  size?: "md" | "lg";
}) {
  if (!verification) return null;

  const base =
    size === "lg"
      ? "text-sm px-3 py-1.5 gap-1.5"
      : "text-xs px-2.5 py-1 gap-1";

  if (verification.status === "verified") {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-primary font-semibold text-white ${base}`}
      >
        <CheckIcon />
        Vérifié Worimo
      </span>
    );
  }

  if (verification.status === "in_review") {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-white/15 font-medium text-white/90 backdrop-blur ${base}`}
      >
        Vérification en cours
      </span>
    );
  }

  return null;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
