"""Reference preprocessing for both cloud and mobile (EffNet-B0).

Camera/upload inputs must go through this exact pipeline — Lambda and the
mobile app must use the same constants or the model under-performs.

Usage:
    arr = preprocess_image_pil(pil_img)   # np.ndarray (1, 3, 224, 224) fp32
    arr = preprocess_image_cv2(bgr_img)   # from cv2.imread() output
"""
from __future__ import annotations

import numpy as np

# ImageNet stats — DO NOT CHANGE. The model was trained with these.
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def preprocess_image_pil(pil_img):
    """PIL.Image (any size, any mode) -> np.ndarray (1, 3, 224, 224) fp32."""
    from PIL import Image
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    w, h = pil_img.size
    if w < h:
        new_w, new_h = 256, int(round(h * 256 / w))
    else:
        new_w, new_h = int(round(w * 256 / h)), 256
    pil_img = pil_img.resize((new_w, new_h), Image.BILINEAR)
    left = (new_w - 224) // 2
    top  = (new_h - 224) // 2
    pil_img = pil_img.crop((left, top, left + 224, top + 224))
    arr = np.asarray(pil_img, dtype=np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)
    arr = (arr - MEAN) / STD
    return arr[None, ...].astype(np.float32)


def preprocess_image_cv2(bgr_img):
    """cv2 BGR ndarray -> np.ndarray (1, 3, 224, 224) fp32."""
    import cv2
    rgb = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    if w < h:
        new_w, new_h = 256, int(round(h * 256 / w))
    else:
        new_w, new_h = int(round(w * 256 / h)), 256
    rgb = cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    left = (new_w - 224) // 2
    top  = (new_h - 224) // 2
    rgb = rgb[top:top + 224, left:left + 224]
    arr = rgb.astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)
    arr = (arr - MEAN) / STD
    return arr[None, ...].astype(np.float32)


def hflip_tta(arr):
    """Horizontal-flip variant of a (1,3,224,224) tensor.
    Average softmax over arr + hflip_tta(arr) for ~+0.5pp.
    """
    return arr[..., ::-1].copy()
