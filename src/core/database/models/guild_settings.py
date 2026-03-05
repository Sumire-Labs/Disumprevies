# src/core/database/models/guild_settings.py

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class GuildSettings(BaseModel):
    """サーバーごとの基本設定"""

    guild_id: int = Field(description="サーバーID")
    point_expiry_days: int = Field(default=30, ge=1, le=365, description="ポイント有効期限（日）")
    log_retention_days: int = Field(default=30, ge=1, le=365, description="ログ保持期間（日）")
    mute_role_id: Optional[int] = Field(default=None, description="ミュートロールID")

    # スパム検出設定
    spam_enabled: bool = Field(default=True, description="スパム検出の有効/無効")
    spam_count: int = Field(default=5, ge=1, le=100, description="スパム検出件数")
    spam_seconds: int = Field(default=5, ge=1, le=60, description="スパム検出秒数")

    # 連続投稿検出設定
    duplicate_enabled: bool = Field(default=True, description="連続投稿検出の有効/無効")
    duplicate_count: int = Field(default=3, ge=2, le=20, description="連続投稿検出件数")
    duplicate_seconds: int = Field(default=30, ge=5, le=120, description="連続投稿検出秒数")

    # NGワード検出設定
    ngword_enabled: bool = Field(default=True, description="NGワード検出の有効/無効")

    # メンション検出設定
    mention_enabled: bool = Field(default=True, description="メンション検出の有効/無効")
    mention_limit: int = Field(default=10, ge=1, le=50, description="メンション上限数")

    # 招待リンク検出設定
    invite_enabled: bool = Field(default=True, description="招待リンク検出の有効/無効")

    # 外部リンク検出設定
    link_enabled: bool = Field(default=True, description="外部リンク検出の有効/無効")

    # 新規アカウント制限
    new_account_enabled: bool = Field(default=False, description="新規アカウント制限の有効/無効")
    new_account_days: int = Field(default=7, ge=0, le=90, description="新規アカウント制限日数")

    # レイド検出設定
    raid_enabled: bool = Field(default=False, description="レイド検出の有効/無効")
    raid_count: int = Field(default=10, ge=2, le=100, description="レイド検出人数")
    raid_seconds: int = Field(default=10, ge=1, le=120, description="レイド検出秒数")

    created_at: datetime = Field(default_factory=datetime.utcnow, description="作成日時")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="更新日時")

    class Config:
        from_attributes = True
