import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import ChatBot from "./components/Chatbot";
import useCardStore from "./components/store/useCardStore";
import AudioPlayer from "./components/AudioPlayer";

const audioMap = {
  1: "/assets/audio/ai_doctor.mp3",
  2: "/assets/audio/medical_transcription.mp3",
  3: "/assets/audio/data_analyst.mp3",
  4: "/assets/audio/report_enhancement.mp3",
  5: "/assets/audio/ivf_assistant.mp3",
  6: "/assets/audio/patient_assistant.mp3",
};

const AppCard = ({ app, onPlay }) => {
  const { activeCardId, setActiveCardId } = useCardStore();
  const isActive = activeCardId === app.id;
  const cardRef = useRef(null);

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive]);

  const handleHelpClick = () => {
    onPlay(app.helpVideo);
    setActiveCardId(app.id);
  };

  return (
    <div
      ref={cardRef}
      className={`card animated-card ${isActive ? "highlight expanded" : ""}`}
      tabIndex="0"
      style={{
        position: isActive ? "absolute" : "relative",
        zIndex: isActive ? 999 : 1,
        width: isActive ? "100%" : undefined,
      }}
    >
      {isActive && (
        <>
          <span></span><span></span><span></span><span></span>
        </>
      )}

      <div className="glow-border"></div>
      <div className="content">
        <img src={app.icon} alt={app.name} className="app-icon" />
        <h3 className="title">{app.name}</h3>
        <p className="copy">{app.description}</p>

        <div className="app-actions">
          <a href={app.link} className="btn" target="_blank" rel="noopener noreferrer">
            Launch
          </a>
          <button onClick={handleHelpClick} className="btn">
            Help
          </button>
        </div>

        {isActive && (
          <div className="audio-wrapper">
            <AudioPlayer
              src={audioMap[app.id]}
              key={audioMap[app.id]}
              onEnded={() => setActiveCardId(null)}
            />
          </div>
        )}
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
      description: "Generate structured medical notes from consultations",
      icon: "/icons/hospital.svg",
      link: "https://medicaltranscription-version2-tests.onrender.com",
      helpVideo: "https://www.youtube.com/embed/24T0hx6AfAA?autoplay=1&mute=1",
    },
    {
      id: 3,
      name: "📊 AI-Powered Data Analyst",
      description: "Upload and analyze hospital data instantly, visualize the results",
      icon: "/icons/dashboard.svg",
      link: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
      helpVideo: "https://www.youtube.com/embed/FbEV-LrmZl0?autoplay=1&mute=1",
    },
    {
      id: 4,
      name: "🧠 Medical Report Enhancement App",
      description: "Enhance the quality of medical reports using AI",
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
                DSAH AI PLATFORM 🤖<div className="cursor"></div>
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

      <div className="page-content" style={{ position: "relative", paddingBottom: "600px" }}>
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onPlay={setVideoUrl} />
        ))}
      </div>

      <ChatBot />
    </div>
  );
};

export default App;















