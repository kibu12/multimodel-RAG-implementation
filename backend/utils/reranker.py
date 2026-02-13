from sentence_transformers import CrossEncoder
from backend.config import DEVICE

# A fast, high-accuracy model optimized for search ranking
MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
reranker_model = None

def load_ranker():
    global reranker_model
    if reranker_model is not None: return
    
    print(f"⏳ Loading Cross-Encoder Reranker ({MODEL_NAME})...")
    try:
        reranker_model = CrossEncoder(MODEL_NAME, device=DEVICE)
        print("✅ Reranker Ready")
    except Exception as e:
        print(f"⚠️ Error loading Reranker: {e}")
        reranker_model = None

def rerank_results(query, initial_results, top_k=5):
    """
    Takes a query and a list of results.
    Re-scores them by comparing 'Query' vs 'Image Caption'.
    """
    load_ranker()
    if reranker_model is None or not initial_results:
        return initial_results[:top_k]

    # 1. Prepare pairs for the model: [[Query, Caption1], [Query, Caption2], ...]
    prediction_inputs = []
    valid_results = []
    
    for res in initial_results:
        # We need text to compare. Use the caption we generated!
        # If no caption, fallback to category name.
        text_content = res.get('caption', f"a {res.get('category', 'jewellery')} item")
        
        prediction_inputs.append([query, text_content])
        valid_results.append(res)

    if not prediction_inputs:
        return initial_results[:top_k]

    # 2. Predict scores (returns a list of floats, e.g., [-4.2, 2.1, 0.5])
    # Higher is better.
    scores = reranker_model.predict(prediction_inputs)

    # 3. Attach new scores to results
    import numpy as np
    
    for idx, score in enumerate(scores):
        # Apply Sigmoid to squash logit to 0-1 probability
        # Logits from MS-MARCO are usually -10 to +10.
        prob_score = 1 / (1 + np.exp(-float(score)))
        
        valid_results[idx]['rerank_score'] = float(prob_score)
        valid_results[idx]['score'] = float(prob_score)
        # Append to debug string so you can see it in Gradio
        if 'debug' not in valid_results[idx]:
             valid_results[idx]['debug'] = "Raw Match"
        valid_results[idx]['debug'] += f" | RankLogit: {score:.2f} -> Prob: {prob_score:.2f}"

    # 4. Sort by the NEW Cross-Encoder score (Descending)
    valid_results.sort(key=lambda x: x['rerank_score'], reverse=True)

    return valid_results[:top_k]