from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str

    # This configures Pydantic to read variables from the ".env" file
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()