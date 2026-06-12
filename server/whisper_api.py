#!/usr/bin/env python3
import asyncio
import json
import os
import tempfile
import time
import traceback
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny").strip() or "tiny"
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "pt").strip() or "pt"
TMP_DIR = os.environ.get("WHISPER_TMP_DIR", "server/data/whisper-tmp").strip() or "server/data/whisper-tmp"
MAX_AUDIO_MB = int(os.environ.get("WHISPER_MAX_AUDIO_MB", "25") or "25")
FP16 = os.environ.get("WHISPER_FP16", "false").strip().lower() in {"1", "true", "yes", "on"}

app = FastAPI(title="Freguesia Whisper Service", version="1.0.0")
_model = None
_model_lock = asyncio.Lock()
_transcribe_lock = asyncio.Lock()


def _safe_suffix(mime_type: str) -> str:
    mime = (mime_type or "").lower()
    if "mpeg" in mime or "mp3" in mime:
        return ".mp3"
    if "mp4" in mime or "m4a" in mime:
        return ".m4a"
    if "wav" in mime:
        return ".wav"
    if "webm" in mime:
        return ".webm"
    if "ogg" in mime or "opus" in mime:
        return ".ogg"
    return ".ogg"


def _load_model_sync():
    import whisper

    started = time.time()
    model = whisper.load_model(MODEL_NAME)
    elapsed = round(time.time() - started, 3)
    print(f"[whisper-service] model loaded model={MODEL_NAME} elapsed={elapsed}s", flush=True)
    return model


async def get_model():
    global _model
    if _model is not None:
        return _model

    async with _model_lock:
        if _model is None:
            _model = await run_in_threadpool(_load_model_sync)
    return _model


def _transcribe_sync(audio_path: str, mime_type: str, language: Optional[str]):
    model = _model
    if model is None:
        raise RuntimeError("Whisper model was not loaded")

    result = model.transcribe(
        audio_path,
        language=language or None,
        fp16=FP16,
        verbose=False,
    )

    text = str(result.get("text") or "").strip()
    detected_language = result.get("language") or language or LANGUAGE
    return {
        "ok": True,
        "text": text,
        "language": detected_language,
        "durationSeconds": 0,
        "model": MODEL_NAME,
        "mimeType": mime_type or "audio/ogg",
        "provider": "local-whisper-service",
    }


@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "language": LANGUAGE,
        "loaded": _model is not None,
        "provider": "local-whisper-service",
    }


@app.post("/transcribe")
async def transcribe(request: Request):
    started = time.time()
    mime_type = (request.headers.get("content-type") or "audio/ogg").split(";")[0].strip() or "audio/ogg"
    language = request.headers.get("x-whisper-language") or LANGUAGE

    audio_bytes = await request.body()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio payload is empty")

    max_bytes = max(1, MAX_AUDIO_MB) * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {MAX_AUDIO_MB}MB limit")

    Path(TMP_DIR).mkdir(parents=True, exist_ok=True)
    suffix = _safe_suffix(mime_type)
    tmp_file = None

    try:
        with tempfile.NamedTemporaryFile(prefix="whisper-", suffix=suffix, dir=TMP_DIR, delete=False) as handle:
            handle.write(audio_bytes)
            tmp_file = handle.name

        await get_model()

        async with _transcribe_lock:
            print(
                f"[whisper-service] transcribe started bytes={len(audio_bytes)} model={MODEL_NAME} mime={mime_type}",
                flush=True,
            )
            result = await run_in_threadpool(_transcribe_sync, tmp_file, mime_type, language)
            elapsed = round(time.time() - started, 3)
            print(f"[whisper-service] transcribe finished elapsed={elapsed}s", flush=True)
            return JSONResponse(result)
    except Exception as exc:
        elapsed = round(time.time() - started, 3)
        print(f"[whisper-service] transcribe failed elapsed={elapsed}s error={exc}", flush=True)
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)
    finally:
        if tmp_file:
            try:
                os.remove(tmp_file)
            except FileNotFoundError:
                pass
            except Exception as exc:
                print(f"[whisper-service] temp cleanup failed path={tmp_file} error={exc}", flush=True)
