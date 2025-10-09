/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, useMotionValue } from "framer-motion";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

/**
 * Draggable D-ID widget notes:
 * - We lazy-inject the D-ID script when the user presses the in-chat "Avatar" button.
 * - Once the script builds its default FAB, we detect it via MutationObserver and
 *   move/re-parent that DOM into our own fixed-position, draggable container.
 * - We neutralize any fixed positioning/styles the script sets so the widget stays inside our container.
 * - The container is position:fixed so users can drag it outside the chat box freely.
 *
 * If D-ID changes DOM structure, update CANDIDATE_SELECTORS below.
 */

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

// ---- Chat content ----------------------------------------------------------------

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

const ChatBot = () => {
  const [open, setOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hi! Ask me anything about these AI tools." },
  ]);
  const [visibleQuestions, setVisibleQuestions] = useState(initialQuestions);
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef(null);
  const { setActiveCardId } = useCardStore();

  const [sessionId] = useState(() => {
    const id = localStorage.getItem("chatbot-session") || crypto.randomUUID();
    localStorage.setItem("chatbot-session", id);
    return id;
  });

  // ---- D-ID draggable widget state ------------------------------------------
  const [showDid, setShowDid] = useState(false);
  const [didAttached, setDidAttached] = useState(false);
  const didContainerRef = useRef(null); // Where we re-parent the D-ID DOM
  const observerRef = useRef(null);

  // Draggable initial position (fixed coords). Start near bottom-right, above your chat FAB.
  const x = useMotionValue(typeof window !== "undefined" ? window.innerWidth - 360 : 0);
  const y = useMotionValue(typeof window !== "undefined" ? window.innerHeight - 420 : 0);

  // Inject D-ID script on demand
  const injectDidScript = () => {
    if (typeof document === "undefined") return;
    if (document.getElementById(DID_SCRIPT_ID)) return; // already injected

    const s = document.createElement("script");
    s.type = "module";
    s.async = true;
    s.src = DID_AGENT_SRC;
    s.id = DID_SCRIPT_ID;

    // data-* attributes to configure the agent
    s.dataset.mode = "fabio";
    s.dataset.clientKey = DID_CLIENT_KEY;
    s.dataset.agentId = DID_AGENT_ID;
    s.dataset.name = "did-agent";
    s.dataset.monitor = "true";
    s.dataset.orientation = "horizontal";
    // Let us control position; script may try to stick it to an edge.
    // We'll reparent & strip its fixed positioning afterward.
    s.dataset.position = "right";

    document.body.appendChild(s);
  };

  // Observe DOM for the D-ID FAB and re-parent it into our container
  const startObservingForDid = () => {
    if (observerRef.current) return;

    const obs = new MutationObserver(() => {
      const didNode = findDidNode();
      if (didNode && didContainerRef.current) {
        try {
          neutralizeDidStyles(didNode);
          didContainerRef.current.appendChild(didNode);
          setDidAttached(true);
          // Once attached, no need to keep observing:
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
    // The D-ID FAB/bubble often uses fixed positioning. Remove those so our container controls layout.
    el.style.position = "static";
    el.style.inset = "auto";
    el.style.right = "auto";
    el.style.left = "auto";
    el.style.bottom = "auto";
    el.style.top = "auto";
    el.style.margin = "0";

    // Make sure it doesn't overflow our container horizontally.
    el.style.maxWidth = "100%";

    // If they inject inner wrappers with fixed positions, try to reset them too:
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

    // best-effort cleanup of any created nodes
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
        "https://ai-platform-dsah-backend-chatbot.onrender.com/stream",
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
        "https://ai-platform-dsah-backend-chatbot.onrender.com/classify",
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
      } else {
        console.warn("Classification request failed");
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

  // Cleanup observer on unmount just in case
  useEffect(() => {
    return () => {
      stopObserving();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Your existing Chat FAB */}
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
            width: 340, // adjust as you like
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        >
          {/* Card chrome + drag handle */}
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
              // Drag handle area (bigger target)
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
                    // Snap to bottom-right quickly
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

            {/* Where we mount the D-ID DOM */}
            <div
              ref={didContainerRef}
              style={{
                // Size of the live agent bubble/player; adjust if needed
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




















