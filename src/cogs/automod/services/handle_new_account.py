# src/cogs/automod/services/handle_new_account.py

import discord

from src.core.database.repositories import GuildSettingsRepository

from ..detectors import check_new_account
from .log_new_account import log_new_account


async def handle_new_account(
    bot: discord.Client,
    member: discord.Member
) -> bool:
    """
    新規アカウントチェック
    Returns: True if new account was detected
    """
    guild = member.guild
    settings = await GuildSettingsRepository.get(guild.id)

    # 新規アカウント制限が無効の場合
    if not settings or not settings.new_account_enabled:
        return False

    # 新規アカウントチェック
    result = check_new_account(member, settings.new_account_days)

    if result.is_new:
        await log_new_account(
            bot,
            member,
            result.account_age_days,
            settings.new_account_days,
            result.created_at
        )
        return True

    return False
