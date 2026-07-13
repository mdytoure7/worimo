"use client";

// Feed vidéo vertical façon TikTok/Reels :
//  - scroll-snap plein écran, une annonce par écran ;
//  - autoplay/pause piloté par IntersectionObserver ;
//  - lecture HLS adaptative (hls.js, ou HLS natif sur Safari/iOS) ;
//  - hls.js n'est attaché qu'aux vidéos proches de l'écran (économie de data).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type Hls from "hls.js";
import {
  formatPrice,
  getVerification,
  getVideo,
  whatsappLink,
  OFFER_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
} from "@/lib/types";
import VerifiedBadge from "./VerifiedBadge";
import FavoriteButton from "./FavoriteButton";

export default function VideoFeed({ properties }: { properties: Property[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const slides = Array.from(container.children);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveIndex(slides.indexOf(entry.target));
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [properties.length]);

  return (
    <div
      ref={containerRef}
      className="feed-scroll h-dvh snap-y snap-mandatory overflow-y-scroll bg-night"
    >
      {properties.map((property, index) => (
        <FeedSlide
          key={property.id}
          property={property}
          active={index === activeIndex}
          // On ne charge le flux que pour la slide visible et ses voisines.
          shouldLoad={Math.abs(index - activeIndex) <= 1}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
        />
      ))}
    </div>
  );
}

function FeedSlide({
  property,
  active,
  shouldLoad,
  muted,
  onToggleMute,
}: {
  property: Property;
  active: boolean;
  shouldLoad: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const video = getVideo(property);
  const verification = getVerification(property);

  // Attache/détache le flux HLS selon la proximité de la slide.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video?.manifest_url) return;

    if (!shouldLoad) {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      element.removeAttribute("src");
      return;
    }
    if (hlsRef.current || element.src) return;

    let cancelled = false;
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / iOS : HLS natif, bascule de qualité gérée par le système.
      element.src = video.manifest_url;
    } else {
      import("hls.js").then(({ default: HlsClass }) => {
        if (cancelled || !HlsClass.isSupported()) return;
        const hls = new HlsClass({ capLevelToPlayerSize: true });
        hls.loadSource(video.manifest_url!);
        hls.attachMedia(element);
        hlsRef.current = hls;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [shouldLoad, video?.manifest_url]);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  // Autoplay quand la slide devient active, pause sinon.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (active) {
      element.play().catch(() => {
        /* autoplay bloqué tant que la vidéo n'est pas muette : ignoré */
      });
    } else {
      element.pause();
      element.currentTime = 0;
    }
  }, [active, shouldLoad]);

  return (
    <section className="relative h-dvh w-full snap-start overflow-hidden">
      {video ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster={video.thumbnail_url ?? undefined}
          muted={muted}
          loop
          playsInline
          preload="none"
          onClick={onToggleMute}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-white/50">
          Vidéo en cours de traitement…
        </div>
      )}

      {/* Dégradé de lisibilité */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-night/95 via-night/40 to-transparent" />

      {/* Bouton son */}
      <button
        onClick={onToggleMute}
        aria-label={muted ? "Activer le son" : "Couper le son"}
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2.5 text-white backdrop-blur"
      >
        {muted ? <MutedIcon /> : <SoundIcon />}
      </button>

      {/* Infos annonce */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 pb-6">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <VerifiedBadge verification={verification} />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
              {OFFER_TYPE_LABELS[property.offer_type]} · {PROPERTY_TYPE_LABELS[property.type]}
            </span>
          </div>
          <Link href={`/annonces/${property.id}`} className="block">
            <h2 className="truncate text-lg font-semibold">{property.title}</h2>
            <p className="text-sm text-white/80">
              {property.district ? `${property.district}, ` : ""}
              {property.city}
              {property.surface ? ` · ${property.surface} m²` : ""}
            </p>
            <p className="mt-1 text-xl font-bold text-primary">
              {formatPrice(property.price, property.offer_type)}
            </p>
          </Link>
          <Link
            href={`/annonces/${property.id}`}
            className="mt-3 inline-block rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            Voir l’annonce →
          </Link>
        </div>

        {/* Actions latérales */}
        <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
          <div className="flex flex-col items-center gap-1 text-xs text-white/90">
            <FavoriteButton
              propertyId={property.id}
              className="rounded-full bg-black/40 p-3 backdrop-blur transition hover:bg-primary"
            />
            Favoris
          </div>
          {property.whatsapp_phone && (
            <ActionButton
              href={whatsappLink(property.whatsapp_phone, property.title)}
              label="WhatsApp"
              external
            >
              <WhatsAppIcon />
            </ActionButton>
          )}
          {property.contact_phone && (
            <ActionButton href={`tel:${property.contact_phone}`} label="Appeler">
              <PhoneIcon />
            </ActionButton>
          )}
        </div>
      </div>
    </section>
  );
}

function ActionButton({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex flex-col items-center gap-1 text-xs text-white/90"
    >
      <span className="rounded-full bg-black/40 p-3 backdrop-blur transition hover:bg-primary">
        {children}
      </span>
      {label}
    </a>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M13.5 4.06c0-1.34-1.61-2.01-2.56-1.06L6.5 7.44H4.51A2.51 2.51 0 0 0 2 9.95v4.1a2.51 2.51 0 0 0 2.51 2.51H6.5l4.44 4.44c.95.95 2.56.28 2.56-1.06V4.06ZM17.72 9.22a.75.75 0 0 1 1.06 0L20.5 10.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L21.56 12l1.72 1.72a.75.75 0 1 1-1.06 1.06L20.5 13.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L19.44 12l-1.72-1.72a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M13.5 4.06c0-1.34-1.61-2.01-2.56-1.06L6.5 7.44H4.51A2.51 2.51 0 0 0 2 9.95v4.1a2.51 2.51 0 0 0 2.51 2.51H6.5l4.44 4.44c.95.95 2.56.28 2.56-1.06V4.06ZM18.58 5.4a.75.75 0 0 1 1.06.02A9.72 9.72 0 0 1 22.25 12a9.72 9.72 0 0 1-2.61 6.58.75.75 0 1 1-1.08-1.04A8.22 8.22 0 0 0 20.75 12a8.22 8.22 0 0 0-2.19-5.54.75.75 0 0 1 .02-1.06ZM15.93 8.1a.75.75 0 0 1 1.05.16A6.22 6.22 0 0 1 18.25 12c0 1.39-.46 2.68-1.27 3.74a.75.75 0 1 1-1.2-.9c.6-.8.97-1.78.97-2.84 0-1.06-.36-2.04-.97-2.84a.75.75 0 0 1 .15-1.05Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.87 9.87 0 0 0 4.74 1.21h.01c5.45 0 9.89-4.44 9.89-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.22-.08-.39-.12-.55.13-.17.24-.64.8-.78.97-.15.16-.29.18-.54.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42-.14-.01-.31-.01-.47-.01-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
