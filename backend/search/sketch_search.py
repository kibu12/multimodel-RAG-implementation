import os
import faiss
import numpy as np
from PIL import Image
from backend.config import INDEX_DIR, TOP_K
from backend.models.clip import get_image_embedding
from backend.utils.sketch_utils import preprocess_sketch
from backend.search import image_search 
from backend.utils.captioning import describe_sketch
from backend.utils.reranker import rerank_results  # <--- NEW IMPORT

SKETCH_INDEX_PATH = os.path.join(INDEX_DIR, "faiss_sketch.index")

sketch_index = None
metadata = []

def load_sketch_index(meta):
    global sketch_index, metadata
    metadata = meta
    if os.path.exists(SKETCH_INDEX_PATH):
        sketch_index = faiss.read_index(SKETCH_INDEX_PATH)
        print(f"✅ Sketch Index Loaded: {sketch_index.ntotal} items")

def search_by_sketch(sketch_path, top_k=TOP_K):
    # 1. Preprocess
    processed_sketch_pil = preprocess_sketch(sketch_path)
    
    # 2. Generate Description (The "Query")
    # 2. Generate Description (The "Query")
    llm_response = describe_sketch(processed_sketch_pil)
    print(f"🎨 AI Raw Response: '{llm_response}'")
    
    import json
    try:
        data = json.loads(llm_response)
        search_query = data.get("description", "jewellery sketch")
        strict_type = data.get("type", "").lower() # "ring" or "necklace"
    except:
        print("⚠️ Failed to parse Sketch LLM JSON. Fallback to raw.")
        search_query = llm_response
        strict_type = ""

    print(f"🎨 Parsed: Query='{search_query}' | Type='{strict_type}'")
    
    # 3. Get Candidates (Text Search)
    # We fetch 50 candidates to allow for reranking
    text_results = image_search.search_by_text(search_query, top_k=50)
    
    # STRICT FILTERING based on LLM decision
    if strict_type in ["ring", "necklace"]:
        print(f"🔒 Enforcing Strict Filter: {strict_type}")
        text_results = [r for r in text_results if r['category'].lower() == strict_type]
    
    # 4. Get Candidates (Visual Shape Search)
    visual_emb = get_image_embedding(processed_sketch_pil).astype("float32")
    faiss.normalize_L2(visual_emb.reshape(1, -1))
    v_scores, v_indices = sketch_index.search(visual_emb.reshape(1, -1), 50)
    
    # 5. Hybrid Fusion (Merge lists)
    candidates = {}
    
    # Add Text Matches
    for res in text_results:
        # Remove the 'rerank_score' from text search so we can do a final fresh rerank here
        res.pop('rerank_score', None) 
        candidates[res['id']] = res

    # Add Shape Matches
    for score, idx in zip(v_scores[0], v_indices[0]):
        if idx < len(metadata):
            item = metadata[idx]
            if item['id'] not in candidates:
                item_copy = item.copy()
                item_copy['debug'] = f"Shape: {score:.2f}"
                candidates[item['id']] = item_copy
            else:
                if 'debug' not in candidates[item['id']]:
                    candidates[item['id']]['debug'] = "Text Match"
                candidates[item['id']]['debug'] += f" | Shape: {score:.2f}"

    candidate_list = list(candidates.values())

    # 6. RERANKING
    # Rerank ALL candidates against the sketch description
    final_results = rerank_results(search_query, candidate_list, top_k=top_k)
    
    return final_results, search_query