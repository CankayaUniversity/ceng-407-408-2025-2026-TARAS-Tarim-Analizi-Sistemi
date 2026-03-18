import json
import logging
import io
from typing import Dict, Any
import numpy as np
from PIL import Image
import tensorflow as tf
import boto3

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Load model once (reused across container lifecycle)
INTERPRETER = None
INPUT_INDEX = None
OUTPUT_INDEX = None


def load_model():
    """Load TFLite model - executed once per container"""
    global INTERPRETER, INPUT_INDEX, OUTPUT_INDEX

    if INTERPRETER is None:
        try:
            # Load the embedded TFLite model
            interpreter = tf.lite.Interpreter(model_path="model/disease_detection.tflite")
            interpreter.allocate_tensors()

            # Get input and output details
            input_details = interpreter.get_input_details()
            output_details = interpreter.get_output_details()

            INTERPRETER = interpreter
            INPUT_INDEX = input_details[0]['index']
            OUTPUT_INDEX = output_details[0]['index']

            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise

    return INTERPRETER


def preprocess_image(image_data: bytes, target_size: tuple = (256, 256)) -> np.ndarray:
    """
    Preprocess image for TFLite inference

    Args:
        image_data: Raw image bytes
        target_size: Model input size

    Returns:
        Preprocessed image array normalized to [0, 1]
    """
    try:
        # Load image
        image = Image.open(io.BytesIO(image_data)).convert('RGB')

        # Resize
        image = image.resize(target_size, Image.Resampling.LANCZOS)

        # Convert to array and normalize
        image_array = np.array(image, dtype=np.float32)
        image_array = image_array / 255.0

        # Add batch dimension
        image_array = np.expand_dims(image_array, axis=0)

        return image_array
    except Exception as e:
        logger.error(f"Image preprocessing failed: {str(e)}")
        raise


def detect_disease(image_data: bytes) -> Dict[str, Any]:
    """
    Run disease detection inference on image

    Args:
        image_data: Raw image bytes

    Returns:
        Detection results with disease name, confidence, and recommendations
    """
    try:
        interpreter = load_model()

        # Preprocess image
        processed_image = preprocess_image(image_data)

        # Run inference
        interpreter.set_tensor(INPUT_INDEX, processed_image)
        interpreter.invoke()

        # Get results
        output_data = interpreter.get_tensor(OUTPUT_INDEX)
        predictions = output_data[0]

        # Get top prediction
        class_idx = np.argmax(predictions)
        confidence = float(predictions[class_idx])

        # Disease classes mapping (from classes.txt)
        disease_classes = {
            0: "Pepper Bell - Bacterial Spot",
            1: "Pepper Bell - Healthy",
            2: "Potato - Early Blight",
            3: "Potato - Healthy",
            4: "Potato - Late Blight",
            5: "Tomato - Target Spot",
            6: "Tomato - Mosaic Virus",
            7: "Tomato - Yellow Leaf Curl Virus",
            8: "Tomato - Bacterial Spot",
            9: "Tomato - Early Blight",
            10: "Tomato - Healthy",
            11: "Tomato - Late Blight",
            12: "Tomato - Leaf Mold",
            13: "Tomato - Septoria Leaf Spot",
            14: "Tomato - Spider Mites (Two-Spotted)"
        }

        disease_name = disease_classes.get(class_idx, "Unknown")

        # Generate recommendations based on disease
        recommendations = get_disease_recommendations(disease_name)

        result = {
            "disease": disease_name,
            "confidence": round(confidence * 100, 2),
            "confidence_score": float(confidence),
            "all_predictions": {
                disease_classes.get(i, f"Class {i}"): float(predictions[i])
                for i in range(len(predictions))
            },
            "recommendations": recommendations
        }

        logger.info(f"Detection result: {disease_name} ({confidence:.2%})")
        return result

    except Exception as e:
        logger.error(f"Disease detection failed: {str(e)}")
        raise


def get_disease_recommendations(disease: str) -> list:
    """Get farming recommendations based on detected disease"""

    recommendations_map = {
        # Pepper Diseases
        "Pepper Bell - Bacterial Spot": [
            "Remove and destroy infected leaves",
            "Apply copper-based bactericide",
            "Avoid overhead irrigation",
            "Use disease-free seeds",
            "Rotate crops - avoid planting peppers in same location for 2 years"
        ],
        "Pepper Bell - Healthy": [
            "Maintain current care practices",
            "Monitor regularly for early disease signs",
            "Ensure proper spacing for air circulation",
            "Apply balanced fertilizer"
        ],

        # Potato Diseases
        "Potato - Early Blight": [
            "Apply fungicide (chlorothalonil or mancozeb)",
            "Remove affected lower leaves",
            "Improve air circulation",
            "Avoid overhead irrigation",
            "Monitor field daily for disease spread"
        ],
        "Potato - Healthy": [
            "Continue current management practices",
            "Monitor for late blight during humid weather",
            "Maintain consistent soil moisture",
            "Hill soil around plants properly"
        ],
        "Potato - Late Blight": [
            "URGENT: Apply systemic fungicide immediately",
            "Remove severely affected plants",
            "Avoid overhead irrigation",
            "Harvest tubers promptly",
            "Destroy all infected plant material"
        ],

        # Tomato Diseases
        "Tomato - Target Spot": [
            "Apply fungicide (chlorothalonil)",
            "Remove infected leaves",
            "Space plants adequately",
            "Reduce humidity around plants",
            "Monitor for spread"
        ],
        "Tomato - Mosaic Virus": [
            "Remove and destroy infected plants immediately",
            "Control aphid vectors with insecticide",
            "Disinfect tools and equipment",
            "No chemical cure available",
            "Plant resistant varieties next season"
        ],
        "Tomato - Yellow Leaf Curl Virus": [
            "Control whitefly vectors immediately",
            "Remove severely affected plants",
            "Apply insecticide to control whiteflies",
            "Use reflective mulch to deter insects",
            "Plant resistant varieties"
        ],
        "Tomato - Bacterial Spot": [
            "Apply copper-based bactericide",
            "Remove infected plant parts",
            "Avoid overhead watering",
            "Use pathogen-free seeds and transplants",
            "Practice crop rotation"
        ],
        "Tomato - Early Blight": [
            "Apply fungicide (chlorothalonil or mancozeb)",
            "Remove affected leaves immediately",
            "Improve air circulation around plants",
            "Reduce leaf wetness duration",
            "Mulch to prevent soil splash"
        ],
        "Tomato - Healthy": [
            "Maintain current irrigation schedule",
            "Continue regular monitoring",
            "Apply preventive fungicides if weather favors disease",
            "Ensure proper nutrition"
        ],
        "Tomato - Late Blight": [
            "URGENT: Apply systemic fungicide immediately",
            "Remove severely affected plants",
            "Avoid overhead irrigation",
            "Space plants for better air flow",
            "Harvest ripe fruits immediately"
        ],
        "Tomato - Leaf Mold": [
            "Improve greenhouse/tunnel ventilation",
            "Reduce humidity below 85%",
            "Apply fungicide if severe",
            "Remove infected leaves",
            "Space plants for better air circulation"
        ],
        "Tomato - Septoria Leaf Spot": [
            "Remove infected lower leaves",
            "Apply fungicide (copper-based or mancozeb)",
            "Improve air circulation",
            "Avoid overhead irrigation",
            "Sanitize equipment between plants"
        ],
        "Tomato - Spider Mites (Two-Spotted)": [
            "Apply miticide or insecticidal soap",
            "Increase humidity around plants",
            "Remove heavily infested leaves",
            "Introduce predatory mites if available",
            "Avoid water stress - maintain consistent moisture"
        ]
    }

    return recommendations_map.get(disease, ["Consult agricultural extension for unknown disease"])


def fetch_image_from_s3(bucket: str, key: str) -> bytes:
    """S3'ten goruntu indir"""
    s3 = boto3.client("s3")
    response = s3.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def handler(event, context) -> Dict[str, Any]:
    """
    AWS Lambda handler for disease detection

    Expected event format:
    {
        "s3_bucket": "taras-images",
        "s3_key": "disease-detection/uuid.jpg"
    }
    """
    try:
        # Parse request body if needed
        body = event
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])

        if 's3_bucket' not in body or 's3_key' not in body:
            raise ValueError("Missing 's3_bucket' or 's3_key' in request")

        # S3'ten goruntu indir
        logger.info(f"Fetching image from S3: s3://{body['s3_bucket']}/{body['s3_key']}")
        image_data = fetch_image_from_s3(body['s3_bucket'], body['s3_key'])

        # Run detection
        result = detect_disease(image_data)

        return {
            "statusCode": 200,
            "body": json.dumps(result),
            "headers": {
                "Content-Type": "application/json"
            }
        }

    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"}
        }

    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
            "headers": {"Content-Type": "application/json"}
        }
