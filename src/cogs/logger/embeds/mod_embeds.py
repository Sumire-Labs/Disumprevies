from datetime import datetime
from typing import Optional

import discord


class ModEmbeds:
    """モデレーション関連のEmbed生成"""

    @staticmethod
    def auto_delete(
        message: discord.Message,
        violation_type: str,
        points: int,
        total_points: int
    ) -> discord.Embed:
        """自動削除メッセージのEmbed"""
        embed = discord.Embed(
            title="🛡️ メッセージ自動削除",
            color=discord.Color.orange(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{message.author.mention} (`{message.author.id}`)",
            inline=True
        )
        embed.add_field(
            name="チャンネル",
            value=f"{message.channel.mention}",
            inline=True
        )
        embed.add_field(
            name="違反種別",
            value=violation_type,
            inline=True
        )
        embed.add_field(
            name="付与ポイント",
            value=f"+{points}pt",
            inline=True
        )
        embed.add_field(
            name="累計ポイント",
            value=f"{total_points}pt",
            inline=True
        )

        content = message.content[:1000] if message.content else "(なし)"
        embed.add_field(
            name="メッセージ内容",
            value=content,
            inline=False
        )

        if message.attachments:
            attachment_info = ", ".join([a.filename for a in message.attachments])
            embed.add_field(
                name="添付ファイル",
                value=attachment_info[:500],
                inline=False
            )

        embed.set_author(
            name=str(message.author),
            icon_url=message.author.display_avatar.url
        )
        embed.set_footer(text=f"メッセージID: {message.id}")

        return embed

    @staticmethod
    def violation_detected(
        user: discord.Member,
        violation_type: str,
        points: int,
        total_points: int,
        reason: str
    ) -> discord.Embed:
        """違反検出・ポイント付与のEmbed"""
        embed = discord.Embed(
            title="⚠️ 違反検出",
            color=discord.Color.yellow(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{user.mention} (`{user.id}`)",
            inline=True
        )
        embed.add_field(
            name="違反種別",
            value=violation_type,
            inline=True
        )
        embed.add_field(
            name="付与ポイント",
            value=f"+{points}pt",
            inline=True
        )
        embed.add_field(
            name="累計ポイント",
            value=f"{total_points}pt",
            inline=True
        )
        embed.add_field(
            name="理由",
            value=reason,
            inline=False
        )

        embed.set_thumbnail(url=user.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {user.id}")

        return embed

    @staticmethod
    def punishment(
        user: discord.Member | discord.User,
        action: str,
        reason: str,
        moderator: Optional[discord.Member] = None,
        duration: Optional[str] = None
    ) -> discord.Embed:
        """処分実行のEmbed"""
        color_map = {
            "warn": discord.Color.yellow(),
            "timeout": discord.Color.orange(),
            "kick": discord.Color.red(),
            "ban": discord.Color.dark_red()
        }
        emoji_map = {
            "warn": "⚠️",
            "timeout": "🔇",
            "kick": "👢",
            "ban": "🔨"
        }

        embed = discord.Embed(
            title=f"{emoji_map.get(action, '📋')} {action.upper()}",
            color=color_map.get(action, discord.Color.greyple()),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="対象ユーザー",
            value=f"{user.mention} (`{user.id}`)",
            inline=True
        )

        if moderator:
            embed.add_field(
                name="実行者",
                value=moderator.mention,
                inline=True
            )
        else:
            embed.add_field(
                name="実行者",
                value="🤖 自動処分",
                inline=True
            )

        if duration:
            embed.add_field(
                name="期間",
                value=duration,
                inline=True
            )

        embed.add_field(
            name="理由",
            value=reason,
            inline=False
        )

        embed.set_thumbnail(url=user.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {user.id}")

        return embed

    @staticmethod
    def punishment_revoke(
        user: discord.Member | discord.User,
        action: str,
        moderator: Optional[discord.Member] = None,
        reason: Optional[str] = None
    ) -> discord.Embed:
        """処分解除のEmbed"""
        action_display = {
            "timeout": "タイムアウト",
            "ban": "BAN"
        }

        embed = discord.Embed(
            title=f"✅ {action_display.get(action, action)}解除",
            color=discord.Color.green(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="対象ユーザー",
            value=f"{user.mention} (`{user.id}`)",
            inline=True
        )

        if moderator:
            embed.add_field(
                name="実行者",
                value=moderator.mention,
                inline=True
            )

        if reason:
            embed.add_field(
                name="理由",
                value=reason,
                inline=False
            )

        embed.set_thumbnail(url=user.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {user.id}")

        return embed
