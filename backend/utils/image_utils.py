import cv2
import numpy as np

def compute_skew_angle(gray):
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
    if lines is None:
        return 0.0
    angles = []
    for rho, theta in lines[:20]:
        angle = (theta - np.pi / 2) * 180 / np.pi
        angles.append(angle)
    return np.median(angles) if angles else 0.0

def rotate_image(image, angle):
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def normalize_text_image(image_path):
    img = cv2.imread(image_path)
    if img is None: return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    angle = compute_skew_angle(gray)
    if abs(angle) > 1.0:
        img = rotate_image(img, angle)
    return img