
import os
import torch
from transformers import pipeline
from backend.config import DEVICE
import imageio_ffmpeg

# Explicitly add ffmpeg to PATH for subprocesses
os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

# Global pipeline instance to avoid reloading
_transcriber = None

def get_transcriber():
    global _transcriber
    if _transcriber is None:
        print("🎙️ Loading Whisper Model (openai/whisper-tiny) for Voice Search...")
        try:
            # Using "openai/whisper-tiny" for fastest CPU/low-vram inference
            # You can switch to "openai/whisper-base" or "openai/whisper-small" for better accuracy
            model_id = "openai/whisper-tiny"
            
            _transcriber = pipeline(
                "automatic-speech-recognition",
                model=model_id,
                device=DEVICE if torch.cuda.is_available() else "cpu",
                chunk_length_s=30,
            )
            print("✅ Whisper Model Loaded Successfully")
        except Exception as e:
            print(f"❌ Failed to load Whisper Model: {e}")
            _transcriber = None
    return _transcriber

def transcribe_audio(audio_path: str) -> str:
    """
    Transcribes audio file to text.
    supported formats: wav, mp3, flac, etc. (ffmpeg required usually)
    """
    transcriber = get_transcriber()
    if not transcriber:
        raise RuntimeError("Transcriber model not initialized")

    try:
        # result is {'text': " transcription..."}
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        print(f"🎙️ Transcribing: {audio_path}")
        result = transcriber(audio_path)
        text = result.get('text', '').strip()
        print(f"🎙️ Transcription Result: '{text}'")
        return text
    except ValueError as e:
        if "ffmpeg" in str(e).lower():
            print("❌ FFMPEG Not Found: Audio transcoding requires ffmpeg.")
            raise RuntimeError("FFMPEG dependency missing") from e
        raise e
    except Exception as e:
        print(f"❌ Transcription Error: {e}")
        raise e
