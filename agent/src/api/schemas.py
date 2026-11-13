"""Pydantic guardrails. Ranges are the "Valid Range" column of AIVI_model_to_UI.docx §3.2, so corrupted sensor
spikes are rejected with 422 before they reach the encoders or the GRU."""
from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

CBC_TIMEPOINTS = ("L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194")


class Telemetry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    hr_bpm: float = Field(ge=40.0, le=180.0)
    spo2_pct: float = Field(ge=70.0, le=100.0)
    eda_tonic_us: float = Field(ge=0.05, le=40.0)
    hrv_rmssd_ms: float = Field(ge=5.0, le=150.0)
    sleep_duration_hr: float = Field(ge=0.0, le=12.0)
    # Optional fields fall back to the documented defaults.
    hrv_sdnn_ms: Optional[float] = Field(default=None, ge=10.0, le=200.0)  # default rmssd * 1.15
    resp_rate_bpm: float = Field(default=16.0, ge=6.0, le=45.0)
    scr_peaks_min: float = Field(default=15.0, ge=0.0, le=120.0)
    skin_temp_c: float = Field(default=33.9, ge=25.0, le=41.0)
    eeg_delta_rel: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eeg_theta_rel: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eeg_sigma_rel: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eeg_beta_rel: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eog_std_uv: Optional[float] = Field(default=None, ge=0.0, le=500.0)
    # "L-3" | "R+1" | "R+45" (any OSD-569 timepoint) or an integer mission day 1-300.
    mission_day: Optional[Union[int, str]] = None
    mission_timepoint: Optional[Literal["L-92","L-44","L-3","R+1","R+45","R+82","R+194"]] = None

    @field_validator("mission_day")
    @classmethod
    def valid_day(cls, value):
        if value is None or value in CBC_TIMEPOINTS: return value
        if isinstance(value, int) and 1 <= value <= 1000: return value
        if isinstance(value, str) and value.isdigit() and 1 <= int(value) <= 1000: return int(value)
        raise ValueError("Use day 1-1000 or a supported CBC reference timepoint")


class PersonalBaseline(BaseModel):
    model_config = ConfigDict(extra="ignore")

    hr_bpm: float = 64.0
    hr_sd: float = Field(default=5.0, gt=0)
    rmssd_ms: float = 58.0
    rmssd_sd: float = Field(default=8.0, gt=0)
    sdnn_ms: Optional[float] = None
    eda_us: float = 2.1
    eda_sd: float = Field(default=0.8, gt=0)
    sleep_hr: float = 7.4
    sleep_sd: float = Field(default=0.65, gt=0)
    resp_bpm: float = 14.0
    skin_temp_c: float = 33.9
    spo2_pct: float = 98.0


class InferRequest(BaseModel):
    crew_id: str = Field(description="UI crew slug, e.g. 'okafor'")
    crew_code: str = Field(pattern=r"^C00[1-4]$", description="OSD-569 CBC subject, C001-C004")
    baseline: PersonalBaseline = PersonalBaseline()
    # Oldest -> newest; the last step is the reading being evaluated. Missing history is padded with the
    # personal-baseline state, so the GRU always sees the 6-step (72 h) window it was trained on.
    steps: list[Telemetry] = Field(min_length=1, max_length=12)


class TwinRequest(BaseModel):
    crew_id: str
    adherence_pct: float = Field(default=70.0, ge=0.0, le=100.0)
    horizon_days: int = Field(default=60, ge=1, le=365)
    femoral_bmd: float = Field(default=0.939, ge=0.3, le=2.0)
    lumbar_bmd: float = Field(default=1.120, gt=0.3, lt=2.0)
    cardiac_anomaly_prob: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SuitRequest(BaseModel):
    crew_id: str = "okafor"
    suit_p_left_arm_psi: float = Field(default=4.3, ge=1.0, le=4.5)
    suit_p_right_arm_psi: float = Field(default=4.3, ge=1.0, le=4.5)
    suit_p_legs_psi: float = Field(default=4.3, ge=1.0, le=4.5)
    suit_p_torso_psi: float = Field(default=4.3, ge=1.0, le=4.5)
    bioimp_left_arm_ohm: float = Field(default=305.0, ge=180.0, le=330.0)
    bioimp_right_arm_ohm: float = Field(default=305.0, ge=180.0, le=330.0)
    bioimp_legs_ohm: float = Field(default=258.0, ge=150.0, le=280.0)
    hr_bpm: float = Field(default=68.0, ge=50.0, le=150.0)
    spo2_pct: float = Field(default=98.0, ge=75.0, le=100.0)
    resp_rate_bpm: float = Field(default=15.0, ge=10.0, le=35.0)
    sbp_mmhg: float = Field(default=120.0, ge=60.0, le=200.0)
    dbp_mmhg: float = Field(default=70.0, ge=30.0, le=130.0)
    eda_tonic_us: float = Field(default=2.2, ge=0.05, le=40.0)
    # Personal baselines for the hr/spo2/sbp_personal_delta features (the core API fills hr/spo2 from the crew record).
    base_hr: float = Field(default=66.0, ge=30.0, le=120.0)
    base_spo2: float = Field(default=98.5, ge=80.0, le=100.0)
    base_sbp: float = Field(default=120.0, ge=80.0, le=180.0)
    adherence_pct: float = Field(default=70.0, ge=0.0, le=100.0)


Status = Literal["Nominal", "Warning", "Critical"]
