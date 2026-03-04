# src/core/database/repositories/punishments.py

from datetime import datetime
from typing import Optional

from ..connection import Database
from ..models import Punishment, PunishmentType


class PunishmentsRepository:
    """処分履歴のリポジトリ"""

    @staticmethod
    async def get(punishment_id: int) -> Optional[Punishment]:
        """処分を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM punishments WHERE id = $1",
            punishment_id
        )
        return Punishment.model_validate(dict(row)) if row else None

    @staticmethod
    async def get_user_punishments(
        guild_id: int,
        user_id: int,
        active_only: bool = False
    ) -> list[Punishment]:
        """ユーザーの処分履歴を取得"""
        pool = Database.get_pool()

        query = "SELECT * FROM punishments WHERE guild_id = $1 AND user_id = $2"
        if active_only:
            query += " AND is_active = TRUE"
        query += " ORDER BY created_at DESC"

        rows = await pool.fetch(query, guild_id, user_id)
        return [Punishment.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_active_timeout(guild_id: int, user_id: int) -> Optional[Punishment]:
        """ユーザーのアクティブなタイムアウトを取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            SELECT * FROM punishments
            WHERE guild_id = $1 AND user_id = $2
              AND type = $3 AND is_active = TRUE
              AND expires_at > CURRENT_TIMESTAMP
            ORDER BY created_at DESC
            LIMIT 1
            """,
            guild_id, user_id, PunishmentType.TIMEOUT.value
        )
        return Punishment.model_validate(dict(row)) if row else None

    @staticmethod
    async def create(
        guild_id: int,
        user_id: int,
        punishment_type: PunishmentType,
        reason: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        total_points: Optional[int] = None,
        moderator_id: Optional[int] = None,
        expires_at: Optional[datetime] = None
    ) -> Punishment:
        """処分を記録"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO punishments 
            (guild_id, user_id, type, reason, duration_minutes, total_points, moderator_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            guild_id, user_id, punishment_type.value, reason,
            duration_minutes, total_points, moderator_id, expires_at
        )
        return Punishment.model_validate(dict(row))

    @staticmethod
    async def deactivate(punishment_id: int) -> None:
        """処分を無効化"""
        pool = Database.get_pool()
        await pool.execute(
            "UPDATE punishments SET is_active = FALSE WHERE id = $1",
            punishment_id
        )

    @staticmethod
    async def deactivate_expired() -> int:
        """期限切れの処分を無効化"""
        pool = Database.get_pool()
        result = await pool.execute(
            """
            UPDATE punishments
            SET is_active = FALSE
            WHERE is_active = TRUE
              AND expires_at IS NOT NULL
              AND expires_at < CURRENT_TIMESTAMP
            """
        )
        return int(result.split()[-1])
