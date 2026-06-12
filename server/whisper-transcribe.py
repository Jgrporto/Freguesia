#!/usr/bin/env python3
import argparse
import json
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Transcreve áudio usando Whisper local.")
    parser.add_argument("--audio", required=True, help="Caminho do arquivo de áudio")
    parser.add_argument("--model", default="base", help="Modelo Whisper: tiny, base, small, medium, large, turbo")
    parser.add_argument("--language", default="pt", help="Idioma esperado, padrão pt")
    parser.add_argument("--mime-type", default="audio/ogg", help="MIME type original")
    args = parser.parse_args()

    started = time.time()
    try:
        import whisper

        model = whisper.load_model(args.model)
        result = model.transcribe(
            args.audio,
            language=args.language or None,
            fp16=False,
            verbose=False,
        )
        text = (result.get("text") or "").strip()
        payload = {
            "ok": True,
            "text": text,
            "language": result.get("language") or args.language,
            "durationSeconds": round(time.time() - started, 3),
            "model": args.model,
            "mimeType": args.mime_type,
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
