# src/core/database/repositories/violations.py

from typing import Optional

from ..connection import Database
from ..models import NgWord


class NgWordsRepository:
    """NGワードのリポジトリ"""

    @staticmethod
    async def get_all(guild_id: int) -> list[NgWord]:
        """サーバーの全NGワードを取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT * FROM ngwords WHERE guild_id = $1 ORDER BY word",
            guild_id
        )
        return [NgWord.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_words(guild_id: int) -> list[str]:
        """サーバーのNGワード一覧を文字列リストで取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            "SELECT word FROM ngwords WHERE guild_id = $1 ORDER BY word",
            guild_id
        )
        return [row["word"] for row in rows]

    @staticmethod
    async def exists(guild_id: int, word: str) -> bool:
        """NGワードが存在するか確認"""
        pool = Database.get_pool()
        result = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM ngwords WHERE guild_id = $1 AND word = $2)",
            guild_id, word.lower()
        )
        return result

    @staticmethod
    async def add(guild_id: int, word: str) -> Optional[NgWord]:
        """NGワードを追加"""
        pool = Database.get_pool()
        try:
            row = await pool.fetchrow(
                """
                INSERT INTO ngwords (guild_id, word)
                VALUES ($1, $2)
                RETURNING *
                """,
                guild_id, word.lower()
            )
            return NgWord.model_validate(dict(row))
        except Exception:
            # 重複の場合はNoneを返す
            return None

    @staticmethod
    async def remove(guild_id: int, word: str) -> bool:
        """NGワードを削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM ngwords WHERE guild_id = $1 AND word = $2",
            guild_id, word.lower()
        )
        return int(result.split()[-1]) > 0

    @staticmethod
    async def clear(guild_id: int) -> int:
        """サーバーの全NGワードを削除"""
        pool = Database.get_pool()
        result = await pool.execute(
            "DELETE FROM ngwords WHERE guild_id = $1",
            guild_id
        )
        return int(result.split()[-1])
