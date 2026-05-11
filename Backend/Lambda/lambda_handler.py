"""Lambda entry point for TARAS disease detection.

Accepts {s3_bucket, s3_key} (direct SDK invoke) or an API Gateway-style
event with a string body. Returns the old-schema response expected by
`Backend/src/services/diseaseDetection.service.ts`:

    {
      disease: str,              # display name, e.g. "Tomato - Leaf Mold"
      confidence: float,         # 0-100, 2 decimal places
      confidence_score: float,   # 0-1
      all_predictions: dict,     # {display_name: probability}, top N only
      recommendations: [str],    # Turkish, per-disease
      request_id: str,           # Lambda aws_request_id for tracing
      model_version: str,        # MODEL_VERSION env var (audit trail)
    }

Errors:
  - 400 (user fault):     missing fields, bad JSON body, image too large,
                          S3 object missing, image decode failed
  - 500 (internal):       inference crash, unexpected boto3 error,
                          anything we didn't classify - includes error_type

Warmup:
  {"warmup": true} returns 200 immediately without fetching or inferring.
  Hook an EventBridge rate(10 minutes) rule pointed at the function to keep
  one container hot.
"""
from __future__ import annotations

import json
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

from config import CONF_THRESHOLD, MAX_IMAGE_BYTES, MODEL_VERSION, TOP_N_PREDICTIONS, logger
from inference import ImageDecodeError, predict
from labels import display_name, get_recommendations, get_uncertain_recommendations

# Module-level: TCP connections to S3 are reused across warm invocations.
_s3 = boto3.client("s3")


class _BadRequest(ValueError):
    """User-facing 400 - message is Turkish and surfaced to the mobile app."""


# --- Public entry ---

def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    request_id = getattr(context, "aws_request_id", "unknown")
    start = time.monotonic()

    try:
        body = _parse_body(event)

        # Warmup short-circuit - used by EventBridge keep-alive.
        if body.get("warmup"):
            logger.info(f"[WARMUP] {request_id}")
            return _response(200, {"warmed": True, "request_id": request_id})

        s3_bucket = body.get("s3_bucket")
        s3_key = body.get("s3_key")
        if not s3_bucket or not s3_key:
            raise _BadRequest("Eksik alanlar: s3_bucket veya s3_key gerekli")

        image_bytes = _fetch_s3(s3_bucket, s3_key, request_id)

        try:
            result = predict(image_bytes)
        except ImageDecodeError as exc:
            raise _BadRequest(str(exc)) from exc

        confidence = result["confidence_score"]
        if confidence < CONF_THRESHOLD:
            disease = "Uncertain"
            recs = get_uncertain_recommendations()
        else:
            disease = display_name(result["raw_class"])
            recs = get_recommendations(disease)

        top_preds = dict(
            sorted(
                result["all_scores"].items(), key=lambda kv: kv[1], reverse=True
            )[:TOP_N_PREDICTIONS]
        )

        duration_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            f"[INFERENCE] {request_id} disease={disease} "
            f"conf={confidence * 100:.2f}% dur={duration_ms}ms"
        )

        return _response(
            200,
            {
                "disease": disease,
                "confidence": round(confidence * 100, 2),
                "confidence_score": round(confidence, 6),
                "all_predictions": top_preds,
                "recommendations": recs,
                "request_id": request_id,
                "model_version": MODEL_VERSION,
                "duration_ms": duration_ms,
            },
        )

    except _BadRequest as exc:
        logger.warning(f"[ERR] {request_id} 400: {exc}")
        return _response(400, {"error": str(exc), "request_id": request_id})

    except Exception as exc:  # noqa: BLE001 - last-ditch catch for 500
        logger.error(
            f"[ERR] {request_id} 500 {type(exc).__name__}: {exc}",
            exc_info=True,
        )
        return _response(
            500,
            {
                "error": "Tespit basarisiz",
                "error_type": type(exc).__name__,
                "request_id": request_id,
            },
        )


# --- Helpers ---

def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    """Unwrap both direct-invoke and API Gateway event shapes."""
    raw_body = event.get("body")
    if isinstance(raw_body, str):
        try:
            parsed = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise _BadRequest(f"Gecersiz JSON body: {exc.msg}") from exc
        if not isinstance(parsed, dict):
            raise _BadRequest("Gecersiz body icerigi (dict bekleniyor)")
        return parsed
    return event


def _fetch_s3(bucket: str, key: str, request_id: str) -> bytes:
    """Fetch image bytes from S3 with a content-length guard.

    Does a HEAD first so we can reject oversized objects without downloading
    them. NoSuchKey/NoSuchBucket are translated to 400 (user fault); any
    other S3 error bubbles up as 500.
    """
    try:
        head = _s3.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"NoSuchKey", "NoSuchBucket", "404"}:
            raise _BadRequest(f"Goruntu bulunamadi: s3://{bucket}/{key}") from exc
        raise

    size = int(head.get("ContentLength", 0))
    if size == 0:
        raise _BadRequest("S3 objesi bos")
    if size > MAX_IMAGE_BYTES:
        raise _BadRequest(
            f"Goruntu cok buyuk: {size} bytes (max {MAX_IMAGE_BYTES})"
        )

    logger.info(f"[S3] {request_id} fetching s3://{bucket}/{key} size={size}")
    response = _s3.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    """Format a Lambda HTTP-style response with ensure_ascii=False so Turkish chars stay readable."""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
