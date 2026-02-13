import cv2
import numpy as np
from PIL import Image

def photo_to_sketch_database(image_path):
    """
    CONVERTS DATABASE PHOTOS -> REALISTIC PENCIL SKETCHES.
    Uses a 'Color Dodge' blend to preserve shading and texture.
    This creates the "Target" for the search.
    """
    img = cv2.imread(image_path)
    if img is None: return None
    
    # 1. Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Invert (Negative)
    inverted = 255 - gray
    
    # 3. Gaussian Blur (The key to soft shading)
    blurred = cv2.GaussianBlur(inverted, (21, 21), 0)
    
    # 4. Color Dodge Blend
    # This mathematical trick creates the "Pencil" look
    sketch = cv2.divide(gray, 255 - blurred, scale=256)
    
    # 5. Convert to RGB for CLIP (White BG, Dark Lines)
    sketch_rgb = cv2.cvtColor(sketch, cv2.COLOR_GRAY2RGB)
    return Image.fromarray(sketch_rgb)

def preprocess_sketch(image_path):
    """
    CLEANS USER UPLOAD -> STANDARD PENCIL SKETCH.
    Assumes user uploads 'Dark lines on White paper'.
    """
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None: return None

    # 1. Resize/Pad to 224x224 (Standardize Size)
    h, w = img.shape
    scale = 224 / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    # Create WHITE canvas (255)
    canvas = np.full((224, 224), 255, dtype=np.uint8)
    x_offset = (224 - new_w) // 2
    y_offset = (224 - new_h) // 2
    canvas[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = img

    # 2. Adaptive Thresholding (The "Scanner" Effect)
    # This removes shadows and turns the messy phone photo into clean lines
    clean_sketch = cv2.adaptiveThreshold(
        canvas, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    
    # 3. Convert to RGB
    return Image.fromarray(cv2.cvtColor(clean_sketch, cv2.COLOR_GRAY2RGB))