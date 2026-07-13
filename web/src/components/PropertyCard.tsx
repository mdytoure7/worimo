import Link from "next/link";
import {
  formatPrice,
  getImages,
  getVerification,
  getVideo,
  OFFER_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
} from "@/lib/types";
import VerifiedBadge from "./VerifiedBadge";
import FavoriteButton from "./FavoriteButton";

/** Carte annonce pour les grilles (résultats de recherche, favoris…). */
export default function PropertyCard({ property }: { property: Property }) {
  const cover = getImages(property)[0]?.url ?? getVideo(property)?.thumbnail_url ?? null;
  const verification = getVerification(property);

  return (
    <Link
      href={`/annonces/${property.id}`}
      className="group block overflow-hidden rounded-2xl bg-white/5 transition hover:bg-white/10"
    >
      <div className="relative aspect-[4/3] bg-white/10">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={property.title}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white/30">
            Pas de photo
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <VerifiedBadge verification={verification} />
        </div>
        <div className="absolute right-2 top-2">
          <FavoriteButton propertyId={property.id} iconClassName="h-4 w-4" />
        </div>
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium backdrop-blur">
          {OFFER_TYPE_LABELS[property.offer_type]}
        </span>
      </div>

      <div className="space-y-1 p-3">
        <h3 className="truncate font-semibold">{property.title}</h3>
        <p className="truncate text-sm text-white/60">
          {PROPERTY_TYPE_LABELS[property.type]} ·{" "}
          {property.district ? `${property.district}, ` : ""}
          {property.city}
          {property.surface ? ` · ${property.surface} m²` : ""}
        </p>
        <p className="font-bold text-primary">
          {formatPrice(property.price, property.offer_type)}
        </p>
      </div>
    </Link>
  );
}
