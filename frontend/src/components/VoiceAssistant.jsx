/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";

/* ---------- WebRTC refs ---------- */
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

/* ---------- Whitelists / tools (kept intact) ---------- */
const ALLOWED_SECTIONS = new Set([
  "home",
  "products",
  "policy",
  "watch_tutorial",
  "contact",
  "footer",
  "chat",
  "doctor",
  "transcription",
  "analyst",
  "report",
  "ivf",
  "patient",
  "survey",
]);
const ALLOWED_CONTROL_IDS = new Set([
  "nav.about",
  "nav.products",
  "nav.policy",
  "nav.watch_tutorial",
  "nav.contact",
  "nav.footer",
  "products.launch:doctor",
  "products.launch:transcription",
  "products.launch:analyst",
  "products.launch:report",
  "products.launch:ivf",
  "products.launch:patient",
  "products.launch:survey",
  "products.help:doctor",
  "products.help:transcription",
  "products.help:analyst",
  "products.help:report",
  "products.help:ivf",
  "products.help:patient",
  "products.help:survey",
  "contact.submit",
]);
const TOOL_SCHEMAS = [
  {
    type: "function",
    name: "navigate_to",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { section: { type: "string", enum: Array.from(ALLOWED_SECTIONS) } },
      required: ["section"],
    },
  },
  {
    type: "function",
    name: "click_control",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { control_id: { type: "string" } },
      required: ["control_id"],
    },
  },
  {
    type: "function",
    name: "chat_ask",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 500 } },
      required: ["text"],
    },
  },
  {
    type: "function",
    name: "contact_fill",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        recipient: { type: "string" },
        message: { type: "string" },
      },
    },
  },
  { type: "function", name: "contact_submit", parameters: { type: "object", additionalProperties: false, properties: {} } },
  {
    type: "function",
    name: "toggle_theme",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { theme: { type: "string", enum: ["light", "dark", "system", "toggle"] } },
      required: ["theme"],
    },
  },
  { type: "function", name: "chat_toggle", parameters: { type: "object", additionalProperties: false, properties: {} } },
  { type: "function", name: "chat_close", parameters: { type: "object", additionalProperties: false, properties: {} } },
  {
    type: "function",
    name: "set_chat_visible",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { visible: { type: "boolean" } },
      required: ["visible"],
    },
  },
];

/* ------------------------------------------------------------------------------------
   PortalCircle: video-based portal (transparent outside), audio + hover reactive
   - No background fill (fully transparent outside the circle)
   - Uses a looping portal video for the inner visuals (from your example snippet)
   - Remote AI audio (MediaStream) drives glow thickness & subtle scale "breathing"
   - Hover highlight follows the pointer around the ring
-------------------------------------------------------------------------------------*/
const PortalCircle = ({
  stream,           // remoteStream from WebRTC (AI voice)
  size = 180,       // diameter in px (component will center itself)
  videoSrc = "https://cdn.pixabay.com/video/2020/01/22/31495-387312407_tiny.mp4",
}) => {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  // audio-reactivity
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const timeDataRef = useRef(null);
  const rafRef = useRef(0);

  // pointer highlight
  const [hover, setHover] = useState(false);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Inject tiny keyframes once
  useEffect(() => {
    const id = "portal-circle-inline-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.innerHTML = `
        @keyframes portalSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Ensure the video plays (muted/inline)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.autoplay = true;
      v.play().catch(() => {});
    };
    tryPlay();
    const onClick = () => v.play().catch(() => {});
    v.addEventListener("click", onClick);
    return () => v.removeEventListener("click", onClick);
  }, []);

  // Build AudioContext on remote stream for reactivity
  useEffect(() => {
    let ac, an, src;
    if (stream) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        an = ac.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.85;
        src = ac.createMediaStreamSource(stream);
        src.connect(an);
        audioCtxRef.current = ac;
        analyserRef.current = an;
        timeDataRef.current = new Uint8Array(an.frequencyBinCount);
      } catch (e) {
        console.warn("Audio analyser init failed:", e);
      }
    }
    return () => {
      try { src && src.disconnect(); } catch {}
      try { an && an.disconnect(); } catch {}
      try { ac && ac.close(); } catch {}
      audioCtxRef.current = null;
      analyserRef.current = null;
      timeDataRef.current = null;
    };
  }, [stream]);

  // Animation loop: set CSS vars for glow/scale and hover hotspot
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      // audio → level
      let level = 0.0;
      const an = analyserRef.current;
      const td = timeDataRef.current;
      if (an && td) {
        an.getByteFrequencyData(td);
        // take low+mid emphasis
        const end = Math.floor(td.length * 0.5);
        let sum = 0;
        for (let i = 0; i < end; i++) sum += td[i];
        level = end ? sum / (end * 255) : 0;
      }

      // ease old → new for smoother motion
      const prev = parseFloat(getComputedStyle(el).getPropertyValue("--audio").trim() || "0");
      const eased = prev * 0.85 + level * 0.15;

      // hover hotspot (angle around rim)
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mouseRef.current.x - cx;
      const dy = mouseRef.current.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const r = rect.width / 2;
      // hotspot only near rim
      const onRim = Math.max(0, Math.min(1, (dist - r * 0.62) / (r * 0.16)));
      const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2); // 0..2π
      const hotspot = hover ? onRim * 1 : 0;

      el.style.setProperty("--audio", eased.toFixed(4));
      el.style.setProperty("--hotspot", hotspot.toFixed(3));
      el.style.setProperty("--hotAngle", `${angle}rad`);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hover]);

  return (
    <div
      ref={wrapRef}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerMove={(e) => (mouseRef.current = { x: e.clientX, y: e.clientY })}
      style={{
        // container is transparent outside the circle
        width: "100%",
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        // CSS variables that drive effects
        // --audio: audio reactivity 0..1
        // --hotspot: 0..1 how strong the hover ring is
        // --hotAngle: where the hover highlight is (radians)
        "--audio": 0,
        "--hotspot": 0,
        "--hotAngle": "0rad",
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          background: "transparent",
          // subtle breath with audio + soft hover lift
          transform:
            "translateZ(0) scale(" +
            (1 + 0.03 * Number(getComputedStyle(document.documentElement).getPropertyValue("--na") || 0)).toString() +
            ")",
          // shadow intensity reacts to audio (computed below with a function)
          boxShadow:
            "0 0 " +
            Math.round(24 + 80 * (hover ? 0.2 : 0) + 180 * 0.0) + // fallback; will be overridden in effect below
            "px rgba(0,183,255,0.35)",
          willChange: "transform, box-shadow",
        }}
      >
        {/* The inner moving portal visuals — video-based, masked to circle, fully transparent outside */}
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          muted
          playsInline
          loop
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "transparent",
            // a touch of energy
            filter: "saturate(1.25) contrast(1.1)",
          }}
        />

        {/* Electric ring layer (reacts to audio + hover) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-6%",
            borderRadius: "50%",
            // mask to a thin ring around ~65% radius
            WebkitMask:
              "radial-gradient(circle at center, transparent 60%, black 61%, black 78%, transparent 79%)",
            mask: "radial-gradient(circle at center, transparent 60%, black 61%, black 78%, transparent 79%)",
            background:
              "conic-gradient(from calc(var(--hotAngle) - 0.25turn), rgba(0,212,255,0) 0deg, rgba(0,212,255,0.8) 25deg, rgba(0,212,255,0) 60deg)",
            filter: "blur(1.2px)",
            mixBlendMode: "screen",
            animation: "portalSpin 6s linear infinite",
            // opacity lifts with audio and hover
            opacity: "calc(0.35 + 0.85 * var(--audio) + 0.35 * var(--hotspot))",
            pointerEvents: "none",
          }}
        />

        {/* Outer glow that thickens with audio */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            pointerEvents: "none",
            boxShadow:
              "0 0 calc(26px + 120px * var(--audio)) rgba(0,183,255,0.45), " +
              "0 0 calc(10px + 70px * var(--audio)) rgba(0,183,255,0.35)",
          }}
        />

        {/* Rim highlight that follows the mouse around the ring */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-2%",
            borderRadius: "50%",
            WebkitMask:
              "radial-gradient(circle at center, transparent 58%, black 63%, black 78%, transparent 82%)",
            mask: "radial-gradient(circle at center, transparent 58%, black 63%, black 78%, transparent 82%)",
            background:
              "conic-gradient(from var(--hotAngle), rgba(255,255,255,0.0) 0deg, rgba(0,242,255,0.95) 18deg, rgba(255,255,255,0.0) 48deg)",
            opacity: "calc(0.06 + 0.65 * var(--hotspot))",
            filter: "blur(0.5px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            transition: "opacity 120ms linear",
          }}
        />
      </div>
    </div>
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
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      localStreamRef.current = null;
    }
    try {
      if (audioPlayerRef.current) audioPlayerRef.current.srcObject = null;
    } catch {}

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
      if (window.agentNavigate) {
        try {
          window.agentNavigate(section);
        } catch {}
      } else {
        window.dispatchEvent(new CustomEvent("agent:navigate", { detail: { section } }));
      }
      return;
    }
    if (name === "click_control") {
      const id = String(args?.control_id || "").trim();
      if (!ALLOWED_CONTROL_IDS.has(id)) return;
      const now = Date.now();
      const last = recentClicksRef.current.get(id) || 0;
      if (now - last < 400) return;
      recentClicksRef.current.set(id, now);
      const el = document.querySelector(`[data-agent-id="${CSS.escape(id)}"]`);
      if (el) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {}
        try {
          el.focus({ preventScroll: true });
        } catch {}
        try {
          el.click();
        } catch {}
      }
      return;
    }
    if (name === "chat_ask") {
      const text = String(args?.text || "").trim();
      if (!text) return;
      if (window.ChatBotBridge?.sendMessage) {
        try {
          window.ChatBotBridge.sendMessage(text);
        } catch {}
      } else {
        window.dispatchEvent(new CustomEvent("agent:chat.ask", { detail: { text } }));
      }
      return;
    }
    if (name === "contact_fill") {
      const payload = {
        name: typeof args?.name === "string" ? args.name : undefined,
        email: typeof args?.email === "string" ? args.email : undefined,
        recipient: typeof args?.recipient === "string" ? args.recipient : undefined,
        message: typeof args?.message === "string" ? args.message : undefined,
      };
      try {
        window.agentNavigate?.("contact");
      } catch {}
      if (window.ContactBridge?.fill) {
        try {
          window.ContactBridge.fill(payload);
        } catch {}
      } else {
        const setVal = (sel, val) => {
          if (val == null) return;
          const el = document.querySelector(sel);
          if (!el) return;
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setVal('[data-agent-id="contact.name"]', payload.name);
        setVal('[data-agent-id="contact.email"]', payload.email);
        setVal('[data-agent-id="contact.recipient"]', payload.recipient);
        setVal('[data-agent-id="contact.message"]', payload.message);
      }
      return;
    }
    if (name === "contact_submit") {
      try {
        window.agentNavigate?.("contact");
      } catch {}
      if (window.ContactBridge?.submit) {
        try {
          window.ContactBridge.submit();
        } catch {}
      } else {
        const btn = document.querySelector('[data-agent-id="contact.submit"]');
        if (btn) {
          try {
            btn.click();
          } catch {}
        } else {
          document.querySelector('[data-agent-id="contact.form"]')?.requestSubmit?.();
        }
      }
      return;
    }
    if (name === "toggle_theme") {
      const mode = String(args?.theme || "toggle").toLowerCase();
      const STORAGE_KEY = "app-theme";
      const getSystemPrefersDark = () =>
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const applyThemeAttr = (m) => {
        const root = document.documentElement;
        const isDark = m === "dark" || (m === "system" && getSystemPrefersDark());
        if (isDark) root.setAttribute("data-theme", "dark");
        else root.removeAttribute("data-theme");
        window.dispatchEvent(new CustomEvent("theme:changed", { detail: { mode: m, isDark } }));
      };
      const current = localStorage.getItem(STORAGE_KEY) || "light";
      let next = mode === "toggle" ? (current === "dark" ? "light" : "dark") : mode;
      localStorage.setItem(STORAGE_KEY, next);
      applyThemeAttr(next);
      return;
    }
    if (name === "set_chat_visible") {
      const on = !!args?.visible;
      if (on) {
        if (window.ChatBot?.open) {
          try {
            window.ChatBot.open();
          } catch {}
        } else {
          window.dispatchEvent(new CustomEvent("chatbot:open"));
        }
      } else {
        if (window.ChatBot?.close) {
          try {
            window.ChatBot.close();
          } catch {}
        } else {
          window.dispatchEvent(new CustomEvent("chatbot:close"));
        }
      }
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
      ch.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            turn_detection: { type: "server_vad" },
            tools: TOOL_SCHEMAS,
            tool_choice: { type: "auto" },
          },
        })
      );
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
        try {
          channel.send(JSON.stringify({ type: "response.create", response: { modalities: ["text", "audio"] } }));
        } catch {}
      };

      channel.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "conversation.item.input_audio_transcription.completed") {
          setTranscript(msg.transcript || "");
          setResponseText("");
          return;
        }
        if (msg.type === "response.text.delta") {
          setResponseText((p) => p + (msg.delta || ""));
          return;
        }
        if (msg.type === "response.done") {
          setTranscript("");
          return;
        }

        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          toolBuffersRef.current.set(id, { name: msg.item.name || "", argsText: "" });
          return;
        }
        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const prev = toolBuffersRef.current.get(id) || { name: "", argsText: "" };
          prev.argsText += msg.delta || msg.arguments_delta || "";
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
          try {
            args = JSON.parse(buf.argsText || "{}");
          } catch {}
          handleToolCall(buf.name || "unknown_tool", args);
          return;
        }
      };

      channel.onerror = () => {
        setConnectionStatus("error");
        setResponseText("Connection error.");
      };
      channel.onclose = () => {
        cleanupWebRTC();
      };

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
      if (opening) {
        chooseVoice();
        startWebRTC();
      } else {
        cleanupWebRTC();
      }
      return !prev;
    });
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const next = !isMicActive;
      setIsMicActive(next);
      try {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
      } catch {}
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
            style={{
              position: "fixed",
              top: 96,
              left: 96,
              zIndex: 1001,
              width: "380px",
              height: "600px",
              background: "transparent", // ensure the whole card is transparent behind
            }}
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.2}
          >
            <audio ref={audioPlayerRef} style={{ display: "none" }} />

            <div className="voice-header">
              <h3>Voice Assistant</h3>
              <button className="close-btn-green" onClick={toggleAssistant}>
                ✖
              </button>
            </div>

            {/* Replaced: WebGL circle → PortalCircle (video-based, fully transparent outside) */}
            <PortalCircle stream={remoteStream} size={180} />

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

