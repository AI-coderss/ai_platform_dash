# backend/voice.py
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os
import json
import logging
from dotenv import load_dotenv

# Vector store (unchanged from your version)
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import Qdrant
import qdrant_client

# OpenAI Python SDK for Responses API (vision/text)
from openai import OpenAI

# Your system prompt (unchanged)
from prompts.system_prompt import SYSTEM_PROMPT

# ===== env & config =====
load_dotenv()

app = Flask(__name__)

# CORS: keep your existing frontend origin
CORS(app, resources={
    r"/api/*": {
        "origins": "https://ai-platform-dash.onrender.com",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not set.")
    raise EnvironmentError("OPENAI_API_KEY environment variable not set.")

# ----- Realtime (WebRTC) (kept intact) -----
OPENAI_SESSION_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_API_URL = "https://api.openai.com/v1/realtime"
REALTIME_MODEL_ID = os.getenv("REALTIME_MODEL_ID", "gpt-4o-realtime-preview-2024-12-17")
REALTIME_VOICE = os.getenv("REALTIME_VOICE", "ballad")

# ----- Vision/Text (Responses API) -----
# Defaults to GPT-4.1 mini which supports image understanding per OpenAI docs.
VISION_MODEL_ID = os.getenv("VISION_MODEL_ID", "gpt-4.1-mini")

DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# Single OpenAI client for Responses API calls (vision/text)
oai_client = OpenAI(api_key=OPENAI_API_KEY)

# ===== vector store (unchanged) =====
def get_vector_store():
    client = qdrant_client.QdrantClient(
        url=os.getenv("QDRANT_HOST"),
        api_key=os.getenv("QDRANT_API_KEY"),
    )
    embeddings = OpenAIEmbeddings(api_key=OPENAI_API_KEY)
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


# ============================================================
# Realtime (WebRTC) voice assistant session + SDP exchange
# (kept intact; frontend no longer calls it for hover)
# ============================================================
@app.route('/api/rtc-connect', methods=['POST'])
def connect_rtc():
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400)

        # Step 1: Create a Realtime session
        session_payload = {
            "model": REALTIME_MODEL_ID,
            "voice": REALTIME_VOICE,
            "instructions": DEFAULT_INSTRUCTIONS
        }
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        session_resp = requests.post(OPENAI_SESSION_URL, headers=headers, json=session_payload, timeout=20)
        if not session_resp.ok:
            logger.error(f"Session create failed: {session_resp.status_code} {session_resp.text}")
            return Response("Failed to create realtime session", status=500)

        token_data = session_resp.json()
        ephemeral_token = token_data.get("client_secret", {}).get("value")
        if not ephemeral_token:
            logger.error(f"Ephemeral token missing in: {token_data}")
            return Response("Missing ephemeral token", status=500)

        # Step 2: SDP exchange with the ephemeral token
        sdp_headers = {
            "Authorization": f"Bearer {ephemeral_token}",
            "Content-Type": "application/sdp"
        }
        sdp_resp = requests.post(
            OPENAI_API_URL,
            headers=sdp_headers,
            params={
                "model": REALTIME_MODEL_ID,
                "voice": REALTIME_VOICE
            },
            data=client_sdp,
            timeout=20
        )
        if not sdp_resp.ok:
            logger.error(f"SDP exchange failed: {sdp_resp.status_code} {sdp_resp.text}")
            return Response("SDP exchange error", status=500)

        return Response(sdp_resp.content, status=200, mimetype='application/sdp')

    except Exception as e:
        logger.exception("RTC connection error")
        return Response(f"Error: {e}", status=500)


# ============================================================
# Vision-on-hover: full explanation (kept, optional)
# ============================================================
@app.route('/api/element-explain', methods=['POST'])
def element_explain():
    """
    Expects JSON:
      { "image_data_url": "data:image/png;base64,...", "prompt": "..." }
    Returns: { "text": "<model explanation>" }
    """
    try:
        data = request.get_json(silent=True) or {}
        image_data_url = data.get("image_data_url")
        user_prompt = data.get("prompt") or "Explain what's shown and how to use it, step by step, concisely."

        if not image_data_url:
            return jsonify({"error": "image_data_url is required"}), 400

        style_prefix = (
            "You are a helpful voice assistant for Dr. Samir Abbas Hospital's AI platform. "
            "Be concise, friendly, and actionable. Avoid internal implementation details."
        )

        vision_input = [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": f"{style_prefix}\n\n{user_prompt}"},
                {"type": "input_image", "image_url": image_data_url},
            ],
        }]

        resp = oai_client.responses.create(
            model=VISION_MODEL_ID,
            input=vision_input,
        )

        text = getattr(resp, "output_text", None)
        if not text:
            try:
                blocks = getattr(resp, "output", None)
                if isinstance(blocks, list):
                    text = "".join([b.get("text", "") for b in blocks if b.get("type") == "output_text"]).strip()
            except Exception:
                text = None

        if not text:
            text = "Sorry, I couldn't generate an explanation for that element."

        return jsonify({"text": text})

    except Exception as e:
        logger.exception("element_explain error")
        return jsonify({"error": str(e)}), 500


# ============================================================
# Vision-on-hover: generate a single concise QUERY (new)
# ============================================================
@app.route('/api/element-query', methods=['POST'])
def element_query():
    """
    Expects JSON:
      {
        "image_data_url": "data:image/png;base64,...",
        "meta": { "name": "...", "description": "...", "link": "..." }  # optional
      }

    Returns:
      { "query": "<one-sentence question the user can ask the assistant>" }
    """
    try:
        data = request.get_json(silent=True) or {}
        image_data_url = data.get("image_data_url")
        meta = data.get("meta") or {}
        app_name = meta.get("name", "this application")
        app_desc = meta.get("description", "")
        app_link = meta.get("link", "")

        if not image_data_url:
            return jsonify({"error": "image_data_url is required"}), 400

        system_style = (
            "You generate exactly ONE short user query (a single sentence, under 160 characters). "
            "Do NOT answer the question. Do NOT add quotes. "
            "Prefer mentioning the app's name if known. No extra text."
        )

        # Build the textual instruction given the meta
        text_prompt = (
            f"{system_style}\n\n"
            f"Context:\n- App name: {app_name}\n- App description: {app_desc}\n- Launch URL: {app_link}\n\n"
            f"Task: Based on the screenshot and context, produce ONE helpful question to ask an assistant about how to use this app."
        )

        vision_input = [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": text_prompt},
                {"type": "input_image", "image_url": image_data_url},
            ],
        }]

        resp = oai_client.responses.create(
            model=VISION_MODEL_ID,
            input=vision_input,
        )

        query_text = getattr(resp, "output_text", None)
        if not query_text:
            try:
                blocks = getattr(resp, "output", None)
                if isinstance(blocks, list):
                    query_text = "".join([b.get("text", "") for b in blocks if b.get("type") == "output_text"]).strip()
            except Exception:
                query_text = None

        # Normalize to one line, trim length hard if needed
        if not query_text:
            query_text = f"How do I use {app_name} to get started?"

        query_text = " ".join(query_text.split())[:180]  # soft cap
        return jsonify({"query": query_text})

    except Exception as e:
        logger.exception("element_query error")
        return jsonify({"error": str(e)}), 500


# ============================================================
# Search (Qdrant vector store) — unchanged
# ============================================================
@app.route('/api/search', methods=['POST'])
def search():
    try:
        payload = request.get_json(silent=True) or {}
        query = payload.get('query')
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


# ============================================================
# Healthcheck (optional)
# ============================================================
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"ok": True, "model_realtime": REALTIME_MODEL_ID, "model_vision": VISION_MODEL_ID})


if __name__ == '__main__':
  # Use PORT env if deploying (Render/Heroku/etc.)
  port = int(os.getenv("PORT", 8813))
  app.run(host="0.0.0.0", port=port, debug=True)

