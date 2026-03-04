from typing import Optional

from ..connection import Database
from ..models import LogSettings, LogType


class LogSettingsRepository:
    """ログ設定のリポジトリ"""

    @staticmethod
    async def get(guild_id: int, log_type: LogType) -> Optional[LogSettings]:
        """ログ設定を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM log_settings WHERE guild_id = $1 AND log_type = $2",
            guild_id, log_type.value
        )
        return LogSettings.model_validate(dict(row)) if row else None

    @staticmethod
    async def get_all(guild_id: int) -> list[LogSettings]:
        """サーバーの全ログ設定を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT * FROM log_settings WHERE guild_id = $1",
            guild_id
        )
        return [LogSettings.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_enabled_channel(guild_id: int, log_type: LogType) -> Optional[int]:
        """有効なログチャンネルIDを取得"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            """
            SELECT channel_id FROM log_settings
            WHERE guild_id = $1 AND log_type = $2 AND is_enabled = TRUE
            """,
            guild_id, log_type.value
        )
        return result

    @staticmethod
    async def set_channel(guild_id: int, log_type: LogType, channel_id: int) -> LogSettings:
        """ログチャンネルを設定"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO log_settings (guild_id, log_type, channel_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (guild_id, log_type) DO UPDATE
            SET channel_id = $3
            RETURNING *
            """,
            guild_id, log_type.value, channel_id
        )
        return LogSettings.model_validate(dict(row))

    @staticmethod
    async def enable(guild_id: int, log_type: LogType) -> None:
        """ログを有効化"""
        pool = Database.get_pool()
        await pool.execute(
            """
            INSERT INTO log_settings (guild_id, log_type, is_enabled)
            VALUES ($1, $2, TRUE)
            ON CONFLICT (guild_id, log_type) DO UPDATE
            SET is_enabled = TRUE
            """,
            guild_id, log_type.value
        )

    @staticmethod
    async def disable(guild_id: int, log_type: LogType) -> None:
        """ログを無効化"""
        pool = Database.get_pool()
        await pool.execute(
            """
            INSERT INTO log_settings (guild_id, log_type, is_enabled)
            VALUES ($1, $2, FALSE)
            ON CONFLICT (guild_id, log_type) DO UPDATE
            SET is_enabled = FALSE
            """,
            guild_id, log_type.value
        )

    @staticmethod
    async def create_defaults(guild_id: int) -> list[LogSettings]:
        """デフォルトのログ設定を作成"""
        result = []
        pool = Database.get_pool()
        for log_type in LogType:
            row = await pool.fetchrow(
                """
                INSERT INTO log_settings (guild_id, log_type)
                VALUES ($1, $2)
                ON CONFLICT (guild_id, log_type) DO NOTHING
                RETURNING *
                """,
                guild_id, log_type.value
            )
            if row:
                result.append(LogSettings.model_validate(dict(row)))
        return result

    # ログ除外設定

    @staticmethod
    async def add_ignore(guild_id: int, target_type: str, target_id: int) -> bool:
        """ログ除外対象を追加"""
        pool = Database.get_pool()
        try:
            await pool.execute(
                """
                INSERT INTO log_ignores (guild_id, target_type, target_id)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
                """,
                guild_id, target_type, target_id
            )
            return True
        except Exception:
            return False

    @staticmethod
    async def remove_ignore(guild_id: int, target_type: str, target_id: int) -> bool:
        """ログ除外対象を削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM log_ignores WHERE guild_id = $1 AND target_type = $2 AND target_id = $3",
            guild_id, target_type, target_id
        )
        return int(result.split()[-1]) > 0

    @staticmethod
    async def get_ignored_channels(guild_id: int) -> list[int]:
        """ログ除外チャンネル一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT target_id FROM log_ignores WHERE guild_id = $1 AND target_type = 'channel'",
            guild_id
        )
        return [row["target_id"] for row in rows]

    @staticmethod
    async def get_ignored_roles(guild_id: int) -> list[int]:
        """ログ除外ロール一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT target_id FROM log_ignores WHERE guild_id = $1 AND target_type = 'role'",
            guild_id
        )
        return [row["target_id"] for row in rows]

    @staticmethod
    async def is_ignored(guild_id: int, target_type: str, target_id: int) -> bool:
        """ログ除外対象かどうか確認"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM log_ignores 
                WHERE guild_id = $1 AND target_type = $2 AND target_id = $3
            )
            """,
            guild_id, target_type, target_id
        )
        return result
