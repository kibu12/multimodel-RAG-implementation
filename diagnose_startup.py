import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

log_file = "startup_log.txt"

def log(msg):
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)

# Clear log
with open(log_file, "w") as f:
    f.write("Starting diagnosis...\n")

log(f"CWD: {os.getcwd()}")
log(f"Path: {sys.path}")

log("Attempting to import backend.main...")
try:
    import backend.main
    log("✅ backend.main imported successfully.")
except ImportError as e:
    log(f"❌ ImportError: {e}")
except Exception as e:
    log(f"❌ Exception during import: {e}")
    import traceback
    with open(log_file, "a", encoding="utf-8") as f:
        traceback.print_exc(file=f)

log("Diagnosis complete.")
