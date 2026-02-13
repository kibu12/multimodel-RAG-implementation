import os
import torch
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Paths
DATA_DIR = os.path.join(BASE_DIR, "data", "images").replace("\\", "/") # Adjust if your folder name differs
INDEX_DIR = os.path.join(BASE_DIR, "indexes")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# Ensure dirs exist
os.makedirs(INDEX_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Device
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# API Keys
API_KEY = os.getenv("OPENAI_API_KEY")
BASE_URL = os.getenv("OPENAI_BASE_URL")
LLM_MODEL = "gpt-4.1-nano" # Or your specific model name

# Constants
TOP_K = 30