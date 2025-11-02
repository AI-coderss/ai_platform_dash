
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

  // start empty (users add entries)
  const testimonials = useRef([]);

  // modal + form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    designation: "",
    quote: "",
    imageDataUrl: "",
  });
  const [errors, setErrors] = useState({});

  const calculateGap = (width) => {
    const minWidth = 1024, maxWidth = 1456, minGap = 60, maxGap = 86;
    if (width <= minWidth) return minGap;
    if (width >= maxWidth) return Math.max(minGap, maxGap + 0.06018 * (width - maxWidth));
    return minGap + (maxGap - minGap) * ((width - minWidth) / (maxWidth - minWidth));
  };

  const animateWords = () => {
    gsap.from(".tsm-word", { opacity: 0, y: 10, stagger: 0.02, duration: 0.2, ease: "power2.out" });
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

    // ensure <img> nodes exist
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

    // animate images
    testimonials.current.forEach((_, index) => {
      const img = imageContainer.querySelector(`[data-index="${index}"]`);
      if (!img) return;

      const offset = (index - activeIndexRef.current + len) % len;
      const zIndex = len - Math.abs(offset);
      const scale = index === activeIndexRef.current ? 1 : 0.85;

      let translateX, translateY, rotateY;
      if (offset === 0) {
        translateX = "0%"; translateY = "0%"; rotateY = 0;
      } else if (offset === 1 || offset === -2) {
        translateX = "20%"; translateY = `-${(maxStickUp / containerHeight) * 100}%`; rotateY = -15;
      } else {
        translateX = "-20%"; translateY = `-${(maxStickUp / containerHeight) * 100}%`; rotateY = 15;
      }

      gsap.to(img, {
        zIndex, opacity: 1, scale, x: translateX, y: translateY, rotateY,
        duration: 0.8, ease: "power3.out",
      });
    });

    const t = testimonials.current[activeIndexRef.current];

    gsap.to([nameEl, desigEl], {
      opacity: 0, y: -20, duration: 0.3, ease: "power2.in",
      onComplete: () => {
        nameEl.textContent = t.name;
        desigEl.textContent = t.designation;
        gsap.to([nameEl, desigEl], { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
      },
    });

    gsap.to(quoteEl, {
      opacity: 0, y: -20, duration: 0.3, ease: "power2.in",
      onComplete: () => {
        quoteEl.innerHTML = t.quote.split(" ").map((w) => `<span class="tsm-word">${w}</span>`).join(" ");
        gsap.to(quoteEl, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", onComplete: animateWords });
      },
    });
  };

  useEffect(() => {
    const len = testimonials.current.length;
    if (len === 0) {
      if (nameRef.current) nameRef.current.textContent = "";
      if (designationRef.current) designationRef.current.textContent = "";
      if (quoteRef.current) quoteRef.current.innerHTML = "";
    } else {
      if (nameRef.current) nameRef.current.textContent = testimonials.current[0].name;
      if (designationRef.current) designationRef.current.textContent = testimonials.current[0].designation;
      if (quoteRef.current) {
        quoteRef.current.innerHTML = testimonials.current[0].quote.split(" ")
          .map((w) => `<span class="tsm-word">${w}</span>`).join(" ");
        animateWords();
      }
      updateTestimonial(0);
      if (len > 1) autoplayRef.current = setInterval(() => updateTestimonial(1), 5000);
    }

    const onResize = () => {
      if (testimonials.current.length > 0) {
        const current = activeIndexRef.current;
        activeIndexRef.current = (current - 1 + testimonials.current.length) % testimonials.current.length;
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
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null; }
    updateTestimonial(-1);
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (testimonials.current.length === 0) return;
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null; }
    updateTestimonial(1);
  };

  // modal handlers
  const openModal = (e) => {
    e.preventDefault();
    if (autoplayRef.current) { clearInterval(autoplayRef.current); autoplayRef.current = null; }
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
          {/* Image stack */}
          <div className="tsm-image-container" ref={imageContainerRef} />

          {/* Content card */}
          <div className="tsm-content">
            <div>
              <h3 className="tsm-name" ref={nameRef} />
              <p className="tsm-designation" ref={designationRef} />
              <p className="tsm-quote" ref={quoteRef} />
            </div>

            {/* Centered Share button (CTA) */}
            <div className="tsm-share-wrap tsm-share-center">
              <a
                href="#"
                className="tsm-share tsm-share-cta"
                onClick={openModal}
                aria-label="Share your experience"
              >
                Share Your Experience
              </a>
            </div>

            <nav className="tsm-arrows" aria-label="testimonial navigation">
              <a href="#" className="tsm-nav tsm-prev" onClick={handlePrev} ref={prevRef} aria-label="Previous testimonial">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </a>
              <a href="#" className="tsm-nav tsm-next" onClick={handleNext} ref={nextRef} aria-label="Next testimonial">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
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

            <h3 className="tsm-modal-title">Share Your Experience</h3>

            <form className="tsm-form tsm-form-lg" onSubmit={handleSubmit}>
              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-name">Your Name</label>
                <input
                  id="tsm-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={onChange}
                  required
                  aria-required="true"
                  placeholder="e.g., Dr. Ahmed"
                  className="tsm-input tsm-input-lg"
                />
                {errors.name && <span className="tsm-error">{errors.name}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-designation">Your Role/Title</label>
                <input
                  id="tsm-designation"
                  name="designation"
                  type="text"
                  value={formData.designation}
                  onChange={onChange}
                  required
                  aria-required="true"
                  placeholder="e.g., General Practitioner"
                  className="tsm-input tsm-input-lg"
                />
                {errors.designation && <span className="tsm-error">{errors.designation}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label" htmlFor="tsm-quote">Your Testimonial</label>
                <textarea
                  id="tsm-quote"
                  name="quote"
                  rows="5"
                  value={formData.quote}
                  onChange={onChange}
                  required
                  aria-required="true"
                  placeholder="Share your experience about the DSAH platform..."
                  className="tsm-textarea tsm-input-lg"
                />
                {errors.quote && <span className="tsm-error">{errors.quote}</span>}
              </div>

              <div className="tsm-field">
                <label className="tsm-label">Your Photo</label>

                {/* custom upload control */}
                <input
                  id="tsm-image"
                  name="image"
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  required
                  aria-required="true"
                  className="tsm-file-input"
                />
                <label htmlFor="tsm-image" className="tsm-upload-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14a2 2 0 0 0 2-2v-7h-2v7H5V6h7V4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Zm7-2 6-6h-4V2h-4v10H6l6 6Z"/></svg>
                  Upload Image
                </label>
                {errors.image && <span className="tsm-error">{errors.image}</span>}

                {formData.imageDataUrl && (
                  <div className="tsm-upload-preview">
                    <img src={formData.imageDataUrl} alt="Preview" />
                    <span>Preview</span>
                  </div>
                )}
              </div>

              <div className="tsm-actions tsm-actions-lg">
                <a href="#" className="tsm-btn tsm-btn-ghost" onClick={closeModal}>Cancel</a>

                {/* anchor as CTA; form still submits on Enter via onSubmit */}
                <a href="#" className="tsm-btn tsm-btn-primary tsm-btn-gradient" onClick={handleSubmit}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  Submit Testimonial
                </a>
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

