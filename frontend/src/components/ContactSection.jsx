import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import axios from "axios";
import confetti from "canvas-confetti";
import "../styles/ContactSection.css";

const ContactSection = () => {
  const canvasRef = useRef(null);
  const formRef = useRef(null);

  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [envelopeClosed, setEnvelopeClosed] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const triggerConfetti = () => {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post("https://ai-platform-dash-mailing-server-services.onrender.com/contact", formData);
      triggerConfetti();
      setEnvelopeClosed(true);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to send.");
    } finally {
      setLoading(false);
    }
  };

  // Init 3D background
  useEffect(() => {
    const scene = new THREE.Scene();
    const sizes = { width: window.innerWidth, height: window.innerHeight };
    const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
    camera.position.set(3, 3, 3);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const controls = new OrbitControls(camera, canvasRef.current);
    controls.enableDamping = true;

    const parameters = {
      count: 80000, size: 0.01, radius: 5, branches: 3, spin: 1,
      randomness: 0.2, randomnessPower: 3,
      insideColor: "#ff6030", outsideColor: "#1b3984",
    };

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(parameters.count * 3);
    const colors = new Float32Array(parameters.count * 3);
    const colorInside = new THREE.Color(parameters.insideColor);
    const colorOutside = new THREE.Color(parameters.outsideColor);

    for (let i = 0; i < parameters.count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * parameters.radius;
      const spinAngle = radius * parameters.spin;
      const branchAngle = ((i % parameters.branches) / parameters.branches) * Math.PI * 2;
      const randomX = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);
      const randomY = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);
      const randomZ = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      const mixedColor = colorInside.clone().lerp(colorOutside, radius / parameters.radius);
      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: parameters.size,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const tick = () => {
      points.rotation.y += 0.001;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();

    window.addEventListener("resize", () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
    });

    return () => renderer.dispose();
  }, []);

  return (
    <section className="contact-section">
      <canvas ref={canvasRef} className="webgl" />

      <div className={`envelope-wrapper ${envelopeClosed ? "closed" : ""}`}>
        <motion.div
          className={`contact-form-container ${envelopeClosed ? "slide-in" : ""}`}
          drag
          dragMomentum
          dragElastic={0.5}
          whileTap={{ cursor: "grabbing" }}
        >
          {!envelopeClosed ? (
            <form className="contact-form" onSubmit={handleSubmit} ref={formRef}>
              <h2>Contact Us</h2>
              <input
                type="text"
                name="name"
                placeholder="Your Name"
                required
                value={formData.name}
                onChange={handleChange}
              />
              <input
                type="email"
                name="email"
                placeholder="Your Email"
                required
                value={formData.email}
                onChange={handleChange}
              />
              <textarea
                name="message"
                placeholder="Your Message"
                rows="5"
                required
                value={formData.message}
                onChange={handleChange}
              />
              <button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send Message"}
              </button>
            </form>
          ) : (
            <div className="confirmation-message">
              <h2>✉️ Message Sent!</h2>
              <p>Thank you, {formData.name}</p>
            </div>
          )}
        </motion.div>

        <div className="envelope-base">
          <div className="envelope-top" />
          <div className="envelope-body" />
        </div>
      </div>
    </section>
  );
};

export default ContactSection;







