# src/core/database/models/log_settings.py

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class LogType(str, Enum):
    """ログ種別"""

    MOD = "mod"
    MESSAGE = "message"
    MEMBER = "member"
    SERVER = "server"
    VOICE = "voice"


class LogSettings(BaseModel):
    """ログ出力先設定"""

    guild_id: int = Field(description="サーバーID")
    log_type: LogType = Field(description="ログ種別")
    channel_id: Optional[int] = Field(default=None, description="出力先チャンネルID")
    is_enabled: bool = Field(default=True, description="有効フラグ")

    class Config:
        from_attributes = True
