import React, { useState, useMemo } from "react";
import "../styles/aquarium.css";

/**
 * Aquarium
 * - Embeds https://webglsamples.org/aquarium/aquarium.html in a responsive iframe
 * - Full width, controlled height (default 68vh, min 320px)
 * - Optional overlay slot via children (e.g., place your Chat widget)
 *
 * Props:
 *  - src?: string                 // custom URL if you ever swap demos
 *  - height?: string | number     // e.g., "68vh", "600px", 560 (px)
 *  - rounded?: boolean            // adds rounded corners (default true)
 *  - shadow?: boolean             // adds soft shadow (default true)
 *  - className?: string           // extra classes for the outer container
 *  - style?: React.CSSProperties  // style overrides
 */
export default function Aquarium({
  src = "https://webglsamples.org/aquarium/aquarium.html",
  height = "80vh",
  rounded = true,
  shadow = true,
  className = "",
  style,
  children,
}) {
  const [loaded, setLoaded] = useState(false);

  // Normalize height -> CSS var (accepts number px or any CSS length)
  const resolvedHeight = useMemo(() => {
    if (typeof height === "number") return `${height}px`;
    return height || "80vh";
  }, [height]);

  return (
    <div
      className={[
        "aq-container",
        loaded ? "is-loaded" : "",
        rounded ? "aq-rounded" : "",
        shadow ? "aq-shadow" : "",
        className,
      ].join(" ")}
      style={{
        "--aq-height": resolvedHeight,
        ...style,
      }}
    >
      <iframe
        className="aq-iframe"
        src={src}
        title="WebGL Aquarium"
        loading="eager"                 // eager so it starts right away
        allow="autoplay; fullscreen; xr-spatial-tracking; gamepad"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
      />
      {/* Optional overlay area for your UI (chat, buttons, etc.) */}
      {children ? (
        <div className="aq-overlay">
          {/* Wrap interactive elements in .aq-overlay-interactive if they need clicks */}
          <div className="aq-overlay-interactive">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
