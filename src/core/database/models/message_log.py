# src/core/database/models/message_log.py

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MessageLogEventType(str, Enum):
    """メッセージログイベント種別"""

    AUTO_DELETE = "auto_delete"
    MANUAL_DELETE = "manual_delete"
    BULK_DELETE = "bulk_delete"


class MessageLog(BaseModel):
    """メッセージログ"""

    id: Optional[int] = Field(default=None, description="ID")
    guild_id: int = Field(description="サーバーID")
    channel_id: int = Field(description="チャンネルID")
    message_id: int = Field(description="メッセージID")
    user_id: int = Field(description="ユーザーID")
    content: Optional[str] = Field(default=None, max_length=500, description="メッセージ内容")
    has_attachments: bool = Field(default=False, description="添付ファイル有無")
    event_type: MessageLogEventType = Field(description="イベント種別")
    reason: Optional[str] = Field(default=None, max_length=30, description="削除理由")
    created_at: datetime = Field(description="メッセージ作成日時")
    logged_at: datetime = Field(default_factory=datetime.utcnow, description="ログ記録日時")

    class Config:
        from_attributes = True
