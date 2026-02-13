import streamlit as st
import os
import faiss
import numpy as np
import json
from PIL import Image
from tqdm import tqdm

# Import your existing backend logic
from config import DATA_DIR, INDEX_DIR, TOP_K
from models.clip import get_image_embedding
from search import image_search, sketch_search
from ocr.ocr_pipeline import extract_text_from_image, llm_refine_ocr_text
from utils.captioning import generate_caption
# Import the sketch converter to force correct indexing
from utils.sketch_utils import photo_to_sketch_database

# ==========================================
# 1. SYSTEM INITIALIZATION
# ==========================================
@st.cache_resource
def initialize_system():
    print("🚀 Starting System Initialization...")
    
    METADATA_JSON = os.path.join(INDEX_DIR, "metadata_with_captions.json")
    
    # 1. LOAD / BUILD METADATA
    if os.path.exists(METADATA_JSON):
        with open(METADATA_JSON, 'r') as f:
            existing_meta = json.load(f)
    else:
        existing_meta = {}

    new_meta = {}
    
    for category in os.listdir(DATA_DIR):
        cat_path = os.path.join(DATA_DIR, category)
        if not os.path.isdir(cat_path): continue
        
        for img_name in os.listdir(cat_path):
            if img_name.lower().endswith(('.jpg', '.jpeg', '.png')):
                full_path = os.path.join(cat_path, img_name)
                
                # Use existing caption if available to save time
                if img_name in existing_meta:
                    caption = existing_meta[img_name]['caption']
                else:
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

    with open(METADATA_JSON, 'w') as f:
        json.dump(new_meta, f, indent=4)

    # 2. BUILD VISUAL INDEX (Standard)
    img_idx_path = os.path.join(INDEX_DIR, "faiss_image.index")
    meta_npy_path = os.path.join(INDEX_DIR, "metadata.npy")
    
    if not os.path.exists(img_idx_path) or len(new_meta) != len(existing_meta):
        print("Building Visual Index...")
        embeddings = []
        meta_list = list(new_meta.values())
        
        for item in tqdm(meta_list):
            img = Image.open(item['image_path']).convert("RGB")
            embeddings.append(get_image_embedding(img))
        
        embeddings = np.array(embeddings).astype('float32')
        faiss.normalize_L2(embeddings)
        index = faiss.IndexFlatIP(embeddings.shape[1])
        index.add(embeddings)
        faiss.write_index(index, img_idx_path)
        np.save(meta_npy_path, meta_list)
    
    # 3. BUILD SKETCH INDEX (The Critical Level 1 Fix)
    sketch_idx_path = os.path.join(INDEX_DIR, "faiss_sketch.index")
    
    # Force rebuild if missing OR count changed
    if not os.path.exists(sketch_idx_path) or len(new_meta) != len(existing_meta):
        print("🎨 Building Artistic Sketch Index...")
        embeddings = []
        meta_list = list(new_meta.values())
        
        for item in tqdm(meta_list):
            # Convert the DB photo to a sketch so it matches user input
            pil_sketch = photo_to_sketch_database(item['image_path'])
            if pil_sketch:
                embeddings.append(get_image_embedding(pil_sketch))
            else:
                embeddings.append(np.zeros(512))
            
        embeddings = np.array(embeddings).astype('float32')
        faiss.normalize_L2(embeddings)
        index = faiss.IndexFlatIP(embeddings.shape[1])
        index.add(embeddings)
        faiss.write_index(index, sketch_idx_path)

    # Load into memory
    image_search.load_index()
    sketch_search.load_sketch_index(image_search.metadata)
    return "System Ready"

status = initialize_system()

# ==========================================
# 2. HELPER: HYBRID MERGE
# ==========================================
def merge_and_display(results_a, results_b, limit=5):
    """
    Mixes results from two sources (e.g., Sketch Visual + Text Interpretation)
    to give the best chance of finding the item.
    """
    seen_ids = set()
    final = []
    
    # Interleave: 1 from A, 1 from B, etc.
    len_a, len_b = len(results_a), len(results_b)
    max_len = max(len_a, len_b)
    
    for i in range(max_len):
        if i < len_a:
            res = results_a[i]
            if res['id'] not in seen_ids:
                final.append(res)
                seen_ids.add(res['id'])
        if i < len_b:
            res = results_b[i]
            if res['id'] not in seen_ids:
                final.append(res)
                seen_ids.add(res['id'])
                
    display_results(final[:limit])

def display_results(results):
    if not results:
        st.warning("No results found.")
        return
    cols = st.columns(4)
    for idx, r in enumerate(results):
        with cols[idx % 4]:
            st.image(Image.open(r['image_path']), use_container_width=True)
            st.markdown(f"**Score:** `{r.get('score', 0):.2f}`")
            with st.expander("Details"):
                st.caption(r.get('caption', ''))
                st.text(f"Cat: {r.get('category', '-')}")

# ==========================================
# 3. UI LAYOUT
# ==========================================
st.set_page_config(layout="wide", page_title="Jewellery AI")
st.title("💎 Jewellery AI Retrieval System")

tab1, tab2, tab3, tab4 = st.tabs(["🔍 Text", "🖼️ Visual", "📝 OCR", "🎨 Sketch"])

# --- TAB 1: TEXT ---
with tab1:
    st.header("Search by Description")
    query = st.text_input("Describe the jewellery:", placeholder="e.g. gold ring")
    if st.button("Search Text"):
        with st.spinner("Searching..."):
            # 1. Get Many
            raw = image_search.search_by_text(query, top_k=30)
            # 2. Filter
            if "ring" in query.lower():
                raw = [r for r in raw if r['category'] == 'ring']
            elif "necklace" in query.lower():
                raw = [r for r in raw if r['category'] == 'necklace']
            # 3. Show Top 10
            display_results(raw[:10])

# --- TAB 2: VISUAL ---
with tab2:
    st.header("Visual Match")
    f = st.file_uploader("Upload Image", key="v")
    if f and st.button("Match"):
        img = Image.open(f).convert("RGB")
        res = image_search.search_by_image(img)
        display_results(res[:10])

# --- TAB 3: OCR (Fixing the logic) ---
with tab3:
    st.header("Handwriting / Text Search")
    f = st.file_uploader("Upload Text Image", key="o")
    if f and st.button("Read"):
        with open("t.jpg","wb") as p: p.write(f.getbuffer())
        st.image(f, width=200)
        
        with st.spinner("Reading Text (TrOCR)..."):
            # This calls your ocr_pipeline.py
            txt = extract_text_from_image("t.jpg")
            
            # CHECK: Did OCR fail?
            if not txt or len(txt) < 3:
                st.error("OCR failed to read text. Ensure TrOCR is loaded.")
            else:
                st.success(f"Detected: **{txt}**")
                
                # Refine
                ref = llm_refine_ocr_text(txt)
                q = ref.get('cleaned_query', txt)
                cat = ref.get('product_type', 'unknown')
                st.info(f"Searching for: **{q}** (Category: {cat})")
                
                # Search
                raw = image_search.search_by_text(q, top_k=30)
                if cat in ['ring', 'necklace']:
                    raw = [r for r in raw if r['category'] == cat]
                
                display_results(raw[:10])

# --- TAB 4: SKETCH (The Hybrid Fix) ---
with tab4:
    st.header("Sketch Search")
    f = st.file_uploader("Upload Sketch", key="s")
    if f and st.button("Match Sketch"):
        with open("s.jpg","wb") as p: p.write(f.getbuffer())
        st.image(f, width=200)
        
        with st.spinner("Analyzing Sketch..."):
            # 1. Visual Sketch Search (The Shape Match)
            # Note: This relies on the new 'photo_to_sketch_database' index!
            res_visual, interpretation = sketch_search.search_by_sketch("s.jpg", top_k=20)
            
            st.info(f"AI Interpretation: **{interpretation}**")
            
            # 2. Text Search (The Backup Plan)
            # If visual fails (e.g. thinks it's an apple), text search for "ring" might save us.
            res_text = image_search.search_by_text(interpretation, top_k=20)
            
            # 3. Filter Both by Category (if interpretation mentions one)
            valid_cats = []
            if "ring" in interpretation.lower(): valid_cats.append("ring")
            if "necklace" in interpretation.lower(): valid_cats.append("necklace")
            
            if valid_cats:
                res_visual = [r for r in res_visual if r['category'] in valid_cats]
                res_text = [r for r in res_text if r['category'] in valid_cats]

            # 4. Merge & Display
            st.write("### Hybrid Results (Visual + Text)")
            merge_and_display(res_visual, res_text, limit=10)