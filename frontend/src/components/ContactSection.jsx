import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import axios from "axios";
import confetti from "canvas-confetti";
import { Howl, Howler } from "howler";               // 🔊 NEW
import "../styles/ContactSection.css";
import SendButton from "./SendButton";

const ContactSection = () => {
  const canvasRef = useRef(null);
  const formCardRef = useRef(null);
  const formRef = useRef(null);
  const sendSoundRef = useRef(null);                 // 🔊 NEW

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    recipient: "",
    message: "",
  });

  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);

  // 🔊 init Howler sound once
  useEffect(() => {
    // Support either filename (mp3 or the provided "mb3") to be safe
    sendSoundRef.current = new Howl({
      src: ["/send.mp3"],
      preload: true,
      volume: 0.6,
    });
    return () => {
      try { sendSoundRef.current?.unload(); } catch {}
    };
  }, []);

  const playSendSound = () => {
    const snd = sendSoundRef.current;
    if (!snd) return;
    try {
      // Handle browsers that require a prior user gesture
      if (Howler.state !== "running") {
        const playOnUnlock = () => {
          try { snd.play(); } catch {}
          Howler.off("unlock", playOnUnlock);
        };
        Howler.once("unlock", playOnUnlock);
      } else {
        snd.play();
      }
    } catch {}
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 🔊 play the send sound for both manual and AI-triggered submissions
    playSendSound();

    setLoading(true);
    try {
      await axios.post(
        "https://ai-platform-dash-mailing-server-services.onrender.com/contact",
        formData
      );
      triggerConfetti();
      setFormData({ name: "", email: "", recipient: "", message: "" });
    } catch (err) {
      console.error("❌ Error:", err);
      alert("❌ Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Voice agent bridge (unchanged except it still routes through requestSubmit → handleSubmit)
  useEffect(() => {
    const fill = (payload = {}) => {
      setFormData((prev) => ({
        name: payload.name ?? prev.name,
        email: payload.email ?? prev.email,
        recipient: payload.recipient ?? prev.recipient,
        message: payload.message ?? prev.message,
      }));
      try {
        document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
      setTimeout(() => {
        if (!formData.name) { document.querySelector('[data-agent-id="contact.name"]')?.focus(); return; }
        if (!formData.email) { document.querySelector('[data-agent-id="contact.email"]')?.focus(); return; }
        if (!formData.message) { document.querySelector('[data-agent-id="contact.message"]')?.focus(); return; }
      }, 50);
    };

    const submit = () => {
      try {
        document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
      // This will trigger handleSubmit → sound plays there
      formRef.current?.requestSubmit?.();
    };

    window.ContactBridge = { fill, submit };

    const onFill = (e) => fill(e.detail || {});
    const onSubmit = () => submit();

    window.addEventListener("agent:contact.fill", onFill);
    window.addEventListener("agent:contact.submit", onSubmit);

    return () => {
      window.removeEventListener("agent:contact.fill", onFill);
      window.removeEventListener("agent:contact.submit", onSubmit);
      try { delete window.ContactBridge; } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, formData.email, formData.message]);

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
      count: 80000,
      size: 0.01,
      radius: 5,
      branches: 3,
      spin: 1,
      randomness: 0.2,
      randomnessPower: 3,
      insideColor: "#ff6030",
      outsideColor: "#1b3984",
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

  useEffect(() => {
    const handleTilt = (e) => {
      const card = formCardRef.current;
      const bounds = card.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      const rotateY = ((x / bounds.width) - 0.5) * 20;
      const rotateX = ((y / bounds.height) - 0.5) * -20;
      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };

    const resetTilt = () => {
      formCardRef.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    };

    const card = formCardRef.current;
    card.addEventListener("mousemove", handleTilt);
    card.addEventListener("mouseleave", resetTilt);

    return () => {
      card.removeEventListener("mousemove", handleTilt);
      card.removeEventListener("mouseleave", resetTilt);
    };
  }, []);

  return (
    <section className="contact-section">
      <canvas ref={canvasRef} className="webgl" />
      <div className="contact-content">
        <motion.div
          style={{ display: "inline-block" }}
          drag
          dragMomentum
          dragElastic={0.5}
          whileTap={{ cursor: "grabbing" }}
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          <div ref={formCardRef} className="contact-form-wrapper">
            <h2 className="contact-title">Contact Us</h2>
            <form
              className="contact-form"
              onSubmit={handleSubmit}
              ref={formRef}
              data-agent-id="contact.form"
            >
              <input
                type="text"
                name="name"
                placeholder="Your Name"
                required
                value={formData.name}
                onChange={handleChange}
                data-agent-id="contact.name"
              />
              <input
                type="email"
                name="email"
                placeholder="Your Email"
                required
                value={formData.email}
                onChange={handleChange}
                data-agent-id="contact.email"
              />
              <input
                type="text"
                name="recipient"
                placeholder="Recipient (optional)"
                value={formData.recipient}
                onChange={handleChange}
                data-agent-id="contact.recipient"
              />
              <textarea
                name="message"
                placeholder="Your Message"
                rows="5"
                required
                value={formData.message}
                onChange={handleChange}
                data-agent-id="contact.message"
              />
              {/* The SendButton may already submit; the sound plays on submit either way */}
              <div data-agent-id="contact.submit">
                <SendButton />
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ContactSection;








