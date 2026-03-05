# src\cogs\logger\services\base.py
from typing import Optional

import discord

from src.core.database.models import LogType
from src.core.database.repositories import LogSettingsRepository


async def get_log_channel(
    bot: discord.Client,
    guild_id: int,
    log_type: LogType
) -> Optional[discord.TextChannel]:
    """有効なログチャンネルを取得"""
    channel_id = await LogSettingsRepository.get_enabled_channel(guild_id, log_type)
    if channel_id is None:
        return None

    channel = bot.get_channel(channel_id)
    if isinstance(channel, discord.TextChannel):
        return channel
    return None


async def send_log(
    bot: discord.Client,
    guild_id: int,
    log_type: LogType,
    embed: discord.Embed
) -> Optional[discord.Message]:
    """ログを送信"""
    channel = await get_log_channel(bot, guild_id, log_type)
    if channel is None:
        return None

    try:
        return await channel.send(embed=embed)
    except discord.Forbidden:
        return None
    except discord.HTTPException:
        return None


async def is_ignored(
    guild_id: int,
    channel_id: Optional[int] = None,
    role_ids: Optional[list[int]] = None
) -> bool:
    """ログ除外対象かどうか確認"""
    if channel_id:
        if await LogSettingsRepository.is_ignored(guild_id, "channel", channel_id):
            return True

    if role_ids:
        ignored_roles = await LogSettingsRepository.get_ignored_roles(guild_id)
        if any(role_id in ignored_roles for role_id in role_ids):
            return True

    return False
