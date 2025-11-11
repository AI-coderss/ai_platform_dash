// src/components/ContactSection.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import axios from "axios";
// import confetti from "canvas-confetti";                     // ❌ removed
import { Howl, Howler } from "howler";                         // 🔊 keep
import "../styles/ContactSection.css";
import SendButton from "./SendButton";

const ContactSection = () => {
  const canvasRef = useRef(null);
  const formCardRef = useRef(null);
  const formRef = useRef(null);
  const sendSoundRef = useRef(null);

  // 🔥 Fireworks refs/state
  const fireworksCanvasRef = useRef(null);
  const fireworksRAFRef = useRef(null);
  const fireworksActiveRef = useRef(false);
  const fireworksStartAtRef = useRef(0);

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

  /* =========================
     ✨ FIREWORKS ENGINE (Canvas)
     — compact, dependency-free —
     ========================= */
  const startFireworks = () => {
    if (!fireworksCanvasRef.current) return;

    const canvas = fireworksCanvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth | 0;
      const h = canvas.clientHeight | 0;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Physics + particles
    const GRAVITY = 0.08;
    const AIR = 0.995;
    const COLORS = ["#ffcc00", "#ff3b3b", "#5ad1ff", "#9b59b6", "#2ecc71", "#ff6f91", "#ffd166"];
    const rockets = [];
    const particles = [];

    const rand = (min, max) => Math.random() * (max - min) + min;
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    function spawnRocket() {
      const x = rand(canvas.clientWidth * 0.15, canvas.clientWidth * 0.85);
      const y = canvas.clientHeight + 10;
      const vx = rand(-1.2, 1.2);
      const vy = rand(-7.5, -9.5);
      const color = pick(COLORS);
      rockets.push({ x, y, vx, vy, color, explodeY: rand(canvas.clientHeight * 0.2, canvas.clientHeight * 0.5) });
    }

    function explode(x, y, baseColor) {
      const count = 120 + (Math.random() * 40 | 0);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = rand(1.5, 4.5);
        particles.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: rand(40, 70),
          ttl: 0,
          color: baseColor,
          size: rand(1.2, 2.2),
          sparkle: Math.random() < 0.25
        });
      }
    }

    // Night sky fade (motion trails)
    function clearSoft() {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalCompositeOperation = "lighter";
    }

    function drawRocket(r) {
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.vx * 2, r.y - r.vy * 2);
      ctx.stroke();
      ctx.restore();
    }

    function drawParticle(p) {
      const alpha = Math.max(0, 1 - p.ttl / p.life);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      if (p.sparkle && Math.random() < 0.2) {
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }
      ctx.restore();
    }

    let lastSpawn = 0;
    const SPACING = 280; // ms between rockets

    fireworksActiveRef.current = true;
    fireworksStartAtRef.current = performance.now();

    const loop = (t) => {
      if (!fireworksActiveRef.current) {
        window.removeEventListener("resize", resize);
        return;
      }

      fireworksRAFRef.current = requestAnimationFrame(loop);
      clearSoft();

      // spawn rockets rhythmically
      if (!lastSpawn || t - lastSpawn > SPACING) {
        spawnRocket();
        if (Math.random() < 0.35) spawnRocket();
        lastSpawn = t;
      }

      // update rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += GRAVITY * 0.35;

        drawRocket(r);

        if (r.y <= r.explodeY || r.vy >= 0.2) {
          explode(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      // update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.ttl++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.vx *= AIR;
        p.vy *= AIR;
        drawParticle(p);
        if (p.ttl > p.life) particles.splice(i, 1);
      }

      // auto-stop after 10s
      if (t - fireworksStartAtRef.current > 10000) {
        stopFireworks(true);
      }
    };

    // paint a dark base once
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    fireworksRAFRef.current = requestAnimationFrame(loop);
  };

  const stopFireworks = (fadeOut = false) => {
    fireworksActiveRef.current = false;
    if (fireworksRAFRef.current) cancelAnimationFrame(fireworksRAFRef.current);
    const wrap = fireworksCanvasRef.current?.parentElement;
    if (!wrap) return;
    if (fadeOut) {
      wrap.classList.add("contact-fireworks--fadeout");
      setTimeout(() => {
        wrap.classList.remove("contact-fireworks--active");
        wrap.classList.remove("contact-fireworks--fadeout");
      }, 350);
    } else {
      wrap.classList.remove("contact-fireworks--active");
    }
  };

  const showFireworks = () => {
    const wrap = fireworksCanvasRef.current?.parentElement;
    if (!wrap) return;
    wrap.classList.add("contact-fireworks--active");
    startFireworks();
  };

  /* =========================
     FORM SUBMIT
     ========================= */
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

      // 🎆 replace confetti() with fireworks overlay
      showFireworks();

      setFormData({ name: "", email: "", recipient: "", message: "" });
    } catch (err) {
      console.error("❌ Error:", err);
      alert("❌ Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Voice agent bridge (untouched)
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

  /* =========================
     BACKGROUND GALAXY (unchanged)
     ========================= */
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

    const onResize = () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, []);

  /* =========================
     TILT (unchanged)
     ========================= */
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
      {/* Background stars */}
      <canvas ref={canvasRef} className="webgl" />

      {/* Fireworks overlay (hidden until submit) */}
      <div className="contact-fireworks-overlay" onClick={() => stopFireworks(true)}>
        <canvas ref={fireworksCanvasRef} className="contact-fireworks-canvas" />
        <button type="button" className="contact-fireworks-close" aria-label="Close fireworks">
          ×
        </button>
      </div>

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









