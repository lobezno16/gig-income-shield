from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(
        default="postgresql+asyncpg://soteria:soteria123@localhost:5432/soteria_db",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    secret_key: str = Field(default="dev-secret-key-change-in-prod", alias="SECRET_KEY")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    owm_api_key: str = Field(default="", alias="OWM_API_KEY")
    waqi_api_key: str = Field(default="", alias="WAQI_API_KEY")
    razorpay_key_id: str = Field(default="", alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", alias="RAZORPAY_KEY_SECRET")

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
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def model_dir_path(self) -> Path:
        return Path(self.ml_model_dir).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()

