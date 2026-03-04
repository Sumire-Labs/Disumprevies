# src/core/database/models/ngword.py

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NgWord(BaseModel):
    """NGワード"""

    id: Optional[int] = Field(default=None, description="NGワードID")
    guild_id: int = Field(description="サーバーID")
    word: str = Field(max_length=100, description="NGワード")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")

    class Config:
        from_attributes = True
