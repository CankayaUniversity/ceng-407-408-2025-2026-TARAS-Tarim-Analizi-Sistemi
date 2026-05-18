"""AWS Lambda adapter for the v8 3-way disease ensemble.

Translates Backend's {s3_bucket, s3_key, crop?, tta?} request into the
new inference_lambda.predict() interface and returns a slim response the
Backend stores directly.

Output: {top1, top1_score, scores, inference_ms}

Recommendations are NOT included — Backend looks them up locally from
the disease class (Backend/src/services/diseaseRecommendations.ts).
"""
from __future__ import annotations

import json
import logging
import sys
import time
from io import BytesIO

import boto3
from PIL import Image

# inference_lambda.py + .pt checkpoints live in /var/task/code/ (see Dockerfile);
# labels.json lives in /var/task/shared/ because inference_lambda resolves it
# relative to its own dir (../shared/labels.json).
sys.path.insert(0, "/var/task/code")
from inference_lambda import predict  # type: ignore

log = logging.getLogger()
log.setLevel(logging.INFO)

S3 = boto3.client("s3")


def lambda_handler(event, context):
    start = time.time()
    bucket = event.get("s3_bucket")
    key = event.get("s3_key")
    use_tta = event.get("tta", False)

    if not bucket or not key:
        return _err(400, "s3_bucket and s3_key required")

    try:
        log.info(f"fetch s3://{bucket}/{key}")
        obj = S3.get_object(Bucket=bucket, Key=key)
        pil_img = Image.open(BytesIO(obj["Body"].read()))
    except S3.exceptions.NoSuchKey:
        return _err(400, f"NoSuchKey: {key}")
    except Exception as e:
        log.error(f"S3 fetch failed: {e}")
        return _err(400, f"S3 fetch error: {e}")

    try:
        result = predict(pil_img, use_tta=use_tta)
    except Exception as e:
        log.error("Inference failed", exc_info=True)
        return _err(500, f"Inference error: {e}")

    inference_ms = round((time.time() - start) * 1000)
    body = {
        "top1": result["top1_class"],
        "top1_score": round(result["top1_confidence"], 4),
        "scores": {k: round(v, 4) for k, v in result["all_probs"].items()},
        "inference_ms": inference_ms,
        "timings_ms": result.get("timings_ms"),
    }
    log.info(f"{body['top1']} ({body['top1_score']:.4f}) in {inference_ms}ms tta={use_tta}")

    return {"statusCode": 200, "body": json.dumps(body)}


def _err(code: int, msg: str) -> dict:
    return {"statusCode": code, "body": json.dumps({"error": msg})}
