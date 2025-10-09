/* eslint-disable no-loop-func */
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, useMotionValue } from "framer-motion";
import ChatInputWidget from "./ChatInputWidget";
import "../styles/ChatBot.css";
import useCardStore from "./store/useCardStore";

/**
 * Draggable D-ID widget notes (Updated Logic):
 * - We inject the D-ID script on initial component load.
 * - Once the script builds its avatar, we detect it via MutationObserver and
 *   move/re-parent it into our "docked" container (dockRef) inside the chat box.
 * - The avatar starts visible in this docked state on first load.
 * - A "Float Avatar" button moves the avatar to a fixed-position, draggable container.
 * - The floating container has no visible chrome; only the D-ID widget is visible.
 * - A tiny '✖' close chip on the floating avatar docks it back to its original position.
 * - On Close (dock), we re-parent the widget back. The flow is: Open → float; Close → dock.
 * - The script is never removed; we just move the DOM node around.
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

  // ---- D-ID draggable widget state (REVISED) ----
  const [isDidFloating, setIsDidFloating] = useState(false);
  const [didAttached, setDidAttached] = useState(false);
  const dockRef = useRef(null); // The new container for the docked avatar
  const didContainerRef = useRef(null); // The ref for the floating container
  const observerRef = useRef(null);

  // Draggable initial position
  const x = useMotionValue(typeof window !== "undefined" ? window.innerWidth - 360 : 0);
  const y = useMotionValue(typeof window !== "undefined" ? window.innerHeight - 420 : 0);

  // Inject D-ID script
  const injectDidScript = () => {
    if (typeof document === "undefined" || document.getElementById(DID_SCRIPT_ID)) return;

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

  // Find the D-ID node in the document
  const findDidNode = () => {
    for (const sel of CANDIDATE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  // Neutralize D-ID's inline styles so it fits our containers
  const neutralizeDidStyles = (el) => {
    el.style.position = "static";
    el.style.inset = "auto";
    el.style.margin = "0";
    el.style.maxWidth = "100%";
    el.querySelectorAll("*").forEach((n) => {
      const cs = window.getComputedStyle(n);
      if (cs.position === "fixed") {
        n.style.position = "static";
      }
    });
  };

  const stopObserving = () => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  };

  // Observe DOM for the D-ID FAB and move it to the DOCKED container on first find
  const startObservingForDid = () => {
    if (observerRef.current) return;
    const obs = new MutationObserver(() => {
      const didNode = findDidNode();
      if (didNode && dockRef.current) {
        try {
          neutralizeDidStyles(didNode);
          dockRef.current.appendChild(didNode);
          setDidAttached(true);
          stopObserving(); // We found it, no need to observe anymore
        } catch (e) {
          console.warn("Failed to attach D-ID node to dock:", e);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    observerRef.current = obs;
  };

  // --- NEW: Float/Dock logic ---
  const floatDid = () => {
    setIsDidFloating(true); // Set state to render the floating container
  };

  const dockDid = () => {
    const didNode = findDidNode();
    if (didNode && dockRef.current) {
      try {
        // Move the node from the floating container back to the dock
        dockRef.current.appendChild(didNode);
        setIsDidFloating(false); // Then set state to remove the floating container
      } catch (e) {
        console.warn("Failed to dock D-ID node:", e);
      }
    }
  };

  // --- REVISED: Load script on mount ---
  useEffect(() => {
    injectDidScript();
    startObservingForDid();
    return () => stopObserving();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This effect runs after the floating container is rendered to move the DOM node into it.
  useEffect(() => {
    if (isDidFloating) {
      const didNode = findDidNode();
      if (didNode && didContainerRef.current) {
        try {
          didContainerRef.current.appendChild(didNode);
        } catch (e) {
          console.warn("Failed to move D-ID node to floating container:", e);
        }
      }
    }
  }, [isDidFloating]);

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

      // Classify intent to highlight a card
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
        if (data.card_id) setActiveCardId(data.card_id);
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
            {/* --- REVISED: D-ID Controls & Dock --- */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                margin: "6px 8px 10px",
              }}
            >
              {/* This is where the D-ID avatar lives when docked. */}
              <div
                ref={dockRef}
                style={{
                  minHeight: "72px",
                  minWidth: "72px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!didAttached && (
                  <span style={{ fontSize: 12, color: "#666" }}>Loading avatar...</span>
                )}
              </div>

              {/* Button to float the avatar. Only shows when avatar is ready and docked. */}
              {didAttached && !isDidFloating && (
                <button
                  onClick={floatDid}
                  className="predefined-q"
                  title="Float and drag avatar"
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
                  🎭 Float Avatar
                </button>
              )}
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
                {msg.type === "bot" ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
              </div>
            ))}

            {loading && (
              <div className="chat-msg bot loader" style={{ alignSelf: "flex-start" }}>
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
                    <span className={`chevron ${accordionOpen ? "rotate" : ""}`}>▼</span>
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

      {/* ---------- REVISED: Chrome-less Draggable D-ID container ---------- */}
      {isDidFloating && (
        <motion.div
          ref={didContainerRef}
          role="dialog"
          aria-label="Floating D-ID Avatar"
          drag
          dragMomentum={false}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            x,
            y,
            zIndex: 9999,
            cursor: "grab",
            // The container itself is invisible.
            // The D-ID node provides the visuals.
          }}
        >
          {/* The D-ID node will be programmatically appended here */}

          {/* Tiny '✖' close chip to dock the avatar back */}
          <button
            onClick={dockDid}
            title="Dock Avatar"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              transform: "translate(40%, -40%)", // Position it nicely outside the corner
              background: "rgba(0, 0, 0, 0.7)",
              color: "white",
              border: "2px solid white",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              fontSize: "12px",
              lineHeight: "1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
            }}
          >
            ✖
          </button>
        </motion.div>
      )}
    </>
  );
};

export default ChatBot;




















