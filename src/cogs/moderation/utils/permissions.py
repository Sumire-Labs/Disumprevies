# src/cogs/moderation/utils/permissions.py

import discord
from discord import app_commands


def is_moderator() -> app_commands.check:
    """モデレーター権限チェック（kick_members）"""
    async def predicate(interaction: discord.Interaction) -> bool:
        if not isinstance(interaction.user, discord.Member):
            return False
        return interaction.user.guild_permissions.kick_members

    return app_commands.check(predicate)


def is_admin() -> app_commands.check:
    """管理者権限チェック（administrator または ban_members）"""
    async def predicate(interaction: discord.Interaction) -> bool:
        if not isinstance(interaction.user, discord.Member):
            return False
        perms = interaction.user.guild_permissions
        return perms.administrator or perms.ban_members

    return app_commands.check(predicate)
