/* eslint-disable react/jsx-no-duplicate-props */
/* eslint-disable no-unused-vars */
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// src/components/MeetingAssistantAnnouncement.jsx
// MeetingAssistantAnnouncement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import "../styles/MeetingAssistantAnnouncement.css";
import ChatInputWidget from "./ChatInputWidget";

const DEFAULT_QUESTIONS = [
  "What is the AI Meeting Assistant and who should use it?",
  "How do I schedule a meeting and invite attendees?",
  "Can it record and transcribe meetings automatically?",
  "How do I generate minutes, summaries, and action items?",
  "How can I share minutes and follow up on tasks?",
  "Where can I see upcoming meetings and meeting history?",
  "How do I give feedback or report an issue to improve it?",
];

const MESSAGES = [
  "🚀 New tool is live: AI Meeting Assistant",
  "Schedule meetings with real-time notifications.",
  "Record & transcribe meetings, then generate minutes.",
  "Extract action items, assign owners, and track follow-ups.",
  "Revisit meeting history anytime to stay aligned.",
];

const safeOpenVoice = () => {
  if (window.VoiceAssistantBridge?.open) {
    try {
      window.VoiceAssistantBridge.open();
      return;
    } catch {}
  }
  try {
    window.dispatchEvent(new Event("assistant:open"));
  } catch {}
};

const safeAskVoice = async (text) => {
  const q = String(text || "").trim();
  if (!q) return;

  if (window.VoiceAssistantBridge?.ask) {
    try {
      await window.VoiceAssistantBridge.ask(q);
      return;
    } catch {}
  }

  try {
    window.dispatchEvent(
      new CustomEvent("voice:ask", {
        detail: {
          text: q,
          meta: { source: "meeting_announcement" },
        },
      })
    );
  } catch {}
};

const highlightMeetingAssistant = (on) => {
  try {
    window.dispatchEvent(
      new CustomEvent("card:highlight", {
        detail: { id: "meeting_assistant", active: !!on },
      })
    );
  } catch {}

  const selectors = [
    '[data-card-id="meeting_assistant"]',
    '[data-app-card="meeting_assistant"]',
    '[data-product="meeting_assistant"]',
    "#meeting_assistant",
    ".meeting-assistant-card",
    '[data-agent-id="products.launch:meeting"]',
    '[data-agent-id="products.help:meeting"]',
  ];

  let el = null;
  for (const s of selectors) {
    const found = document.querySelector(s);
    if (found) {
      el = found;
      break;
    }
  }
  if (!el) return;

  if (on) el.classList.add("maa-external-highlight");
  else el.classList.remove("maa-external-highlight");
};

export default function MeetingAssistantAnnouncement() {
  const rootRef = useRef(null);
  const dragConstraintsRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);

  // typed loop
  const [typed, setTyped] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const [activeSection, setActiveSection] = useState("overview"); // overview | faq
  const [selectedQ, setSelectedQ] = useState("");
  const [inputText, setInputText] = useState("");

  const questions = useMemo(() => DEFAULT_QUESTIONS, []);

  useEffect(() => {
    dragConstraintsRef.current = document.body;
  }, []);

  // highlight the external card while visible
  useEffect(() => {
    if (!open) return;
    highlightMeetingAssistant(!minimized);
    return () => highlightMeetingAssistant(false);
  }, [open, minimized]);

  // fly-in from top (slow, noticeable)
  useEffect(() => {
    if (!open || minimized) return;
    const el = rootRef.current;
    if (!el) return;

    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { y: -140, opacity: 0, scale: 0.985 },
      { y: 0, opacity: 1, scale: 1, duration: 1.45, ease: "power3.out" }
    );
  }, [open, minimized]);

  // continuous typing loop
  useEffect(() => {
    if (!open || minimized) return;

    const current = MESSAGES[msgIdx];
    const typingSpeed = deleting ? 22 : 36;
    const pauseAtEnd = 900;

    const t = setTimeout(() => {
      if (!deleting) {
        const next = charIdx + 1;
        setTyped(current.slice(0, next));
        setCharIdx(next);

        if (next >= current.length) {
          setTimeout(() => setDeleting(true), pauseAtEnd);
        }
      } else {
        const next = charIdx - 1;
        setTyped(current.slice(0, Math.max(0, next)));
        setCharIdx(next);

        if (next <= 0) {
          setDeleting(false);
          setMsgIdx((i) => (i + 1) % MESSAGES.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(t);
  }, [open, minimized, msgIdx, charIdx, deleting]);

  const buildMeetingPrompt = (q) =>
    [
      "You are the AI Meeting Assistant support agent for Dr. Samir Abbas Hospital.",
      "Answer in a clear, friendly, concise way for hospital staff.",
      "Do NOT trigger any UI actions or media. Do NOT call tools.",
      "",
      `Question: ${q}`,
    ].join("\n");

  const handleSendMessage = async (payload) => {
    const text =
      typeof payload === "string"
        ? payload
        : typeof payload?.text === "string"
        ? payload.text
        : inputText;

    const q = String(text || "").trim();
    if (!q) return;

    setInputText("");
    safeOpenVoice();
    await safeAskVoice(buildMeetingPrompt(q));
  };

  const onQuestionClick = (q) => {
    setSelectedQ(q);
    setInputText(q);
    setActiveSection("faq");
    // focus input if the widget exposes focus
    try {
      inputRef.current?.focus?.();
    } catch {}
  };

  const close = () => {
    setOpen(false);
    setMinimized(false);
    highlightMeetingAssistant(false);
    try {
      window.dispatchEvent(
        new CustomEvent("announcement:closed", { detail: { id: "meeting_assistant" } })
      );
    } catch {}
  };

  const minimize = () => setMinimized(true);
  const restore = () => {
    setOpen(true);
    setMinimized(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.16,
        delayChildren: 0.40,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -14, scale: 0.992 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.54, ease: "easeOut" },
    },
  };

  if (!open) return null;

  return (
    <>
      {/* Minimized pill */}
      <AnimatePresence>
        {minimized && (
          <motion.button
            className="maa-mini"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            onClick={restore}
            title="Open announcement"
          >
            <span className="maa-mini-dot" />
            <span className="maa-mini-title">AI Meeting Assistant</span>
            <span className="maa-mini-cta">Open</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            className="maa-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Click-through stage; only the card captures clicks */}
            <motion.div
              ref={rootRef}
              className="maa-card maa-breath"
              style={{ zIndex: 99999 }}
              drag
              dragElastic={0.16}
              dragConstraints={dragConstraintsRef}
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              role="dialog"
              aria-label="AI Meeting Assistant announcement"
            >
              {/* Header */}
              <motion.div className="maa-head" variants={itemVariants}>
                <div className="maa-badge">New</div>

                <div className="maa-head-text">
                  <div className="maa-title">AI Meeting Assistant</div>
                  <div className="maa-subtitle">Dr. Samir Abbas Hospital • internal release</div>
                </div>

                <div className="maa-head-actions">
                  <button className="maa-icon" onClick={minimize} aria-label="Minimize">
                    —
                  </button>
                  <button className="maa-icon danger" onClick={close} aria-label="Close">
                    ✕
                  </button>
                </div>
              </motion.div>

              {/* Hero / typed */}
              <motion.div className="maa-hero" variants={itemVariants}>
                <div className="maa-typed">
                  <span className="maa-typed-text">{typed}</span>
                  <span className="maa-caret" />
                </div>

                <div className="maa-note">
                  Ask questions at the bottom using <b>ChatInputWidget</b>. Clicking a predefined
                  question will highlight it and load it into the input.
                </div>
              </motion.div>

              {/* Tabs */}
              <motion.div className="maa-tabs" variants={itemVariants}>
                <button
                  className={`maa-tab ${activeSection === "overview" ? "active" : ""}`}
                  onClick={() => setActiveSection("overview")}
                >
                  Overview
                </button>
                <button
                  className={`maa-tab ${activeSection === "faq" ? "active" : ""}`}
                  onClick={() => setActiveSection("faq")}
                >
                  Questions
                </button>
              </motion.div>

              {/* Scrollable content */}
              <motion.div className="maa-content" variants={itemVariants}>
                {activeSection === "overview" && (
                  <div className="maa-panel">
                    <ul className="maa-list">
                      <li>Schedule meetings & send invitations faster.</li>
                      <li>Real-time reminders and notifications.</li>
                      <li>Record + transcribe meetings automatically.</li>
                      <li>Generate minutes, summaries, and action items.</li>
                      <li>Track follow-ups and revisit meeting history anytime.</li>
                    </ul>

                    <div className="maa-ctaRow">
                      <button
                        className="maa-btn primary"
                        onClick={() => {
                          setActiveSection("faq");
                          onQuestionClick("How do I start using the AI Meeting Assistant today?");
                        }}
                      >
                        Start now
                      </button>

                      <button
                        className="maa-btn"
                        onClick={() => {
                          setActiveSection("faq");
                          onQuestionClick("Where do I submit feedback and feature requests?");
                        }}
                      >
                        Give feedback
                      </button>
                    </div>

                    <div className="maa-feedback">
                      We’re actively improving it — your feedback helps the next release become even
                      stronger.
                    </div>
                  </div>
                )}

                {activeSection === "faq" && (
                  <div className="maa-panel">
                    <details className="maa-details" open>
                      <summary className="maa-summary">Predefined questions</summary>

                      <div className="maa-questions">
                        {questions.map((q) => {
                          const active = selectedQ === q;
                          return (
                            <button
                              key={q}
                              className={`maa-q ${active ? "active" : ""}`}
                              onClick={() => onQuestionClick(q)}
                              title="Load into input"
                            >
                              <span className="maa-qText">{q}</span>
                              {active && <span className="maa-qTag">Selected</span>}
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </motion.div>

              {/* Chat input pinned at bottom */}
              <motion.div className="maa-chat" variants={itemVariants}>
                <div className="maa-chatHint">
                  Type your question below and send — it will be answered by the assistant.
                </div>

                <ChatInputWidget
                  ref={inputRef}
                  onSendMessage={handleSendMessage}
                  inputText={inputText}
                  setInputText={setInputText}
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

