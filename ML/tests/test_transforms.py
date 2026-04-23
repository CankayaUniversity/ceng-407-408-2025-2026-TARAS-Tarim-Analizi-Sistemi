import numpy as np
import torch

from taras.transforms import IMG_SIZE, build_eval_transform, build_train_transform


def _fake_rgb() -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.integers(0, 255, size=(480, 640, 3), dtype=np.uint8)


def test_train_transform_shape():
    tf = build_train_transform()
    out = tf(image=_fake_rgb())["image"]
    assert isinstance(out, torch.Tensor)
    assert out.shape == (3, IMG_SIZE, IMG_SIZE)
    assert out.dtype == torch.float32


def test_eval_transform_shape():
    tf = build_eval_transform()
    out = tf(image=_fake_rgb())["image"]
    assert out.shape == (3, IMG_SIZE, IMG_SIZE)
    assert out.dtype == torch.float32


def test_eval_transform_normalized_range():
    tf = build_eval_transform()
    out = tf(image=_fake_rgb())["image"]
    assert out.min().item() > -3.0
    assert out.max().item() < 3.0
