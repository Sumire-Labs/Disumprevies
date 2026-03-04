from typing import Optional

from ..connection import Database
from ..models import WhitelistRole, WhitelistChannel


class WhitelistRepository:
    """ホワイトリストのリポジトリ"""

    # ロール関連

    @staticmethod
    async def get_roles(guild_id: int) -> list[WhitelistRole]:
        """ホワイトリストのロール一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT * FROM whitelist_roles WHERE guild_id = $1",
            guild_id
        )
        return [WhitelistRole.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_role_ids(guild_id: int) -> list[int]:
        """ホワイトリストのロールID一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT role_id FROM whitelist_roles WHERE guild_id = $1",
            guild_id
        )
        return [row["role_id"] for row in rows]

    @staticmethod
    async def is_role_whitelisted(guild_id: int, role_id: int) -> bool:
        """ロールがホワイトリストに登録されているか確認"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM whitelist_roles WHERE guild_id = $1 AND role_id = $2)",
            guild_id, role_id
        )
        return result

    @staticmethod
    async def add_role(guild_id: int, role_id: int) -> Optional[WhitelistRole]:
        """ロールをホワイトリストに追加"""
        pool = Database.get_pool()
        try:
            row = await pool.fetchrow(
                """
                INSERT INTO whitelist_roles (guild_id, role_id)
                VALUES ($1, $2)
                RETURNING *
                """,
                guild_id, role_id
            )
            return WhitelistRole.model_validate(dict(row))
        except Exception:
            return None

    @staticmethod
    async def remove_role(guild_id: int, role_id: int) -> bool:
        """ロールをホワイトリストから削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM whitelist_roles WHERE guild_id = $1 AND role_id = $2",
            guild_id, role_id
        )
        return int(result.split()[-1]) > 0

    # チャンネル関連

    @staticmethod
    async def get_channels(guild_id: int) -> list[WhitelistChannel]:
        """ホワイトリストのチャンネル一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT * FROM whitelist_channels WHERE guild_id = $1",
            guild_id
        )
        return [WhitelistChannel.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_channel_ids(guild_id: int) -> list[int]:
        """ホワイトリストのチャンネルID一覧を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT channel_id FROM whitelist_channels WHERE guild_id = $1",
            guild_id
        )
        return [row["channel_id"] for row in rows]

    @staticmethod
    async def is_channel_whitelisted(guild_id: int, channel_id: int) -> bool:
        """チャンネルがホワイトリストに登録されているか確認"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM whitelist_channels WHERE guild_id = $1 AND channel_id = $2)",
            guild_id, channel_id
        )
        return result

    @staticmethod
    async def add_channel(guild_id: int, channel_id: int) -> Optional[WhitelistChannel]:
        """チャンネルをホワイトリストに追加"""
        pool = Database.get_pool()
        try:
            row = await pool.fetchrow(
                """
                INSERT INTO whitelist_channels (guild_id, channel_id)
                VALUES ($1, $2)
                RETURNING *
                """,
                guild_id, channel_id
            )
            return WhitelistChannel.model_validate(dict(row))
        except Exception:
            return None

    @staticmethod
    async def remove_channel(guild_id: int, channel_id: int) -> bool:
        """チャンネルをホワイトリストから削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM whitelist_channels WHERE guild_id = $1 AND channel_id = $2",
            guild_id, channel_id
        )
        return int(result.split()[-1]) > 0
