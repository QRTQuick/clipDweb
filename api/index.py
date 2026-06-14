from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import json, os

app = FastAPI()
DATA_FILE = "slips.json"

class Slip(BaseModel):
    text: str

def load_slips():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_slips(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

@app.get("/")
def home():
    return HTMLResponse(open("static/index.html", encoding="utf-8").read())

@app.get("/api/slips")
def get_slips():
    return JSONResponse(load_slips())

@app.post("/api/slips")
def add_slip(slip: Slip):
    slips = load_slips()
    slips.insert(0, {"text": slip.text})
    save_slips(slips)
    return {"success": True}

@app.delete("/api/slips/{index}")
def delete_slip(index: int):
    slips = load_slips()
    if 0 <= index < len(slips):
        slips.pop(index)
        save_slips(slips)
    return {"success": True}
