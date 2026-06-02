// Resilient image element used for any photo whose `src` might fail
// (e.g. Drive-backed URLs while the backend warms up, expired CDN tokens).
//
// Two features beyond a vanilla `<img>`:
//
//   1. `placeholderSrc` (optional): a small/thumbnail version of the
//      same image. Shown immediately while `src` (the full version) is
//      still downloading. Both get a smooth fade-in so the viewer never
//      sees a blank/black frame.
//
//   2. `onError` fallback: if the image fails to load, the entire
//      element is swapped for a soft grey "Image unavailable" panel
//      that uses the same className/aspect so layout doesn't shift.

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function SmartPhoto({
  src,
  placeholderSrc,
  alt,
  className,
  label,
  ...rest
}) {
  const [failed, setFailed] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);

  // Reset on src change so a successful re-upload clears the error state.
  useEffect(() => {
    setFailed(false);
    setFullLoaded(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={label || alt || "Image unavailable"}
        className={`${className || ""} flex items-center justify-center bg-[#F5F2EC] text-[#7A7571]`}
        data-testid="smart-photo-fallback"
      >
        <div className="flex flex-col items-center gap-1.5 px-3 py-2 text-center">
          <ImageOff className="w-6 h-6" strokeWidth={1.6} />
          <span className="text-[11px] leading-tight">
            {label || "Image unavailable"}
          </span>
        </div>
      </div>
    );
  }

  // Progressive-loading variant — only when a placeholder is supplied and
  // different from the full src.
  if (placeholderSrc && placeholderSrc !== src) {
    return (
      <div className={`${className || ""} relative overflow-hidden`}>
        <img
          src={placeholderSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-sm scale-105"
          aria-hidden="true"
        />
        <img
          src={src}
          alt={alt || ""}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${fullLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setFullLoaded(true)}
          onError={() => setFailed(true)}
          {...rest}
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || ""}
      className={className}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
