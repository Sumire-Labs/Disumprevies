# src/core/database/models/whitelist.py

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WhitelistRole(BaseModel):
    """検出除外ロール"""

    id: Optional[int] = Field(default=None, description="ID")
    guild_id: int = Field(description="サーバーID")
    role_id: int = Field(description="ロールID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")

    class Config:
        from_attributes = True


class WhitelistChannel(BaseModel):
    """検出除外チャンネル"""

    id: Optional[int] = Field(default=None, description="ID")
    guild_id: int = Field(description="サーバーID")
    channel_id: int = Field(description="チャンネルID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")

    class Config:
        from_attributes = True
