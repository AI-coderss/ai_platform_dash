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
// MeetingAssistantAnnouncement.jsx
// MeetingAssistantAnnouncement.jsx
// MeetingAssistantAnnouncement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import "../styles/MeetingAssistantAnnouncement.css";
import ChatInputWidget from "./ChatInputWidget";

/* ---------------- Animated launch messages ---------------- */
const MESSAGES = [
  "✨ AI Meeting Assistant is live.",
  "Schedule meetings with real-time notifications.",
  "Record & transcribe, then generate minutes automatically.",
  "Extract action items and track follow-ups.",
  "Open Questions to ask instantly.",
];

/* ---------------- FAQ grouped accordions ---------------- */
const FAQ_GROUPS = [
  { id: "basics", title: "Basics", items: ["What is the AI Meeting Assistant and who should use it?"] },
  { id: "scheduling", title: "Scheduling & invitations", items: ["How do I schedule a meeting and invite attendees?"] },
  { id: "recording", title: "Recording & transcription", items: ["Can it record and transcribe meetings automatically?"] },
  {
    id: "minutes",
    title: "Minutes, summaries & action items",
    items: ["How do I generate minutes, summaries, and action items?", "How can I share minutes and follow up on tasks?"],
  },
  { id: "history", title: "History & tracking", items: ["Where can I see upcoming meetings and meeting history?"] },
  { id: "support", title: "Support & feedback", items: ["How do I give feedback or report an issue to improve it?"] },
];

/* ---------------- Voice Agent bridge (NO external audio) ---------------- */
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
    window.dispatchEvent(new CustomEvent("voice:ask", { detail: { text: q, meta: { source: "meeting_announcement" } } }));
  } catch {}
};

/* ---------------- Highlight WITHOUT triggering audio ---------------- */
const highlightMeetingAssistant = (on) => {
  try {
    window.dispatchEvent(new CustomEvent("card:highlight", { detail: { id: "meeting_assistant", active: !!on } }));
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
  const dragBoundsRef = useRef(null);
  const dragControls = useDragControls();

  const inputRef = useRef(null);

  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);

  // typed loop
  const [typed, setTyped] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // tabs: overview | questions
  const [tab, setTab] = useState("overview");

  const [selectedQ, setSelectedQ] = useState("");

  // ChatInputWidget (free text only)
  const [inputText, setInputText] = useState("");

  // accordion open/close
  const [openGroups, setOpenGroups] = useState(() => new Set(["basics"]));
  const groups = useMemo(() => FAQ_GROUPS, []);

  // highlight external card while visible
  useEffect(() => {
    if (!open) return;
    highlightMeetingAssistant(!minimized);
    return () => highlightMeetingAssistant(false);
  }, [open, minimized]);

  // slower visible typing loop
  useEffect(() => {
    if (!open || minimized) return;

    const current = MESSAGES[msgIdx];
    const typingSpeed = deleting ? 18 : 36;
    const pauseAtEnd = 1100;

    const t = setTimeout(() => {
      if (!deleting) {
        const next = charIdx + 1;
        setTyped(current.slice(0, next));
        setCharIdx(next);
        if (next >= current.length) setTimeout(() => setDeleting(true), pauseAtEnd);
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

  // Predefined question: highlight + ask instantly
  const askPredefinedInstant = async (q) => {
    const text = String(q || "").trim();
    if (!text) return;

    setSelectedQ(text);
    safeOpenVoice();
    await safeAskVoice(buildMeetingPrompt(text));
  };

  // Free text send from ChatInputWidget ONLY
  const handleSendMessage = async (payload) => {
    const text =
      typeof payload === "string" ? payload : typeof payload?.text === "string" ? payload.text : inputText;

    const q = String(text || "").trim();
    if (!q) return;

    setInputText("");
    safeOpenVoice();
    await safeAskVoice(buildMeetingPrompt(q));
  };

  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    setOpen(false);
    setMinimized(false);
    highlightMeetingAssistant(false);
    try {
      window.dispatchEvent(new CustomEvent("announcement:closed", { detail: { id: "meeting_assistant" } }));
    } catch {}
  };

  const minimize = () => setMinimized(true);
  const restore = () => {
    setOpen(true);
    setMinimized(false);
  };

  /* ---------------- “Build in front of user” animation ---------------- */
  const shellVariants = {
    hidden: {
      opacity: 0,
      y: -22,
      scale: 0.985,
      filter: "blur(8px)",
      clipPath: "inset(0 0 100% 0 round 22px)",
    },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      clipPath: "inset(0 0 0% 0 round 22px)",
      transition: {
        duration: 1.05,
        ease: [0.16, 1, 0.3, 1],
        when: "beforeChildren",
        delayChildren: 0.45,
        staggerChildren: 0.22,
      },
    },
    exit: {
      opacity: 0,
      y: -12,
      scale: 0.985,
      transition: { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 14, scale: 0.995 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
  };

  const panelVariants = {
    initial: { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, y: -8, filter: "blur(8px)", transition: { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] } },
  };

  const accBodyVariants = {
    closed: { height: 0, opacity: 0 },
    open: { height: "auto", opacity: 1, transition: { duration: 0.46, ease: [0.16, 1, 0.3, 1] } },
  };

  if (!open) return null;

  return (
    <>
      {/* Drag bounds (invisible) */}
      <div ref={dragBoundsRef} className="maa-dragBounds" />

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
            <span className="maa-mini-title">Announcements</span>
            <span className="maa-mini-cta">Open</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            className="maa-card maa-breath"
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={dragBoundsRef}
            dragElastic={0.14}
            dragMomentum={false}
            variants={shellVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            role="dialog"
            aria-label="Dr. Samir Abbas Hospital announcements"
          >
            {/* DRAG ZONE: header + launch animation + tabs */}
            <motion.div
              className="maa-dragZone"
              variants={itemVariants}
              onPointerDown={(e) => dragControls.start(e)}
              title="Drag"
            >
              {/* Header */}
              <div className="maa-head">
                <div className="maa-head-text">
                  <div className="maa-headTitle">Dr. Samir Abbas Hospital Announcements</div>
                  <div className="maa-headSub">Internal release</div>
                </div>

                <div className="maa-head-actions">
                  <button
                    className="maa-icon"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={minimize}
                    aria-label="Minimize"
                  >
                    —
                  </button>
                  <button
                    className="maa-icon danger"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={close}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Animated launch line */}
              <div className="maa-hero">
                <div className="maa-launchLabel">Launch:</div>
                <div className="maa-typed">
                  <span className="maa-typed-text">{typed}</span>
                  <span className="maa-caret" />
                </div>
              </div>

              {/* ✅ Smooth tabs (Overview | Questions) */}
              <div className="maa-tabs" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  className={`maa-tab ${tab === "overview" ? "active" : ""}`}
                  onClick={() => setTab("overview")}
                  type="button"
                >
                  Overview
                </button>
                <button
                  className={`maa-tab ${tab === "questions" ? "active" : ""}`}
                  onClick={() => setTab("questions")}
                  type="button"
                >
                  Questions
                </button>

                <motion.div
                  className="maa-tabIndicator"
                  layout
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                  style={{ left: tab === "overview" ? "6px" : "calc(50% + 4px)" }}
                />
              </div>
            </motion.div>

            {/* Content */}
            <motion.div className="maa-content" variants={itemVariants}>
              <AnimatePresence mode="wait">
                {tab === "overview" && (
                  <motion.div
                    key="overview"
                    className="maa-panel"
                    variants={panelVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <div className="maa-overviewTitle">AI Meeting Assistant</div>

                    <div className="maa-overviewText">
                      The AI Meeting Assistant helps hospital teams plan meetings faster, stay aligned during discussions,
                      and close meetings with clear outputs. It supports scheduling, real-time reminders, transcription,
                      and structured minutes so everyone leaves with the same understanding and next steps.
                    </div>

                    <div className="maa-overviewBlock">
                      <div className="maa-overviewHeading">What it does</div>
                      <div className="maa-overviewText">
                        It can record and transcribe meetings, generate summaries and minutes, extract action items with
                        owners, and preserve meeting history so teams can review decisions at any time.
                      </div>
                    </div>

                    <div className="maa-overviewBlock">
                      <div className="maa-overviewHeading">Who should use it</div>
                      <div className="maa-overviewText">
                        Department heads, coordinators, committee members, and anyone running recurring meetings (quality,
                        operations, clinical, admin, IT, finance).
                      </div>
                    </div>

                    <div className="maa-overviewBlock">
                      <div className="maa-overviewHeading">How to start</div>
                      <div className="maa-overviewText">
                        Open the <b>Questions</b> tab and click a question to get an instant answer, or type your own
                        question at the bottom. The voice agent responds immediately without triggering extra media.
                      </div>
                    </div>

                    <div className="maa-hint">
                      Tip: Ask about scheduling, transcription, minutes, action items, meeting history, and best practices.
                    </div>
                  </motion.div>
                )}

                {tab === "questions" && (
                  <motion.div
                    key="questions"
                    className="maa-panel"
                    variants={panelVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <div className="maa-accList">
                      {groups.map((g) => {
                        const isOpen = openGroups.has(g.id);
                        return (
                          <motion.div key={g.id} className="maa-acc" variants={itemVariants}>
                            <button
                              className={`maa-accHead ${isOpen ? "open" : ""}`}
                              onClick={() => toggleGroup(g.id)}
                              aria-expanded={isOpen}
                              type="button"
                            >
                              <span className="maa-accTitle">{g.title}</span>
                              <span className={`maa-accIcon ${isOpen ? "open" : ""}`} aria-hidden="true" />
                            </button>

                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  className="maa-accBody"
                                  key="body"
                                  initial="closed"
                                  animate="open"
                                  exit="closed"
                                  variants={accBodyVariants}
                                >
                                  <div className="maa-questions">
                                    {g.items.map((q) => {
                                      const active = selectedQ === q;
                                      return (
                                        <button
                                          key={q}
                                          className={`maa-q ${active ? "active" : ""}`}
                                          onClick={() => askPredefinedInstant(q)}
                                          title="Ask instantly"
                                          type="button"
                                        >
                                          <span className="maa-qText">{q}</span>
                                          {active && <span className="maa-qTag">Selected</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Chat input dock */}
            <motion.div className="maa-chatDock" variants={itemVariants}>
              <div className="maa-chatHint">Ask freely (text):</div>

              <div onPointerDown={(e) => e.stopPropagation()}>
                <ChatInputWidget
                  ref={inputRef}
                  onSendMessage={handleSendMessage}
                  inputText={inputText}
                  setInputText={setInputText}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


