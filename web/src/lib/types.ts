/** Sélection PostgREST standard d'une annonce avec médias, vérification, agence. */
export const PROPERTY_SELECT = `
  id, title, description, type, offer_type, price, surface, rooms,
  city, district, latitude, longitude, contact_phone, whatsapp_phone, published_at,
  property_media ( id, kind, url, manifest_url, thumbnail_url, duration_seconds, status, display_order ),
  verifications ( id, level, status, report_number, summary, documents, verified_at ),
  agencies ( id, name, logo_url, verified )
`;

export type PropertyType = "apartment" | "house" | "land" | "commercial" | "office";
export type OfferType = "sale" | "rent";
export type VerificationStatus = "pending" | "in_review" | "verified" | "rejected";

export interface PropertyMedia {
  id: string;
  kind: "image" | "video";
  url: string | null;
  manifest_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: string;
  display_order: number;
}

export interface VerificationDocument {
  doc_type: string;
  label: string;
  checked: boolean;
}

export interface Verification {
  id: string;
  level: string | null;
  status: VerificationStatus;
  report_number: string | null;
  summary: string | null;
  documents: VerificationDocument[];
  verified_at: string | null;
}

export interface Agency {
  id: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
}

export interface Property {
  id: string;
  title: string;
  description: string | null;
  type: PropertyType;
  offer_type: OfferType;
  price: number;
  surface: number | null;
  rooms: number | null;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  published_at: string | null;
  property_media: PropertyMedia[];
  // PostgREST renvoie un objet (contrainte unique) mais on tolère un tableau.
  verifications: Verification | Verification[] | null;
  agencies: Agency | null;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Appartement",
  house: "Maison",
  land: "Terrain",
  commercial: "Local commercial",
  office: "Bureau",
};

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  sale: "À vendre",
  rent: "À louer",
};

export function getVerification(property: Property): Verification | null {
  const v = property.verifications;
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function getVideo(property: Property): PropertyMedia | null {
  return (
    property.property_media
      .filter((m) => m.kind === "video" && m.status === "ready" && m.manifest_url)
      .sort((a, b) => a.display_order - b.display_order)[0] ?? null
  );
}

export function getImages(property: Property): PropertyMedia[] {
  return property.property_media
    .filter((m) => m.kind === "image" && m.url)
    .sort((a, b) => a.display_order - b.display_order);
}

export function formatPrice(price: number, offerType: OfferType): string {
  const formatted = new Intl.NumberFormat("fr-FR").format(price);
  return offerType === "rent" ? `${formatted} FCFA / mois` : `${formatted} FCFA`;
}

export function whatsappLink(phone: string, title: string): string {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(
    `Bonjour, je suis intéressé(e) par votre annonce « ${title} » vue sur Worimo.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}
