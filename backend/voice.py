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

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "https://ai-platform-dash.onrender.com",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Session-Id"],
        }
    },
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not set.")
    raise EnvironmentError("OPENAI_API_KEY environment variable not set.")

# ✅ Current Realtime endpoints
OPENAI_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls"

MODEL_ID = "gpt-4o-realtime-preview-2024-12-17"
VOICE = "ballad"
DEFAULT_INSTRUCTIONS = SYSTEM_PROMPT

# ✅ Input transcription model (for streaming transcripts of the user's speech)
# Use one of the models supported by Realtime transcription in your account/docs.
INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"


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


@app.route("/")
def home():
    return "Flask API is running!"


@app.route("/api/session-context", methods=["POST", "OPTIONS"])
def api_session_context():
    """
    Optional endpoint to receive transcript/context and keep parity with clients
    that may want to push context. We simply log and return ok.
    """
    try:
        data = request.get_json(silent=True) or {}
        session_id = (data.get("session_id") or "").strip()
        transcript = (data.get("transcript") or "").strip()
        logger.info(f"[session-context] session_id={session_id} chars={len(transcript)}")
        return jsonify({"ok": True}), 200
    except Exception as e:
        logger.exception("session-context error")
        return jsonify({"ok": False, "error": str(e)}), 500


# ------------------------ Function-calling tools ------------------------
NAV_ALLOWED = [
    "home",
    "about",  # ✅ add to match your instructions
    "products",
    "policy",
    "watch_tutorial",
    "contact",
    "footer",
    "chat",
    "doctor",
    "transcription",
    "analyst",
    "report",
    "ivf",
    "patient",
    "survey",
]

TOOLS = [
    {
        "type": "function",
        "name": "navigate_to",
        "description": "Navigate the platform to an allowed section or open a specific product/app.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "section": {
                    "type": "string",
                    "description": "One of the allowed section names.",
                    "enum": NAV_ALLOWED,
                }
            },
            "required": ["section"],
        },
    },
    {
        "type": "function",
        "name": "click_control",
        "description": "Click a whitelisted UI control by its data-agent-id. Use ONLY ids you have been told are available.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "control_id": {
                    "type": "string",
                    "description": "A safe, whitelisted control id like 'products.launch:doctor' or 'nav.products'.",
                }
            },
            "required": ["control_id"],
        },
    },
    {
        "type": "function",
        "name": "chat_ask",
        "description": "Type a message into the platform's chatbot and submit.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "text": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 500,
                    "description": "The exact message to send into the on-platform chatbot.",
                }
            },
            "required": ["text"],
        },
    },
    {
        "type": "function",
        "name": "contact_fill",
        "description": "Fill the contact form fields (name, email, recipient, message). Any field may be omitted to partially fill.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "name": {"type": "string", "description": "Sender's name"},
                "email": {"type": "string", "description": "Sender's email address"},
                "recipient": {"type": "string", "description": "Person/department to reach (optional)"},
                "message": {"type": "string", "description": "Message body"},
            },
        },
    },
    {
        "type": "function",
        "name": "contact_submit",
        "description": "Submit the contact form after required fields are present.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {}},
    },
    {
        "type": "function",
        "name": "toggle_theme",
        "description": "Switch the application theme.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "theme": {
                    "type": "string",
                    "enum": ["light", "dark", "system", "toggle"],
                    "description": "Target theme or 'toggle'.",
                }
            },
            "required": ["theme"],
        },
    },
    {
        "type": "function",
        "name": "set_chat_visible",
        "description": "Open or close the on-page chatbot window.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {"visible": {"type": "boolean", "description": "true to open, false to close"}},
            "required": ["visible"],
        },
    },
    {
        "type": "function",
        "name": "chat_toggle",
        "description": "Toggle the on-page chatbot open/closed.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {}},
    },
    {
        "type": "function",
        "name": "chat_close",
        "description": "Close (hide) the on-page chatbot if it is open.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {}},
    },
    {
        "type": "function",
        "name": "tutorial_play",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "id": {
                    "type": "string",
                    "enum": ["doctorai", "transcription", "medreport", "ivf", "meeting"],  # ✅ add meeting
                },
                "open_modal": {"type": "boolean"},
            },
            "required": ["id"],
        },
    },
    {
        "type": "function",
        "name": "card_play",
        "description": "Open the Card Console for a specific application and (optionally) autoplay the info audio.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "id": {
                    "type": "string",
                    "enum": [
                        "ai_doctor",
                        "transcription",
                        "bi_dashboard",
                        "report_enhance",
                        "ivf_assistant",
                        "meeting_assistant",
                        "patient_avatar",
                    ],
                    "description": "Stable card ids in the Card Console UI.",
                },
                "autoplay": {"type": "boolean", "description": "If true (default), starts audio automatically."},
            },
            "required": ["id"],
        },
    },
    {
        "type": "function",
        "name": "show_dashboard",
        "description": "Open the draggable dashboard displaying Web Vitals and platform usage statistics.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {}},
    },
    {
        "type": "function",
        "name": "assistant_close",
        "description": "Close/hide the on-screen voice assistant and end the session.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {}},
    },
]


@app.route("/api/rtc-connect", methods=["POST"])
def connect_rtc():
    """
    Receives SDP offer from the browser and returns SDP answer from OpenAI Realtime (WebRTC).

    This version:
    - uses /v1/realtime/client_secrets to create an ephemeral token with full session config
    - uses /v1/realtime/calls for the SDP exchange
    - enables input transcription so the client can stream user speech transcript in real-time
    """
    try:
        client_sdp = request.get_data(as_text=True)
        if not client_sdp:
            return Response("No SDP provided", status=400, mimetype="text/plain")

        session_id = request.args.get("session_id") or request.headers.get("X-Session-Id") or ""

        # ✅ Session config for Realtime (WebRTC + tools + voice + transcription)
        session_config = {
            "session": {
                "type": "realtime",
                "model": MODEL_ID,
                "output_modalities": ["audio", "text"],
                "audio": {
                    "input": {
                        "turn_detection": {"type": "server_vad"},
                        "transcription": {"model": INPUT_TRANSCRIPTION_MODEL},
                    },
                    "output": {"voice": VOICE},
                },
                "instructions": (
                    DEFAULT_INSTRUCTIONS
                    + "\n\n"
                    + "If the user wants to send an email via the Contact section, ask for any missing fields "
                      "(name, email, recipient if needed, and message). After confirming, call contact_fill with "
                      "the collected values, then call contact_submit to send. "
                      "When the user asks you to open pages, click buttons, or type into the chatbot, "
                      "use the provided tools strictly with the allowed values. "
                      "If the user asks you to open or close the chatbot, call set_chat_visible with visible=true "
                      "or visible=false respectively. "
                      "If the user asks you to go to the About section, use navigate_to section='about'. "
                      "If the user indicates they want to dismiss the assistant (e.g., “dismiss”, “close assistant”, “hide”), "
                      "call assistant_close with no arguments and do not ask for confirmation. "
                      "When the user asks to show or play a tutorial video, call tutorial_play with the proper id."
                ),
                "tools": TOOLS,
                "tool_choice": "auto",
                # (optional) store your own metadata
                "metadata": {"app_session_id": session_id} if session_id else {},
            }
        }

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

        # 1) Create client secret (ephemeral token) with session config
        secret_resp = requests.post(
            OPENAI_CLIENT_SECRETS_URL,
            headers=headers,
            json=session_config,
            timeout=30,
        )
        if not secret_resp.ok:
            logger.error(f"client_secrets failed: {secret_resp.status_code} {secret_resp.text}")
            return Response("Failed to create realtime client secret", status=500, mimetype="text/plain")

        secret_data = secret_resp.json()

        # Some older responses used client_secret.value; newer docs use value directly.
        ephemeral_token = (
            secret_data.get("value")
            or (secret_data.get("client_secret") or {}).get("value")
        )
        if not ephemeral_token:
            logger.error(f"Ephemeral token missing: {secret_data}")
            return Response("Missing ephemeral token", status=500, mimetype="text/plain")

        # 2) SDP exchange (offer -> answer)
        sdp_headers = {
            "Authorization": f"Bearer {ephemeral_token}",
            "Content-Type": "application/sdp",
        }
        sdp_resp = requests.post(
            OPENAI_CALLS_URL,
            headers=sdp_headers,
            data=client_sdp,
            timeout=60,
        )
        if not sdp_resp.ok:
            logger.error(f"SDP exchange failed: {sdp_resp.status_code} {sdp_resp.text}")
            return Response("SDP exchange error", status=500, mimetype="text/plain")

        return Response(sdp_resp.content, status=200, mimetype="application/sdp")

    except Exception as e:
        logger.exception("RTC connection error")
        return Response(f"Error: {e}", status=500, mimetype="text/plain")


@app.route("/api/search", methods=["POST"])
def search():
    try:
        query = request.json.get("query")
        if not query:
            return jsonify({"error": "No query provided"}), 400

        logger.info(f"Searching for: {query}")
        results = vector_store.similarity_search_with_score(query, k=3)

        formatted = [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
                "relevance_score": float(score),
            }
            for doc, score in results
        ]

        return jsonify({"results": formatted})

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=8813)

