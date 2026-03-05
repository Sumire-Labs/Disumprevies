# src\cogs\logger\embeds\message_embeds.py
from datetime import datetime
from typing import Optional

import discord


class MessageEmbeds:
    """メッセージ関連のEmbed生成"""

    @staticmethod
    def message_delete(
        message: discord.Message,
        executor: Optional[discord.Member] = None
    ) -> discord.Embed:
        """メッセージ削除のEmbed"""
        embed = discord.Embed(
            title="🗑️ メッセージ削除",
            color=discord.Color.red(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="送信者",
            value=f"{message.author.mention} (`{message.author.id}`)",
            inline=True
        )
        embed.add_field(
            name="チャンネル",
            value=f"{message.channel.mention}",
            inline=True
        )

        if executor:
            embed.add_field(
                name="削除者",
                value=executor.mention,
                inline=True
            )

        if message.content:
            content = message.content[:1000]
            if len(message.content) > 1000:
                content += "..."
            embed.add_field(
                name="内容",
                value=content,
                inline=False
            )

        if message.attachments:
            attachment_info = "\n".join([
                f"[{a.filename}]({a.url})" for a in message.attachments
            ])
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
    def message_bulk_delete(
        channel: discord.TextChannel,
        messages: list[discord.Message],
        executor: Optional[discord.Member] = None
    ) -> discord.Embed:
        """一括メッセージ削除のEmbed"""
        embed = discord.Embed(
            title="🗑️ メッセージ一括削除",
            color=discord.Color.dark_red(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="チャンネル",
            value=channel.mention,
            inline=True
        )
        embed.add_field(
            name="削除件数",
            value=f"{len(messages)}件",
            inline=True
        )

        if executor:
            embed.add_field(
                name="実行者",
                value=executor.mention,
                inline=True
            )

        # 削除されたメッセージの送信者をカウント
        authors: dict[int, dict[str, any]] = {}
        for msg in messages:
            author_id = msg.author.id
            if author_id not in authors:
                authors[author_id] = {"name": str(msg.author), "count": 0}
            authors[author_id]["count"] += 1

        if authors:
            author_list = "\n".join([
                f"{data['name']}: {data['count']}件"
                for data in sorted(authors.values(), key=lambda x: x["count"], reverse=True)[:10]
            ])
            embed.add_field(
                name="送信者別件数",
                value=author_list,
                inline=False
            )

        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def message_edit(
        before: discord.Message,
        after: discord.Message
    ) -> discord.Embed:
        """メッセージ編集のEmbed"""
        embed = discord.Embed(
            title="✏️ メッセージ編集",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="送信者",
            value=f"{after.author.mention} (`{after.author.id}`)",
            inline=True
        )
        embed.add_field(
            name="チャンネル",
            value=f"{after.channel.mention}",
            inline=True
        )
        embed.add_field(
            name="メッセージリンク",
            value=f"[ジャンプ]({after.jump_url})",
            inline=True
        )

        before_content = before.content[:500] if before.content else "(なし)"
        if len(before.content or "") > 500:
            before_content += "..."
        embed.add_field(
            name="編集前",
            value=before_content,
            inline=False
        )

        after_content = after.content[:500] if after.content else "(なし)"
        if len(after.content or "") > 500:
            after_content += "..."
        embed.add_field(
            name="編集後",
            value=after_content,
            inline=False
        )

        embed.set_author(
            name=str(after.author),
            icon_url=after.author.display_avatar.url
        )
        embed.set_footer(text=f"メッセージID: {after.id}")

        return embed
