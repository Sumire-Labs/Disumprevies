from datetime import datetime, timezone
from typing import Optional

import discord


class MemberEmbeds:
    """メンバー関連のEmbed生成"""

    @staticmethod
    def member_join(member: discord.Member) -> discord.Embed:
        """メンバー参加のEmbed"""
        embed = discord.Embed(
            title="📥 メンバー参加",
            color=discord.Color.green(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="ユーザー名",
            value=str(member),
            inline=True
        )

        # アカウント作成日
        created_at = member.created_at
        now = datetime.now(timezone.utc)
        created_days = (now - created_at).days
        embed.add_field(
            name="アカウント作成日",
            value=f"{created_at.strftime('%Y/%m/%d %H:%M')}\n({created_days}日前)",
            inline=True
        )

        # 新規アカウント警告
        if created_days < 7:
            embed.add_field(
                name="⚠️ 警告",
                value="新規アカウントです",
                inline=False
            )

        # メンバー数
        embed.add_field(
            name="メンバー数",
            value=f"{member.guild.member_count}人",
            inline=True
        )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed

    @staticmethod
    def member_leave(
        member: discord.Member,
        reason: Optional[str] = None
    ) -> discord.Embed:
        """メンバー退出のEmbed"""
        embed = discord.Embed(
            title="📤 メンバー退出",
            color=discord.Color.orange(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="ユーザー名",
            value=str(member),
            inline=True
        )

        # 参加日
        if member.joined_at:
            now = datetime.now(timezone.utc)
            joined_days = (now - member.joined_at).days
            embed.add_field(
                name="参加日",
                value=f"{member.joined_at.strftime('%Y/%m/%d %H:%M')}\n({joined_days}日間在籍)",
                inline=True
            )

        # 持っていたロール
        roles = [role.mention for role in member.roles if role != member.guild.default_role]
        if roles:
            roles_text = ", ".join(roles[:10])
            if len(roles) > 10:
                roles_text += f" 他{len(roles) - 10}個"
            embed.add_field(
                name="ロール",
                value=roles_text,
                inline=False
            )

        if reason:
            embed.add_field(
                name="退出理由",
                value=reason,
                inline=False
            )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed

    @staticmethod
    def role_update(
        member: discord.Member,
        added: list[discord.Role],
        removed: list[discord.Role]
    ) -> discord.Embed:
        """ロール変更のEmbed"""
        embed = discord.Embed(
            title="🏷️ ロール変更",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )

        if added:
            added_text = ", ".join([role.mention for role in added])
            embed.add_field(
                name="✅ 付与",
                value=added_text,
                inline=False
            )

        if removed:
            removed_text = ", ".join([role.mention for role in removed])
            embed.add_field(
                name="❌ 剥奪",
                value=removed_text,
                inline=False
            )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed

    @staticmethod
    def nickname_update(
        member: discord.Member,
        before: Optional[str],
        after: Optional[str]
    ) -> discord.Embed:
        """ニックネーム変更のEmbed"""
        embed = discord.Embed(
            title="📝 ニックネーム変更",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="変更前",
            value=before or "(なし)",
            inline=True
        )
        embed.add_field(
            name="変更後",
            value=after or "(なし)",
            inline=True
        )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed
