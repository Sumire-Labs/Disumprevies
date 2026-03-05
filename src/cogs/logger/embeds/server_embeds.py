from datetime import datetime
from typing import Optional

import discord


class ServerEmbeds:
    """サーバー関連のEmbed生成"""

    # チャンネルタイプのマッピング
    CHANNEL_TYPE_MAP = {
        discord.ChannelType.text: "テキストチャンネル",
        discord.ChannelType.voice: "ボイスチャンネル",
        discord.ChannelType.category: "カテゴリ",
        discord.ChannelType.news: "アナウンスチャンネル",
        discord.ChannelType.stage_voice: "ステージチャンネル",
        discord.ChannelType.forum: "フォーラムチャンネル",
        discord.ChannelType.public_thread: "公開スレッド",
        discord.ChannelType.private_thread: "プライベートスレッド",
    }

    @staticmethod
    def channel_create(channel: discord.abc.GuildChannel) -> discord.Embed:
        """チャンネル作成のEmbed"""
        embed = discord.Embed(
            title="📁 チャンネル作成",
            color=discord.Color.green(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="チャンネル名",
            value=f"{channel.mention} (`{channel.name}`)",
            inline=True
        )
        embed.add_field(
            name="種類",
            value=ServerEmbeds.CHANNEL_TYPE_MAP.get(channel.type, str(channel.type)),
            inline=True
        )

        if hasattr(channel, "category") and channel.category:
            embed.add_field(
                name="カテゴリ",
                value=channel.category.name,
                inline=True
            )

        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def channel_delete(channel: discord.abc.GuildChannel) -> discord.Embed:
        """チャンネル削除のEmbed"""
        embed = discord.Embed(
            title="📁 チャンネル削除",
            color=discord.Color.red(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="チャンネル名",
            value=f"#{channel.name}",
            inline=True
        )
        embed.add_field(
            name="種類",
            value=ServerEmbeds.CHANNEL_TYPE_MAP.get(channel.type, str(channel.type)),
            inline=True
        )

        if hasattr(channel, "category") and channel.category:
            embed.add_field(
                name="カテゴリ",
                value=channel.category.name,
                inline=True
            )

        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def get_channel_changes(
            before: discord.abc.GuildChannel,
            after: discord.abc.GuildChannel
    ) -> list[tuple[str, str, str]]:
        """チャンネルの変更点を取得"""
        changes = []

        if before.name != after.name:
            changes.append(("名前", before.name, after.name))

        if hasattr(before, "topic") and hasattr(after, "topic"):
            if before.topic != after.topic:
                changes.append((
                    "トピック",
                    before.topic or "(なし)",
                    after.topic or "(なし)"
                ))

        if hasattr(before, "slowmode_delay") and hasattr(after, "slowmode_delay"):
            if before.slowmode_delay != after.slowmode_delay:
                changes.append((
                    "低速モード",
                    f"{before.slowmode_delay}秒",
                    f"{after.slowmode_delay}秒"
                ))

        if hasattr(before, "nsfw") and hasattr(after, "nsfw"):
            if before.nsfw != after.nsfw:
                changes.append((
                    "NSFW",
                    "オン" if before.nsfw else "オフ",
                    "オン" if after.nsfw else "オフ"
                ))

        if hasattr(before, "bitrate") and hasattr(after, "bitrate"):
            if before.bitrate != after.bitrate:
                changes.append((
                    "ビットレート",
                    f"{before.bitrate // 1000}kbps",
                    f"{after.bitrate // 1000}kbps"
                ))

        if hasattr(before, "user_limit") and hasattr(after, "user_limit"):
            if before.user_limit != after.user_limit:
                changes.append((
                    "ユーザー制限",
                    str(before.user_limit) if before.user_limit else "無制限",
                    str(after.user_limit) if after.user_limit else "無制限"
                ))

        if before.category != after.category:
            before_cat = before.category.name if before.category else "(なし)"
            after_cat = after.category.name if after.category else "(なし)"
            changes.append(("カテゴリ", before_cat, after_cat))

        return changes

    @staticmethod
    def channel_update(
            channel: discord.abc.GuildChannel,
            changes: list[tuple[str, str, str]]
    ) -> discord.Embed:
        """チャンネル更新のEmbed"""
        embed = discord.Embed(
            title="📁 チャンネル更新",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="チャンネル",
            value=f"{channel.mention}",
            inline=False
        )

        for name, before, after in changes:
            embed.add_field(
                name=name,
                value=f"{before} → {after}",
                inline=False
            )

        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def role_create(role: discord.Role) -> discord.Embed:
        """ロール作成のEmbed"""
        embed = discord.Embed(
            title="🏷️ ロール作成",
            color=role.color if role.color != discord.Color.default() else discord.Color.green(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ロール名",
            value=f"{role.mention} (`{role.name}`)",
            inline=True
        )
        embed.add_field(
            name="色",
            value=str(role.color),
            inline=True
        )
        embed.add_field(
            name="メンション可能",
            value="はい" if role.mentionable else "いいえ",
            inline=True
        )
        embed.add_field(
            name="別枠表示",
            value="はい" if role.hoist else "いいえ",
            inline=True
        )

        embed.set_footer(text=f"ロールID: {role.id}")

        return embed

    @staticmethod
    def role_delete(role: discord.Role) -> discord.Embed:
        """ロール削除のEmbed"""
        embed = discord.Embed(
            title="🏷️ ロール削除",
            color=discord.Color.red(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ロール名",
            value=f"`{role.name}`",
            inline=True
        )
        embed.add_field(
            name="色",
            value=str(role.color),
            inline=True
        )
        embed.add_field(
            name="メンバー数",
            value=f"{len(role.members)}人",
            inline=True
        )

        embed.set_footer(text=f"ロールID: {role.id}")

        return embed

    @staticmethod
    def get_role_changes(
            before: discord.Role,
            after: discord.Role
    ) -> list[tuple[str, str, str]]:
        """ロールの変更点を取得"""
        changes = []

        if before.name != after.name:
            changes.append(("名前", before.name, after.name))

        if before.color != after.color:
            changes.append(("色", str(before.color), str(after.color)))

        if before.hoist != after.hoist:
            changes.append((
                "別枠表示",
                "はい" if before.hoist else "いいえ",
                "はい" if after.hoist else "いいえ"
            ))

        if before.mentionable != after.mentionable:
            changes.append((
                "メンション可能",
                "はい" if before.mentionable else "いいえ",
                "はい" if after.mentionable else "いいえ"
            ))

        if before.permissions != after.permissions:
            # 追加された権限
            added_perms = []
            removed_perms = []
            for perm, value in after.permissions:
                before_value = getattr(before.permissions, perm)
                if value and not before_value:
                    added_perms.append(perm)
                elif not value and before_value:
                    removed_perms.append(perm)

            if added_perms or removed_perms:
                before_text = ", ".join(removed_perms[:5]) if removed_perms else "(なし)"
                after_text = ", ".join(added_perms[:5]) if added_perms else "(なし)"
                if len(added_perms) > 5:
                    after_text += f" 他{len(added_perms) - 5}個"
                if len(removed_perms) > 5:
                    before_text += f" 他{len(removed_perms) - 5}個"
                changes.append(("権限変更", f"削除: {before_text}", f"追加: {after_text}"))

        return changes

    @staticmethod
    def role_update(
            role: discord.Role,
            changes: list[tuple[str, str, str]]
    ) -> discord.Embed:
        """ロール更新のEmbed"""
        embed = discord.Embed(
            title="🏷️ ロール更新",
            color=role.color if role.color != discord.Color.default() else discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ロール",
            value=f"{role.mention}",
            inline=False
        )

        for name, before, after in changes:
            embed.add_field(
                name=name,
                value=f"{before} → {after}",
                inline=False
            )

        embed.set_footer(text=f"ロールID: {role.id}")

        return embed

    @staticmethod
    def get_guild_changes(
            before: discord.Guild,
            after: discord.Guild
    ) -> list[tuple[str, str, str]]:
        """サーバーの変更点を取得"""
        changes = []

        if before.name != after.name:
            changes.append(("サーバー名", before.name, after.name))

        if before.icon != after.icon:
            changes.append(("アイコン", "変更あり", "変更あり"))

        if before.banner != after.banner:
            changes.append(("バナー", "変更あり", "変更あり"))

        if before.description != after.description:
            changes.append((
                "説明",
                before.description or "(なし)",
                after.description or "(なし)"
            ))

        if before.verification_level != after.verification_level:
            level_names = {
                discord.VerificationLevel.none: "なし",
                discord.VerificationLevel.low: "低",
                discord.VerificationLevel.medium: "中",
                discord.VerificationLevel.high: "高",
                discord.VerificationLevel.highest: "最高",
            }
            changes.append((
                "認証レベル",
                level_names.get(before.verification_level, str(before.verification_level)),
                level_names.get(after.verification_level, str(after.verification_level))
            ))

        if before.default_notifications != after.default_notifications:
            notif_names = {
                discord.NotificationLevel.all_messages: "すべてのメッセージ",
                discord.NotificationLevel.only_mentions: "メンションのみ",
            }
            changes.append((
                "デフォルト通知",
                notif_names.get(before.default_notifications, str(before.default_notifications)),
                notif_names.get(after.default_notifications, str(after.default_notifications))
            ))

        if before.afk_channel != after.afk_channel:
            before_afk = before.afk_channel.name if before.afk_channel else "(なし)"
            after_afk = after.afk_channel.name if after.afk_channel else "(なし)"
            changes.append(("AFKチャンネル", before_afk, after_afk))

        if before.afk_timeout != after.afk_timeout:
            changes.append((
                "AFKタイムアウト",
                f"{before.afk_timeout // 60}分",
                f"{after.afk_timeout // 60}分"
            ))

        if before.system_channel != after.system_channel:
            before_sys = before.system_channel.name if before.system_channel else "(なし)"
            after_sys = after.system_channel.name if after.system_channel else "(なし)"
            changes.append(("システムチャンネル", before_sys, after_sys))

        return changes

    @staticmethod
    def guild_update(
            guild: discord.Guild,
            changes: list[tuple[str, str, str]]
    ) -> discord.Embed:
        """サーバー設定更新のEmbed"""
        embed = discord.Embed(
            title="⚙️ サーバー設定変更",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="サーバー",
            value=guild.name,
            inline=False
        )

        for name, before, after in changes:
            embed.add_field(
                name=name,
                value=f"{before} → {after}",
                inline=False
            )

        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)

        embed.set_footer(text=f"サーバーID: {guild.id}")

        return embed
