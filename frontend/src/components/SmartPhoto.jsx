// Resilient image element used for any photo whose `src` might fail
// (e.g. Drive-backed URLs while the backend warms up, expired CDN tokens).
//
// Default behaviour:
//   1. Render an `<img>` with the requested src.
//   2. If loading errors, swap the entire element for a soft placeholder
//      that uses the same className/aspect so the surrounding layout
//      doesn't shift. The placeholder is light-grey (not black) so the
//      user can see "this image failed" rather than a void.
//
// Why a component instead of a CSS background? Browsers don't fire any
// JS event for a `background-image` 404, so we'd lose the ability to
// retry / show a label / log.

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function SmartPhoto({ src, alt, className, label, ...rest }) {
  const [failed, setFailed] = useState(false);

  // Reset on src change so a successful re-upload clears the error state.
  useEffect(() => { setFailed(false); }, [src]);

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
