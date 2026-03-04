from datetime import datetime, timedelta
from typing import Optional

from ..connection import Database
from ..models import MessageLog, MessageLogEventType


class MessageLogsRepository:
    """メッセージログのリポジトリ"""

    @staticmethod
    async def create(
        guild_id: int,
        channel_id: int,
        message_id: int,
        user_id: int,
        event_type: MessageLogEventType,
        created_at: datetime,
        content: Optional[str] = None,
        has_attachments: bool = False,
        reason: Optional[str] = None
    ) -> MessageLog:
        """メッセージログを作成"""
        pool = Database.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO message_logs 
            (guild_id, channel_id, message_id, user_id, content, has_attachments, event_type, reason, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            guild_id, channel_id, message_id, user_id,
            content[:500] if content else None,
            has_attachments, event_type.value, reason, created_at
        )
        return MessageLog.model_validate(dict(row))

    @staticmethod
    async def get_user_logs(
        guild_id: int,
        user_id: int,
        limit: int = 50
    ) -> list[MessageLog]:
        """ユーザーのメッセージログを取得"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            """
            SELECT * FROM message_logs
            WHERE guild_id = $1 AND user_id = $2
            ORDER BY logged_at DESC
            LIMIT $3
            """,
            guild_id, user_id, limit
        )
        return [MessageLog.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def get_recent_logs(
        guild_id: int,
        hours: int = 24,
        limit: int = 100
    ) -> list[MessageLog]:
        """最近のメッセージログを取得"""
        pool = Database.get_pool()
        since = datetime.utcnow() - timedelta(hours=hours)
        rows = await pool.fetch(
            """
            SELECT * FROM message_logs
            WHERE guild_id = $1 AND logged_at > $2
            ORDER BY logged_at DESC
            LIMIT $3
            """,
            guild_id, since, limit
        )
        return [MessageLog.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def search_by_content(
        guild_id: int,
        keyword: str,
        limit: int = 50
    ) -> list[MessageLog]:
        """メッセージ内容で検索"""
        pool = Database.get_pool()
        rows = await pool.fetch(
            """
            SELECT * FROM message_logs
            WHERE guild_id = $1 AND content ILIKE $2
            ORDER BY logged_at DESC
            LIMIT $3
            """,
            guild_id, f"%{keyword}%", limit
        )
        return [MessageLog.model_validate(dict(row)) for row in rows]

    @staticmethod
    async def cleanup_old_logs(retention_days: int) -> int:
        """古いログを削除"""
        pool = Database.get_pool()
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        result = await pool.execute(
            "DELETE FROM message_logs WHERE logged_at < $1",
            cutoff
        )
        return int(result.split()[-1])

    @staticmethod
    async def cleanup_guild_old_logs(guild_id: int, retention_days: int) -> int:
        """サーバーの古いログを削除"""
        pool = Database.get_pool()
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        result = await pool.execute(
            "DELETE FROM message_logs WHERE guild_id = $1 AND logged_at < $2",
            guild_id, cutoff
        )
        return int(result.split()[-1])
