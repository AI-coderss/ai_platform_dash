/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";

/* THREE for shader circle */
import * as THREE from "three";

/* ---------- WebRTC refs ---------- */
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

/* ---------- Whitelists / tools (kept intact) ---------- */
const ALLOWED_SECTIONS = new Set([
  "home", "products", "policy", "watch_tutorial", "contact", "footer",
  "chat", "doctor", "transcription", "analyst", "report", "ivf", "patient", "survey",
]);
const ALLOWED_CONTROL_IDS = new Set([
  "nav.about", "nav.products", "nav.policy", "nav.watch_tutorial", "nav.contact", "nav.footer",
  "products.launch:doctor", "products.launch:transcription", "products.launch:analyst", "products.launch:report",
  "products.launch:ivf", "products.launch:patient", "products.launch:survey",
  "products.help:doctor", "products.help:transcription", "products.help:analyst", "products.help:report",
  "products.help:ivf", "products.help:patient", "products.help:survey",
  "contact.submit",
]);
const TOOL_SCHEMAS = [
  { type: "function", name: "navigate_to",
    parameters: { type: "object", additionalProperties: false,
      properties: { section: { type: "string", enum: Array.from(ALLOWED_SECTIONS) } },
      required: ["section"]
    }
  },
  { type: "function", name: "click_control",
    parameters: { type: "object", additionalProperties: false,
      properties: { control_id: { type: "string" } }, required: ["control_id"]
    }
  },
  { type: "function", name: "chat_ask",
    parameters: { type: "object", additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 500 } }, required: ["text"]
    }
  },
  { type: "function", name: "contact_fill",
    parameters: { type: "object", additionalProperties: false,
      properties: { name: { type: "string" }, email: { type: "string" }, recipient: { type: "string" }, message: { type: "string" } }
    }
  },
  { type: "function", name: "contact_submit",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  { type: "function", name: "toggle_theme",
    parameters: { type: "object", additionalProperties: false,
      properties: { theme: { type: "string", enum: ["light", "dark", "system", "toggle"] } }, required: ["theme"]
    }
  },
  { type: "function", name: "chat_toggle",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  { type: "function", name: "chat_close",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
  { type: "function", name: "set_chat_visible",
    parameters: { type: "object", additionalProperties: false,
      properties: { visible: { type: "boolean" } }, required: ["visible"]
    }
  },
];

/* ---------------- Water-ripple circle (your original shader & behavior) ---------------- */
const WaterRippleCircle = ({ stream, height = 170 }) => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const rafRef = useRef(0);

  // Audio analysis from AI playback (remoteStream)
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const sourceRef = useRef(null);

  // Water simulation buffers/settings (same structure as your JS)
  const waterSettingsRef = useRef({
    resolution: 256,
    damping: 0.913,
    tension: 0.02,
    rippleStrength: 0.2,
    mouseIntensity: 1.2,
    clickIntensity: 3.0,
    rippleRadius: 8,
    splatForce: 50000,
    splatThickness: 0.1,
    vorticityInfluence: 0.2,
    swirlIntensity: 0.2,
    pressure: 0.3,
    velocityDissipation: 0.08,
    densityDissipation: 1.0,
    displacementScale: 0.01,
  });

  const buffersRef = useRef(null);
  const waterTextureRef = useRef(null);

  // Pointer state (hover ripples)
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const throttleRef = useRef(0);
  const clockRef = useRef(new THREE.Clock());

  // === shaders (exactly your vertex/fragment, with final alpha = circle mask to keep canvas transparent) ===
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec3 u_color1;
    uniform vec3 u_color2;
    uniform vec3 u_color3;
    uniform vec3 u_background;
    uniform float u_speed;
    uniform sampler2D u_waterTexture;
    uniform float u_waterStrength;
    uniform float u_ripple_time;
    uniform vec2 u_ripple_position;
    uniform float u_ripple_strength;
    uniform sampler2D u_textTexture;
    uniform bool u_showText;
    uniform bool u_isMonochrome;
    uniform float u_audioLow;
    uniform float u_audioMid;
    uniform float u_audioHigh;
    uniform float u_audioOverall;
    uniform float u_audioReactivity;

    varying vec2 vUv;

    void main() {
      vec2 r = u_resolution;
      vec2 FC = gl_FragCoord.xy;
      vec2 uv = vec2(FC.x / r.x, 1.0 - FC.y / r.y);
      vec2 screenP = (FC.xy * 2.0 - r) / r.y;

      vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
      float waterHeight = texture2D(u_waterTexture, wCoord).r;
      float waterInfluence = clamp(waterHeight * u_waterStrength, -0.5, 0.5);

      float baseRadius = 0.99;
      float audioPulse = u_audioOverall * u_audioReactivity * 0.1;
      float waterPulse = waterInfluence * 0.3;
      float circleRadius = baseRadius + audioPulse + waterPulse;

      float distFromCenter = length(screenP);
      float inCircle = smoothstep(circleRadius + 0.1, circleRadius - 0.1, distFromCenter);

      vec4 o = vec4(0.0);

      if (inCircle > 0.0) {
        vec2 p = screenP * 1.1;

        float rippleTime = u_time - u_ripple_time;
        vec2 ripplePos = u_ripple_position * r;
        float rippleDist = distance(FC.xy, ripplePos);

        float clickRipple = 0.0;
        if (rippleTime < 3.0 && rippleTime > 0.0) {
          float rippleRadius = rippleTime * 150.0;
          float rippleWidth = 30.0;
          float rippleDecay = 1.0 - rippleTime / 3.0;
          clickRipple = exp(-abs(rippleDist - rippleRadius) / rippleWidth) * rippleDecay * u_ripple_strength;
        }

        float totalWaterInfluence = clamp((waterInfluence + clickRipple * 0.1) * u_waterStrength, -0.8, 0.8);
        float audioInfluence = (u_audioLow * 0.3 + u_audioMid * 0.4 + u_audioHigh * 0.3) * u_audioReactivity;

        float angle = length(p) * 4.0 + audioInfluence * 2.0;
        mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p *= R;

        float l = length(p) - 0.7 + totalWaterInfluence * 0.5 + audioInfluence * 0.2;
        float t = u_time * u_speed + totalWaterInfluence * 2.0 + audioInfluence * 1.5;
        float enhancedY = p.y + totalWaterInfluence * 0.3 + audioInfluence * 0.2;

        float pattern1 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t));
        float pattern2 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 1.0));
        float pattern3 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 2.0));

        float intensity = 1.0 + totalWaterInfluence * 0.5 + audioInfluence * 0.3;

        if (u_isMonochrome) {
          float mono = (pattern1 + pattern2 + pattern3) / 3.0 * intensity;
          o = vec4(mono, mono, mono, inCircle);
        } else {
          o.r = pattern1 * u_color1.r * intensity;
          o.g = pattern2 * u_color2.g * intensity;
          o.b = pattern3 * u_color3.b * intensity;
          o.a = inCircle;
        }
      }

      vec3 bgColor = u_isMonochrome ? vec3(0.0) : u_background;
      vec3 finalColor = mix(bgColor, o.rgb, o.a);

      // Transparent outside the circle to avoid any white box
      gl_FragColor = vec4(finalColor, o.a);
    }
  `;

  // Audio init from remote stream
  useEffect(() => {
    let ac, an, src;
    if (stream) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        an = ac.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.8;
        src = ac.createMediaStreamSource(stream);
        src.connect(an);

        audioCtxRef.current = ac;
        analyserRef.current = an;
        dataArrayRef.current = new Uint8Array(an.frequencyBinCount);
        sourceRef.current = src;
      } catch {}
    }
    return () => {
      try { src?.disconnect(); } catch {}
      try { an?.disconnect(); } catch {}
      try { ac?.close(); } catch {}
      audioCtxRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      sourceRef.current = null;
    };
  }, [stream]);

  // Water buffers + texture
  useEffect(() => {
    const resolution = waterSettingsRef.current.resolution;
    const size = resolution * resolution;

    const buffers = {
      current: new Float32Array(size),
      previous: new Float32Array(size),
      velocity: new Float32Array(size * 2),
      vorticity: new Float32Array(size),
      pressure: new Float32Array(size),
    };
    buffersRef.current = buffers;

    const tex = new THREE.DataTexture(
      buffers.current,
      resolution,
      resolution,
      THREE.RedFormat,
      THREE.FloatType
    );
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    waterTextureRef.current = tex;

    return () => {
      waterTextureRef.current?.dispose?.();
      buffersRef.current = null;
      waterTextureRef.current = null;
    };
  }, []);

  // Three.js scene
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0); // fully transparent
    el.appendChild(renderer.domElement);

    // material uniforms (initial values mirror your preset "Ice White")
    const uniforms = {
      u_time: { value: 0.0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_speed: { value: 1.3 },
      u_color1: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      u_color2: { value: new THREE.Vector3(0.9, 0.95, 1.0) },
      u_color3: { value: new THREE.Vector3(0.8, 0.9, 1.0) },
      u_background: { value: new THREE.Vector3(0.02, 0.02, 0.05) },
      u_waterTexture: { value: waterTextureRef.current },
      u_waterStrength: { value: 0.55 },
      u_ripple_time: { value: -10.0 },
      u_ripple_position: { value: new THREE.Vector2(0.5, 0.5) },
      u_ripple_strength: { value: 0.5 },
      u_textTexture: { value: null },
      u_showText: { value: false }, // no text inside circle for the card
      u_isMonochrome: { value: false },
      u_audioLow: { value: 0.0 },
      u_audioMid: { value: 0.0 },
      u_audioHigh: { value: 0.0 },
      u_audioOverall: { value: 0.0 },
      u_audioReactivity: { value: 1.0 },
      
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    meshRef.current = mesh;
    materialRef.current = material;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      material.uniforms.u_resolution.value.set(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // helpers: local -> tex coords for ripples
    const addRipple = (x, y, strength = 1.0) => {
      const ws = waterSettingsRef.current;
      const buffers = buffersRef.current;
      const resolution = ws.resolution;
      if (!buffers) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const nx = (x - rect.left) / rect.width;
      const ny = 1.0 - (y - rect.top) / rect.height;

      const texX = Math.floor(nx * resolution);
      const texY = Math.floor(ny * resolution);
      const radius = Math.max(ws.rippleRadius, Math.floor(0.1 * resolution));
      const rippleStrength = strength * (ws.splatForce / 100000);

      const radiusSq = radius * radius;
      for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
          const distSq = i * i + j * j;
          if (distSq <= radiusSq) {
            const px = texX + i;
            const py = texY + j;
            if (px >= 0 && px < resolution && py >= 0 && py < resolution) {
              const idx = py * resolution + px;
              const velIdx = idx * 2;
              const dist = Math.sqrt(distSq);
              const falloff = 1.0 - dist / radius;
              const rippleVal = Math.cos((dist / radius) * Math.PI * 0.5) * rippleStrength * falloff;
              buffers.previous[idx] += rippleVal;

              const angle = Math.atan2(j, i);
              const velStr = rippleVal * waterSettingsRef.current.swirlIntensity;
              buffers.velocity[velIdx] += Math.cos(angle) * velStr;
              buffers.velocity[velIdx + 1] += Math.sin(angle) * velStr;

              const swirlAngle = angle + Math.PI * 0.5;
              const swirlStrength = Math.min(velStr * 0.3, 0.1);
              buffers.velocity[velIdx] += Math.cos(swirlAngle) * swirlStrength;
              buffers.velocity[velIdx + 1] += Math.sin(swirlAngle) * swirlStrength;
            }
          }
        }
      }

      // uniforms for click ripple ring
      material.uniforms.u_ripple_position.value.set(nx, ny);
      material.uniforms.u_ripple_time.value = clockRef.current.getElapsedTime();
    };

    const updateWaterSimulation = () => {
      const ws = waterSettingsRef.current;
      const buffers = buffersRef.current;
      if (!buffers) return;

      const { current, previous, velocity, vorticity } = buffers;
      const { damping, resolution } = ws;
      const safeTension = Math.min(ws.tension, 0.05);
      const velocityDissipation = ws.velocityDissipation;
      const densityDissipation = ws.densityDissipation;
      const vorticityInfluence = Math.min(Math.max(ws.swirlIntensity, 0.0), 0.5);

      // dissipate velocity
      for (let i = 0; i < resolution * resolution * 2; i++) {
        velocity[i] *= 1.0 - velocityDissipation;
      }

      // vorticity calc
      for (let i = 1; i < resolution - 1; i++) {
        for (let j = 1; j < resolution - 1; j++) {
          const index = i * resolution + j;
          const left = velocity[(index - 1) * 2 + 1];
          const right = velocity[(index + 1) * 2 + 1];
          const bottom = velocity[(index - resolution) * 2];
          const top = velocity[(index + resolution) * 2];
          vorticity[index] = (right - left - (top - bottom)) * 0.5;
        }
      }

      if (vorticityInfluence > 0.001) {
        for (let i = 1; i < resolution - 1; i++) {
          for (let j = 1; j < resolution - 1; j++) {
            const index = i * resolution + j;
            const velIndex = index * 2;
            const left = Math.abs(vorticity[index - 1]);
            const right = Math.abs(vorticity[index + 1]);
            const bottom = Math.abs(vorticity[index - resolution]);
            const top = Math.abs(vorticity[index + resolution]);
            const gradX = (right - left) * 0.5;
            const gradY = (top - bottom) * 0.5;
            const len = Math.sqrt(gradX * gradX + gradY * gradY) + 1e-5;
            const safeV = Math.max(-1.0, Math.min(1.0, vorticity[index]));
            const fx = (gradY / len) * safeV * vorticityInfluence * 0.1;
            const fy = (-gradX / len) * safeV * vorticityInfluence * 0.1;
            velocity[velIndex] += Math.max(-0.1, Math.min(0.1, fx));
            velocity[velIndex + 1] += Math.max(-0.1, Math.min(0.1, fy));
          }
        }
      }

      // wave equation + damping + velocity influence
      for (let i = 1; i < resolution - 1; i++) {
        for (let j = 1; j < resolution - 1; j++) {
          const index = i * resolution + j;
          const velIndex = index * 2;
          const top = previous[index - resolution];
          const bottom = previous[index + resolution];
          const left = previous[index - 1];
          const right = previous[index + 1];
          current[index] = (top + bottom + left + right) / 2 - current[index];
          current[index] = current[index] * ws.damping + previous[index] * (1 - ws.damping);
          current[index] += (0 - previous[index]) * safeTension;

          const velMagnitude = Math.sqrt(velocity[velIndex] ** 2 + velocity[velIndex + 1] ** 2);
          const safeVelInfluence = Math.min(velMagnitude * ws.displacementScale, 0.1);
          current[index] += safeVelInfluence;

          current[index] *= 1.0 - densityDissipation * 0.01;
          current[index] = Math.max(-2.0, Math.min(2.0, current[index]));
        }
      }

      // zero boundary
      for (let i = 0; i < resolution; i++) {
        current[i] = 0;
        current[(resolution - 1) * resolution + i] = 0;
        current[i * resolution] = 0;
        current[i * resolution + (resolution - 1)] = 0;
      }

      // swap
      [buffers.current, buffers.previous] = [buffers.previous, buffers.current];
      waterTextureRef.current.image.data = buffers.current;
      waterTextureRef.current.needsUpdate = true;
    };

    // pointer interactions (hover ripples)
    const onPointerMove = (e) => {
      const now = performance.now();
      if (now - throttleRef.current < 8) return;
      throttleRef.current = now;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };

      const dx = e.movementX ?? 0;
      const dy = e.movementY ?? 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const velInfluence = Math.min(dist / 10, 2.0);
        const base = Math.min(dist / 20, 1.0);
        const intensity = base * velInfluence * waterSettingsRef.current.mouseIntensity * (0.7 + Math.random() * 0.3);
        addRipple(e.clientX, e.clientY, intensity);
      }
    };
    const onPointerDown = (e) => {
      addRipple(e.clientX, e.clientY, waterSettingsRef.current.clickIntensity);
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // initial gentle center ripple
    setTimeout(() => {
      const rect = renderer.domElement.getBoundingClientRect();
      addRipple(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.5);
    }, 400);

    // animation loop (time, audio uniforms, water sim, render)
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // time
      material.uniforms.u_time.value = clockRef.current.getElapsedTime();

      // audio from remote stream (bass/mid/treble/overall)
      const an = analyserRef.current;
      const arr = dataArrayRef.current;
      if (an && arr) {
        an.getByteFrequencyData(arr);
        const bassEnd = Math.floor(arr.length * 0.1);
        const midEnd = Math.floor(arr.length * 0.5);
        let bass = 0, mid = 0, treble = 0;
        for (let i = 0; i < bassEnd; i++) bass += arr[i];
        bass = bassEnd ? (bass / bassEnd / 255) : 0;
        for (let i = bassEnd; i < midEnd; i++) mid += arr[i];
        mid = (midEnd - bassEnd) ? (mid / (midEnd - bassEnd) / 255) : 0;
        for (let i = midEnd; i < arr.length; i++) treble += arr[i];
        treble = (arr.length - midEnd) ? (treble / (arr.length - midEnd) / 255) : 0;
        const overall = (bass + mid + treble) / 3;

        material.uniforms.u_audioLow.value = material.uniforms.u_audioLow.value * 0.8 + bass * 0.2;
        material.uniforms.u_audioMid.value = material.uniforms.u_audioMid.value * 0.8 + mid * 0.2;
        material.uniforms.u_audioHigh.value = material.uniforms.u_audioHigh.value * 0.8 + treble * 0.2;
        material.uniforms.u_audioOverall.value = material.uniforms.u_audioOverall.value * 0.8 + overall * 0.2;
      } else {
        // decay to zero if no stream
        material.uniforms.u_audioLow.value *= 0.95;
        material.uniforms.u_audioMid.value *= 0.95;
        material.uniforms.u_audioHigh.value *= 0.95;
        material.uniforms.u_audioOverall.value *= 0.95;
      }

      updateWaterSimulation();
      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      try { geometry.dispose(); } catch {}
      try { material.dispose(); } catch {}
      try { renderer.dispose(); } catch {}
      if (el && renderer.domElement && el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      meshRef.current = null;
      materialRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        marginTop: 6,
        marginBottom: 6,
        borderRadius: 12,
        overflow: "hidden",     // keep it clean inside the card
        pointerEvents: "auto",
      }}
    />
  );
};

/* --------------------------------- Main component --------------------------------- */
const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);
  const audioPlayerRef = useRef(null);
  const dragConstraintsRef = useRef(null);

  const toolBuffersRef = useRef(new Map());
  const recentClicksRef = useRef(new Map());

  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();

  useEffect(() => {
    if (dragConstraintsRef.current == null) {
      dragConstraintsRef.current = document.body;
    }
  }, []);

  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) { try { peerConnectionRef.current.close(); } catch {} peerConnectionRef.current = null; }
    if (dataChannelRef.current) { try { dataChannelRef.current.close(); } catch {} dataChannelRef.current = null; }
    if (localStreamRef.current) { try { localStreamRef.current.getTracks().forEach(t => t.stop()); } catch {} localStreamRef.current = null; }
    try { if (audioPlayerRef.current) audioPlayerRef.current.srcObject = null; } catch {}

    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript("");
    setResponseText("");
    setRemoteStream(null);
    resetToggles();
  };

  const handleToolCall = (name, args) => {
    if (!name) return;
    if (name === "navigate_to") {
      const section = String(args?.section || "").trim();
      if (!ALLOWED_SECTIONS.has(section)) return;
      if (window.agentNavigate) { try { window.agentNavigate(section); } catch {} }
      else { window.dispatchEvent(new CustomEvent("agent:navigate", { detail: { section } })); }
      return;
    }
    if (name === "click_control") {
      const id = String(args?.control_id || "").trim();
      if (!ALLOWED_CONTROL_IDS.has(id)) return;
      const now = Date.now(); const last = recentClicksRef.current.get(id) || 0;
      if (now - last < 400) return; recentClicksRef.current.set(id, now);
      const el = document.querySelector(`[data-agent-id="${CSS.escape(id)}"]`);
      if (el) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
        try { el.focus({ preventScroll: true }); } catch {}
        try { el.click(); } catch {}
      }
      return;
    }
    if (name === "chat_ask") {
      const text = String(args?.text || "").trim(); if (!text) return;
      if (window.ChatBotBridge?.sendMessage) { try { window.ChatBotBridge.sendMessage(text); } catch {} }
      else { window.dispatchEvent(new CustomEvent("agent:chat.ask", { detail: { text } })); }
      return;
    }
    if (name === "contact_fill") {
      const payload = {
        name: typeof args?.name === "string" ? args.name : undefined,
        email: typeof args?.email === "string" ? args.email : undefined,
        recipient: typeof args?.recipient === "string" ? args.recipient : undefined,
        message: typeof args?.message === "string" ? args.message : undefined,
      };
      try { window.agentNavigate?.("contact"); } catch {}
      if (window.ContactBridge?.fill) { try { window.ContactBridge.fill(payload); } catch {} }
      else {
        const setVal = (sel, val) => { if (val == null) return; const el = document.querySelector(sel); if (!el) return; el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); };
        setVal('[data-agent-id="contact.name"]', payload.name);
        setVal('[data-agent-id="contact.email"]', payload.email);
        setVal('[data-agent-id="contact.recipient"]', payload.recipient);
        setVal('[data-agent-id="contact.message"]', payload.message);
      }
      return;
    }
    if (name === "contact_submit") {
      try { window.agentNavigate?.("contact"); } catch {}
      if (window.ContactBridge?.submit) { try { window.ContactBridge.submit(); } catch {} }
      else {
        const btn = document.querySelector('[data-agent-id="contact.submit"]');
        if (btn) { try { btn.click(); } catch {} }
        else { document.querySelector('[data-agent-id="contact.form"]')?.requestSubmit?.(); }
      }
      return;
    }
    if (name === "toggle_theme") {
      const mode = String(args?.theme || "toggle").toLowerCase();
      const STORAGE_KEY = "app-theme";
      const getSystemPrefersDark = () =>
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const applyThemeAttr = (m) => {
        const root = document.documentElement;
        const isDark = m === 'dark' || (m === 'system' && getSystemPrefersDark());
        if (isDark) root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        window.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode: m, isDark } }));
      };
      const current = localStorage.getItem(STORAGE_KEY) || 'light';
      let next = mode === 'toggle' ? (current === 'dark' ? 'light' : 'dark') : mode;
      localStorage.setItem(STORAGE_KEY, next);
      applyThemeAttr(next);
      return;
    }
    if (name === "set_chat_visible") {
      const on = !!args?.visible;
      if (on) { if (window.ChatBot?.open) { try { window.ChatBot.open(); } catch {} } else { window.dispatchEvent(new CustomEvent("chatbot:open")); } }
      else { if (window.ChatBot?.close) { try { window.ChatBot.close(); } catch {} } else { window.dispatchEvent(new CustomEvent("chatbot:close")); } }
      return;
    }
    if (name === "chat_toggle") {
      if (window.ChatBot?.toggle) window.ChatBot.toggle();
      else window.dispatchEvent(new Event("chatbot:toggle"));
      return;
    }
    if (name === "chat_close") {
      if (window.ChatBot?.close) window.ChatBot.close();
      else window.dispatchEvent(new Event("chatbot:close"));
      return;
    }
  };

  const sendSessionUpdate = () => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== "open") return;
    try {
      ch.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          turn_detection: { type: "server_vad" },
          tools: TOOL_SCHEMAS,
          tool_choice: { type: "auto" }
        }
      }));
    } catch {}
  };

  const startWebRTC = async () => {
    if (peerConnectionRef.current || connectionStatus === "connecting") return;
    setConnectionStatus("connecting");
    setResponseText("Connecting to assistant...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const s = event.streams[0];
          if (audioPlayerRef.current) {
            audioPlayerRef.current.srcObject = s;
            audioPlayerRef.current.play().catch(() => {});
          }
          setRemoteStream(s);
        }
      };

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const channel = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = channel;

      channel.onopen = () => {
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);
        sendSessionUpdate();
        try { channel.send(JSON.stringify({ type: "response.create", response: { modalities: ["text","audio"] } })); } catch {}
      };

      channel.onmessage = (event) => {
        let msg; try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === "conversation.item.input_audio_transcription.completed") { setTranscript(msg.transcript || ""); setResponseText(""); return; }
        if (msg.type === "response.text.delta") { setResponseText((p) => p + (msg.delta || "")); return; }
        if (msg.type === "response.done") { setTranscript(""); return; }

        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          toolBuffersRef.current.set(id, { name: msg.item.name || "", argsText: "" });
          return;
        }
        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const prev = toolBuffersRef.current.get(id) || { name: "", argsText: "" };
          prev.argsText += (msg.delta || msg.arguments_delta || "");
          toolBuffersRef.current.set(id, prev);
          return;
        }
        if (
          msg.type === "response.function_call_arguments.done" ||
          msg.type === "tool_call_arguments.done" ||
          msg.type === "response.function_call.completed" ||
          msg.type === "tool_call.completed"
        ) {
          const id = msg.call_id || msg.id || "default";
          const buf = toolBuffersRef.current.get(id);
          toolBuffersRef.current.delete(id);
          if (!buf) return;
          let args = {};
          try { args = JSON.parse(buf.argsText || "{}"); } catch {}
          handleToolCall(buf.name || "unknown_tool", args);
          return;
        }
      };

      channel.onerror = () => { setConnectionStatus("error"); setResponseText("Connection error."); };
      channel.onclose = () => { cleanupWebRTC(); };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected" || state === "closed") cleanupWebRTC();
      };

      let offer = await pc.createOffer({ offerToReceiveAudio: true });
      offer.sdp = offer.sdp.replace(
        /a=rtpmap:\d+ opus\/48000\/2/g,
        "a=rtpmap:111 opus/48000/2\r\n" + "a=fmtp:111 minptime=10;useinbandfec=1"
      );
      await pc.setLocalDescription(offer);

      const res = await fetch("https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

    } catch (err) {
      console.error("WebRTC error:", err);
      setConnectionStatus("error");
      setResponseText("Failed to start session.");
      cleanupWebRTC();
    }
  };

  const toggleAssistant = () => {
    setIsOpen((prev) => {
      const opening = !prev;
      if (opening) { chooseVoice(); startWebRTC(); }
      else { cleanupWebRTC(); }
      return !prev;
    });
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const next = !isMicActive;
      setIsMicActive(next);
      try { localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next)); } catch {}
    }
  };

  return (
    <>
      {!isOpen && !hideVoiceBtn && (
        <motion.button className="voice-toggle-btn left" onClick={toggleAssistant}>
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="voice-sidebar glassmorphic"
            style={{ position: "fixed", top: 96, left: 96, zIndex: 1001, width: "320px", height: "400px" }}
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.2}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} />

            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>✖</button>
            </div>

            {/* Top: exact shader circle with hover ripples, transparent outside */}
            <WaterRippleCircle stream={remoteStream} height={170} />

            {/* Your existing audio wave below the circle */}
            <div className="voice-visualizer-container">
              {remoteStream ? (
                <AudioWave stream={remoteStream} />
              ) : (
                <div className="visualizer-placeholder">
                  {connectionStatus === "connected" ? "Listening..." : "Connecting..."}
                </div>
              )}
            </div>

            {/* Mic at bottom-center (unchanged) */}
            <div className="voice-controls">
              <button
                className={`mic-btn ${isMicActive ? "active" : ""}`}
                onClick={toggleMic}
                disabled={connectionStatus !== "connected"}
              >
                <FaMicrophoneAlt />
              </button>
              <span className={`status ${connectionStatus}`}>{connectionStatus}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;
