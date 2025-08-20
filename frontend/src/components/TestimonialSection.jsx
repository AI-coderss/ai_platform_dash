/* eslint-disable no-unused-vars */
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/heading-has-content */
// src/components/TestimonialSection.jsx
import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import "../styles/TestimonialSection.css";

/**
 * TestimonialSection (no shaders)
 * - Fully glassmorphic using your tokens
 * - Unique classes (tsm-*)
 * - Anchor tags for nav controls (no <button>)
 * - Image DOM is created/managed exactly like your original JS (GSAP animates <img> nodes)
 */

export default function TestimonialSection() {
  const imageContainerRef = useRef(null);
  const nameRef = useRef(null);
  const designationRef = useRef(null);
  const quoteRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const autoplayRef = useRef(null);
  const activeIndexRef = useRef(0);

  // Same data you shared
  const testimonials = useRef([
    {
      quote:
        "Honestly, having used the website for the first time, I do find that its design is modern and beautiful. With its AI tools, it makes things much easier and explains everything clearly. Thank you for the effort",
      name: "Eng.Nawaf Yakoub",
      designation: "IT Specialist",
      src: "/images/testimonials/nawaf.jpeg",
    },
    {
      quote:
        "This place exceeded all expectations! The atmosphere is inviting, and the staff truly goes above and beyond to ensure a fantastic visit. I'll keep returning for more dining experience.",
      name: "Joe Charlescraft",
      designation: "Frequent Visitor",
      src: "https://images.unsplash.com/photo-1628749528992-f5702133b686?q=80&w=1368&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      quote:
        "Shining Yam is a hidden gem! From the moment I walked in, I knew I was in for a treat. The impeccable service and overall attention to detail created a memorable experience. I highly recommend it!",
      name: "Martina Edelweist",
      designation: "Satisfied Customer",
      src: "https://images.unsplash.com/photo-1524267213992-b76e8577d046?q=80&w=1368&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ]);

  const calculateGap = (width) => {
    const minWidth = 1024;
    const maxWidth = 1456;
    const minGap = 60;
    const maxGap = 86;

    if (width <= minWidth) return minGap;
    if (width >= maxWidth) return Math.max(minGap, maxGap + 0.06018 * (width - maxWidth));
    return minGap + (maxGap - minGap) * ((width - minWidth) / (maxWidth - minWidth));
  };

  const animateWords = () => {
    gsap.from(".tsm-word", {
      opacity: 0,
      y: 10,
      stagger: 0.02,
      duration: 0.2,
      ease: "power2.out",
    });
  };

  const updateTestimonial = (direction) => {
    const imageContainer = imageContainerRef.current;
    const nameEl = nameRef.current;
    const desigEl = designationRef.current;
    const quoteEl = quoteRef.current;
    if (!imageContainer || !nameEl || !desigEl || !quoteEl) return;

    // update index
    const len = testimonials.current.length;
    const oldIndex = activeIndexRef.current;
    activeIndexRef.current = (activeIndexRef.current + direction + len) % len;

    // sizing
    const containerWidth = imageContainer.offsetWidth || 0;
    const containerHeight = imageContainer.offsetHeight || 1;
    const gap = calculateGap(containerWidth);
    const maxStickUp = gap * 0.8;

    // ensure <img> nodes exist (mirror original DOM approach)
    testimonials.current.forEach((t, index) => {
      let img = imageContainer.querySelector(`[data-index="${index}"]`);
      if (!img) {
        img = document.createElement("img");
        img.src = t.src;
        img.alt = t.name;
        img.classList.add("tsm-image");
        img.dataset.index = String(index);
        imageContainer.appendChild(img);
      }
    });

    // animate images (mirror original math)
    testimonials.current.forEach((_, index) => {
      const img = imageContainer.querySelector(`[data-index="${index}"]`);
      if (!img) return;

      const offset = (index - activeIndexRef.current + len) % len;
      const zIndex = len - Math.abs(offset);
      const scale = index === activeIndexRef.current ? 1 : 0.85;
      const opacity = 1; // keep parity with your original

      let translateX, translateY, rotateY;
      if (offset === 0) {
        translateX = "0%";
        translateY = "0%";
        rotateY = 0;
      } else if (offset === 1 || offset === -2) {
        translateX = "20%";
        translateY = `-${(maxStickUp / containerHeight) * 100}%`;
        rotateY = -15;
      } else {
        translateX = "-20%";
        translateY = `-${(maxStickUp / containerHeight) * 100}%`;
        rotateY = 15;
      }

      gsap.to(img, {
        zIndex,
        opacity,
        scale,
        x: translateX,
        y: translateY,
        rotateY,
        duration: 0.8,
        ease: "power3.out",
      });
    });

    // animate text
    gsap.to([nameEl, desigEl], {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        nameEl.textContent = testimonials.current[activeIndexRef.current].name;
        desigEl.textContent = testimonials.current[activeIndexRef.current].designation;
        gsap.to([nameEl, desigEl], {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      },
    });

    gsap.to(quoteEl, {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        quoteEl.innerHTML = testimonials.current[activeIndexRef.current].quote
          .split(" ")
          .map((w) => `<span class="tsm-word">${w}</span>`)
          .join(" ");
        gsap.to(quoteEl, {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
          onComplete: animateWords,
        });
      },
    });
  };

  useEffect(() => {
    // Initial text & DOM build then first layout
    if (nameRef.current) nameRef.current.textContent = testimonials.current[0].name;
    if (designationRef.current) designationRef.current.textContent = testimonials.current[0].designation;
    if (quoteRef.current) {
      quoteRef.current.innerHTML = testimonials.current[0].quote
        .split(" ")
        .map((w) => `<span class="tsm-word">${w}</span>`)
        .join(" ");
    }
    // Build images and set initial positions
    updateTestimonial(0);

    // Autoplay
    autoplayRef.current = setInterval(() => updateTestimonial(1), 5000);

    // Resize recalculates layout (no text animation)
    const onResize = () => {
      // call with direction 0 to recompute transforms without changing index
      const current = activeIndexRef.current;
      activeIndexRef.current = (current - 1 + testimonials.current.length) % testimonials.current.length;
      updateTestimonial(1);
    };
    window.addEventListener("resize", onResize);

    // Clean-up
    return () => {
      window.removeEventListener("resize", onResize);
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrev = (e) => {
    e.preventDefault();
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    updateTestimonial(-1);
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    updateTestimonial(1);
  };

  return (
    <section className="tsm-wrapper" aria-label="Testimonials">
      <div className="tsm-container">
        <div className="tsm-grid">
          {/* Image stack (images are appended dynamically) */}
          <div className="tsm-image-container" ref={imageContainerRef} />

          {/* Content card */}
          <div className="tsm-content">
            <div>
              <h3 className="tsm-name" ref={nameRef} />
              <p className="tsm-designation" ref={designationRef} />
              <p className="tsm-quote" ref={quoteRef} />
            </div>

            <nav className="tsm-arrows" aria-label="testimonial navigation">
              <a
                href="#"
                className="tsm-nav tsm-prev"
                onClick={handlePrev}
                ref={prevRef}
                aria-label="Previous testimonial"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </a>
              <a
                href="#"
                className="tsm-nav tsm-next"
                onClick={handleNext}
                ref={nextRef}
                aria-label="Next testimonial"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </a>
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
