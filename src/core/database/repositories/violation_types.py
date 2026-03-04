# src/core/database/repositories/violation_types.py

from typing import Optional

from ..connection import Database
from ..models import ViolationType


# デフォルトの違反種別
DEFAULT_VIOLATION_TYPES = [
    {"name": "spam", "display_name": "スパム", "default_points": 2, "expiry_days": 14},
    {"name": "duplicate", "display_name": "連続投稿", "default_points": 2, "expiry_days": 14},
    {"name": "ngword", "display_name": "NGワード", "default_points": 1, "expiry_days": 7},
    {"name": "mention_bomb", "display_name": "メンション爆撃", "default_points": 3, "expiry_days": 30},
    {"name": "invite_link", "display_name": "招待リンク", "default_points": 2, "expiry_days": 14},
    {"name": "external_link", "display_name": "外部リンク", "default_points": 1, "expiry_days": 7},
]


class ViolationTypesRepository:
    """違反種別のリポジトリ"""

    @staticmethod
    async def get(guild_id: int, name: str) -> Optional[ViolationType]:
        """違反種別を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM violation_types WHERE guild_id = $1 AND name = $2",
            guild_id, name
        )
        return ViolationType.model_validate(dict(row)) if row else None

    @staticmethod
    async def get_by_id(violation_type_id: int) -> Optional[ViolationType]:
        """IDで違反種別を取得"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            "SELECT * FROM violation_types WHERE id = $1",
            violation_type_id
        )
        return ViolationType.model_validate(dict(row)) if row else None

    @staticmethod
    async def get_all(guild_id: int) -> list[ViolationType]:
        """サーバーの全違反種別を取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT * FROM violation_types WHERE guild_id = $1 ORDER BY name",
            guild_id
        )
        return [ViolationType.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def create(violation_type: ViolationType) -> ViolationType:
        """違反種別を作成"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO violation_types (guild_id, name, display_name, default_points, expiry_days)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (guild_id, name) DO UPDATE
            SET display_name = $3, default_points = $4, expiry_days = $5
            RETURNING *
            """,
            violation_type.guild_id,
            violation_type.name,
            violation_type.display_name,
            violation_type.default_points,
            violation_type.expiry_days
        )
        return ViolationType.model_validate(dict(row))

    @staticmethod
    async def create_defaults(guild_id: int) -> list[ViolationType]:
        """デフォルトの違反種別を作成"""
        result = []
        for vtype in DEFAULT_VIOLATION_TYPES:
            violation_type = ViolationType(guild_id=guild_id, **vtype)
            created = await ViolationTypesRepository.create(violation_type)
            result.append(created)
        return result

    @staticmethod
    async def update_points(guild_id: int, name: str, points: int) -> None:
        """違反種別のポイントを更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE violation_types
            SET default_points = $3
            WHERE guild_id = $1 AND name = $2
            """,
            guild_id, name, points
        )

    @staticmethod
    async def update_expiry(guild_id: int, name: str, expiry_days: int) -> None:
        """違反種別の有効期限を更新"""
        pool = Database.get_pool()
        await pool.execute(
            """
            UPDATE violation_types
            SET expiry_days = $3
            WHERE guild_id = $1 AND name = $2
            """,
            guild_id, name, expiry_days
        )

    @staticmethod
    async def delete(guild_id: int, name: str) -> None:
        """違反種別を削除"""
        pool = Database.get_pool()
        await pool.execute(
            "DELETE FROM violation_types WHERE guild_id = $1 AND name = $2",
            guild_id, name
        )
