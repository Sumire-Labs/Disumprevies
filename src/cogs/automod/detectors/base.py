from dataclasses import dataclass
from typing import Optional

import discord

from src.core.database.repositories import WhitelistRepository


@dataclass
class DetectionResult:
    """検出結果"""
    detected: bool
    violation_type: Optional[str] = None
    reason: Optional[str] = None


async def is_whitelisted(
    guild_id: int,
    member: discord.Member,
    channel_id: int
) -> bool:
    """ホワイトリスト対象かどうか確認"""
    # チャンネルがホワイトリストに含まれているか
    if await WhitelistRepository.is_channel_whitelisted(guild_id, channel_id):
        return True

    # メンバーのロールがホワイトリストに含まれているか
    role_ids = [role.id for role in member.roles]
    whitelisted_roles = await WhitelistRepository.get_role_ids(guild_id)

    for role_id in role_ids:
        if role_id in whitelisted_roles:
            return True

    return False
