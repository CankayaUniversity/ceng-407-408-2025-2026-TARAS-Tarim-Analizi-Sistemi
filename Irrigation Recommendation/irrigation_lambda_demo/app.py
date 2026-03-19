import os
import json
from google import genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = os.environ.get("MODEL_NAME", "gemini-3-flash-preview")

SYSTEM_PROMPT = """
You are an agricultural irrigation planning assistant for greenhouse crops and home pot plants.
You receive:
- Crop type
- Soil type
- Irrigation System
- Recent sensor time series (soil moisture, air temperature, humidity)
- Crop-specific irrigation thresholds and rules

Your job is to:
- Decide whether irrigation should be scheduled within the next 24 hours
- If yes, determine the start time
- Determine either:
  - irrigation duration in minutes for greenhouse irrigation, or
  - water amount in milliliters for manual home-pot watering
- Provide a short explanation

You MUST strictly follow the crop rules and safety thresholds given in CROP_RULES.
Always output a single JSON object in the format described in OUTPUT_FORMAT.
Do not add any extra text outside the JSON.

CROP_RULES:
- Crop: Tomato
     - RecommendedSoilMoistureRange: 60-80 %
     - CriticalLowSoilMoisture: 55 %
     - CriticalHighSoilMoisture: 90 %
     - TypicalIrrigationIntervalDays: 1-2

IrrigationDurationGuidelines:
When irrigation is recommended, estimate duration starting from the base duration
for the irrigation system and adjust it using soil type and temperature modifiers.

BaseDurationMinutes:
Drip: 25
Sprinkler: 20

SoilTypeAdjustments:
Sandy: increase duration by 10–20 %
Clay: decrease duration by 10–20 %

TemperatureAdjustment:
If MaxTemp > 32 °C and soil moisture is below the recommended range: increase duration moderately (about +10 %)

SafetyLimits:
MinimumDurationMinutes: 0
MaximumDurationMinutes: 120

GLOBAL DECISION RULES:
Definitions:
- "Near the lower bound of the recommended soil moisture range" means
within 5 percentage points above or below the lower bound value.
Example:
If the lower bound is 60%, "near the lower bound" means soil moisture
between 55% and 65%.
The assistant must use this numeric definition strictly when interpreting the rules.
- If current soil moisture is at or above the critical high soil moisture threshold, you must NOT recommend irrigation.
- If current soil moisture is ABOVE the recommended range for this crop, you must NOT recommend irrigation.
- If current soil moisture is BELOW or near the lower bound of the recommended range, you should recommend irrigation.
- If current soil moisture is within the recommended range, prefer to delay irrigation.
- Prefer irrigation between 05:00–09:00 or 18:00–23:00 unless immediate irrigation is required.
- Irrigation duration must be between 0 and 120 minutes.

urgency_level meanings:
- low: irrigation can be delayed
- medium: irrigation recommended within 24h
- high: irrigation recommended soon due to low soil moisture
Always prioritize safety thresholds over scheduling preferences.

WATERING_MODE_RULES:
- If EnvironmentType is "greenhouse" and WateringMethod is "drip" or "sprinkler": output irrigation duration in minutes.
- If EnvironmentType is "home_pot" and WateringMethod is "manual": output water amount in milliliters instead of irrigation duration.
- For manual watering, "duration_minutes" must be null.
- For drip or sprinkler irrigation, "water_amount_ml" must be null.
- Always include "irrigation_mode" in the output.
- Set "irrigation_mode" to "manual" for home_pot manual watering.
- Set "irrigation_mode" to the selected greenhouse method such as "drip" or "sprinkler" for greenhouse environments.

OUTPUT RULES:
- If required sensor values are missing or inconsistent, do not guess.
  Return a JSON object with:
  - "should_irrigate": false
  - "start_time": null
  - "irrigation_mode": null
  - "duration_minutes": 0
  - "water_amount_ml": 0
  - "urgency_level": "unknown"
  - "reason": "Insufficient data to determine irrigation recommendation."

- If irrigation is not needed, set:
  - "should_irrigate" to false
  - "start_time" to null
  - "duration_minutes" to 0
  - "irrigation_mode": null
  - "water_amount_ml": 0

- Do not invent missing values.
- Return only one valid JSON object.
- You must always include both "duration_minutes" and "water_amount_ml" in the output.
- For greenhouse irrigation, set "water_amount_ml" to null.
- For manual home-pot watering, set "duration_minutes" to null.
"""

SAMPLE_FIELD_INPUT = {
    "crop_name": "Tomato",
    "environment_type": "greenhouse",
    "soil_type": "Sandy",
    "watering_method": "drip",
    "pot_volume_liters": None,
    "current_soil_moisture_percent": 58,
    "current_air_temp_c": 31,
    "current_air_humidity_percent": 52,
    "hours_window": 12,
    "soil_moisture_mean": 60,
    "soil_moisture_min": 57,
    "soil_moisture_max": 64,
    "soil_moisture_trend": "decreasing",
    "soil_moisture_array": [58, 59, 60, 60, 61, 61, 62, 62, 63, 63, 64, 64]
}

def build_user_prompt(data: dict) -> str:
    return f"""
CURRENT FIELD CONTEXT:
- Crop: {data["crop_name"]}
- EnvironmentType: {data["environment_type"]}
- SoilType: {data["soil_type"]}
- WateringMethod: {data["watering_method"]}
- PotVolumeLiters: {data["pot_volume_liters"]}

SENSOR DATA:
- CurrentSoilMoisture: {data["current_soil_moisture_percent"]} %
- CurrentAirTemp: {data["current_air_temp_c"]} °C
- CurrentAirHumidity: {data["current_air_humidity_percent"]} %

- SoilMoistureSummary (last {data["hours_window"]} hours):
 - Mean: {data["soil_moisture_mean"]} %
 - Min: {data["soil_moisture_min"]} %
 - Max: {data["soil_moisture_max"]} %
 - Trend: {data["soil_moisture_trend"]}

- SoilMoistureReadingsRecent (most recent first, %):
 {data["soil_moisture_array"]}

TASK:
Using CROP_RULES, CURRENT FIELD CONTEXT, SENSOR DATA:
1. Decide if irrigation is needed within the next 24 hours.
2. If yes, choose a concrete start time (24h format)
3. Determine either irrigation duration in minutes OR water amount in milliliters depending on the environment type.
4. Give a short explanation (2–3 sentences) summarizing your reasoning, explicitly mentioning:
  - current soil moisture vs recommended range
  - crop and soil type

OUTPUT_FORMAT:
Return ONLY a single JSON object.
"""

def build_user_prompt(data: dict) -> str:
    return f"""
CURRENT FIELD CONTEXT:
- Crop: {data["crop_name"]}
- EnvironmentType: {data["environment_type"]}
- SoilType: {data["soil_type"]}
- WateringMethod: {data["watering_method"]}
- PotVolumeLiters: {data["pot_volume_liters"]}

SENSOR DATA:
- CurrentSoilMoisture: {data["current_soil_moisture_percent"]} %
- CurrentAirTemp: {data["current_air_temp_c"]} °C
- CurrentAirHumidity: {data["current_air_humidity_percent"]} %

- SoilMoistureSummary (last {data["hours_window"]} hours):
 - Mean: {data["soil_moisture_mean"]} %
 - Min: {data["soil_moisture_min"]} %
 - Max: {data["soil_moisture_max"]} %
 - Trend: {data["soil_moisture_trend"]}

- SoilMoistureReadingsRecent (most recent first, %):
 {data["soil_moisture_array"]}

TASK:
Using CROP_RULES, CURRENT FIELD CONTEXT, SENSOR DATA:
1. Decide if irrigation is needed within the next 24 hours.
2. If yes, choose a concrete start time (24h format)
3. Determine either irrigation duration in minutes OR water amount in milliliters depending on the environment type.
4. Give a short explanation (2–3 sentences) summarizing your reasoning, explicitly mentioning:
  - current soil moisture vs recommended range
  - crop and soil type

OUTPUT_FORMAT:
Return ONLY a single JSON object.
"""

def call_model(system_prompt: str, user_prompt: str) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing.")

    client = genai.Client(api_key=GEMINI_API_KEY)

    full_prompt = system_prompt + "\n\n" + user_prompt

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=full_prompt
    )

    content = response.text.strip()

    if content.startswith("```"):
        content = content.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {
            "raw_model_output": content,
            "error": "Model output was not valid JSON."
        }

def lambda_handler(event, context):
    try:
        user_prompt = build_user_prompt(SAMPLE_FIELD_INPUT)
        result = call_model(SYSTEM_PROMPT, user_prompt)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "ok": True,
                "input_used": SAMPLE_FIELD_INPUT,
                "model_result": result
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "ok": False,
                "error": str(e)
            })
        }
