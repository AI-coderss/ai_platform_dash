/* eslint-disable no-unused-vars */
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/heading-has-content */
// src/components/TestimonialSection.jsx
/* eslint-disable no-unused-vars */
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/heading-has-content */
// src/components/TestimonialSection.jsx
/* eslint-disable no-unused-vars */
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/heading-has-content */
// src/components/TestimonialSection.jsx
import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "../styles/TestimonialSection.css";

export default function TestimonialSection() {
  const imageContainerRef = useRef(null);
  const nameRef = useRef(null);
  const designationRef = useRef(null);
  const quoteRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const autoplayRef = useRef(null);
  const activeIndexRef = useRef(0);

  // Start empty; users add testimonials via modal
  const testimonials = useRef([]);

  // Modal + form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    designation: "",
    quote: "",
    imageDataUrl: "",
  });
  const [errors, setErrors] = useState({});

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

    const len = testimonials.current.length;
    if (len === 0) return;

    activeIndexRef.current = (activeIndexRef.current + direction + len) % len;

    const containerWidth = imageContainer.offsetWidth || 0;
    const containerHeight = imageContainer.offsetHeight || 1;
    const gap = calculateGap(containerWidth);
    const maxStickUp = gap * 0.8;

    // Ensure <img> nodes exist
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

    // Animate images
    testimonials.current.forEach((_, index) => {
      const img = imageContainer.querySelector(`[data-index="${index}"]`);
      if (!img) return;

      const offset = (index - activeIndexRef.current + len) % len;
      const zIndex = len - Math.abs(offset);
      const scale = index === activeIndexRef.current ? 1 : 0.85;

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
        opacity: 1,
        scale,
        x: translateX,
        y: translateY,
        rotateY,
        duration: 0.8,
        ease: "power3.out",
      });
    });

    // Animate text
    const t = testimonials.current[activeIndexRef.current];
    gsap.to([nameEl, desigEl], {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        nameEl.textContent = t.name;
        desigEl.textContent = t.designation;
        gsap.to([nameEl, desigEl], {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
        });
      },
    });

    gsap.to(quoteRef.current, {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        quoteRef.current.innerHTML = t.quote
          .split(" ")
          .map((w) => `<span class="tsm-word">${w}</span>`)
          .join(" ");
        gsap.to(quoteRef.current, {
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
    const len = testimonials.current.length;

    if (len === 0) {
      // Zero-state: no placeholder copy — keep fields empty and no autoplay
      if (nameRef.current) nameRef.current.textContent = "";
      if (designationRef.current) designationRef.current.textContent = "";
      if (quoteRef.current) quoteRef.current.innerHTML = "";
    } else {
      if (nameRef.current) nameRef.current.textContent = testimonials.current[0].name;
      if (designationRef.current) designationRef.current.textContent = testimonials.current[0].designation;
      if (quoteRef.current) {
        quoteRef.current.innerHTML = testimonials.current[0].quote
          .split(" ")
          .map((w) => `<span class="tsm-word">${w}</span>`)
          .join(" ");
        animateWords();
      }
      updateTestimonial(0);
      if (len > 1) {
        autoplayRef.current = setInterval(() => updateTestimonial(1), 5000);
      }
    }

    const onResize = () => {
      if (testimonials.current.length > 0) {
        const current = activeIndexRef.current;
        activeIndexRef.current =
          (current - 1 + testimonials.current.length) % testimonials.current.length;
        updateTestimonial(1);
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrev = (e) => {
    e.preventDefault();
    if (testimonials.current.length === 0) return;
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    updateTestimonial(-1);
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (testimonials.current.length === 0) return;
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    updateTestimonial(1);
  };

  // Modal handlers
  const openModal = (e) => {
    e.preventDefault();
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    setIsModalOpen(true);
  };

  const closeModal = (e) => {
    e?.preventDefault?.();
    setIsModalOpen(false);
    if (!autoplayRef.current && testimonials.current.length > 1) {
      autoplayRef.current = setInterval(() => updateTestimonial(1), 5000);
    }
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData((d) => ({ ...d, [name]: value }));
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFormData((d) => ({ ...d, imageDataUrl: reader.result }));
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const err = {};
    if (!formData.name.trim()) err.name = "Required";
    if (!formData.designation.trim()) err.designation = "Required";
    if (!formData.quote.trim()) err.quote = "Required";
    if (!formData.imageDataUrl) err.image = "Image required";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    testimonials.current.push({
      quote: formData.quote,
      name: formData.name,
      designation: formData.designation,
      src: formData.imageDataUrl,
    });

    activeIndexRef.current = testimonials.current.length - 1;

    setIsModalOpen(false);
    setFormData({ name: "", designation: "", quote: "", imageDataUrl: "" });

    updateTestimonial(0);

    if (!autoplayRef.current && testimonials.current.length > 1) {
      autoplayRef.current = setInterval(() => updateTestimonial(1), 5000);
    }
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

            {/* Centered Share Experience (anchor) */}
            <div className="tsm-share-wrap tsm-share-center">
              <a
                href="#"
                className="tsm-share tsm-share-animated"
                onClick={openModal}
                aria-label="Share your experience"
              >
                Share your experience
              </a>
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

      {/* Modal */}
      {isModalOpen && (
        <>
          <div className="tsm-overlay" onClick={closeModal} />
          <div className="tsm-modal" role="dialog" aria-modal="true" aria-label="Share your experience">
            <a href="#" className="tsm-modal-close" onClick={closeModal} aria-label="Close">×</a>
            <h3 className="tsm-modal-title">Share your experience</h3>

            <form className="tsm-form" onSubmit={handleSubmit}>
              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-name">Name</label>
                <input
                  id="tsm-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={onChange}
                  required
                  aria-required="true"
                  className="tsm-input"
                />
                {errors.name && <span className="tsm-error">{errors.name}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-designation">Title</label>
                <input
                  id="tsm-designation"
                  name="designation"
                  type="text"
                  value={formData.designation}
                  onChange={onChange}
                  required
                  aria-required="true"
                  className="tsm-input"
                />
                {errors.designation && <span className="tsm-error">{errors.designation}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-quote">Testimonial</label>
                <textarea
                  id="tsm-quote"
                  name="quote"
                  rows="4"
                  value={formData.quote}
                  onChange={onChange}
                  required
                  aria-required="true"
                  className="tsm-textarea"
                />
                {errors.quote && <span className="tsm-error">{errors.quote}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-image">Photo (required)</label>
                <input
                  id="tsm-image"
                  name="image"
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  required
                  aria-required="true"
                  className="tsm-file"
                />
                {errors.image && <span className="tsm-error">{errors.image}</span>}
                {formData.imageDataUrl && (
                  <img className="tsm-preview" src={formData.imageDataUrl} alt="Preview" />
                )}
              </div>

              <div className="tsm-actions">
                <a href="#" className="tsm-btn tsm-btn-secondary" onClick={closeModal}>Cancel</a>
                <a href="#" className="tsm-btn tsm-btn-primary" onClick={handleSubmit}>Submit</a>
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
