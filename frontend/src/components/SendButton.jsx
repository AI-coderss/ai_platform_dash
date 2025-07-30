import React, { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import "../styles/SendButton.css"; // ✅ Import custom styles

gsap.registerPlugin(MorphSVGPlugin);

const SendButton = ({ loading }) => {
  const buttonRef = useRef(null);
  const pathRef = useRef(null);

  useEffect(() => {
    const button = buttonRef.current;
    const path = pathRef.current;
    const tl = gsap.timeline();

    const handleClick = (e) => {
      if (loading) return; // Don't animate while loading
      if (button.classList.contains("active")) return;
      button.classList.add("active");

      tl.to(path, {
        morphSVG:
          "M136,77.5h-1H4.8H4c-2.2,0-4-1.8-4-4v-47c0-2.2,1.8-4,4-4c0,0,0.6,0,0.9,0C44,22.5,66,10,66,10  s3,12.5,69.1,12.5c0.2,0,0.9,0,0.9,0c2.2,0,4,1.8,4,4v47C140,75.7,138.2,77.5,136,77.5z",
        duration: 0.3,
        delay: 0.3,
      }).to(path, {
        morphSVG:
          "M136,77.5c0,0-11.7,0-12,0c-90,0-94.2,0-94.2,0s-10.8,0-25.1,0c-0.2,0-0.8,0-0.8,0c-2.2,0-4-1.8-4-4v-47  c0-2.2,1.8-4,4-4c0,0,0.6,0,0.9,0c39.1,0,61.1,0,61.1,0s3,0,69.1,0c0.2,0,0.9,0,0.9,0c2.2,0,4,1.8,4,4v47  C140,75.7,138.2,77.5,136,77.5z",
        duration: 1.7,
        ease: "elastic.out(1, .15)",
        onComplete: () => button.classList.remove("active"),
      });
    };

    buttonRef.current.addEventListener("click", handleClick);
    return () => button.removeEventListener("click", handleClick);
  }, [loading]);

  return (
    <>
      {/* Hidden SVG for symbols */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ display: "none" }}>
        <symbol viewBox="0 0 28 26" id="plane" preserveAspectRatio="none">
          <path d="M5.25,15.24,18.42,3.88,7.82,17l0,4.28a.77.77,0,0,0,1.36.49l3-3.68,5.65,2.25a.76.76,0,0,0,1-.58L22,.89A.77.77,0,0,0,20.85.1L.38,11.88a.76.76,0,0,0,.09,1.36Z" />
        </symbol>
      </svg>

      <button
        className="button"
        type="submit" // ✅ Enables form submission
        ref={buttonRef}
        disabled={loading} // ✅ Prevent double submit
      >
        <svg className="btn-layer" viewBox="0 0 140 100" preserveAspectRatio="none">
          <path
            ref={pathRef}
            d="M136,77.5c0,0-11.7,0-12,0c-90,0-94.2,0-94.2,0s-10.8,0-25.1,0c-0.2,0-0.8,0-0.8,0
              c-2.2,0-4-1.8-4-4v-47c0-2.2,1.8-4,4-4c0,0,0.6,0,0.9,0c39.1,0,61.1,0,61.1,0s3,0,69.1,0c0.2,0,0.9,0,0.9,0
              c2.2,0,4,1.8,4,4v47C140,75.7,138.2,77.5,136,77.5z"
          />
        </svg>

        <svg className="plane">
          <use xlinkHref="#plane" />
        </svg>

        <ul>
          <li>{loading ? "Sending..." : "Send"}</li>
          <li>Done</li>
        </ul>
      </button>
    </>
  );
};

export default SendButton;
