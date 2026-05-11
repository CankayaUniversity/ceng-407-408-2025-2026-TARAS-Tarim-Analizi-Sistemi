from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import json


# =========================================================
# INPUT MODELS - DB'ye hizalı V1
# =========================================================

@dataclass
class FieldInfo:
    pot_id: str                    # DB'de pot_id
    crop_name: str
    environment_type: str            # only pot for V1
    irrigation_mode: str             # only manual for V1
    ml_per_sm_percent: Optional[float]
    sm_percent_per_100ml: Optional[float]
    irrigation_gain_mm_per_100ml: Optional[float]
    default_check_after_min: int = 60

    @staticmethod
    def from_db_row(row: Dict[str, Any]) -> "FieldInfo":
        return FieldInfo(
            field_id=str(row["pot_id"]),
            crop_name=row["crop_name"],
            environment_type=row["environment_type"],
            irrigation_mode=row["irrigation_mode"],
            ml_per_sm_percent=row.get("ml_per_sm_percent"),
            sm_percent_per_100ml=row.get("sm_percent_per_100ml"),
            irrigation_gain_mm_per_100ml=row.get("irrigation_gain_mm_per_100ml"),
            default_check_after_min=row.get("default_check_after_min", 60),
        )


@dataclass
class SensorData:
    current_sm: float
    current_temp: float
    current_hum: float
    time: str

    @staticmethod
    def from_db_row(row: Dict[str, Any]) -> "SensorData":
        return SensorData(
            current_sm=float(row["soil_moisture"]),
            current_temp=float(row["temperature"]),
            current_hum=float(row["humidity"]),
            time=row["reading_time"],
        )


@dataclass
class CropMetadata:
    growth_stage: Optional[str]
    planting_date: Optional[str] = None

    @staticmethod
    def from_db_row(row: Dict[str, Any]) -> "CropMetadata":
        return CropMetadata(
            growth_stage=row.get("growth_stage"),
            planting_date=row.get("planting_date"),
        )


# =========================================================
# CALIBRATION / HISTORY
# =========================================================

@dataclass
class Calibration:
    recommendation_count: int
    average_prediction_error_check: float
    learned_ml_per_sm_percent: Optional[float] = None
    learned_sm_percent_per_100ml: Optional[float] = None
    irrigation_effect_record_count: int = 0


@dataclass
class RecommendationHistory:
    recommendation_id: int
    field_id: str
    recommendation_time: str
    current_sm_before_irrigation: float
    predicted_sm_after_check: float
    recommended_check_after_min: int

    actual_irrigation_time: Optional[str] = None
    actual_water_amount_ml: Optional[float] = None
    actual_sm_after_check: Optional[float] = None

    sm_gain: Optional[float] = None
    prediction_error: Optional[float] = None


# =========================================================
# OUTPUT MODEL
# =========================================================

@dataclass
class RecommendationOutput:
    should_irrigate: bool
    start_time: Optional[str]
    irrigation_mode: Optional[str]
    water_amount_ml: float
    required_water_mm: float
    predicted_sm_after_check: float
    recommended_check_after_min: Optional[int]
    followup_check_time: Optional[str]
    urgency_level: str
    reason: str
    current_sm: float
    target_sm: Optional[float]
    sm_deficit: float


# =========================================================
# RULES - TOMATO V1
# =========================================================

TOMATO_POT_RULES = {
    "thresholds_by_stage": {
        "seedling": {
            "rec_sm_min": 45,
            "rec_sm_max": 60,
            "critical_min": 35,
            "target_sm": 52
        },
        "vegetative": {
            "rec_sm_min": 50,
            "rec_sm_max": 65,
            "critical_min": 40,
            "target_sm": 57
        },
        "flowering": {
            "rec_sm_min": 65,
            "rec_sm_max": 80,
            "critical_min": 50,
            "target_sm": 72
        },
        "fruiting": {
            "rec_sm_min": 65,
            "rec_sm_max": 80,
            "critical_min": 50,
            "target_sm": 72
        },
        "ripening": {
            "rec_sm_min": 55,
            "rec_sm_max": 70,
            "critical_min": 40,
            "target_sm": 62
        }
    },
    "safety_limits": {
        "min_amount_ml": 0,
        "max_amount_ml": 400
    }
}


# =========================================================
# ENGINE - SADE V1
# =========================================================

class PotIrrigationEngineV1:
    def __init__(self, rules: dict):
        self.rules = rules

    def validate_input(
        self,
        field: FieldInfo,
        sensor: SensorData,
        crop: CropMetadata
    ):
        missing = []

        if not field.field_id:
            missing.append("field_id/pot_id")
        if not field.crop_name:
            missing.append("crop_name")
        if not field.environment_type:
            missing.append("environment_type")
        if not field.irrigation_mode:
            missing.append("irrigation_mode")

        if sensor.current_sm is None:
            missing.append("soil_moisture")
        if sensor.current_temp is None:
            missing.append("temperature")
        if sensor.current_hum is None:
            missing.append("humidity")
        if not sensor.time:
            missing.append("reading_time")

        if missing:
            return False, "insufficient data: " + ", ".join(missing)

        if field.environment_type != "pot":
            return False, "V1 only supports pot environment"
        if field.irrigation_mode != "manual":
            return False, "V1 only supports manual irrigation"

        if sensor.current_sm < 0 or sensor.current_sm > 100:
            return False, "sensor error: soil_moisture out of range"
        if sensor.current_temp < -30 or sensor.current_temp > 60:
            return False, "sensor error: temperature out of range"
        if sensor.current_hum < 0 or sensor.current_hum > 100:
            return False, "sensor error: humidity out of range"

        return True, "valid"

    def get_growth_stage_from_planting_date(self, planting_date: str, current_time: str) -> Optional[str]:
        try:
            planting_dt = datetime.strptime(planting_date, "%Y-%m-%d")
            current_dt = datetime.strptime(current_time, "%Y-%m-%d %H:%M")
        except ValueError:
            return None

        days_after_planting = (current_dt.date() - planting_dt.date()).days

        if days_after_planting < 0:
            return None
        elif days_after_planting <= 20:
            return "seedling"
        elif days_after_planting <= 45:
            return "vegetative"
        elif days_after_planting <= 75:
            return "flowering"
        elif days_after_planting <= 105:
            return "fruiting"
        else:
            return "ripening"

    def get_growth_stage(self, crop: CropMetadata, sensor: SensorData) -> Optional[str]:
        if crop.growth_stage:
            return crop.growth_stage
        if crop.planting_date:
            return self.get_growth_stage_from_planting_date(crop.planting_date, sensor.time)
        return None

    def get_stage_thresholds(self, growth_stage: str):
        return self.rules["thresholds_by_stage"].get(growth_stage)

    def get_urgency(self, current_sm: float, rec_sm_min: float, critical_min: float) -> str:
        if current_sm <= critical_min + 5:
            return "high"
        elif current_sm <= rec_sm_min + 5:
            return "medium"
        else:
            return "low"

    def apply_safety_limits(self, water_amount_ml: float) -> float:
        limits = self.rules["safety_limits"]

        if water_amount_ml < limits["min_amount_ml"]:
            water_amount_ml = limits["min_amount_ml"]

        if limits["max_amount_ml"] is not None and water_amount_ml > limits["max_amount_ml"]:
            water_amount_ml = limits["max_amount_ml"]

        return water_amount_ml

    def get_manual_pot_coefficients(self, field: FieldInfo, calibration: Calibration):
        ml_per_sm_percent = field.ml_per_sm_percent
        sm_percent_per_100ml = field.sm_percent_per_100ml

        if ml_per_sm_percent is None:
            ml_per_sm_percent = calibration.learned_ml_per_sm_percent

        if sm_percent_per_100ml is None:
            sm_percent_per_100ml = calibration.learned_sm_percent_per_100ml

        return ml_per_sm_percent, sm_percent_per_100ml

    def calculate_followup_check_time(self, recommendation_time: str, check_after_min: int) -> Optional[str]:
        try:
            rec_dt = datetime.strptime(recommendation_time, "%Y-%m-%d %H:%M")
        except ValueError:
            return None

        followup_dt = rec_dt + timedelta(minutes=check_after_min)
        return followup_dt.strftime("%Y-%m-%d %H:%M")

    def build_calibration_from_history(
        self,
        history_records: List[RecommendationHistory],
        field_id: str
    ) -> Calibration:
        prediction_records = []
        irrigation_effect_values = []

        for record in history_records:
            if record.field_id != field_id:
                continue

            if record.actual_sm_after_check is not None and record.prediction_error is not None:
                prediction_records.append(record)

            if (
                record.actual_water_amount_ml is not None and
                record.actual_water_amount_ml > 0 and
                record.actual_sm_after_check is not None
            ):
                sm_gain = record.actual_sm_after_check - record.current_sm_before_irrigation
                if sm_gain > 0:
                    sm_percent_per_100ml = (sm_gain / record.actual_water_amount_ml) * 100.0
                    irrigation_effect_values.append(sm_percent_per_100ml)

        if prediction_records:
            errors = [r.prediction_error for r in prediction_records if r.prediction_error is not None]
            avg_error = sum(errors) / len(errors) if errors else 0.0
        else:
            avg_error = 0.0

        learned_sm_percent_per_100ml = None
        learned_ml_per_sm_percent = None

        if irrigation_effect_values:
            learned_sm_percent_per_100ml = sum(irrigation_effect_values) / len(irrigation_effect_values)
            if learned_sm_percent_per_100ml > 0:
                learned_ml_per_sm_percent = 100.0 / learned_sm_percent_per_100ml

        return Calibration(
            recommendation_count=len(prediction_records),
            average_prediction_error_check=avg_error,
            learned_ml_per_sm_percent=learned_ml_per_sm_percent,
            learned_sm_percent_per_100ml=learned_sm_percent_per_100ml,
            irrigation_effect_record_count=len(irrigation_effect_values)
        )

    def recommend(
        self,
        field: FieldInfo,
        sensor: SensorData,
        crop: CropMetadata,
        calibration: Calibration
    ) -> RecommendationOutput:
        valid, validation_reason = self.validate_input(field, sensor, crop)

        if not valid:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode if field else None,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm if sensor else 0.0,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="unknown",
                reason=validation_reason,
                current_sm=sensor.current_sm if sensor else 0.0,
                target_sm=None,
                sm_deficit=0.0
            )

        growth_stage = self.get_growth_stage(crop, sensor)
        if growth_stage is None:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="unknown",
                reason="growth_stage cannot be determined",
                current_sm=sensor.current_sm,
                target_sm=None,
                sm_deficit=0.0
            )

        thresholds = self.get_stage_thresholds(growth_stage)
        if thresholds is None:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="unknown",
                reason="unsupported growth_stage",
                current_sm=sensor.current_sm,
                target_sm=None,
                sm_deficit=0.0
            )

        rec_sm_min = thresholds["rec_sm_min"]
        rec_sm_max = thresholds["rec_sm_max"]
        critical_min = thresholds["critical_min"]
        target_sm = thresholds["target_sm"]

        if sensor.current_sm >= rec_sm_max:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="low",
                reason="Current soil moisture is already above recommended range.",
                current_sm=sensor.current_sm,
                target_sm=target_sm,
                sm_deficit=0.0
            )

        urgency = self.get_urgency(sensor.current_sm, rec_sm_min, critical_min)
        should_irrigate = sensor.current_sm <= rec_sm_min

        if not should_irrigate:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level=urgency,
                reason="Soil moisture is still within acceptable range.",
                current_sm=sensor.current_sm,
                target_sm=target_sm,
                sm_deficit=0.0
            )

        ml_per_sm_percent, sm_percent_per_100ml = self.get_manual_pot_coefficients(field, calibration)

        if ml_per_sm_percent is None or ml_per_sm_percent <= 0:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="unknown",
                reason="ml_per_sm_percent missing for manual pot irrigation",
                current_sm=sensor.current_sm,
                target_sm=target_sm,
                sm_deficit=0.0
            )

        if sm_percent_per_100ml is None or sm_percent_per_100ml <= 0:
            return RecommendationOutput(
                should_irrigate=False,
                start_time=None,
                irrigation_mode=field.irrigation_mode,
                water_amount_ml=0.0,
                required_water_mm=0.0,
                predicted_sm_after_check=sensor.current_sm,
                recommended_check_after_min=None,
                followup_check_time=None,
                urgency_level="unknown",
                reason="sm_percent_per_100ml missing for manual pot irrigation",
                current_sm=sensor.current_sm,
                target_sm=target_sm,
                sm_deficit=0.0
            )

        sm_deficit = max(0.0, target_sm - sensor.current_sm)

        water_amount_ml = sm_deficit * ml_per_sm_percent
        water_amount_ml = self.apply_safety_limits(water_amount_ml)

        if field.irrigation_gain_mm_per_100ml is not None and field.irrigation_gain_mm_per_100ml > 0:
            required_water_mm = (water_amount_ml / 100.0) * field.irrigation_gain_mm_per_100ml
        else:
            required_water_mm = 0.0

        predicted_increase = (water_amount_ml / 100.0) * sm_percent_per_100ml
        predicted_sm_after_check = sensor.current_sm + predicted_increase
        if predicted_sm_after_check > 100:
            predicted_sm_after_check = 100.0

        recommended_check_after_min = field.default_check_after_min
        followup_check_time = self.calculate_followup_check_time(sensor.time, recommended_check_after_min)

        return RecommendationOutput(
            should_irrigate=True,
            start_time="now",
            irrigation_mode=field.irrigation_mode,
            water_amount_ml=round(water_amount_ml, 2),
            required_water_mm=round(required_water_mm, 2),
            predicted_sm_after_check=round(predicted_sm_after_check, 2),
            recommended_check_after_min=recommended_check_after_min,
            followup_check_time=followup_check_time,
            urgency_level=urgency,
            reason="Irrigation is recommended based on soil moisture deficit and pot calibration.",
            current_sm=sensor.current_sm,
            target_sm=target_sm,
            sm_deficit=round(sm_deficit, 2)
        )

    # =====================================================
    # DB PAYLOAD HELPERS
    # =====================================================

    def build_recommendation_row(
        self,
        pot_id: str,
        output: RecommendationOutput,
        recommendation_time: str
    ) -> Dict[str, Any]:
        return {
            "pot_id": pot_id,
            "recommendation_time": recommendation_time,
            "should_irrigate": output.should_irrigate,
            "start_time": output.start_time,
            "irrigation_mode": output.irrigation_mode,
            "water_amount_ml": output.water_amount_ml,
            "predicted_sm_after_check": output.predicted_sm_after_check,
            "urgency_level": output.urgency_level,
            "reason": output.reason,
            "current_sm": output.current_sm,
            "target_sm": output.target_sm,
            "sm_deficit": output.sm_deficit,
            "recommended_check_after_min": output.recommended_check_after_min,
            "followup_check_time": output.followup_check_time,
            "created_at": recommendation_time,
        }

    def build_irrigation_action_row(
        self,
        pot_id: str,
        recommendation_id: int,
        actual_irrigation_time: str,
        actual_water_amount_ml: float
    ) -> Dict[str, Any]:
        return {
            "pot_id": pot_id,
            "recommendation_id": recommendation_id,
            "actual_irrigation_time": actual_irrigation_time,
            "actual_water_amount_ml": actual_water_amount_ml,
            "created_at": actual_irrigation_time,
        }

    def build_followup_row(
        self,
        pot_id: str,
        recommendation_id: int,
        check_time: str,
        current_sm_before_irrigation: float,
        predicted_sm_after_check: float,
        actual_sm_after_check: float
    ) -> Dict[str, Any]:
        sm_gain = actual_sm_after_check - current_sm_before_irrigation
        prediction_error = actual_sm_after_check - predicted_sm_after_check

        return {
            "pot_id": pot_id,
            "recommendation_id": recommendation_id,
            "check_time": check_time,
            "sm_after_check": actual_sm_after_check,
            "sm_gain": round(sm_gain, 2),
            "prediction_error": round(prediction_error, 2),
        }


# =========================================================
# DEMO - DB'ye yakın kullanım
# =========================================================

pot_row = {
    "pot_id": "POT_001",
    "crop_name": "tomato",
    "environment_type": "pot",
    "irrigation_mode": "manual",
    "ml_per_sm_percent": 15.0,
    "sm_percent_per_100ml": 6.0,
    "irrigation_gain_mm_per_100ml": 1.2,
    "default_check_after_min": 60,
    "created_at": "2026-03-31 19:00"
}

sensor_row = {
    "reading_id": 101,
    "pot_id": "POT_001",
    "soil_moisture": 41.0,
    "temperature": 27.5,
    "humidity": 62.0,
    "reading_time": "2026-03-31 19:30"
}

crop_row = {
    "crop_data_id": 1,
    "pot_id": "POT_001",
    "crop_name": "tomato",
    "growth_stage": None,
    "planting_date": "2026-02-20",
    "is_active": True,
    "created_at": "2026-02-20 10:00"
}

history_records = [
    RecommendationHistory(
        recommendation_id=1,
        field_id="POT_001",
        recommendation_time="2026-03-20 09:00",
        current_sm_before_irrigation=45.0,
        predicted_sm_after_check=51.0,
        recommended_check_after_min=60,
        actual_irrigation_time="2026-03-20 09:05",
        actual_water_amount_ml=110.0,
        actual_sm_after_check=50.8,
        sm_gain=5.8,
        prediction_error=-0.2
    ),
    RecommendationHistory(
        recommendation_id=2,
        field_id="POT_001",
        recommendation_time="2026-03-21 09:30",
        current_sm_before_irrigation=44.0,
        predicted_sm_after_check=50.0,
        recommended_check_after_min=60,
        actual_irrigation_time="2026-03-21 09:32",
        actual_water_amount_ml=108.0,
        actual_sm_after_check=49.7,
        sm_gain=5.7,
        prediction_error=-0.3
    ),
    RecommendationHistory(
        recommendation_id=3,
        field_id="POT_001",
        recommendation_time="2026-03-22 10:00",
        current_sm_before_irrigation=43.0,
        predicted_sm_after_check=49.2,
        recommended_check_after_min=60,
        actual_irrigation_time="2026-03-22 10:02",
        actual_water_amount_ml=112.0,
        actual_sm_after_check=49.5,
        sm_gain=6.5,
        prediction_error=0.3
    )
]

field_info = FieldInfo.from_db_row(pot_row)
sensor_data = SensorData.from_db_row(sensor_row)
crop_metadata = CropMetadata.from_db_row(crop_row)

engine = PotIrrigationEngineV1(TOMATO_POT_RULES)
calibration = engine.build_calibration_from_history(history_records, field_info.field_id)

result = engine.recommend(
    field=field_info,
    sensor=sensor_data,
    crop=crop_metadata,
    calibration=calibration
)

recommendation_payload = engine.build_recommendation_row(
    pot_id=field_info.field_id,
    output=result,
    recommendation_time=sensor_data.time
)

print("Recommendation output:")
print(json.dumps(asdict(result), indent=4))

print("\nRecommendation DB payload:")
print(json.dumps(recommendation_payload, indent=4))

# Örnek: kullanıcı "Suladım" dedi
example_recommendation_id = 999

irrigation_action_payload = engine.build_irrigation_action_row(
    pot_id=field_info.field_id,
    recommendation_id=example_recommendation_id,
    actual_irrigation_time="2026-03-31 19:35",
    actual_water_amount_ml=result.water_amount_ml
)

print("\nIrrigation action DB payload:")
print(json.dumps(irrigation_action_payload, indent=4))

# Örnek: 60 dk sonra follow-up geldi
followup_payload = engine.build_followup_row(
    pot_id=field_info.field_id,
    recommendation_id=example_recommendation_id,
    check_time="2026-03-31 20:35",
    current_sm_before_irrigation=result.current_sm,
    predicted_sm_after_check=result.predicted_sm_after_check,
    actual_sm_after_check=56.8
)

print("\nFollowup DB payload:")
print(json.dumps(followup_payload, indent=4))

print("\nCalibration:")
print(json.dumps(asdict(calibration), indent=4))