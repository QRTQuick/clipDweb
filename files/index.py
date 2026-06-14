from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json, os, asyncio, time

app = FastAPI()
DATA_FILE = "slips.json"
_last_modified = time.time()
_sse_clients: list[asyncio.Queue] = []

class Slip(BaseModel):
    text: str

def load_slips():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_slips(data):
    global _last_modified
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    _last_modified = time.time()
    # Notify all SSE clients
    for q in list(_sse_clients):
        try:
            q.put_nowait("update")
        except:
            pass

@app.get("/", response_class=HTMLResponse)
def home():
    with open("static/index.html", encoding="utf-8") as f:
        return f.read()

@app.get("/api/slips")
def get_slips():
    return JSONResponse(load_slips())

@app.get("/api/slips/timestamp")
def get_timestamp():
    return JSONResponse({"ts": _last_modified})

@app.get("/api/events")
async def sse_events(request: Request):
    q: asyncio.Queue = asyncio.Queue()
    _sse_clients.append(q)

    async def event_stream():
        try:
            # Send initial ping
            yield "data: ping\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield "data: ping\n\n"
        finally:
            _sse_clients.remove(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@app.post("/api/slips")
def add_slip(slip: Slip):
    slips = load_slips()
    slips.insert(0, {"text": slip.text, "ts": time.time()})
    save_slips(slips)
    return {"success": True}

@app.delete("/api/slips/{index}")
def delete_slip(index: int):
    slips = load_slips()
    if 0 <= index < len(slips):
        slips.pop(index)
        save_slips(slips)
    return {"success": True}

app.mount("/static", StaticFiles(directory="static"), name="static")
