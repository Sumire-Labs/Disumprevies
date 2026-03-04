# src/core/database/repositories/guild_settings.py

from typing import Optional

from ..connection import Database
from ..models import GuildSettings


class GuildSettingsRepository:
    """サーバー設定のリポジトリ"""

    @staticmethod
    async def get(guild_id: int) -> Optional[GuildSettings]:
        """サーバー設定を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM guild_settings WHERE guild_id = $1",
            guild_id
        )
        return GuildSettings.model_validate(dict(row)) if row else None

    @staticmethod
    async def create(guild_id: int) -> GuildSettings:
        """サーバー設定を作成（存在する場合は取得）"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO guild_settings (guild_id)
            VALUES ($1)
            ON CONFLICT (guild_id) DO UPDATE SET guild_id = $1
            RETURNING *
            """,
            guild_id
        )
        return GuildSettings.model_validate(dict(row))

    @staticmethod
    async def get_or_create(guild_id: int) -> GuildSettings:
        """サーバー設定を取得、なければ作成"""
        settings = await GuildSettingsRepository.get(guild_id)
        if settings is None:
            settings = await GuildSettingsRepository.create(guild_id)
        return settings

    @staticmethod
    async def update_point_expiry(guild_id: int, days: int) -> None:
        """ポイント有効期限を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET point_expiry_days = $2, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, days
        )

    @staticmethod
    async def update_log_retention(guild_id: int, days: int) -> None:
        """ログ保持期間を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET log_retention_days = $2, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, days
        )

    @staticmethod
    async def update_spam_settings(guild_id: int, count: int, seconds: int) -> None:
        """スパム検出設定を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET spam_count = $2, spam_seconds = $3, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, count, seconds
        )

    @staticmethod
    async def update_mention_limit(guild_id: int, limit: int) -> None:
        """メンション上限を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET mention_limit = $2, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, limit
        )

    @staticmethod
    async def update_new_account_days(guild_id: int, days: int) -> None:
        """新規アカウント制限日数を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET new_account_days = $2, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, days
        )

    @staticmethod
    async def update_raid_settings(guild_id: int, count: int, seconds: int) -> None:
        """レイド検出設定を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE guild_settings
            SET raid_count = $2, raid_seconds = $3, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
            """,
            guild_id, count, seconds
        )

    @staticmethod
    async def delete(guild_id: int) -> None:
        """サーバー設定を削除"""
        pool = Database.get_pool()
        await pool.execute(
            "DELETE FROM guild_settings WHERE guild_id = $1",
            guild_id
        )
