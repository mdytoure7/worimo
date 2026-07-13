"use client";

// Lecteur HLS autonome avec contrôles (aperçu admin, pages annonces).
// hls.js là où il faut, HLS natif sur Safari/iOS.

import { useEffect, useRef } from "react";
import type Hls from "hls.js";

export default function HlsPlayer({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    let cancelled = false;
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = src;
    } else {
      import("hls.js").then(({ default: HlsClass }) => {
        if (cancelled || !HlsClass.isSupported()) return;
        const hls = new HlsClass();
        hls.loadSource(src);
        hls.attachMedia(element);
        hlsRef.current = hls;
      });
    }
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      element.removeAttribute("src");
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      muted
      poster={poster}
      className={className}
    />
  );
}
