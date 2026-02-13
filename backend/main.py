from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import sys
import os
import shutil
import json
import numpy as np
import faiss
from PIL import Image
from typing import List
from contextlib import asynccontextmanager

# --- DEBUG LOGGING ---
import os
import sys

# Use absolute path for log file in project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STARTUP_LOG = os.path.join(PROJECT_ROOT, "backend_startup.log")

def log_startup(msg):
    try:
        with open(STARTUP_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception as e:
        print(f"Logging failed: {e}")
    print(msg)

try:
    with open(STARTUP_LOG, "w") as f:
        f.write("Initializing backend...\n")
except Exception as e:
    print(f"Could not open log file: {e}")

log_startup(f"CWD: {os.getcwd()}")
log_startup(f"Executable: {sys.executable}")
log_startup(f"Path: {sys.path}")

# Add parent directory to path to import existing modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from backend.schemas import SearchResult, TextSearchRequest, OCRResponse, TextSearchResponse
from backend.config import DATA_DIR, INDEX_DIR
from backend.models.clip import get_image_embedding
from backend.search import image_search, sketch_search
from backend.ocr.ocr_pipeline import extract_text_from_image, llm_refine_ocr_text
from backend.utils.captioning import generate_caption
from backend.utils.captioning import generate_caption
from backend.utils.sketch_utils import photo_to_sketch_database
from backend.voice.transcriber import transcribe_audio
from tqdm import tqdm

# --- LIFESPAN MANAGER (Replaces initialize_system) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting System Initialization...")
    
    METADATA_JSON = os.path.join(INDEX_DIR, "metadata_with_captions.json")
    
    # 1. LOAD / BUILD METADATA
    if os.path.exists(METADATA_JSON):
        with open(METADATA_JSON, 'r') as f:
            existing_meta = json.load(f)
    else:
        existing_meta = {}

    new_meta = {}
    
    # Only scan if data directory exists
    if os.path.exists(DATA_DIR):
        for category in os.listdir(DATA_DIR):
            cat_path = os.path.join(DATA_DIR, category)
            if not os.path.isdir(cat_path): continue
            
            for img_name in os.listdir(cat_path):
                if img_name.lower().endswith(('.jpg', '.jpeg', '.png')):
                    full_path = os.path.join(cat_path, img_name)
                    
                    if img_name in existing_meta:
                        caption = existing_meta[img_name]['caption']
                    else:
                        # minimal fallback or lazy generation could be better here
                        # but keeping original logic for consistency
                        try:
                            img = Image.open(full_path).convert("RGB")
                            caption = generate_caption(img, category_name=category)
                        except:
                            caption = f"a {category} made of gold or silver"
                    
                    new_meta[img_name] = {
                        "image_path": full_path, 
                        "category": category, 
                        "id": img_name,
                        "caption": caption
                    }

        # Save metadata if changed
        if new_meta != existing_meta:
            print("Updates detected (paths or content). Saving new metadata...")
            with open(METADATA_JSON, 'w') as f:
                json.dump(new_meta, f, indent=4)
        
        # 2. BUILD VISUAL INDEX
        img_idx_path = os.path.join(INDEX_DIR, "faiss_image.index")
        meta_npy_path = os.path.join(INDEX_DIR, "metadata.npy")
        
        # Force rebuild if metadata changed or index missing
        # We check if meta_npy exists and if it matches new_meta
        should_rebuild_index = False
        if not os.path.exists(img_idx_path):
             should_rebuild_index = True
        elif new_meta != existing_meta:
             should_rebuild_index = True
             
        if should_rebuild_index:
            print("Building Visual Index...")
            embeddings = []
            meta_list = list(new_meta.values())
            
            batch_size = 32
            image_batch = []
            
            print(f"Processing {len(meta_list)} images in batches of {batch_size}...")
            
            for i in tqdm(range(0, len(meta_list), batch_size)):
                batch_items = meta_list[i:i+batch_size]
                current_batch_imgs = []
                for item in batch_items:
                    try:
                        img = Image.open(item['image_path']).convert("RGB")
                        current_batch_imgs.append(img)
                    except Exception as e:
                        print(f"Error loading {item['image_path']}: {e}")
                        # Black placeholder
                        current_batch_imgs.append(Image.new("RGB", (224, 224)))
                
                if current_batch_imgs:
                    batch_embs = get_image_embedding(current_batch_imgs)
                    embeddings.append(batch_embs)
            
            if embeddings:
                embeddings = np.vstack(embeddings).astype('float32')
                faiss.normalize_L2(embeddings)
                index = faiss.IndexFlatIP(embeddings.shape[1])
                index.add(embeddings)
                faiss.write_index(index, img_idx_path)
                np.save(meta_npy_path, meta_list)
        
        # 3. BUILD SKETCH INDEX
        sketch_idx_path = os.path.join(INDEX_DIR, "faiss_sketch.index")
        
        if not os.path.exists(sketch_idx_path) or should_rebuild_index:
            print("🎨 Building Artistic Sketch Index (Batched)...")
            embeddings = []
            
            # For sketch, we need to process one by one because photo_to_sketch is complex/slow typically?
            # actually photo_to_sketch_database might be CPU bound opencv.
            # But we can still batch the *embedding* part.
            
            sketch_batch_imgs = []
            valid_indices = [] # To keep track if we skip any
            
            for i, item in enumerate(tqdm(meta_list)):
                try:
                    pil_sketch = photo_to_sketch_database(item['image_path'])
                    if pil_sketch:
                         sketch_batch_imgs.append(pil_sketch)
                    else:
                         sketch_batch_imgs.append(Image.new("RGB", (224, 224))) # Placeholder
                except:
                     sketch_batch_imgs.append(Image.new("RGB", (224, 224)))

                if len(sketch_batch_imgs) >= 32:
                    embeddings.append(get_image_embedding(sketch_batch_imgs))
                    sketch_batch_imgs = []
            
            if sketch_batch_imgs:
                 embeddings.append(get_image_embedding(sketch_batch_imgs))

            if embeddings:
                embeddings = np.vstack(embeddings).astype('float32')
                
            if embeddings:
                embeddings = np.array(embeddings).astype('float32')
                faiss.normalize_L2(embeddings)
                index = faiss.IndexFlatIP(embeddings.shape[1])
                index.add(embeddings)
                faiss.write_index(index, sketch_idx_path)

    # Load indices into memory
    image_search.load_index()
    # Sketch index loader requires metadata to be already loaded in image_search
    sketch_search.load_sketch_index(image_search.metadata)
    
    print("✅ System Ready")
    yield
    print("🛑 Shutting down...")


app = FastAPI(title="Jewellery Retrieval API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (images) so frontend can display them
# careful with security in prod, but fine for local tool
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")


@app.post("/search/text", response_model=TextSearchResponse)
async def search_by_text(req: TextSearchRequest):
    try:
        print(f"🔎 SEARCH REQ: '{req.query}'")
        
        # STRATEGY: "Lazy" Refinement to save Time & Tokens
        # 1. Try RAW search first
        raw_start = image_search.search_by_text(req.query, top_k=req.top_k)
        
        # 2. Check Quality (DISABLED BY USER REQUEST TO SAVE TOKENS)
        needs_refinement = False
       
        # 3. Refine if needed
        final_query = None
        results_to_use = raw_start
        
        if needs_refinement:
             # Unreachable now, but keeping structure if re-enabled later
             pass
        else:
            print("🚀 Raw search used (Refinement disabled).")
            
        # Enrich with valid image url for frontend
        results = []
        clean_data_dir = DATA_DIR.replace("\\", "/")
        
        for r in results_to_use:
            clean_img_path = r['image_path'].replace("\\", "/")
            
            if clean_img_path.startswith(clean_data_dir):
                 rel_path = clean_img_path[len(clean_data_dir):].strip("/")
            else:
                 if "data/images" in clean_img_path:
                     rel_path = clean_img_path.split("data/images")[-1].strip("/")
                 else:
                     rel_path = os.path.basename(clean_img_path)

            import time
            r['image_path'] = f"http://localhost:8000/data/{rel_path}?t={int(time.time())}"
            results.append(r)
        
        print(f"📤 RETURNING {len(results)} RESULTS")
            
        return TextSearchResponse(
            query=req.query,
            refined_query=final_query, 
            results=results[:req.top_k]
        )
    except Exception as e:
        print(f"❌ CRITICAL SEARCH ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/debug/check")
async def debug_check():
    try:
        status = {
            "status": "ok",
            "data_dir_exists": os.path.exists(DATA_DIR),
            "data_dir": DATA_DIR,
            "models": {
                "clip": "loaded" if image_search.clip_model else "not loaded",
                "blip": "loaded" if "blip_model" in globals() and globals()["blip_model"] else "lazy-loaded",
                "sketch_index": "loaded" if sketch_search.sketch_index else "not loaded",
                "image_index": "loaded" if image_search.index else "not loaded"
            }
        }
        if os.path.exists(DATA_DIR):
             status["content_count"] = len(os.listdir(DATA_DIR))
        return status
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/search/image", response_model=List[SearchResult])
async def search_by_image(file: UploadFile = File(...)):
    try:
        img = Image.open(file.file).convert("RGB")
        res = image_search.search_by_image(img)
        
        results = []
        for r in res[:30]:
            clean_data_dir = DATA_DIR.replace("\\", "/")
            clean_img_path = r['image_path'].replace("\\", "/")
            if clean_img_path.startswith(clean_data_dir):
                 rel_path = clean_img_path[len(clean_data_dir):].strip("/")
            else:
                 if "data/images" in clean_img_path:
                     rel_path = clean_img_path.split("data/images")[-1].strip("/")
                 else:
                     rel_path = os.path.basename(clean_img_path)
            
            import time
            r['image_path'] = f"http://localhost:8000/data/{rel_path}?t={int(time.time())}"
            results.append(r)
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search/sketch", response_model=List[SearchResult])
async def search_by_sketch(file: UploadFile = File(...)):
    try:
        print(f"🎨 SKETCH: Received upload ({file.filename})")
        # Save temp because sketch_search logic might expect a file path (checking app.py usage)
        # app.py: res_visual, interpretation = sketch_search.search_by_sketch("s.jpg", top_k=20)
        temp_path = "temp_sketch_upload.jpg"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print("🎨 SKETCH: File saved, starting visual search...")
        # 1. Visual Match
        res_visual, interpretation = sketch_search.search_by_sketch(temp_path, top_k=20)
        print(f"🎨 SKETCH: Visual search done. Interpretation: '{interpretation}'")
        
        # 2. Text Backup (REMOVED: Handled internally by sketch_search.py now)
        # res_text = image_search.search_by_text(interpretation, top_k=20)
        
        # 3. Filter
        valid_cats = []
        if "ring" in interpretation.lower(): valid_cats.append("ring")
        if "necklace" in interpretation.lower(): valid_cats.append("necklace")
        
        if valid_cats:
            res_visual = [r for r in res_visual if r['category'] in valid_cats]

        # 4. Result Processing (Fix paths)
        print("🎨 SKETCH: Processing results...")
        final = []
        seen = set()
        
        # Use the RERANKED results directly
        for r in res_visual:
            if r['id'] not in seen:
                clean_data_dir = DATA_DIR.replace("\\", "/")
                clean_img_path = r['image_path'].replace("\\", "/")
                if clean_img_path.startswith(clean_data_dir):
                     rel_path = clean_img_path[len(clean_data_dir):].strip("/")
                else:
                     if "data/images" in clean_img_path:
                         rel_path = clean_img_path.split("data/images")[-1].strip("/")
                     else:
                         rel_path = os.path.basename(clean_img_path)

                import time
                r['image_path'] = f"http://localhost:8000/data/{rel_path}?t={int(time.time())}"
                
                if r.get("interpretation"):
                    r['interpretation'] = interpretation
                final.append(r)
                seen.add(r['id'])
        
        print(f"🎨 SKETCH: Returning {len(final[:20])} results.")
        return final[:20]
        
    except Exception as e:
        print(f"❌ SKETCH ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ocr/read", response_model=OCRResponse)
async def read_ocr(file: UploadFile = File(...), mode: str = Form("standard")):
    try:
        print(f"📝 OCR: Received upload ({file.filename}) | Mode: {mode}")
        temp_path = "temp_ocr_upload.jpg"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        if mode == "llm":
            print("📝 OCR: Using LLM Vision Extraction...")
            # Direct LLM Vision approach
            from backend.ocr.ocr_pipeline import extract_text_with_llm_vision
            result = extract_text_with_llm_vision(temp_path)
            
            txt = result.get("cleaned_query", "")
            cat = result.get("product_type", "unknown")
            # For LLM mode, raw and cleaning happen together, so we can map cleaned -> raw for consistency if needed, 
            # but better to just return the main text as both or specific fields.
            # Schema expects raw_text. We'll use the same text for both if only one is returned.
            return OCRResponse(raw_text=txt, cleaned_query=txt, detected_category=cat)
            
        else:
            # Standard TrOCR + LLM Refine
            print("📝 OCR: Extracting text from image (TrOCR)...")
            txt = extract_text_from_image(temp_path)
            print(f"📝 OCR: Raw text: '{txt}'")
            
            if not txt:
                print("⚠️ OCR: No text found in image.")
                return OCRResponse(raw_text="", cleaned_query="", detected_category="unknown")
                
            print("📝 OCR: Refining text with LLM...")
            ref = llm_refine_ocr_text(txt)
            q = ref.get('cleaned_query', txt)
            cat = ref.get('product_type', 'unknown')
            print(f"📝 OCR: Refined query: '{q}', Category: '{cat}'")
            
            return OCRResponse(raw_text=txt, cleaned_query=q, detected_category=cat)
        
    except Exception as e:
        print(f"❌ OCR ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)):
    try:
        print(f"🎙️ VOICE: Received upload ({file.filename})")
        # Save temp audio file
        temp_path = f"temp_voice_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print("🎙️ VOICE: Transcribing...")
        text = transcribe_audio(temp_path)
        print(f"🎙️ VOICE: Result: '{text}'")
        
        # Cleanup
        try:
            os.remove(temp_path)
        except:
            pass
            
        return {"text": text}
        
    except RuntimeError as e:
        if "FFMPEG dependency missing" in str(e):
             print(f"⚠️ VOICE: Backend transcription unavailable (FFMPEG missing). Using frontend fallback.")
             raise HTTPException(status_code=424, detail="FFMPEG dependency missing on server")
        print(f"❌ VOICE ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"❌ VOICE ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
