import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if _allowed_origins_env and not _allowed_origins_env.strip().startswith("["):
    parsed_origins = [item.strip() for item in _allowed_origins_env.split(",") if item.strip()]
    os.environ["ALLOWED_ORIGINS"] = json.dumps(parsed_origins)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = Field(default="development", alias="ENVIRONMENT")
    database_url: str = Field(
        default="postgresql+asyncpg://soteria:soteria123@localhost:5432/soteria_db",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    secret_key: str = Field(default="dev-secret-key-change-in-prod", alias="SECRET_KEY")
    allowed_origins: list[str] = Field(
        default=["http://localhost:5173"],
        alias="ALLOWED_ORIGINS",
    )

    owm_api_key: str = Field(default="", alias="OWM_API_KEY")
    waqi_api_key: str = Field(default="", alias="WAQI_API_KEY")
    cpcb_api_key: str = Field(default="", alias="CPCB_API_KEY")
    cpcb_base_url: str = Field(default="https://api.cpcb.gov.in", alias="CPCB_BASE_URL")
    tomtom_api_key: str = Field(default="", alias="TOMTOM_API_KEY")
    tomtom_base_url: str = Field(default="https://api.tomtom.com/traffic/services/4", alias="TOMTOM_BASE_URL")
    payment_provider: str = Field(default="razorpay_test", alias="PAYMENT_PROVIDER")
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    razorpay_key_id: str = Field(default="", alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", alias="RAZORPAY_KEY_SECRET")
    trigger_poll_interval_minutes: int = Field(default=10, alias="TRIGGER_POLL_INTERVAL_MINUTES")
    trigger_dedupe_minutes: int = Field(default=60, alias="TRIGGER_DEDUPE_MINUTES")
    default_worker_shift_start: int = Field(default=8, alias="DEFAULT_WORKER_SHIFT_START")
    default_worker_shift_end: int = Field(default=23, alias="DEFAULT_WORKER_SHIFT_END")

    ml_model_dir: str = Field(default="./ml/models", alias="ML_MODEL_DIR")
    ml_retrain_hour: int = Field(default=2, alias="ML_RETRAIN_HOUR")
    ml_random_state: int = Field(default=42, alias="ML_RANDOM_STATE")
    ml_n_estimators: int = Field(default=200, alias="ML_N_ESTIMATORS")
    ml_max_depth: int = Field(default=8, alias="ML_MAX_DEPTH")
    ml_min_samples_leaf: int = Field(default=20, alias="ML_MIN_SAMPLES_LEAF")

    bcr_warning_threshold: float = Field(default=0.75, alias="BCR_WARNING_THRESHOLD")
    bcr_suspend_threshold: float = Field(default=0.85, alias="BCR_SUSPEND_THRESHOLD")
    bcr_critical_threshold: float = Field(default=1.0, alias="BCR_CRITICAL_THRESHOLD")

    api_version: str = "2.0"
    app_name: str = "Soteria API"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("environment")
    @classmethod
    def normalize_environment(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("secret_key")
    @classmethod
    def secret_key_must_be_strong(cls, v: str) -> str:
        if v == "dev-secret-key-change-in-prod":
            raise ValueError("SECRET_KEY must be changed from the default value")
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    @field_validator("secret_key")
    @classmethod
    def secret_key_production_check(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("environment") == "production" and v.startswith("dev-"):
            raise ValueError("Cannot use dev SECRET_KEY in production environment")
        return v

    @field_validator("database_url")
    @classmethod
    def database_url_production_check(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("environment") == "production" and "soteria123" in v:
            raise ValueError("Cannot use default database password in production environment")
        return v

    @field_validator("allowed_origins")
    @classmethod
    def allowed_origins_production_check(cls, v: list[str], info: ValidationInfo) -> list[str]:
        if info.data.get("environment") == "production" and not v:
            raise ValueError("ALLOWED_ORIGINS must be non-empty in production environment")
        return v

    @property
    def model_dir_path(self) -> Path:
        return Path(self.ml_model_dir).resolve()

    @property
    def cors_origins(self) -> list[str]:
        return self.allowed_origins

    @property
    def has_real_weather_data(self) -> bool:
        return bool(self.owm_api_key)

    @property
    def has_real_traffic_data(self) -> bool:
        return bool(self.tomtom_api_key)

    @property
    def has_real_aqi_data(self) -> bool:
        return bool(self.cpcb_api_key or self.waqi_api_key)

    @property
    def has_real_multi_oracle_data(self) -> bool:
        return bool(self.has_real_weather_data and self.has_real_traffic_data and self.has_real_aqi_data)


@lru_cache
def get_settings() -> Settings:
    return Settings()
