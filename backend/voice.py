from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import json
import logging
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import Qdrant
import qdrant_client
from prompts.system_prompt import SYSTEM_PROMPT

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# CORS — allow your frontend
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://ai-platform-dash.onrender.com",
            "http://localhost:5173",
            "http://localhost:3000"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not set.")
    raise EnvironmentError("OPENAI_API_KEY environment variable not set.")

OPENAI_SESSION_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_API_URL = "https://api.openai.com/v1/realtime"
MODEL_ID = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "ballad"
DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# ---------- Vector Store (unchanged) ----------
def get_vector_store():
    client = qdrant_client.QdrantClient(
        url=os.getenv("QDRANT_HOST"),
        api_key=os.getenv("QDRANT_API_KEY"),
    )
    embeddings = OpenAIEmbeddings()
    vector_store = Qdrant(
        client=client,
        collection_name=os.getenv("QDRANT_COLLECTION_NAME"),
        embeddings=embeddings,
    )
    return vector_store

vector_store = get_vector_store()

# ---------- Realtime function/tool schema ----------
def get_realtime_tools():
    """
    Tools made available to the Realtime model. The model can call these;
    your browser client (VoiceAssistant.jsx) listens for function calls and performs them.
    """
    return [
        {
            "type": "function",
            "name": "navigate",
            "description": "Navigate the single-page app to a section (hero/home, products, tutorial, policy, contact, footer).",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "enum": ["hero", "home", "products", "watch_tutorial", "policy", "contact", "footer"],
                        "description": "Section id (hero/home, products, watch_tutorial, policy, contact, footer)."
                    }
                },
                "required": ["target"]
            }
        },
        {
            "type": "function",
            "name": "chat_open",
            "description": "Open the on-page chatbot widget and focus the input.",
            "parameters": { "type": "object", "properties": {} }
        },
        {
            "type": "function",
            "name": "chat_set_text",
            "description": "Type text into the chatbot input without sending.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": { "type": "string" }
                },
                "required": ["text"]
            }
        },
        {
            "type": "function",
            "name": "chat_send",
            "description": "Send a message to the chatbot. If text is omitted, sends the current input field content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "Optional text to send immediately." }
                }
            }
        },
        {
            "type": "function",
            "name": "highlight_card",
            "description": "Highlight a product card by name (e.g., doctor assistant, transcription, analyst, report, ivf, patient).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" }
                },
                "required": ["name"]
            }
        },
        {
            "type": "function",
            "name": "app_launch",
            "description": "Open/launch one of the apps in a new browser tab.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app": {
                        "type": "string",
                        "enum": ["doctor", "transcript", "analyst", "report", "ivf", "patient", "survey"]
                    }
                },
                "required": ["app"]
            }
        }
    ]

@app.route('/')
def home():
    return "Flask API is running!"

@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    """
    Exchanges SDP with OpenAI Realtime and injects tool functions so the model can call them.
    The client (VoiceAssistant.jsx) will receive function call events over the DataChannel.
    """
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # Step 1: Create Realtime session with instructions + tools
        session_payload = {
            "model": MODEL_ID,
            "voice": VOICE,
            "modalities": ["text", "audio"],
            "turn_detection": {"type": "server_vad"},
            "instructions": DEFAULT_INSTRUCTIONS,
            "tools": get_realtime_tools()
        }
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        session_resp = requests.post(OPENAI_SESSION_URL, headers=headers, json=session_payload)
        if not session_resp.ok:
            logger.error(f"Session create failed: {session_resp.status_code} {session_resp.text}")
            return Response("Failed to create realtime session", status=500)

        token_data = session_resp.json()
        ephemeral_token = token_data.get("client_secret", {}).get("value")
        if not ephemeral_token:
            logger.error("Ephemeral token missing in session response")
            return Response("Missing ephemeral token", status=500)

        # Step 2: SDP exchange
        sdp_headers = {
            "Authorization": f"Bearer {ephemeral_token}",
            "Content-Type": "application/sdp"
        }
        sdp_resp = requests.post(
            OPENAI_API_URL,
            headers=sdp_headers,
            params={
                "model": MODEL_ID,
                "voice": VOICE
                # tools + instructions already set at session creation
            },
            data=client_sdp
        )
        if not sdp_resp.ok:
            logger.error(f"SDP exchange failed: {sdp_resp.status_code} {sdp_resp.text}")
            return Response("SDP exchange error", status=500)

        return Response(sdp_resp.content, status=200, mimetype='application/sdp')

    except Exception as e:
        logger.exception("RTC connection error")
        return Response(f"Error: {e}", status=500)

@app.route('/api/search', methods=['POST'])
def search():
    try:
        query = request.json.get('query')
        if not query:
            return jsonify({"error": "No query provided"}), 400

        logger.info(f"Searching for: {query}")
        results = vector_store.similarity_search_with_score(query, k=3)

        formatted = [{
            "content": doc.page_content,
            "metadata": doc.metadata,
            "relevance_score": float(score)
        } for doc, score in results]

        return jsonify({"results": formatted})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

# Optional: expose tool schema for debugging
@app.route('/api/tools', methods=['GET'])
def tools():
    return jsonify(get_realtime_tools())

if __name__ == '__main__':
    app.run(debug=True, port=8813)

