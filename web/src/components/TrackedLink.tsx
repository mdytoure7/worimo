"use client";

import { trackEvent, type EventType } from "@/lib/track";

/** Lien <a> classique + tracking au clic — pour les Server Components. */
export default function TrackedLink({
  href,
  propertyId,
  eventType,
  external,
  className,
  children,
}: {
  href: string;
  propertyId: string;
  eventType: EventType;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={() => trackEvent(eventType, { propertyId })}
      className={className}
    >
      {children}
    </a>
  );
}
