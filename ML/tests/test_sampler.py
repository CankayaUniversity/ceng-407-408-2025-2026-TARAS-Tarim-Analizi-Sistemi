import numpy as np
import pandas as pd

from taras.sampler import make_balanced_sampler


def test_weights_are_inverse_sqrt_count():
    df = pd.DataFrame({
        "class": (["a"] * 100) + (["b"] * 25) + (["c"] * 4),
        "path": ["x"] * 129,
    })
    sampler = make_balanced_sampler(df)
    weights = np.asarray(sampler.weights)
    w_a = weights[df["class"].to_numpy() == "a"][0]
    w_b = weights[df["class"].to_numpy() == "b"][0]
    w_c = weights[df["class"].to_numpy() == "c"][0]
    assert abs(w_a - 1 / np.sqrt(100)) < 1e-6
    assert abs(w_b - 1 / np.sqrt(25)) < 1e-6
    assert abs(w_c - 1 / np.sqrt(4)) < 1e-6
    # Softer than 1/count: ratio rare-to-common should be √(100/4) = 5, not 25
    assert abs((w_c / w_a) - 5.0) < 1e-6


def test_sampler_length_matches_df():
    df = pd.DataFrame({"class": ["a", "a", "b"], "path": ["x", "y", "z"]})
    sampler = make_balanced_sampler(df)
    assert sampler.num_samples == 3
