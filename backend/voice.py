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
from openai import OpenAI

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# CORS: expose API to your site/app domain(s)
CORS(app, resources={
    r"/api/*": {
        "origins": "https://ai-platform-dash.onrender.com",
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

# OpenAI endpoints / model config
OPENAI_SESSION_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_API_URL = "https://api.openai.com/v1/realtime"
MODEL_ID = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "ballad"
DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# OpenAI Python SDK client (for generating short focus instructions)
oai_client = OpenAI()

# In-memory per-visitor focus prompts used by /api/rtc-connect
VISITOR_VOICE_PROMPTS: dict[str, dict] = {}

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

@app.route('/')
def home():
    return "Flask API is running!"

# ---------------------------------------------------------------------
# NEW: Hover → voice priming endpoints
# ---------------------------------------------------------------------
@app.post("/api/voice-prompt")
def set_voice_prompt():
    """
    Receive JSON:
    {
      "visitorId": "string",
      "app": {
        "id": int, "name": str, "description": str, "link": str, "icon": str, "tag": str
      }
    }

    Generate a short instruction paragraph for the realtime voice agent to focus
    on the hovered app, store it in memory keyed by visitorId, and return it.
    """
    data = request.get_json(silent=True) or {}
    visitor_id = data.get("visitorId")
    appd = (data.get("app") or {})

    if not visitor_id or not appd.get("name"):
        return jsonify({"error": "visitorId and app.name required"}), 400

    sys = (
        "You write 1-2 paragraph instructions for a realtime medical voice AI. "
        "Keep them concise, helpful, clinician-friendly, and under 600 characters. "
        "Do not include JSON or code fences; return plain text only."
    )
    usr = f"""
App:
- id: {appd.get('id')}
- name: {appd.get('name')}
- description: {appd.get('description')}
- link: {appd.get('link')}
- tag: {appd.get('tag')}

Task:
Write short instructions so the agent focuses on THIS app if the user speaks next.
Mention the app name once; suggest how to help (overview + offer guidance).
Max length: 600 chars. Plain text.
"""

    try:
        resp = oai_client.chat.completions.create(
            model="gpt-4o",
            temperature=0.3,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": usr},
            ],
        )
        instructions = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.exception("Failed to generate voice focus instructions; using fallback.")
        instructions = (
            f"You are focusing on {appd.get('name')}. Briefly explain what it does, "
            f"how the user can use it right now, and offer to guide first steps. "
            + (f"Reference: {appd.get('link')}" if appd.get('link') else "")
        )

    payload = {
        "app": appd,
        "title": f"Voice focus: {appd.get('name')}",
        "instructions": instructions,
        "bullets": [
            f"Explain {appd.get('name')} briefly",
            "Offer next steps",
            "Ask if they want a demo",
        ],
        "ts": int(__import__("time").time() * 1000),
    }

    VISITOR_VOICE_PROMPTS[visitor_id] = payload
    return jsonify(payload)

@app.get("/api/voice-prompt")
def get_voice_prompt():
    """Return the latest stored voice-focus payload for a visitor."""
    visitor_id = request.args.get("visitorId")
    if not visitor_id:
        return jsonify({"error": "visitorId required"}), 400
    return jsonify(VISITOR_VOICE_PROMPTS.get(visitor_id) or {})

# ---------------------------------------------------------------------
# WebRTC Realtime connect (tweaked to inject per-visitor instructions)
# ---------------------------------------------------------------------
@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # NEW: pull per-visitor instructions (if any) from query string
        visitor_id = request.args.get("visitorId", "")
        extra = ""
        if visitor_id and visitor_id in VISITOR_VOICE_PROMPTS:
            extra = "\n\n---\nCurrent product focus:\n" + (
                VISITOR_VOICE_PROMPTS[visitor_id].get("instructions", "")
            )

        # Step 1: Create Realtime session + instructions
        session_payload = {
            "model": MODEL_ID,
            "voice": VOICE,
            # Combine your default system prompt with current focus instructions
            "instructions": (DEFAULT_INSTRUCTIONS or "") + extra
        }
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        session_resp = requests.post(OPENAI_SESSION_URL, headers=headers, json=session_payload)
        if not session_resp.ok:
            logger.error(f"Session create failed: {session_resp.text}")
            return Response("Failed to create realtime session", status=500)

        token_data = session_resp.json()
        ephemeral_token = token_data.get("client_secret", {}).get("value")
        if not ephemeral_token:
            logger.error("Ephemeral token missing")
            return Response("Missing ephemeral token", status=500)

        # Step 2: SDP exchange (answer)
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
                # instructions already set at session creation
            },
            data=client_sdp
        )
        if not sdp_resp.ok:
            logger.error(f"SDP exchange failed: {sdp_resp.text}")
            return Response("SDP exchange error", status=500)

        return Response(sdp_resp.content, status=200, mimetype='application/sdp')

    except Exception as e:
        logger.exception("RTC connection error")
        return Response(f"Error: {e}", status=500)

# ---------------------------------------------------------------------
# Vector search passthrough (unchanged)
# ---------------------------------------------------------------------
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


if __name__ == '__main__':
    # For local/dev use; in production deploy under a proper WSGI server
    app.run(debug=True, port=8813)
