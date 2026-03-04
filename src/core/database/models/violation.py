# src/core/database/models/violation.py

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Violation(BaseModel):
    """違反履歴"""

    id: Optional[int] = Field(default=None, description="違反ID")
    guild_id: int = Field(description="サーバーID")
    user_id: int = Field(description="ユーザーID")
    violation_type_id: int = Field(description="違反種別ID")
    points: int = Field(ge=1, description="付与ポイント")
    reason: Optional[str] = Field(default=None, description="違反理由")
    message_id: Optional[int] = Field(default=None, description="違反メッセージID")
    channel_id: Optional[int] = Field(default=None, description="違反チャンネルID")
    moderator_id: Optional[int] = Field(default=None, description="手動付与したモデレーターID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")
    expires_at: datetime = Field(description="有効期限")
    is_deleted: bool = Field(default=False, description="削除済みフラグ")
    deleted_by: Optional[int] = Field(default=None, description="削除したモデレーターID")
    deleted_at: Optional[datetime] = Field(default=None, description="削除日時")

    class Config:
        from_attributes = True
