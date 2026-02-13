import os
import faiss
import numpy as np
from backend.config import INDEX_DIR, TOP_K
from backend.models.clip import get_image_embedding, get_text_embedding
IMAGE_INDEX_PATH = os.path.join(INDEX_DIR, "faiss_image.index")
METADATA_PATH = os.path.join(INDEX_DIR, "metadata.npy")

index = None
metadata = []
caption_embeddings = None

def load_index():
    global index, metadata, caption_embeddings
    if os.path.exists(IMAGE_INDEX_PATH):
        index = faiss.read_index(IMAGE_INDEX_PATH)
        metadata = np.load(METADATA_PATH, allow_pickle=True).tolist()
        
        print("🧠 Pre-computing caption embeddings for Hybrid Search...")
        captions = [m.get('caption', "") for m in metadata]
        
        # Batch process captions (batch size 32 to avoid OOM on small GPUs)
        caption_embeddings = []
        batch_size = 32
        
        for i in range(0, len(captions), batch_size):
            batch = captions[i:i+batch_size]
            # Replace empty strings with space to avoid tokenizer errors
            batch = [c if c.strip() else " " for c in batch]
            
            batch_embs = get_text_embedding(batch)
            caption_embeddings.append(batch_embs)
            
        if caption_embeddings:
            caption_embeddings = np.vstack(caption_embeddings).astype('float32')
        else:
            caption_embeddings = np.zeros((0, 512), dtype='float32')
            
        # Normalize for cosine similarity (already done in model but safe to ensure)
        norm = np.linalg.norm(caption_embeddings, axis=1, keepdims=True)
        norm[norm == 0] = 1 
        caption_embeddings = caption_embeddings / norm
        
        print(f"✅ Index Loaded: {len(caption_embeddings)} items ready.")

# --- RERANKING SETUP ---
from backend.utils.reranker import reranker_model, load_ranker

# Removed local ranker logic to prevent double-loading models
# We now use the shared instance from backend.utils.reranker

def search_by_text(query, top_k=TOP_K):
    if index is None: return []
    
    # --- WEIGHT CONFIGURATION ---
    CAPTION_WEIGHT = 0.5
    VISUAL_WEIGHT = 1.0 - CAPTION_WEIGHT 
    
    # 1. Get Query Embedding
    query_emb = get_text_embedding(query).astype("float32")
    query_emb = query_emb / np.linalg.norm(query_emb)
    
    # 2. Visual Search (Fetch Candidates)
    # Fetch top 50 visual matches
    v_scores, v_indices = index.search(query_emb.reshape(1, -1), 50)
    v_indices = v_indices[0]
    v_scores = v_scores[0]
    
    # 3. Semantic Search (Caption Match)
    c_scores_all = np.dot(caption_embeddings, query_emb.T).flatten()
    
    # Fetch top 50 caption matches
    # argsort gives ascending, so we take last 50 and reverse
    t_indices = np.argsort(c_scores_all)[-50:][::-1]
    
    # 4. Hybrid Fusion (Union of Candidates)
    all_indices = set(v_indices) | set(t_indices)
    
    candidates = []
    
    # Create a lookup for visual scores (default to 0.0 if not in top visual results)
    v_score_map = {idx: score for idx, score in zip(v_indices, v_scores)}
    
    for idx in all_indices:
        if idx < len(metadata):
            # Get scores
            v_score = v_score_map.get(idx, 0.0) # 0.0 if only found via text
            c_score = c_scores_all[idx]
            
            final_score = (VISUAL_WEIGHT * v_score) + (CAPTION_WEIGHT * c_score)
            
            item = metadata[idx].copy()
            
            # Manual Block
            if "ring_049" in item.get('image_path', ''):
                continue

            item['initial_score'] = float(final_score)
            # Add debug info to understand where it came from
            source = []
            if idx in v_indices: source.append("Visual")
            if idx in t_indices: source.append("Text")
            item['debug'] = f"Src: {'+'.join(source)}"
            
            candidates.append(item)
    
    # 5. RERANKING
    load_ranker()
    if reranker_model:
        try:
            # Prepare pairs for cross-encoder: (query, caption)
            pairs = [[query, c['caption']] for c in candidates]
            cross_scores = reranker_model.predict(pairs)
            
            for i, item in enumerate(candidates):
                item['score'] = float(cross_scores[i])
                item['debug'] = f"Reranked: {cross_scores[i]:.2f} (Init: {item['initial_score']:.2f})"
                
            # Re-sort by cross-encoder score
            candidates.sort(key=lambda x: x['score'], reverse=True)
        except Exception as e:
            print(f"Rerank Error: {e}")
            # Fallback to initial score
            for item in candidates:
                item['score'] = item['initial_score']
                if 'debug' not in item: item['debug'] = f"Init: {item['initial_score']:.2f}"
            candidates.sort(key=lambda x: x['score'], reverse=True)
    else:
        # Fallback if no ranker
        for item in candidates:
            item['score'] = item['initial_score']
            if 'debug' not in item: item['debug'] = f"Init: {item['initial_score']:.2f}"
        candidates.sort(key=lambda x: x['score'], reverse=True)
            
    return candidates[:top_k]

def search_by_image(pil_image, top_k=TOP_K):
    # Image search remains 100% Visual
    if index is None: return []
    emb = get_image_embedding(pil_image).astype("float32")
    faiss.normalize_L2(emb.reshape(1, -1))
    scores, indices = index.search(emb.reshape(1, -1), top_k)
    
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < len(metadata):
            item = metadata[idx].copy()
            item['score'] = float(score)
            results.append(item)
    return results