import React from "react";
import "./App.css";
import ChatBot from "./components/Chatbot";

const apps = [
  {
    name: "🧠 AI Doctor Assistant ",
    description: "Get instant AI-powered medical opinions, based on the latest RAG technology",
    icon: "/icons/doctorAI.svg",
    link: "https://dsahdoctoraiassistantbot.onrender.com",
    helpVideo: "https://your-hospital.com/videos/ai-second-opinion.mp4",
  },
  {
    name: "📋 Medical Transcription App",
    description: "Generate structured medical notes from consultations , capture the essence of patient doctor conversation",
    icon: "/icons/hospital.svg",
    link: "https://medicaltranscription-version2-tests.onrender.com",
    helpVideo: "https://your-hospital.com/videos/transcription-help.mp4",
  },
  {
    name: "📊 AI-Powered Data Analyst",
    description: "Upload and analyze hospital data instantly, visualize the results, generate AI insights",
    icon: "/icons/dashboard.svg",
    link: "/bi-dashboard",
    helpVideo: "https://your-hospital.com/videos/dashboard-help.mp4",
  },
  {
    name: "🧠 Medical Report Enhancement App",
    description: "Enhance the quality of the generated Medical reports by leveraging AI",
    icon: "/icons/report.svg",
    link: "https://medical-report-editor-ai-powered-dsah.onrender.com",
    helpVideo: "https://your-hospital.com/videos/assistant-help.mp4",
  },
   {
    name: "🧠 IVF Virtual Training Assistant",
    description: "designed to assist fellowships of IVF at DSAH based retrieval augmented generation (RAG)",
    icon: "/icons/ivf.svg",
    link: "/https://dsahivffellowship.onrender.com/",
    helpVideo: "https://your-hospital.com/videos/ai-second-opinion.mp4",
  },
  {
    name: "💬 Patient Assistant",
    description: "Voice assistant for patient navigation and booking",
    icon: "/icons/voice.svg",
    link: "https://patient-assistant-avatar-v1.onrender.com",
    helpVideo: "https://your-hospital.com/videos/assistant-help.mp4",
  },
];

const AppCard = ({ app }) => {
  const playHelp = () => {
    const videoWindow = window.open("", "Help Video", "width=800,height=600");
    videoWindow.document.write(
      `<video width='100%' controls autoplay><source src='${app.helpVideo}' type='video/mp4'></video>`
    );
  };

  return (
    <div className="card animated-card" tabIndex="0">
      <div className="glow-border"></div>
      <div className="content">
        <img src={app.icon} alt={app.name} className="app-icon" />
        <h3 className="title">{app.name}</h3>
        <p className="copy">{app.description}</p>
        <div className="app-actions">
          <a href={app.link} className="btn" target="_blank" rel="noopener noreferrer">Launch</a>
          <button onClick={playHelp} className="btn">Help</button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <div className="container">
      <div className="header">
        <div className="logo-container">
          <img src="./logo.png" alt="Hospital Logo" className="hospital-logo" />
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
      <div className="page-content">
        {apps.map((app) => (
          <AppCard key={app.name} app={app} />
        ))}
      </div>
      <ChatBot/>
    </div>
  );
};

export default App;





