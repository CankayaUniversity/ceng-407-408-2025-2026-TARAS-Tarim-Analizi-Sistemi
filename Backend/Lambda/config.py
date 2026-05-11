"""Env-backed constants and logger setup for the TARAS disease Lambda.

Every tunable parameter reads from an environment variable with a sensible
default. Ops can change thresholds, log level, or the model path without a
redeploy — set the env var on the Lambda function and the next cold start
picks it up.
"""
import logging
import os

# --- Model ---
MODEL_PATH = os.environ.get("MODEL_PATH", "model/taras_v2m_stage2_best.onnx")
MODEL_INPUT_SIZE = (256, 256)
NUM_CLASSES = 6
MODEL_VERSION = os.environ.get("MODEL_VERSION", "taras_v2m_stage2_best_onnx")

# --- Inference ---
CONF_THRESHOLD = float(os.environ.get("CONF_THRESHOLD", "0.7"))
TOP_N_PREDICTIONS = int(os.environ.get("TOP_N_PREDICTIONS", "5"))

# --- Safety limits ---
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))  # 10 MB

# --- Logging ---
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

_logger = logging.getLogger("taras.lambda")
_logger.setLevel(LOG_LEVEL)
# Lambda already attaches a root handler that pipes to CloudWatch; just
# make sure our logger doesn't add a duplicate.
if not _logger.handlers:
    _logger.propagate = True

logger = _logger
