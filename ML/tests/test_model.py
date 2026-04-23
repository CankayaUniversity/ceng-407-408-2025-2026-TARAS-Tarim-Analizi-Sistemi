import torch

from taras.model import build_model, count_parameters, freeze_backbone, unfreeze_all


def test_convnext_tiny_forward_10():
    model = build_model(arch="convnext_tiny.fb_in22k_ft_in1k",
                        pretrained=False, drop_path_rate=0.0)
    model.eval()
    x = torch.randn(2, 3, 224, 224)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (2, 10)


def test_freeze_unfreeze():
    model = build_model(arch="convnext_tiny.fb_in22k_ft_in1k",
                        pretrained=False, drop_path_rate=0.0)
    freeze_backbone(model)
    _, trainable_frozen = count_parameters(model)
    unfreeze_all(model)
    _, trainable_unfrozen = count_parameters(model)
    assert trainable_frozen > 0
    assert trainable_unfrozen > trainable_frozen
