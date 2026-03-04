# src/core/database/models/punishment.py

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PunishmentType(str, Enum):
    """処分種別"""

    WARN = "warn"
    TIMEOUT = "timeout"
    KICK = "kick"
    BAN = "ban"


class Punishment(BaseModel):
    """処分履歴"""

    id: Optional[int] = Field(default=None, description="処分ID")
    guild_id: int = Field(description="サーバーID")
    user_id: int = Field(description="ユーザーID")
    type: PunishmentType = Field(description="処分種別")
    reason: Optional[str] = Field(default=None, description="処分理由")
    duration_minutes: Optional[int] = Field(default=None, ge=1, description="タイムアウト期間（分）")
    total_points: Optional[int] = Field(default=None, description="処分時の累計ポイント")
    moderator_id: Optional[int] = Field(default=None, description="手動処分したモデレーターID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")
    expires_at: Optional[datetime] = Field(default=None, description="処分解除日時")
    is_active: bool = Field(default=True, description="有効フラグ")

    class Config:
        from_attributes = True
