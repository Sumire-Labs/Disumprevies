# src/core/database/repositories/violations.py

from datetime import datetime, timedelta
from typing import Optional

from ..connection import Database
from ..models import Violation


class ViolationsRepository:
    """違反履歴のリポジトリ"""

    @staticmethod
    async def get(violation_id: int) -> Optional[Violation]:
        """違反を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM violations WHERE id = $1",
            violation_id
        )
        return Violation.model_validate(dict(row)) if row else None

    @staticmethod
    async def get_user_violations(
        guild_id: int,
        user_id: int,
        include_expired: bool = False,
        include_deleted: bool = False
    ) -> list[Violation]:
        """ユーザーの違反履歴を取得"""
        pool = Database.get_pool()

        query = "SELECT * FROM violations WHERE guild_id = $1 AND user_id = $2"
        conditions = []

        if not include_expired:
            conditions.append("expires_at > CURRENT_TIMESTAMP")
        if not include_deleted:
            conditions.append("is_deleted = FALSE")

        if conditions:
            query += " AND " + " AND ".join(conditions)

        query += " ORDER BY created_at DESC"

        rows = await pool.fetch(query, guild_id, user_id)
        return [Violation.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_user_total_points(guild_id: int, user_id: int) -> int:
        """ユーザーの有効な合計ポイントを取得"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            """
            SELECT COALESCE(SUM(points), 0)
            FROM violations
            WHERE guild_id = $1 AND user_id = $2
              AND is_deleted = FALSE
              AND expires_at > CURRENT_TIMESTAMP
            """,
            guild_id, user_id
        )
        return result or 0

    @staticmethod
    async def create(
        guild_id: int,
        user_id: int,
        violation_type_id: int,
        points: int,
        expires_at: datetime,
        reason: Optional[str] = None,
        message_id: Optional[int] = None,
        channel_id: Optional[int] = None,
        moderator_id: Optional[int] = None
    ) -> Violation:
        """違反を記録"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO violations 
            (guild_id, user_id, violation_type_id, points, reason, message_id, channel_id, moderator_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            guild_id, user_id, violation_type_id, points, reason,
            message_id, channel_id, moderator_id, expires_at
        )
        return Violation.model_validate(dict(row))

    @staticmethod
    async def delete(violation_id: int, deleted_by: int) -> None:
        """違反を論理削除"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE violations
            SET is_deleted = TRUE, deleted_by = $2, deleted_at = CURRENT_TIMESTAMP
            WHERE id = $1
            """,
            violation_id, deleted_by
        )

    @staticmethod
    async def clear_user_violations(guild_id: int, user_id: int, deleted_by: int) -> int:
        """ユーザーの全違反を論理削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            """
            UPDATE violations
            SET is_deleted = TRUE, deleted_by = $3, deleted_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1 AND user_id = $2 AND is_deleted = FALSE
            """,
            guild_id, user_id, deleted_by
        )
        # "UPDATE X" の X を返す
        return int(result.split()[-1])

    @staticmethod
    async def cleanup_expired() -> int:
        """期限切れの違反を物理削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM violations WHERE expires_at < CURRENT_TIMESTAMP"
        )
        return int(result.split()[-1])
