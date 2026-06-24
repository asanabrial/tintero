"use client";

import { useState } from "react";

interface AvatarProps {
  src: string;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Avatar island — renders a Gravatar image with fallback to an initial circle.
 * Email must NOT reach this component — callers pass the pre-computed Gravatar URL.
 * The initial-circle fallback matches the existing admin UI styling.
 */
export function Avatar({ src, name, size = 32, className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = name.charAt(0).toUpperCase() || "?";

  if (imgError) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-[#2271b1] font-semibold uppercase text-white ${className ?? ""}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.4)) }}
        aria-label={name}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className={`rounded-full shrink-0 ${className ?? ""}`}
      onError={() => setImgError(true)}
    />
  );
}
