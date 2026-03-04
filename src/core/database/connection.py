# src/core/database/connection.py

import asyncpg
from typing import Optional


class Database:
    """データベース接続を管理するクラス"""

    pool: Optional[asyncpg.Pool] = None

    @classmethod
    async def connect(cls, dsn: str) -> None:
        """データベースに接続してコネクションプールを作成"""
        cls.pool = await asyncpg.create_pool(dsn)

    @classmethod
    async def close(cls) -> None:
        """コネクションプールを閉じる"""
        if cls.pool:
            await cls.pool.close()
            cls.pool = None

    @classmethod
    def get_pool(cls) -> asyncpg.Pool:
        """コネクションプールを取得"""
        if cls.pool is None:
            raise RuntimeError("Database not connected. Call Database.connect() first.")
        return cls.pool
