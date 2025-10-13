/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */

// App.js
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./App.css";
import ChatBot from "./components/Chatbot";
import useCardStore from "./components/store/useCardStore";
import AudioPlayer from "./components/AudioPlayer";
import ContactSection from "./components/ContactSection";
import VoiceAssistant from "./components/VoiceAssistant";
import CardCarousel from "./components/CardCarousel";
import LaptopSection3D from "./components/LaptopSection3D";
/* import DIDAvatarWidget from "./components/DIDAvatarWidget"; */
/* import TestimonialSection from "./components/TestimonialSection"; */

// ⬇️ GSAP + SplitType (added)
import gsap from "gsap";
import SplitType from "split-type";

/* ---------------------- API BASES ---------------------- */
/** 
 * Set these to your deploys. 
 * - CHAT_API_BASE → your `app.py` (chatbot) host (empty = same origin as site).
 * - VOICE_API_BASE → your `voice.py` (voice) host.
 */
const CHAT_API_BASE = ""; 
const VOICE_API_BASE = "https://ai-platform-dash-voice-chatbot-togglabe.onrender.com";

/* ---------------------- AUDIO MAP ---------------------- */
const audioMap = {
  1: "/assets/audio/ai_doctor.mp3",
  2: "/assets/audio/medical_transcription.mp3",
  3: "/assets/audio/data_analyst.mp3",
  4: "/assets/audio/report_enhancement.mp3",
  5: "/assets/audio/ivf_assistant.mp3",
  6: "/assets/audio/patient_assistant.mp3",
};

/* ---------------------- HOVER → PROMPT ---------------------- */
const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

/**
 * Fires both:
 *  - Chatbot prompt generator:  POST {CHAT_API_BASE}/api/chatbot-prompt
 *  - Voice prompt generator:    POST {VOICE_API_BASE}/api/voice-prompt
 * …then dispatches a window event ("app-hover-prompt") so both Chatbot and
 * VoiceAssistant update immediately with the returned structured prompt.
 */
const sendHoverPrompt = async ({ visitorId, app }) => {
  if (!visitorId || !app) return;
  const tag = slugify(app.name);

  const body = {
    visitorId,
    app: {
      id: app.id,
      name: app.name,
      description: app.description,
      link: app.link,
      icon: app.icon,
      tag,
    },
  };

  try {
    // fire both in parallel; keep running if one fails
    const [chatRes, voiceRes] = await Promise.allSettled([
      fetch(`${CHAT_API_BASE}/api/chatbot-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(body),
      }),
      fetch(`${VOICE_API_BASE}/api/voice-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(body),
      }),
    ]);

    // Prefer the chatbot’s structured prompt for display (has bullets)
    let structured = null;

    if (chatRes.status === "fulfilled" && chatRes.value.ok) {
      structured = await chatRes.value.json();
    } else if (voiceRes.status === "fulfilled" && voiceRes.value.ok) {
      const v = await voiceRes.value.json();
      structured = {
        app: body.app,
        prompt: v?.instructions || "",
        title: v?.title || `Ask about ${app.name}`,
        bullets: v?.bullets || [],
      };
    } else {
      // fallback: lightweight local stub
      structured = {
        app: body.app,
        title: `Ask about ${app.name}`,
        prompt:
          `Explain how "${app.name}" works. Provide a concise walkthrough, key features, advantages, and basic steps to use it. ` +
          (app.link ? `Reference: ${app.link}` : ""),
        bullets: [
          `What problems does ${app.name} solve?`,
          `Key features of ${app.name}?`,
          `How do I get started with ${app.name}?`,
        ],
      };
    }

    // Notify the UI (Chat & Voice) with the new structured prompt
    window.dispatchEvent(
      new CustomEvent("app-hover-prompt", {
        detail: {
          visitorId,
          app: body.app,
          title: structured?.title,
          prompt: structured?.prompt,
          bullets: structured?.bullets || [],
          tag,
          ts: Date.now(),
        },
      })
    );
  } catch (e) {
    // silence network errors to avoid UI disruption
  }
};
/* -------------------- END HOVER → PROMPT -------------------- */

/* -------------------- Top Navigation ------------------- */
const NavBar = ({ theme, onToggleTheme }) => {
  const [open, setOpen] = useState(false);
  const handleNav = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };
  return (
    <nav className={`topnav ${open ? "open" : ""}`}>
      <div className="topnav-inner">
        <a href="#hero" className="brand" onClick={(e) => handleNav(e, "hero")}>
          <img src="/assets/logo.png" alt="DSAH" />
          <span>DSAH AI</span>
        </a>

        <div className="topnav-links">
          <a href="#hero" onClick={(e) => handleNav(e, "hero")}>About</a>
          <a href="#products" onClick={(e) => handleNav(e, "products")}>Products</a>
          <a href="#policy" onClick={(e) => handleNav(e, "policy")}>Our Policy</a>
          <a href="#contact" onClick={(e) => handleNav(e, "contact")}>Contact</a>
          <a href="#footer" onClick={(e) => handleNav(e, "footer")}>Footer</a>
        </div>

        <div className="topnav-actions">
          <label className="switch" aria-label="Toggle theme" title="Toggle theme">
            <input
              id="input"
              type="checkbox"
              checked={theme === "dark"}
              onChange={onToggleTheme}
            />
            <div className="slider round">
              <div className="sun-moon">
                <svg id="moon-dot-1" className="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="moon-dot-2" className="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="moon-dot-3" className="moon-dot" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="light-ray-1" className="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="light-ray-2" className="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="light-ray-3" className="light-ray" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>

                <svg id="cloud-1" className="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="cloud-2" className="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="cloud-3" className="cloud-dark" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="cloud-4" className="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="cloud-5" className="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
                <svg id="cloud-6" className="cloud-light" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>
              </div>
              <div className="stars">
                <svg id="star-1" className="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
                <svg id="star-2" className="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
                <svg id="star-3" className="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
                <svg id="star-4" className="star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
              </div>
            </div>
          </label>

          <button className="hamburger" onClick={() => setOpen((s) => !s)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </div>

      <div className="topnav-mobile">
        <a href="#hero" onClick={(e) => handleNav(e, "hero")}>About</a>
        <a href="#products" onClick={(e) => handleNav(e, "products")}>Products</a>
        <a href="#policy" onClick={(e) => handleNav(e, "policy")}>Our Policy</a>
        <a href="#contact" onClick={(e) => handleNav(e, "contact")}>Contact</a>
        <a href="#footer" onClick={(e) => handleNav(e, "footer")}>Footer</a>
      </div>
    </nav>
  );
};

/* --------------- Hero: Glass Cube that contains Heart Particles --------------- */
const LOGO_URL = "/assets/heart.png"; // heart + leaf PNG

const HeroLogoParticles = ({ theme }) => {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const sceneRef = useRef(null);
  const groupRef = useRef(null);   // cube + particles
  const cubeRef = useRef(null);

  const pointsRef = useRef(null);
  const linesRef = useRef(null);

  const posRef = useRef(null);
  const baseRef = useRef(null);
  const velRef = useRef(null);
  const spdRef = useRef(null);
  const sizesRef = useRef(null);
  const colorRef = useRef(null);

  const targetRef = useRef(null);
  const targetCountRef = useRef(0);

  const hoverRef = useRef(false);
  const lockRef = useRef(false);

  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const lastMouseRef = useRef({x:0,y:0});

  const flashRef = useRef({ t: 0, active: false });

  // morph → bounce → disperse
  const bounceRef = useRef({ active:false, started:false, t:0, duration:2.5 });
  const disperseQueuedRef = useRef(false);

  const raycaster = useRef(new THREE.Raycaster()).current;
  const mouseNDC = useRef(new THREE.Vector2()).current;
  const zPlane = useRef(new THREE.Plane(new THREE.Vector3(0,0,1), 0)).current;

  const getVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };
  const getThemeColors = () => {
    const primary = getVar("--brand-primary", theme === "dark" ? "#7aa2ff" : "#4f46e5");
    const accent  = getVar("--brand-accent",  theme === "dark" ? "#8be9fd" : "#06b6d4");
    return { primary, accent };
  };

  // ====== GSAP SplitType animation for hero title ======
  useEffect(() => {
    const split = new SplitType(".hero-title", { types: "lines, words, chars" });
    const tween = gsap.from(split.chars, {
      x: 150,
      opacity: 0,
      duration: 0.7,
      ease: "power4",
      stagger: 0.04,
      repeat: -1,
      repeatDelay: 2,
    });
    return () => {
      tween.kill();
      split.revert();
    };
  }, []);

  /* ------------ Soft studio environment (PMREM) for glass refraction ----------- */
  const buildSoftEnv = (renderer) => {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 64, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top:    { value: new THREE.Color(0xf5f7fb) },
        mid:    { value: new THREE.Color(0xdfe4ee) },
        bottom: { value: new THREE.Color(0xbfc7d8) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        void main(){
          float h = normalize(vWorld).y*0.5 + 0.5;
          vec3 c = mix(bottom, top, smoothstep(0.0,1.0,h));
          c = mix(c, mid, 0.25);
          gl_FragColor = vec4(c,1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromScene(envScene, 0.5);
    return { envMap: envRT.texture, dispose: () => { envRT.dispose(); pmrem.dispose(); } };
  };

  /* ------------------- Animated ripple normal map for glass -------------------- */
  const buildRippleTexture = () => {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;

    const draw = (time) => {
      const img = ctx.getImageData(0, 0, size, size);
      const d = img.data;
      const f1 = 12.0, f2 = 9.0, sp1 = 0.35, sp2 = -0.27, amp = 0.65;
      let p = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size, v = y / size;
          const nx = Math.sin((u * f1 + time * sp1) * Math.PI * 2) * amp;
          const ny = Math.sin((v * f2 + time * sp2) * Math.PI * 2) * amp;
          d[p++] = (nx * 0.5 + 0.5) * 255;
          d[p++] = (ny * 0.5 + 0.5) * 255;
          d[p++] = 255;
          d[p++] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    };
    return { texture: tex, draw };
  };

  /* ------------------------ Build heart target points ------------------------ */
  const buildLogoTargets = async (src, maxPts = 2200) => {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });

    const maxW = 900, maxH = 320;
    const aspect = img.width / img.height;
    let W = maxW, H = Math.round(W / aspect);
    if (H > maxH) { H = maxH; W = Math.round(H * aspect); }

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(img, 0, 0, W, H);

    const { data } = ctx.getImageData(0, 0, W, H);
    const pts = [], cols = [];
    const step = 1;

    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4;
        const a = data[i + 3];
        if (a > 40) {
          const r = data[i] / 255, g = data[i+1]/255, b = data[i+2]/255;
          pts.push([x - W/2, -(y - H/2), (Math.random()-0.5)*6]);
          cols.push([r, g, b]);
        }
      }
    }

    if (pts.length > maxPts) {
      const stride = Math.ceil(pts.length / maxPts);
      const downPts = [], downCols = [];
      for (let i = 0; i < pts.length; i += stride) { downPts.push(pts[i]); downCols.push(cols[i]); }
      pts.length = 0; cols.length = 0;
      Array.prototype.push.apply(pts, downPts);
      Array.prototype.push.apply(cols, downCols);
    }

    const RADIUS = 120;
    let maxAbs = 1;
    for (const [x, y] of pts) maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
    const HEART_SCALE = 0.30;
    const scale = (RADIUS * HEART_SCALE) / maxAbs;

    const tPositions = new Float32Array(pts.length * 3);
    const tColors = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      tPositions[i*3]     = pts[i][0] * scale;
      tPositions[i*3 + 1] = pts[i][1] * scale;
      tPositions[i*3 + 2] = pts[i][2] * 0.8;
      tColors[i*3]     = cols[i][0];
      tColors[i*3 + 1] = cols[i][1];
      tColors[i*3 + 2] = cols[i][2];
    }
    return { tPositions, tColors, count: pts.length };
  };

  useEffect(() => {
    let disposeRequested = false;
    const mount = mountRef.current;
    if (!mount) return;

    // Scene / camera / renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 80);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // Environment for realistic glass
    const { envMap, dispose: disposeEnv } = buildSoftEnv(renderer);

    // Group (cube + particles). Tilt a bit so perspective reads like a real cube.
    const group = new THREE.Group();
    group.rotation.set(0.25, 0.35, 0.0);
    groupRef.current = group;
    scene.add(group);

    /* ----------------------------- Glass Cube ----------------------------- */
    const CUBE_SIZE = 170;
    const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const ripple = buildRippleTexture();

    const cubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.06,
      transmission: 0.98,
      ior: 1.5,
      thickness: 2.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 1.0,
      envMap,
      envMapIntensity: 1.2,
      normalMap: ripple.texture,
      normalScale: new THREE.Vector2(0.6, 0.6),
    });

    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cubeRef.current = cube;

    const edgeGeom = new THREE.EdgesGeometry(cubeGeo, 1);
    const edgeMat  = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    cube.add(edgeLines);

    group.add(cube);

    /* ---------------------------- Particles setup ---------------------------- */
    const COUNT = 9000;
    const RADIUS = 120;

    const positions = new Float32Array(COUNT * 3);
    const base = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);

    const half = (CUBE_SIZE / 2) - 4;

    for (let i = 0; i < COUNT; i++) {
      const r = RADIUS * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      let x = r * Math.sin(ph) * Math.cos(th);
      let y = r * Math.sin(ph) * Math.sin(th);
      let z = r * Math.cos(ph);
      const ix = i * 3;

      x = THREE.MathUtils.clamp(x, -half, half);
      y = THREE.MathUtils.clamp(y, -half, half);
      z = THREE.MathUtils.clamp(z, -half, half);

      positions[ix] = base[ix] = x;
      positions[ix+1] = base[ix+1] = y;
      positions[ix+2] = base[ix+2] = z;
      velocities[ix] = velocities[ix+1] = velocities[ix+2] = 0;
      speeds[i] = 0.24 + Math.random() * 0.8;
      sizes[i] = Math.random() * 0.6 + 1.2;
      colors[ix] = colors[ix+1] = colors[ix+2] = 1.0;
    }

    posRef.current = positions;
    baseRef.current = base;
    velRef.current = velocities;
    spdRef.current = speeds;
    sizesRef.current = sizes;
    colorRef.current = colors;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const { primary, accent } = getThemeColors();
    const pmat = new THREE.PointsMaterial({
      size: 1.0,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true,
    });

    const points = new THREE.Points(geom, pmat);
    pointsRef.current = points;
    group.add(points);

    // connective lines (visual polish)
    const MAX_LINKS = 1600;
    const lpos = new Float32Array(MAX_LINKS * 2 * 3);
    const lgeom = new THREE.BufferGeometry();
    const lmat = new THREE.LineBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const links = new THREE.LineSegments(lgeom, lmat);
    linesRef.current = { mesh: links, positions: lpos, max: MAX_LINKS };
    scene.add(links);

    // lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 0.40);
    dir.position.set(1, 1, 1);
    scene.add(dir);

    // build heart targets
    (async () => {
      const { tPositions, tColors, count } = await buildLogoTargets(LOGO_URL, 9000);
      targetRef.current = tPositions;
      targetCountRef.current = count;

      const colAttr = colorRef.current;
      for (let i = 0; i < count; i++) {
        colAttr[i*3]     = tColors[i*3];
        colAttr[i*3 + 1] = tColors[i*3 + 1];
        colAttr[i*3 + 2] = tColors[i*3 + 2];
      }
      const tint = new THREE.Color(primary);
      for (let i = count; i < colors.length / 3; i++) {
        const ix = i*3;
        colors[ix]     = tint.r * 0.8;
        colors[ix + 1] = tint.g * 0.8;
        colors[ix + 2] = tint.b * 0.8;
      }
      points.geometry.attributes.color.needsUpdate = true;
    })();

    const wrapper = mount;

    const onEnter = () => { hoverRef.current = true; };
    const onLeave = () => { hoverRef.current = false; };
    wrapper.addEventListener("mouseenter", onEnter);
    wrapper.addEventListener("mouseleave", onLeave);

    // impulse burst
    const burst = (clientX, clientY, strength = 24) => {
      const rect = mount.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const mouseNDC = new THREE.Vector2(x, y);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, camera);
      const zPlane = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(zPlane, hit);

      const pos = posRef.current;
      const vel = velRef.current;

      for (let i = 0; i < pos.length/3; i++) {
        const ix = i*3;
        const dx = pos[ix] - hit.x, dy = pos[ix+1] - hit.y, dz = pos[ix+2] - hit.z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.0001;
        const s = (strength / d) * 0.5;
        vel[ix]     += (dx/d) * s + (Math.random()-0.5)*0.35;
        vel[ix + 1] += (dy/d) * s + (Math.random()-0.5)*0.35;
        vel[ix + 2] += (dz/d) * 0.25;
      }
    };

    // drag rotation; click toggles morph lock (visual only)
    const onPointerDown = (e) => {
      draggingRef.current = true;
      dragMovedRef.current = false;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      wrapper.style.cursor = "grabbing";
    };
    const onPointerMove = (e) => {
      if (!draggingRef.current || !groupRef.current) return;
      const dx = (e.clientX - lastMouseRef.current.x);
      const dy = (e.clientY - lastMouseRef.current.y);
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
      groupRef.current.rotation.y += dx * 0.003;
      groupRef.current.rotation.x += dy * 0.003;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      wrapper.style.cursor = "grab";
      if (!dragMovedRef.current) {
        lockRef.current = !lockRef.current;
        bounceRef.current.started = false;
        bounceRef.current.active = false;
        bounceRef.current.t = 0;
        disperseQueuedRef.current = false;
        burst(e.clientX, e.clientY, lockRef.current ? 26 : 20);
      }
      draggingRef.current = false;
    };
    wrapper.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const onDblClick = (e) => {
      burst(e.clientX, e.clientY, 40);
      flashRef.current = { t: 0, active: true };
    };
    wrapper.addEventListener("dblclick", onDblClick);

    // resize
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener("resize", onResize);

    // simple morph check & subtle animation loop
    const morphError = () => {
      const pos = posRef.current;
      const targets = targetRef.current;
      const tCount = targetCountRef.current;
      if (!targets || tCount === 0) return Infinity;
      const N = Math.min(500, tCount);
      let acc = 0;
      for (let i = 0; i < N; i++) {
        const ix = i*3;
        const dx = pos[ix] - targets[ix];
        const dy = pos[ix+1] - targets[ix+1];
        const dz = pos[ix+2] - targets[ix+2];
        acc += dx*dx + dy*dy + dz*dz;
      }
      return Math.sqrt(acc / N);
    };

    const animate = () => {
      if (disposeRequested) return;

      const dt = Math.min(clockRef.current.getDelta(), 0.033);
      const t = clockRef.current.elapsedTime;

      // group motion + idle spin
      if (groupRef.current) {
        const g = groupRef.current;
        g.position.y = Math.sin(t * 0.6) * 1.0;
        if (!draggingRef.current) g.rotation.y += 0.0007;
      }

      const pos = posRef.current;
      const base = baseRef.current;
      const vel = velRef.current;
      const spd = spdRef.current;
      const geomPos = pointsRef.current.geometry.attributes.position;

      const damping = 0.966;
      const drift = 0.0006;

      for (let i = 0; i < pos.length / 3; i++) {
        const ix = i*3;

        // organic drift
        pos[ix]     *= 1.0 + Math.sin(t * 0.12 * spd[i] + i) * drift;
        pos[ix + 1] *= 1.0 + Math.cos(t * 0.10 * spd[i] + i * 0.7) * drift;
        pos[ix + 2] *= 1.0 + Math.sin(t * 0.08 * spd[i] + i * 0.2) * drift;

        // soft pull to base
        const haloPull = 0.012;
        pos[ix]     += (base[ix] - pos[ix]) * haloPull;
        pos[ix + 1] += (base[ix + 1] - pos[ix + 1]) * haloPull;
        pos[ix + 2] += (base[ix + 2] - pos[ix + 2]) * haloPull;

        // integrate velocities
        pos[ix]     += vel[ix] *  dt;
        pos[ix + 1] += vel[ix + 1] * dt;
        pos[ix + 2] += vel[ix + 2] * dt;
        vel[ix]     *= damping;
        vel[ix + 1] *= damping;
        vel[ix + 2] *= damping;
      }

      geomPos.needsUpdate = true;

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposeRequested = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      wrapper.removeEventListener("pointerdown", onPointerDown);
      wrapper.removeEventListener("dblclick", onDblClick);
      wrapper.removeEventListener("mouseenter", onEnter);
      wrapper.removeEventListener("mouseleave", onLeave);
      if (rendererRef.current) {
        mount.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      disposeEnv();
      scene.clear();
    };
  }, []);

  // split hero
  return (
    <section id="hero" className="hero">
      <div className="hero-inner">
        <div className="hero-copy">
          <h1 className="hero-title">Intelligent Healthcare, Seamlessly Delivered</h1>
          <p className="hero-subtitle">
            We build AI assistants for doctors and patients—reliable, secure, and integrated with DSAH workflows.
          </p>
          <div className="hero-ctas">
            <a href="#products" className="btn primary">Explore Products</a>
            <a href="#contact" className="btn ghost">Talk to Us</a>
          </div>
        </div>

        {/* Right side — GLASS CUBE (true 3D) with heart inside */}
        <div className="hero-canvas-wrap" aria-hidden="true" ref={mountRef} />
      </div>
    </section>
  );
};

/* ------------------------ Product Card ------------------------ */
const AppCard = ({ app, onPlay, visitorId }) => {
  const { activeCardId } = useCardStore();
  const isActive = activeCardId === app.id;
  const cardRef = useRef(null);

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive]);

  // auto play/pause showcase audio when highlighted
  useEffect(() => {
    if (!cardRef.current) return;
    const audioEl = cardRef.current.querySelector("audio");
    if (isActive && audioEl) {
      audioEl.muted = false;
      audioEl.playsInline = true;
      const p = audioEl.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } else if (!isActive && audioEl) {
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch(e) {}
    }
  }, [isActive, app.id]);

  const handleHoverPrompt = () => {
    sendHoverPrompt({ visitorId, app });
  };

  return (
    <div
      ref={cardRef}
      className={`card animated-card ${isActive ? "highlight" : ""}`}
      tabIndex="0"
      aria-live="polite"
      onMouseEnter={handleHoverPrompt}
      onFocus={handleHoverPrompt} // keyboard users
    >
      {isActive && <><span></span><span></span><span></span><span></span></>}
      <div className="glow-border"></div>
      <div className="content">
        <img src={app.icon} alt={app.name} className="app-icon" />
        <h3 className="title">{app.name}</h3>
        <p className="copy">{app.description}</p>

        <div className="app-actions" style={{ display: 'flex', gap: '1rem' }}>
          <a href={app.link} className="btn" target="_blank" rel="noopener noreferrer">Launch</a>
          <button onClick={() => onPlay(app.helpVideo)} className="btn">Help</button>
        </div>

        {isActive && (
          <div className="audio-wrapper">
            <AudioPlayer
              src={audioMap[app.id]}
              key={audioMap[app.id]}
              autoPlay={true}
              preload="auto"
              playsInline
            />
          </div>
        )}
      </div>
    </div>
  );
};

/* ----------------------------- Footer ------------------------------- */
const Footer = () => (
  <footer id="footer" className="site-footer">
    <div className="footer-inner">
      <div className="footer-col">
        <h4>DSAH AI Platform</h4>
        <p>Building safe, reliable AI for modern healthcare.</p>
      </div>
      <div className="footer-col">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="#hero">About</a></li>
          <li><a href="#products">Products</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </div>
      <div className="footer-col">
        <h4>Contact</h4>
        <p>Email: mohmmed.bahageel@dsah.sa</p>
      </div>
    </div>
    <div className="footer-bottom">© {new Date().getFullYear()} DSAH — All rights reserved.</div>
  </footer>
);

/* -------------------------------- App ------------------------------- */
const App = () => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" ? "dark" : "light";
  });
  const [visitorId, setVisitorId] = useState(null);

  // stable per-browser visitor id to correlate hover prompts with sessions
  useEffect(() => {
    let id = localStorage.getItem("dsah_visitor_id");
    if (!id) {
      if (window.crypto?.randomUUID) id = crypto.randomUUID();
      else id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("dsah_visitor_id", id);
    }
    setVisitorId(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const surveyUrl = "https://forms.visme.co/formsPlayer/zzdk184y-ai-applications-usage-at-dsah";

  const apps = [
    {
      id: 1, name: "🧠 AI Doctor Assistant",
      description: "Get instant AI-powered medical opinions, based on the latest RAG technology",
      icon: "/icons/doctorAI.svg",
      link: "https://ai-doctor-assistant-app-dev.onrender.com",
      helpVideo: "/videos/doctorai.mp4",
    },
    {
      id: 2, name: "📋 Medical Transcription App",
      description: "Generate structured medical notes from consultations",
      icon: "/icons/hospital.svg",
      link: "https://medicaltranscription-version2-tests.onrender.com",
      helpVideo: "/videos/transcriptionapp.mp4",
    },
    {
      id: 3, name: "📊 AI-Powered Data Analyst",
      description: "Upload and analyze hospital data instantly, visualize the results",
      icon: "/icons/dashboard.svg",
      link: "/videos/unddev.mp4",
      helpVideo: "/videos/unddev.mp4",
    },
    {
      id: 4, name: "🧠 Medical Report Enhancement App",
      description: "Enhance the quality of medical reports using AI",
      icon: "/icons/report.svg",
      link: "https://medical-report-editor-ai-powered-dsah.onrender.com",
      helpVideo: "/videos/medreport.mp4",
    },
    {
      id: 5, name: "🧠 IVF Virtual Training Assistant",
      description: "Designed to assist IVF fellowships at DSAH using RAG technology",
      icon: "/icons/ivf.svg",
      link: "https://ivf-virtual-training-assistant-dsah.onrender.com",
      helpVideo: "/videos/ivf.mp4",
    },
    {
      id: 6, name: "💬 Patient Assistant",
      description: "Voice assistant for patient navigation and booking",
      icon: "/icons/voice.svg",
      link: "https://patient-ai-assistant-mulltimodal-app.onrender.com",
      helpVideo: "/videos/unddev.mp4",
    },
  ];

  return (
    <div className="container">
      <NavBar theme={theme} onToggleTheme={toggleTheme} />

      {/* Header */}
      <div className="header">
        <div className="logo-container">
          <img src="/assets/logo.png" alt="Hospital Logo" className="hospital-logo" />
        </div>
        <div className="title-block">
          <div id="BrushCursor">
            <div className="container">
              <div className="p p1">DSAH AI PLATFORM 🧠</div>
              <div className="p p2">DSAH AI PLATFORM 🧠</div>
              <div className="p p3">DSAH AI PLATFORM 🧠<div className="cursor"></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero with text + GLASS CUBE */}
      <HeroLogoParticles theme={theme} />

      {/* Video modal */}
      {videoUrl && (
        <div className="video-modal">
          <div className="video-wrapper">
            <button className="close-video" onClick={() => setVideoUrl(null)}>✖</button>
            <iframe src={videoUrl} title="Help Video" allow="autoplay; encrypted-media" allowFullScreen />
          </div>
        </div>
      )}

      {/* Products */}
      <section id="products" className="products-section">
        <h2 className="section-title">Our Products</h2>
        <div className="page-content">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} onPlay={setVideoUrl} visitorId={visitorId} />
          ))}
        </div>
      </section>

      <CardCarousel />

      <section id="policy" className="policy-section">
        <LaptopSection3D />
      </section>

      <a href={surveyUrl} className="btn survey-fab-button" target="_blank" rel="noopener noreferrer" title="Take our Survey">
        Take Survey 📝
      </a>

      <div className="contact" href="#contact" id="contact">
        <ContactSection />
      </div>

      {/* Voice + Chat receive hover prompt via event */}
      <VoiceAssistant visitorId={visitorId} voiceApiBase={VOICE_API_BASE} />
      <ChatBot visitorId={visitorId} chatApiBase={CHAT_API_BASE} />

      <Footer />
    </div>
  );
};

export default App;


