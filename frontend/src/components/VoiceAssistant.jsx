/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-concat */
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { FaMicrophoneAlt } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import AudioWave from "./AudioWave";
import "../styles/VoiceAssistant.css";
import useUiStore from "./store/useUiStore";
import * as THREE from "three";

/* ---------- WebRTC refs ---------- */
const peerConnectionRef = React.createRef();
const dataChannelRef = React.createRef();
const localStreamRef = React.createRef();

/* ---------- Whitelists / tools (kept intact) ---------- */
const ALLOWED_SECTIONS = new Set([
  "home","products","policy","watch_tutorial","contact","footer",
  "chat","doctor","transcription","analyst","report","ivf","patient","survey",
]);
const ALLOWED_CONTROL_IDS = new Set([
  "nav.about","nav.products","nav.policy","nav.watch_tutorial","nav.contact","nav.footer",
  "products.launch:doctor","products.launch:transcription","products.launch:analyst","products.launch:report",
  "products.launch:ivf","products.launch:patient","products.launch:survey",
  "products.help:doctor","products.help:transcription","products.help:analyst","products.help:report",
  "products.help:ivf","products.help:patient","products.help:survey",
  "contact.submit",
]);
const TOOL_SCHEMAS = [
  {
    type: "function", name: "navigate_to",
    parameters: { type: "object", additionalProperties: false,
      properties: { section: { type: "string", enum: Array.from(ALLOWED_SECTIONS) } },
      required: ["section"]
    }
  },
  {
    type: "function", name: "click_control",
    parameters: { type: "object", additionalProperties: false,
      properties: { control_id: { type: "string" } }, required: ["control_id"]
    }
  },
  {
    type: "function", name: "chat_ask",
    parameters: { type: "object", additionalProperties: false,
      properties: { text: { type: "string", minLength: 1, maxLength: 500 } }, required: ["text"]
    }
  },
  {
    type: "function", name: "contact_fill",
    parameters: { type: "object", additionalProperties: false,
      properties: { name: { type: "string" }, email: { type: "string" }, recipient: { type: "string" }, message: { type: "string" } }
    }
  },
  {
    type: "function", name: "contact_submit",
    parameters: { type: "object", additionalProperties: false, properties: {} }
  },
];

/* ---------- GLASS CUBE SHADERS (transparent; no background) ---------- */
const cubeVS = `#version 300 es
in vec2 position;
void main(){ gl_Position = vec4(position,0.,1.); }`;

const cubeFS = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;

#define PI 3.14159265359
#define S smoothstep

mat3 rotX(float a){ float s=sin(a), c=cos(a); return mat3(vec3(1,0,0), vec3(0,c,-s), vec3(0,s,c)); }
mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(vec3(c,0,s), vec3(0,1,0), vec3(-s,0,c)); }
mat3 rotZ(float a){ float s=sin(a), c=cos(a); return mat3(vec3(c,-s,0), vec3(s,c,0), vec3(0,0,1)); }

float rnd(float a){ return fract(sin(a*76.5453123)*45617.234); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float n=i.x+i.y*57.;
  float a=mix(rnd(n),rnd(n+1.),f.x);
  float b=mix(rnd(n+57.),rnd(n+58.),f.x);
  return mix(a,b,f.y);
}

float boxSDF(vec3 p, vec3 s, float r){
  p=abs(p)-s;
  return length(max(p,0.))+min(0.,max(max(p.x,p.y),p.z))-r;
}

float glassSDF(vec3 p){
  float wob = S(0.,1., clamp(noise((p.xz + p.yy)*6.), 0.35, 0.65));
  return boxSDF(p, vec3(1.), 0.06) * wob;
}

vec3 normal(vec3 p){
  vec2 e=vec2(1e-2,0.);
  float d=glassSDF(p);
  vec3 n = d - vec3(
    glassSDF(p - e.xyy),
    glassSDF(p - e.yxy),
    glassSDF(p - e.yyx)
  );
  return normalize(n);
}

vec3 dir(vec2 uv, vec3 ro, vec3 t, float z){
  vec3 up=vec3(0,1,0);
  vec3 f=normalize(t-ro);
  vec3 r=normalize(cross(up,f));
  vec3 u=cross(f,r);
  return normalize(f*z + uv.x*r + uv.y*u);
}

void main(){
  vec2 uv=(gl_FragCoord.xy - 0.5*resolution.xy)/min(resolution.x,resolution.y);

  vec3 ro=vec3(0.,0.,-3.8);
  float total=24.0, ph = mod(time,total), a;
  if(ph<6.){ a=-ph*(PI/3.); ro*=rotY(a); }
  else if(ph<12.){ a=-(6.*(PI/3.))+(ph-6.)*(PI/3.); ro*=rotY(a); }
  else if(ph<18.){ a=(ph-12.)*(PI/3.); ro*=rotZ(a); }
  else{ float t4=ph-18.; float pitch=sin(t4*PI/6.)*1.2; ro*=rotX(pitch); }

  vec3 rd=dir(uv,ro,vec3(0),1.);
  vec3 col=vec3(0.0); float alpha=0.0; float side=1.0;

  vec3 glassTint = vec3(0.78, 0.88, 1.0);

  vec3 p=ro;
  for(float i=0.; i<90.; i++){
    float d = glassSDF(p)*side;
    if(d<1e-3){
      vec3 n = normal(p)*side;
      float fres = pow(1.0 - max(0.0, dot(-rd,n)), 5.0);
      float gloss = pow(max(0.0, dot(reflect(-rd,n), n)), 14.0);
      col += 0.08*glassTint + 0.34*fres*glassTint + 0.18*gloss;
      alpha += mix(0.16, 0.72, fres);
      side = -side;
      vec3 rdo = refract(rd, n, 1.0 + 0.42*side);
      if(dot(rdo,rdo)==0.0) rdo = reflect(rd, n);
      rd = rdo;
      d = 0.08;
    }
    if(d>20.) break;
    p += rd * d;
  }

  col = mix(col, vec3(1.0), 0.06);
  alpha = clamp(alpha, 0.0, 0.88);
  fragColor = vec4(col, alpha);
}
`;

/* ---------- SUBSTANCE CIRCLE (hover ripples; transparent) ---------- */
const subVertex = `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=vec4(position,1.0); }
`;

const subFragment = `
  uniform float u_time;
  uniform vec2  u_res;
  uniform vec3  u_c1, u_c2, u_c3;
  uniform float u_speed;
  uniform sampler2D u_tex;      // ripple field
  uniform float u_strength;
  uniform float u_rt;           // last ripple time
  uniform vec2  u_rpos;         // ripple position (0..1)
  uniform float u_rstr;         // ripple strength
  uniform float u_baseR;        // << circle radius (kept small & centered)

  // audio-reactive uniforms (from remote AI voice)
  uniform float u_aLow;
  uniform float u_aMid;
  uniform float u_aHigh;
  uniform float u_aOverall;
  uniform float u_aReact;

  varying vec2 vUv;

  void main(){
    vec2 R = u_res;
    vec2 FC = gl_FragCoord.xy;
    vec2 sc = (FC*2.0 - R) / R.y;

    // Compact circle well inside the cube bounds
    float baseRadius = u_baseR;               
    float audioPulse = u_aOverall * u_aReact * 0.06;
    float texH = texture2D(u_tex, FC / R).r;
    float waterPulse = clamp(texH * u_strength, -0.5, 0.5) * 0.22;
    float circleR = baseRadius + audioPulse + waterPulse;

    float dist = length(sc);
    float inCircle = smoothstep(circleR + 0.06, circleR - 0.06, dist);
    if (inCircle <= 0.0) { gl_FragColor = vec4(0.0); return; }

    vec2 p = sc * 1.05;
    float t = u_time * u_speed + waterPulse * 2.0 + (u_aLow*0.3 + u_aMid*0.4 + u_aHigh*0.3) * u_aReact * 1.2;

    float l = length(p) - 0.62 + waterPulse * 0.42;
    float py = p.y + waterPulse * 0.22;

    float pat1 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1, -l) - sin(l + py + t));
    float pat2 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1, -l) - sin(l + py + t + 1.0));
    float pat3 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1, -l) - sin(l + py + t + 2.0));

    float intensity = 1.0 + waterPulse * 0.45 + (u_aLow*0.3 + u_aMid*0.4 + u_aHigh*0.3) * u_aReact * 0.35;

    vec3 col = vec3(0.0);
    col.r = pat1 * u_c1.r * intensity;
    col.g = pat2 * u_c2.g * intensity;
    col.b = pat3 * u_c3.b * intensity;

    gl_FragColor = vec4(col, inCircle);
  }
`;

/* ---------- helpers ---------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hslToRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const VoiceAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [remoteStream, setRemoteStream] = useState(null);

  const audioPlayerRef = useRef(null);

  // DOM / layout
  const wrapRef = useRef(null);
  const cubeCanvasRef = useRef(null);
  const subMountRef = useRef(null);

  // Cube GL
  const cubeGlRef = useRef(null);
  const cubeProgRef = useRef(null);
  const cubeBufRef = useRef(null);
  const cubePosLocRef = useRef(null);
  const cubeTimeLocRef = useRef(null);
  const cubeResLocRef = useRef(null);
  const cubeRAF = useRef(0);

  // Substance (Three.js)
  const subRendererRef = useRef(null);
  const subSceneRef = useRef(null);
  const subCameraRef = useRef(null);
  const subMatRef = useRef(null);
  const subClockRef = useRef(null);
  const subRAF = useRef(0);
  const subTexRef = useRef(null);
  const subDataRef = useRef({
    res: 192,
    current: null,
    previous: null,
  });
  const subAliveRef = useRef(false);

  // Remote audio analyser (AI talkback)
  const remoteACtxRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const remoteSourceRef = useRef(null);
  const levelSmoothRef = useRef(0);

  const { hideVoiceBtn, chooseVoice, resetToggles } = useUiStore();
  const toolBuffersRef = useRef(new Map());
  const recentClicksRef = useRef(new Map());

  /* ---------- WebRTC core ---------- */
  const cleanupWebRTC = () => {
    if (peerConnectionRef.current) { try { peerConnectionRef.current.close(); } catch {} peerConnectionRef.current = null; }
    if (dataChannelRef.current) { try { dataChannelRef.current.close(); } catch {} dataChannelRef.current = null; }
    if (localStreamRef.current) { try { localStreamRef.current.getTracks().forEach(t=>t.stop()); } catch {} localStreamRef.current=null; }

    // teardown remote analyser
    try {
      if (remoteSourceRef.current) { remoteSourceRef.current.disconnect(); remoteSourceRef.current = null; }
      if (remoteAnalyserRef.current) { remoteAnalyserRef.current.disconnect(); remoteAnalyserRef.current = null; }
      if (remoteACtxRef.current) { remoteACtxRef.current.close(); remoteACtxRef.current = null; }
    } catch {}
    setRemoteStream(null);
    try { if (audioPlayerRef.current) audioPlayerRef.current.srcObject = null; } catch {}

    setConnectionStatus("idle");
    setIsMicActive(false);
    setTranscript(""); setResponseText("");
    resetToggles();
  };

  const sendSessionUpdate = () => {
    const ch = dataChannelRef.current;
    if (!ch || ch.readyState !== "open") return;
    try {
      ch.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "alloy",
          modalities: ["text","audio"],
          turn_detection: { type: "server_vad" },
          tools: TOOL_SCHEMAS, tool_choice: { type: "auto" },
          instructions:
            "You are the DSAH voice assistant. Use tools (navigate_to, click_control, chat_ask, contact_fill, contact_submit). " +
            "For email: collect name, email, optional recipient, message; call contact_fill then contact_submit."
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
            audioPlayerRef.current.play().catch(()=>{});
          }
          setRemoteStream(s);
          setupRemoteAnalyser(s);   // 🔊 colors & waveform scale react to AI voice
        }
      };
      stream.getTracks().forEach((t)=>pc.addTrack(t, stream));

      const ch = pc.createDataChannel("response", { ordered: true });
      dataChannelRef.current = ch;

      ch.onopen = () => {
        setConnectionStatus("connected");
        setResponseText("Connected! Speak now...");
        setIsMicActive(true);
        try { ch.send(JSON.stringify({ type: "response.create", response: { modalities: ["text","audio"] } })); } catch {}
        sendSessionUpdate();
      };
      ch.onmessage = (event) => {
        let msg; try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
          case "conversation.item.input_audio_transcription.completed": setTranscript(msg.transcript||""); setResponseText(""); break;
          case "response.text.delta": setResponseText(prev => prev + (msg.delta || "")); break;
          case "response.done": setTranscript(""); break;
          default: break;
        }
        // Tool streaming buffer
        if (msg.type === "response.output_item.added" && msg.item?.type === "function_call") {
          const id = msg.item.call_id || msg.item.id || "default";
          const prev = toolBuffersRef.current.get(id) || { name:"", argsText:"" };
          prev.name = msg.item.name || prev.name;
          toolBuffersRef.current.set(id, prev);
          return;
        }
        if (msg.type === "response.function_call_arguments.delta" || msg.type === "tool_call.delta") {
          const id = msg.call_id || msg.id || "default";
          const delta = msg.delta || msg.arguments_delta || "";
          const prev = toolBuffersRef.current.get(id) || { name:"", argsText:"" };
          prev.argsText += (delta || "");
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
        }
      };
      ch.onerror = () => { setConnectionStatus("error"); setResponseText("Connection error."); };
      ch.onclose = cleanupWebRTC;
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s==="failed" || s==="disconnected" || s==="closed") cleanupWebRTC();
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      offer.sdp = offer.sdp.replace(
        /a=rtpmap:\d+ opus\/48000\/2/g,
        "a=rtpmap:111 opus/48000/2\r\n" + "a=fmtp:111 minptime=10;useinbandfec=1"
      );
      await pc.setLocalDescription(offer);

      const res = await fetch(
        "https://ai-platform-dash-voice-chatbot-togglabe.onrender.com/api/rtc-connect",
        { method:"POST", headers:{ "Content-Type":"application/sdp" }, body: offer.sdp }
      );
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const answer = await res.text();
      await pc.setRemoteDescription({ type:"answer", sdp: answer });
    } catch {
      setConnectionStatus("error");
      setResponseText("Failed to start session.");
      cleanupWebRTC();
    }
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
        try { el.scrollIntoView({ behavior:"smooth", block:"center" }); } catch {}
        try { el.focus({ preventScroll:true }); } catch {}
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
        const setVal = (sel, val) => { if (val == null) return; const el = document.querySelector(sel); if (!el) return; el.value = val; el.dispatchEvent(new Event("input", { bubbles:true })); };
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
  };

  /* ---------- Remote analyser (AI audio) ---------- */
  const setupRemoteAnalyser = (stream) => {
    try {
      if (remoteACtxRef.current) return; // already set
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;

      const src = ac.createMediaStreamSource(stream);
      src.connect(analyser);

      remoteACtxRef.current = ac;
      remoteAnalyserRef.current = analyser;
      remoteSourceRef.current = src;
    } catch (e) {
      // if it fails, colors will just idle
      console.warn("Remote analyser init failed:", e);
    }
  };

  const readRemoteLevels = () => {
    const analyser = remoteAnalyserRef.current;
    if (!analyser) return { bass:0, mid:0, treble:0, overall:0 };
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bassEnd = Math.floor(data.length * 0.12);
    const midEnd  = Math.floor(data.length * 0.5);
    let b=0,m=0,t=0;
    for (let i=0;i<bassEnd;i++) b+=data[i];
    for (let i=bassEnd;i<midEnd;i++) m+=data[i];
    for (let i=midEnd;i<data.length;i++) t+=data[i];
    b = (b/bassEnd)/255; m=(m/(midEnd-bassEnd))/255; t=(t/(data.length-midEnd))/255;
    let overall = (b+m+t)/3;
    // smooth
    levelSmoothRef.current = levelSmoothRef.current*0.85 + overall*0.15;
    overall = levelSmoothRef.current;
    return { bass:b, mid:m, treble:t, overall };
  };

  /* ---------- Cube GL init/render ---------- */
  const initCube = () => {
    const holder = wrapRef.current;
    const canvas = cubeCanvasRef.current;
    if (!holder || !canvas) return;

    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return;
    cubeGlRef.current = gl;

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, cubeVS);
    const fs = compile(gl.FRAGMENT_SHADER, cubeFS);
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
    cubeProgRef.current = prog;

    const verts = new Float32Array([-1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1]);
    const buf = gl.createBuffer(); cubeBufRef.current = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "position"); cubePosLocRef.current = posLoc;
    gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    cubeTimeLocRef.current = gl.getUniformLocation(prog, "time");
    cubeResLocRef.current = gl.getUniformLocation(prog, "resolution");

    gl.clearColor(0,0,0,0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const rect = holder.getBoundingClientRect();
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0,0,canvas.width, canvas.height);
    };

    const draw = (now) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(cubeProgRef.current);
      gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufRef.current);
      gl.uniform1f(cubeTimeLocRef.current, now * 0.001);
      gl.uniform2f(cubeResLocRef.current, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = (now) => { draw(now); cubeRAF.current = requestAnimationFrame(loop); };
    resize();
    window.addEventListener("resize", resize);
    cubeRAF.current = requestAnimationFrame(loop);

    canvas.__cleanup = () => {
      cancelAnimationFrame(cubeRAF.current);
      window.removeEventListener("resize", resize);
      try { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch {}
      cubeGlRef.current = null; cubeProgRef.current=null; cubeBufRef.current=null;
    };
  };
  const teardownCube = () => {
    const canvas = cubeCanvasRef.current;
    if (canvas && typeof canvas.__cleanup === "function") { try { canvas.__cleanup(); } catch {} delete canvas.__cleanup; }
  };

  /* ---------- Substance setup (Three.js) ---------- */
  const initSubstance = () => {
    const mount = subMountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // fully transparent
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    subRendererRef.current = renderer;
    subSceneRef.current = scene;
    subCameraRef.current = camera;
    subAliveRef.current = true;

    // Ripple field
    const res = subDataRef.current.res;
    const current = new Float32Array(res * res);
    const previous = new Float32Array(res * res);
    subDataRef.current.current = current;
    subDataRef.current.previous = previous;

    const tex = new THREE.DataTexture(current, res, res, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    subTexRef.current = tex;

    const uniforms = {
      u_time: { value: 0.0 },
      u_res:  { value: new THREE.Vector2(1,1) },
      u_c1:   { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      u_c2:   { value: new THREE.Vector3(0.9, 0.95, 1.0) },
      u_c3:   { value: new THREE.Vector3(0.8, 0.9, 1.0) },
      u_speed:{ value: 1.3 },
      u_tex:  { value: tex },
      u_strength: { value: 0.45 },
      u_rt:   { value: -10.0 },
      u_rpos: { value: new THREE.Vector2(0.5, 0.5) },
      u_rstr: { value: 0.5 },
      u_baseR:{ value: 0.45},  // << small circle to sit inside cube

      // audio-reactive (driven by remote AI voice)
      u_aLow: { value: 0.0 },
      u_aMid: { value: 0.0 },
      u_aHigh:{ value: 0.0 },
      u_aOverall: { value: 0.0 },
      u_aReact:   { value: 1.0 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: subVertex,
      fragmentShader: subFragment,
      uniforms,
      transparent: true,
    });
    subMatRef.current = mat;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat);
    scene.add(mesh);

    // Sizing to container
    const resize = () => {
      if (!subAliveRef.current) return;
      const rect = mount.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      mat.uniforms.u_res.value.set(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    mount.__ro = ro;

    // Mouse → ripples (hover enabled)
    const addRipple = (clientX, clientY, strength = 1.0) => {
      if (!subAliveRef.current) return;
      const rect = mount.getBoundingClientRect();
      const nx = clamp01((clientX - rect.left) / rect.width);
      const ny = clamp01((clientY - rect.top) / rect.height);
      const R = subDataRef.current.res;
      const tx = Math.floor(nx * R);
      const ty = Math.floor((1 - ny) * R);
      const radius = Math.floor(0.08 * R);
      const r2 = radius * radius;
      const prev = subDataRef.current.previous;
      for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
          const d2 = i*i + j*j;
          if (d2 <= r2) {
            const px = tx + i, py = ty + j;
            if (px>=0 && px<R && py>=0 && py<R) {
              const idx = py*R + px;
              const dist = Math.sqrt(d2);
              const fall = 1.0 - dist / radius;
              prev[idx] += Math.cos((dist / radius) * Math.PI * 0.5) * strength * fall * 0.6;
            }
          }
        }
      }
      mat.uniforms.u_rpos.value.set(nx, 1 - ny);
      mat.uniforms.u_rt.value = subClockRef.current.getElapsedTime();
    };

    let lastMove = 0;
    const onMove = (e) => {
      const now = performance.now();
      if (now - lastMove < 10) return;
      lastMove = now;
      if (e.touches && e.touches[0]) addRipple(e.touches[0].clientX, e.touches[0].clientY, 0.9);
      else addRipple(e.clientX, e.clientY, 0.9);
    };
    mount.addEventListener("mousemove", onMove, { passive: true });
    mount.addEventListener("touchmove", onMove, { passive: true });
    const onClick = (e) => addRipple(e.clientX, e.clientY, 2.0);
    mount.addEventListener("click", onClick);

    // Ripple simulation step (with guards to avoid 'image' null error)
    const stepRipples = () => {
      if (!subAliveRef.current) return;
      const tex = subTexRef.current;
      if (!tex || !tex.image || !tex.image.data) return;

      const R = subDataRef.current.res;
      const cur = subDataRef.current.current;
      const prev = subDataRef.current.previous;
      if (!cur || !prev) return;

      const damp = 0.913;
      const tension = 0.02;

      for (let y=1; y<R-1; y++){
        for (let x=1; x<R-1; x++){
          const i = y*R + x;
          const top = prev[i - R], bottom = prev[i + R], left = prev[i - 1], right = prev[i + 1];
          let v = (top + bottom + left + right) * 0.5 - cur[i];
          v = v * damp + prev[i] * (1.0 - damp);
          v += (0 - prev[i]) * Math.min(tension, 0.05);
          cur[i] = Math.max(-2.0, Math.min(2.0, v));
        }
      }
      for (let i=0;i<R;i++){ cur[i]=0; cur[(R-1)*R+i]=0; cur[i*R]=0; cur[i*R+(R-1)]=0; }
      subDataRef.current.current = prev;
      subDataRef.current.previous = cur;

      // update texture safely
      if (subTexRef.current && subTexRef.current.image) {
        subTexRef.current.image.data = subDataRef.current.current;
        subTexRef.current.needsUpdate = true;
      }
    };

    subClockRef.current = new THREE.Clock();

    const animate = () => {
      if (!subAliveRef.current) return; // stop loop if torn down
      subRAF.current = requestAnimationFrame(animate);

      // audio-reactive colors & uniforms from remote AI voice
      const { bass, mid, treble, overall } = readRemoteLevels();
      // push uniforms
      mat.uniforms.u_aLow.value = mat.uniforms.u_aLow.value*0.8 + bass*0.2;
      mat.uniforms.u_aMid.value = mat.uniforms.u_aMid.value*0.8 + mid*0.2;
      mat.uniforms.u_aHigh.value= mat.uniforms.u_aHigh.value*0.8 + treble*0.2;
      mat.uniforms.u_aOverall.value = mat.uniforms.u_aOverall.value*0.8 + overall*0.2;

      // drive palette hue by overall level (icy base 190°..215°)
      const hue = 190 + Math.min(25, overall*120);
      const s = 0.70, l1=0.70, l2=0.85, l3=0.92;
      const [r1,g1,b1] = hslToRgb(hue,   s, l1);
      const [r2,g2,b2] = hslToRgb(hue+8, s, l2);
      const [r3,g3,b3] = hslToRgb(hue+16,s, l3);
      mat.uniforms.u_c1.value.set(r1,g1,b1);
      mat.uniforms.u_c2.value.set(r2,g2,b2);
      mat.uniforms.u_c3.value.set(r3,g3,b3);

      // also boost the visual audio wave amplitude via CSS var
      if (wrapRef.current) {
        const scale = 1.8 + overall * 3.2; // big, obvious fluctuations
        wrapRef.current.style.setProperty("--va2-wave-scale", String(scale));
      }

      const t = subClockRef.current.getElapsedTime();
      mat.uniforms.u_time.value = t;
      stepRipples();

      // render if still alive
      if (subRendererRef.current && subSceneRef.current && subCameraRef.current) {
        subRendererRef.current.render(subSceneRef.current, subCameraRef.current);
      }
    };

    animate();

    mount.__cleanup = () => {
      subAliveRef.current = false;
      cancelAnimationFrame(subRAF.current);
      try { mount.removeEventListener("mousemove", onMove); } catch {}
      try { mount.removeEventListener("touchmove", onMove); } catch {}
      try { mount.removeEventListener("click", onClick); } catch {}
      try { mount.__ro?.disconnect(); } catch {}
      try { renderer.dispose(); } catch {}
      subRendererRef.current = null;
      subSceneRef.current = null;
      subCameraRef.current = null;
      subMatRef.current = null;
      subTexRef.current = null;
      subDataRef.current.current = null;
      subDataRef.current.previous = null;
    };
  };

  const teardownSubstance = () => {
    const m = subMountRef.current;
    if (m && typeof m.__cleanup === "function") { try { m.__cleanup(); } catch {} m.innerHTML = ""; delete m.__cleanup; }
  };

  /* ---------- Open/close ---------- */
  const openAssistant = () => {
    chooseVoice();
    startWebRTC();
    setTimeout(() => {
      initSubstance();
      initCube();
    }, 0);
  };
  const closeAssistant = () => {
    // stop renderers first so RAF loops don't touch disposed textures
    teardownCube();
    teardownSubstance();
    cleanupWebRTC();
  };

  const toggleAssistant = () => {
    setIsOpen(prev => {
      const opening = !prev;
      if (opening) openAssistant();
      else closeAssistant();
      return !prev;
    });
  };

  const toggleMic = () => {
    if (connectionStatus === "connected" && localStreamRef.current) {
      const next = !isMicActive;
      setIsMicActive(next);
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    }
  };

  // visual boost when active (sub shader sensitivity)
  useEffect(() => {
    if (!subMatRef.current) return;
    subMatRef.current.uniforms.u_aReact.value =
      connectionStatus === "connected" && isMicActive ? 1.4 : 0.8;
  }, [isMicActive, connectionStatus]);

  useEffect(() => {
    return () => { closeAssistant(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* FAB (unchanged styles) */}
      {!isOpen && !hideVoiceBtn && (
        <motion.button
          className="voice-toggle-btn left"
          onClick={toggleAssistant}
          title="Open Voice Assistant"
        >
          +
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div className="va2-wrap" drag dragElastic={0.2}>
            <audio ref={audioPlayerRef} className="va2-hidden-audio" />

            <div ref={wrapRef} className="va2-body">
              <div className="va2-stack">
                {/* Substance circle (hover-enabled) */}
                <div ref={subMountRef} className="va2-substance" />

                {/* Glass cube on top; pointer-through */}
                <canvas ref={cubeCanvasRef} className="va2-cube" />

                {/* Waveform INSIDE top (responsive amplitude via CSS var) */}
                <div className="va2-wave va2-wave--big">
                  {remoteStream ? (
                    <AudioWave analyser={remoteAnalyserRef.current} />
                  ) : (
                    <div className="va2-wave-placeholder">Connecting…</div>
                  )}
                </div>

                {/* Mic fixed bottom-center (idle red / active green+pulse) */}
                <div className="va2-mic">
                  <button
                    className={`va2-micbtn ${isMicActive ? "active" : ""}`}
                    onClick={toggleMic}
                    disabled={connectionStatus !== "connected"}
                    title={isMicActive ? "Mute microphone" : "Unmute microphone"}
                  >
                    <FaMicrophoneAlt />
                  </button>
                </div>

                {/* Close aligned INSIDE top-right corner */}
                <button className="va2-close" onClick={toggleAssistant} title="Close">✖</button>
              </div>
            </div>

            <div className="va2-visually-hidden" aria-live="polite">{transcript}</div>
            <div className="va2-visually-hidden" aria-live="polite">{responseText}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistant;
