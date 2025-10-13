/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, useMotionValue } from "framer-motion";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

const DID_AGENT_SRC = "https://agent.d-id.com/v2/index.js";
const DID_SCRIPT_ID = "did-agent-loader-v2";
const CANDIDATE_SELECTORS = [
  '[data-name="did-agent"]',
  "#did-agent",
  ".did-voice-agent",
  "[data-did-agent]",
];

// 👉 use your real key/id or env vars.
const DID_CLIENT_KEY = "Z29vZ2xlLW9hdXRoMnwxMTI1MzgwMDI5NzAxNDIxMTMxNDI6TG5FLWVDS1IyaE9VMEcyS2FUVnh0";
const DID_AGENT_ID = "v2_agt_uxCkm0YX";

const initialQuestions = [
  "What can the AI Doctor Assistant do?",
  "How does the Medical Transcription App work?",
  "Can the Data Analyst show me hospital insights?",
  "How can I enhance a medical report using AI?",
  "Tell me more about the IVF Virtual Training Assistant.",
  "Can the Patient Assistant help with navigation?",
  "How to use the AI Doctor Assistant?",
  "How does the IVF Virtual Training Assistant work?",
];

const ChatBot = ({ visitorId, chatApiBase = "" }) => {
  const [open, setOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi! Hover a product card to generate a structured question, then send it with one click — or ask me anything." },
  ]);
  const [visibleQuestions, setVisibleQuestions] = useState(initialQuestions);
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef(null);
  const { setActiveCardId } = useCardStore();

  // 🌟 NEW: hover-generated structured prompt banner
  const [hoverSuggestion, setHoverSuggestion] = useState(null);

  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  // ---- D-ID draggable widget state ------------------------------------------
  const [showDid, setShowDid] = useState(false);
  const [didAttached, setDidAttached] = useState(false);
  const didContainerRef = useRef(null);
  const observerRef = useRef(null);

  const x = useMotionValue(typeof window !== "undefined" ? window.innerWidth - 360 : 0);
  const y = useMotionValue(typeof window !== "undefined" ? window.innerHeight - 420 : 0);

  // Listen for structured prompt events from card hover
  useEffect(() => {
    const onHoverPrompt = (e) => {
      const detail = e.detail || {};
      setHoverSuggestion({
        title: detail.title || `Ask about ${detail?.app?.name || "this app"}`,
        prompt: detail.prompt,
        bullets: detail.bullets || [],
        app: detail.app,
        tag: detail.tag,
        ts: detail.ts || Date.now(),
      });
    };
    window.addEventListener("app-hover-prompt", onHoverPrompt);
    return () => window.removeEventListener("app-hover-prompt", onHoverPrompt);
  }, []);

  // Keep scroll pinned to bottom while streaming
  useLayoutEffect(() => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  }, [messages, loading]);

  const handleSendMessage = async ({ text }) => {
    if (!text?.trim()) return;

    const userMsg = { type: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setAccordionOpen(false);
    setLoading(true);

    let botText = "";
    try {
      const response = await fetch(
        `${chatApiBase}/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, session_id: sessionId }),
        }
      );

      if (!response.ok || !response.body) throw new Error("Streaming failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      setMessages((prev) => [...prev, { type: "bot", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        botText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { type: "bot", text: botText };
          return updated;
        });
      }

      // 🔁 classify -> setActiveCardId
      const classifyRes = await fetch(
        `${chatApiBase}/classify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, ai_response: botText }),
        }
      );

      if (classifyRes.ok) {
        const data = await classifyRes.json();
        if (data.card_id) {
          setActiveCardId(data.card_id);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { type: "bot", text: "⚠️ Error streaming response." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionClick = (question) => {
    handleSendMessage({ text: question });
    setVisibleQuestions((prev) => prev.filter((q) => q !== question));
    setAccordionOpen(false);
  };

  // ===== D-ID: inject & drag support (unchanged behavior) =====
  const injectDidScript = () => {
    if (typeof document === "undefined") return;
    if (document.getElementById(DID_SCRIPT_ID)) return;

    const s = document.createElement("script");
    s.type = "module";
    s.async = true;
    s.src = DID_AGENT_SRC;
    s.id = DID_SCRIPT_ID;

    s.dataset.mode = "fabio";
    s.dataset.clientKey = DID_CLIENT_KEY;
    s.dataset.agentId = DID_AGENT_ID;
    s.dataset.name = "did-agent";
    s.dataset.monitor = "true";
    s.dataset.orientation = "horizontal";
    s.dataset.position = "right";

    document.body.appendChild(s);
  };

  const startObservingForDid = () => {
    if (observerRef.current) return;

    const obs = new MutationObserver(() => {
      const didNode = findDidNode();
      if (didNode && didContainerRef.current) {
        try {
          neutralizeDidStyles(didNode);
          didContainerRef.current.appendChild(didNode);
          setDidAttached(true);
          if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
          }
        } catch (e) {
          console.warn("Failed to attach D-ID node:", e);
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerRef.current = obs;
  };

  const stopObserving = () => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  };

  const findDidNode = () => {
    for (const sel of CANDIDATE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const neutralizeDidStyles = (el) => {
    el.style.position = "static";
    el.style.inset = "auto";
    el.style.right = "auto";
    el.style.left = "auto";
    el.style.bottom = "auto";
    el.style.top = "auto";
    el.style.margin = "0";
    el.style.maxWidth = "100%";
    el.querySelectorAll("*").forEach((n) => {
      const cs = window.getComputedStyle(n);
      if (cs.position === "fixed") {
        n.style.position = "static";
        n.style.right = "auto";
        n.style.left = "auto";
        n.style.bottom = "auto";
        n.style.top = "auto";
      }
    });
  };

  const removeDidScriptAndNode = () => {
    stopObserving();
    const script = document.getElementById(DID_SCRIPT_ID);
    if (script) script.remove();
    CANDIDATE_SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    });
    setDidAttached(false);
  };

  const openDid = () => {
    setShowDid(true);
    injectDidScript();
    startObservingForDid();
  };

  const closeDid = () => {
    setShowDid(false);
    removeDidScriptAndNode();
  };

  useEffect(() => {
    return () => {
      stopObserving();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI — little banner showing the generated prompt with Send/Copy/Dismiss
  const SuggestionBanner = () => {
    if (!hoverSuggestion?.prompt) return null;
    const { app, title, bullets, prompt } = hoverSuggestion;

    const copyToClipboard = async () => {
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {}
    };

    return (
      <div
        className="hover-suggestion"
        style={{
          display: "flex",
          gap: 10,
          padding: "10px 12px",
          margin: "8px",
          borderRadius: 12,
          background: "#eef5ff",
          border: "1px solid #cfe0ff",
          alignItems: "center",
        }}
      >
        {app?.icon && (
          <img src={app.icon} alt="" style={{ width: 28, height: 28 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            {title || `Ask about ${app?.name || "this app"}`}
          </div>
          <div style={{ fontSize: 12, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prompt}
          </div>
          {bullets?.length > 0 && (
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {bullets.slice(0, 3).map((b, i) => (
                <li key={i} style={{ fontSize: 12 }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            className="btn"
            onClick={() => {
              handleSendMessage({ text: prompt });
              setHoverSuggestion(null);
            }}
            style={{ padding: "6px 10px" }}
          >
            Send
          </button>
          <button className="btn ghost" onClick={copyToClipboard} style={{ padding: "6px 10px" }}>
            Copy
          </button>
          <button
            className="btn ghost"
            onClick={() => setHoverSuggestion(null)}
            style={{ padding: "6px 10px" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Chat FAB */}
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        <img src="/icons/chat.svg" alt="Chat" className="chat-icon" />
      </button>

      {open && window.innerWidth <= 768 && (
        <button className="chat-close-mobile" onClick={() => setOpen(false)}>
          ✖
        </button>
      )}

      {open && (
        <div className="chat-box">
          <div
            className="chat-header"
            style={{ background: "#2563eb", color: "#fff", fontWeight: 600 }}
          >
            AI Assistant
          </div>

          {/* NEW: hover suggestion banner */}
          <SuggestionBanner />

          <div className="chat-body" ref={chatBodyRef}>
            {/* In-chat controls row */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "6px 8px 10px",
              }}
            >
              <button
                onClick={openDid}
                className="predefined-q"
                title="Open D-ID Avatar (draggable)"
                style={{
                  background: "#0ea5e9",
                  color: "white",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 13,
                  border: "none",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                  cursor: "pointer",
                }}
              >
                🎭 Open Avatar
              </button>
            </div>

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-msg ${msg.type}`}
                style={{
                  maxWidth: "70%",
                  alignSelf: msg.type === "user" ? "flex-end" : "flex-start",
                  background: msg.type === "user" ? "#2563eb" : "#f1f6fd",
                  color: msg.type === "user" ? "#fff" : "#222",
                  padding: "8px 12px",
                  margin: msg.type === "user" ? "6px" : "0px 15px",
                  borderRadius: "14px",
                  fontSize: "14px",
                  lineHeight: 1.4,
                }}
              >
                {msg.type === "bot" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}

            {loading && (
              <div
                className="chat-msg bot loader"
                style={{ alignSelf: "flex-start" }}
              >
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
          </div>

          {visibleQuestions.length > 0 && (
            <div className="predefined-questions-container">
              {visibleQuestions.length > 3 ? (
                <>
                  <div
                    className="accordion-header"
                    onClick={() => setAccordionOpen((prev) => !prev)}
                  >
                    <span>Show Suggested Questions</span>
                    <span className={`chevron ${accordionOpen ? "rotate" : ""}`}>
                      ▼
                    </span>
                  </div>
                  <div className={`accordion-body ${accordionOpen ? "open" : ""}`}>
                    <div className="accordion-content">
                      {visibleQuestions.map((q, i) => (
                        <button
                          key={i}
                          className="predefined-q fade-in"
                          style={{ animationDelay: `${i * 0.05}s` }}
                          onClick={() => handleQuestionClick(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                visibleQuestions.map((q, i) => (
                  <button
                    key={i}
                    className="predefined-q fade-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => handleQuestionClick(q)}
                  >
                    {q}
                  </button>
                ))
              )}
            </div>
          )}

          <ChatInputWidget onSendMessage={handleSendMessage} />
        </div>
      )}

      {/* ---------- Draggable D-ID container (position: fixed; outside chat DOM flow) ---------- */}
      {showDid && (
        <motion.div
          role="dialog"
          aria-label="D-ID Avatar"
          initial={false}
          drag
          dragMomentum={false}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            x,
            y,
            width: 340,
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(8px)",
              borderRadius: 16,
              boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
              border: "1px solid rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                cursor: "grab",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                background: "#111827",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Avatar (drag me)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    x.set(window.innerWidth - 360);
                    y.set(window.innerHeight - 420);
                  }}
                  title="Snap to corner"
                  style={iconBtnStyle}
                >
                  ⤓
                </button>
                <button onClick={closeDid} title="Close" style={iconBtnStyle}>
                  ✖
                </button>
              </div>
            </div>

            <div
              ref={didContainerRef}
              style={{
                width: "100%",
                minHeight: 72,
                padding: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#0b1220",
              }}
            >
              {!didAttached && (
                <span
                  style={{
                    color: "#cbd5e1",
                    fontSize: 12,
                    padding: "10px 6px",
                  }}
                >
                  Loading avatar…
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
};

const iconBtnStyle = {
  appearance: "none",
  border: "none",
  borderRadius: 10,
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  padding: "4px 8px",
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};

export default ChatBot;





















