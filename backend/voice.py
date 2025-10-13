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
from datetime import datetime  # [ADDED]

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

# [ADDED] In-memory visitor→context map (simple/volatile)
VISITOR_CONTEXT = {}  # { visitorId: {"app": {...}, "ts": "..." } }

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

# [ADDED] Hover-context webhook endpoint (called from frontend on card hover)
@app.route('/api/voice-context', methods=['POST'])
def set_voice_context():
    try:
        data = request.get_json(silent=True) or {}
        visitor_id = data.get("visitorId")
        app_info = data.get("app")
        if not visitor_id or not app_info:
            return jsonify({"ok": False, "error": "visitorId and app are required"}), 400

        VISITOR_CONTEXT[visitor_id] = {
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
        logger.info(f"[voice-context] set for visitor={visitor_id}: {VISITOR_CONTEXT[visitor_id]['app'].get('name')}")
        return jsonify({"ok": True})
    except Exception as e:
        logger.exception("set_voice_context error")
        return jsonify({"ok": False, "error": str(e)}), 500

# [ADDED] Optional: fetch latest context (helpful for client polling or diagnostics)
@app.route('/api/voice-context', methods=['GET'])
def get_voice_context():
    visitor_id = request.args.get("visitorId")
    if not visitor_id:
        return jsonify({"ok": False, "error": "visitorId is required"}), 400
    ctx = VISITOR_CONTEXT.get(visitor_id)
    return jsonify({"ok": True, "context": ctx})

@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # [ADDED] Allow correlating hover context with this session
        # Frontend may pass ?visitorId=... or header X-Visitor-Id
        visitor_id = request.args.get("visitorId") or request.headers.get("X-Visitor-Id")
        merged_instructions = DEFAULT_INSTRUCTIONS

        if visitor_id and visitor_id in VISITOR_CONTEXT:
            app_ctx = VISITOR_CONTEXT[visitor_id]["app"]
            ctx_txt = (
                f"\n\n---\nUSER UI CONTEXT\n"
                f"User is currently focusing on app: {app_ctx.get('name')} "
                f"(tag: {app_ctx.get('tag')}, id: {app_ctx.get('id')}).\n"
                f"Description: {app_ctx.get('description')}\n"
                f"Relevant link (if needed): {app_ctx.get('link')}\n"
                f"Prefer answers scoped to this app unless the user clearly changes topic.\n---\n"
            )
            merged_instructions = f"{DEFAULT_INSTRUCTIONS}{ctx_txt}"

        # Step 1: Create Realtime session + instructions
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
