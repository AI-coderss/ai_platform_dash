import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import ChatBot from "./components/Chatbot";
import useCardStore from "./components/store/useCardStore";

// A simple, reusable audio visualizer component
const AudioVisualizer = () => (
  <div className="visualizer">
    <div className="bar"></div>
    <div className="bar"></div>
    <div className="bar"></div>
    <div className="bar"></div>
    <div className="bar"></div>
  </div>
);

const AppCard = ({ app, onPlay }) => {
  const { activeCardId } = useCardStore();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const cardRef = useRef(null);
  const isHighlighted = activeCardId === app.id;

  // Effect to scroll the highlighted card into view
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  // Effect to handle the audio whisper and visualizer state
  useEffect(() => {
    if (isHighlighted) {
      // Cancel any previously running speech to avoid overlaps
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(app.name);
      utterance.rate = 0.9;
      utterance.volume = 0.6;

      // Set state to show visualizer on start
      utterance.onstart = () => setIsSpeaking(true);
      
      // Set state to hide visualizer on end
      utterance.onend = () => setIsSpeaking(false);
      
      // Also hide visualizer on error
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }

    // Cleanup function runs when component unmounts or dependencies change
    return () => {
      // If this card was speaking, ensure its state is reset
      if (isSpeaking) {
        setIsSpeaking(false);
      }
      // A safety measure to stop speech if the active card changes abruptly
      window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHighlighted, app.name]); // isSpeaking is not a dependency to prevent re-triggering

  return (
    <div
      ref={cardRef}
      className={`card animated-card ${isHighlighted ? "highlight" : ""}`}
      tabIndex="0"
    >
      {/* Conditionally render the visualizer when card is highlighted and speaking */}
      {isHighlighted && isSpeaking && <AudioVisualizer />}

      {/* This div is used for the ripple animation effect */}
      <div className="ripple-border"></div>

      <div className="content">
        <img src={app.icon} alt={app.name} className="app-icon" />
        <h3 className="title">{app.name}</h3>
        <p className="copy">{app.description}</p>
        <div className="app-actions">
          <a href={app.link} className="btn" target="_blank" rel="noopener noreferrer">Launch</a>
          <button onClick={() => onPlay(app.helpVideo)} className="btn">Help</button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [videoUrl, setVideoUrl] = useState(null);

  const apps = [
    {
      id: 1,
      name: "🧠 AI Doctor Assistant",
      description: "Get instant AI-powered medical opinions, based on the latest RAG technology",
      icon: "/icons/doctorAI.svg",
      link: "https://dsahdoctoraiassistantbot.onrender.com",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 2,
      name: "📋 Medical Transcription App",
      description: "Generate structured medical notes from consultations , capture the essence of patient doctor conversation",
      icon: "/icons/hospital.svg",
      link: "https://medicaltranscription-version2-tests.onrender.com",
      helpVideo: "https://www.youtube.com/embed/24T0hx6AfAA?autoplay=1&mute=1",
    },
    {
      id: 3,
      name: "📊 AI-Powered Data Analyst",
      description: "Upload and analyze hospital data instantly, visualize the results, generate AI insights",
      icon: "/icons/dashboard.svg",
      link: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 4,
      name: "🧠 Medical Report Enhancement App",
      description: "Enhance the quality of the generated Medical reports by leveraging AI",
      icon: "/icons/report.svg",
      link: "https://medical-report-editor-ai-powered-dsah.onrender.com",
      helpVideo: "https://www.youtube.com/embed/1amAKukvQ2Q?autoplay=1&mute=1",
    },
    {
      id: 5,
      name: "🧠 IVF Virtual Training Assistant",
      description: "Designed to assist IVF fellowships at DSAH using RAG technology",
      icon: "/icons/ivf.svg",
      link: "https://ivf-virtual-training-assistant-dsah.onrender.com",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 6,
      name: "💬 Patient Assistant",
      description: "Voice assistant for patient navigation and booking",
      icon: "/icons/voice.svg",
      link: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
  ];

  return (
    <div className="container">
      <div className="header">
        <div className="logo-container">
          <img src="/assets/logo.png" alt="Hospital Logo" className="hospital-logo" />
        </div>
        <div className="title-block">
          <div id="BrushCursor">
            <div className="container">
              <div className="p p1">DSAH AI PLATFORM 🤖</div>
              <div className="p p2">DSAH AI PLATFORM 🤖</div>
              <div className="p p3">
                DSAH AI PLATFORM 🤖
                <div className="cursor"></div>
              </div>
            </div>
          </div>
          <p className="subtitle">Your single portal for all AI-powered applications</p>
        </div>
      </div>

      {videoUrl && (
        <div className="video-modal">
          <div className="video-wrapper">
            <button className="close-video" onClick={() => setVideoUrl(null)}>✖</button>
            <iframe
              src={videoUrl}
              title="Help Video"
              allow="autoplay; encrypted-media"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}

      <div className="page-content">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onPlay={setVideoUrl} />
        ))}
      </div>

      <ChatBot />
    </div>
  );
};

export default App;









