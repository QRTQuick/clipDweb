from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os, json, time, httpx

app = FastAPI()

# ── Upstash Redis REST client ────────────────────────────
# These env vars are auto-injected by Vercel when you connect
# the Upstash Redis integration from the Marketplace.
REDIS_URL   = os.environ.get("KV_REST_API_URL", "")
REDIS_TOKEN = os.environ.get("KV_REST_API_TOKEN", "")
SLIPS_KEY   = "slipboard:slips"

def redis(command: list):
    """Execute a Redis command via Upstash REST API."""
    if not REDIS_URL or not REDIS_TOKEN:
        raise RuntimeError(
            "KV_REST_API_URL and KV_REST_API_TOKEN env vars are not set. "
            "Connect Upstash Redis in your Vercel project Marketplace."
        )
    resp = httpx.post(
        f"{REDIS_URL.rstrip('/')}/",
        headers={"Authorization": f"Bearer {REDIS_TOKEN}"},
        json=command,
        timeout=5.0,
    )
    resp.raise_for_status()
    return resp.json().get("result")


def load_slips() -> list:
    raw = redis(["GET", SLIPS_KEY])
    if not raw:
        return []
    return json.loads(raw)


def save_slips(slips: list):
    redis(["SET", SLIPS_KEY, json.dumps(slips)])


# ── Models ───────────────────────────────────────────────
class Slip(BaseModel):
    text: str


# ── Routes ───────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def home():
    with open("static/index.html", encoding="utf-8") as f:
        return f.read()


@app.get("/api/slips")
def get_slips():
    try:
        return JSONResponse(load_slips())
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/slips")
def add_slip(slip: Slip):
    try:
        slips = load_slips()
        slips.insert(0, {"text": slip.text, "ts": time.time()})
        save_slips(slips)
        return {"success": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/slips/{index}")
def delete_slip(index: int):
    try:
        slips = load_slips()
        if 0 <= index < len(slips):
            slips.pop(index)
            save_slips(slips)
        return {"success": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Static files (Vercel serves these via routes) ────────
app.mount("/static", StaticFiles(directory="static"), name="static")
