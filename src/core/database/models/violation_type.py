# src/core/database/models/violation_type.py

from typing import Optional

from pydantic import BaseModel, Field


class ViolationType(BaseModel):
    """違反種別とポイント定義"""

    id: Optional[int] = Field(default=None, description="違反種別ID")
    guild_id: int = Field(description="サーバーID")
    name: str = Field(max_length=50, description="違反種別名（内部用）")
    display_name: Optional[str] = Field(default=None, max_length=100, description="違反種別名（表示用）")
    default_points: int = Field(ge=1, le=100, description="デフォルト付与ポイント")
    expiry_days: Optional[int] = Field(default=None, ge=1, le=365, description="個別有効期限（日）")

    class Config:
        from_attributes = True
