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
from datetime import datetime

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

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

OPENAI_SESSION_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_API_URL = "https://api.openai.com/v1/realtime"
MODEL_ID = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "ballad"
DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# In-memory UI state keyed by visitor (volatile; use Redis for prod)
VISITOR_UI_STATE = {}  # { visitorId: { "prompt": "...", "app": {...}, "ts": "..." } }

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

# ----------- NEW: receive a direct prompt from UI hover -----------
@app.route('/api/voice-prompt', methods=['POST'])
def voice_prompt():
    try:
        data = request.get_json(silent=True) or {}
        visitor_id = data.get("visitorId")
        prompt = data.get("prompt")
        app_info = data.get("app", {})
        if not visitor_id or not prompt:
            return jsonify({"ok": False, "error": "visitorId and prompt are required"}), 400

        VISITOR_UI_STATE[visitor_id] = {
            "prompt": str(prompt),
            "app": {
                "id": app_info.get("id"),
                "name": app_info.get("name"),
                "description": app_info.get("description"),
                "link": app_info.get("link"),
                "icon": app_info.get("icon"),
                "tag": app_info.get("tag"),
            },
            "ts": datetime.utcnow().isoformat() + "Z",
        }
        logger.info(f"[voice-prompt] stored for visitor={visitor_id}: {app_info.get('name')} | {prompt[:80]}...")
        return jsonify({"ok": True})
    except Exception as e:
        logger.exception("voice_prompt error")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/api/voice-prompt', methods=['GET'])
def get_voice_prompt():
    visitor_id = request.args.get("visitorId")
    if not visitor_id:
        return jsonify({"ok": False, "error": "visitorId is required"}), 400
    return jsonify({"ok": True, "state": VISITOR_UI_STATE.get(visitor_id)})

# ------------------------- Realtime connect -------------------------
@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # Correlate hover-prompt with this session (query or header)
        visitor_id = request.args.get("visitorId") or request.headers.get("X-Visitor-Id")
        merged_instructions = DEFAULT_INSTRUCTIONS

        # If a prompt exists for this visitor, merge it explicitly
        if visitor_id and visitor_id in VISITOR_UI_STATE:
            state = VISITOR_UI_STATE[visitor_id]
            app_ctx = state.get("app") or {}
            ui_prompt = state.get("prompt") or ""
            ctx_txt = (
                f"\n\n---\nUI HOVER PROMPT (treat as recent user intent)\n"
                f"{ui_prompt}\n\n"
                f"App Context: {app_ctx.get('name')} (tag: {app_ctx.get('tag')}, id: {app_ctx.get('id')})\n"
                f"Description: {app_ctx.get('description')}\n"
                f"Link: {app_ctx.get('link')}\n---\n"
            )
            merged_instructions = f"{DEFAULT_INSTRUCTIONS}{ctx_txt}"

        # Step 1: Create Realtime session with merged instructions
        session_payload = {
            "model": MODEL_ID,
            "voice": VOICE,
            "instructions": merged_instructions
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
                # instructions already merged at session creation
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

# ----------------------------- RAG search -----------------------------
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
    app.run(debug=True, port=8813)
