# src/cogs/moderation/services/execute_unban.py

from dataclasses import dataclass
from typing import Optional

import discord

from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment_revoke


@dataclass
class UnbanResult:
    success: bool
    user: Optional[discord.User] = None
    error_message: str | None = None


async def execute_unban(
    bot: discord.Client,
    guild: discord.Guild,
    user_id: int,
    moderator: discord.Member,
    reason: str | None = None
) -> UnbanResult:
    """BAN解除を実行"""
    # ユーザー情報を取得
    try:
        user = await bot.fetch_user(user_id)
    except discord.NotFound:
        return UnbanResult(success=False, error_message="ユーザーが見つかりません")
    except discord.HTTPException as e:
        return UnbanResult(success=False, error_message=str(e))

    # BAN解除実行
    try:
        await guild.unban(user, reason=reason)
    except discord.NotFound:
        return UnbanResult(success=False, error_message="このユーザーはBANされていません")
    except discord.Forbidden:
        return UnbanResult(success=False, error_message="権限が不足しています")
    except discord.HTTPException as e:
        return UnbanResult(success=False, error_message=str(e))

    # DBのBAN記録を無効化
    punishments = await PunishmentsRepository.get_user_punishments(
        guild.id, user_id, active_only=True
    )
    for p in punishments:
        if p.type.value == "ban":
            await PunishmentsRepository.deactivate(p.id)

    # ログ送信
    await log_punishment_revoke(bot, guild, user, "ban", moderator, reason)

    return UnbanResult(success=True, user=user)
