from datetime import datetime

import discord


class VoiceEmbeds:
    """ボイスチャンネル関連のEmbed生成"""

    @staticmethod
    def voice_join(
        member: discord.Member,
        channel: discord.VoiceChannel
    ) -> discord.Embed:
        """VC参加のEmbed"""
        embed = discord.Embed(
            title="🔊 VC参加",
            color=discord.Color.green(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="チャンネル",
            value=f"🔊 {channel.name}",
            inline=True
        )
        embed.add_field(
            name="参加人数",
            value=f"{len(channel.members)}人",
            inline=True
        )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def voice_leave(
        member: discord.Member,
        channel: discord.VoiceChannel
    ) -> discord.Embed:
        """VC退出のEmbed"""
        embed = discord.Embed(
            title="🔇 VC退出",
            color=discord.Color.orange(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="チャンネル",
            value=f"🔊 {channel.name}",
            inline=True
        )
        embed.add_field(
            name="残り人数",
            value=f"{len(channel.members)}人",
            inline=True
        )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"チャンネルID: {channel.id}")

        return embed

    @staticmethod
    def voice_move(
        member: discord.Member,
        before: discord.VoiceChannel,
        after: discord.VoiceChannel
    ) -> discord.Embed:
        """VC移動のEmbed"""
        embed = discord.Embed(
            title="🔀 VC移動",
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )
        embed.add_field(
            name="移動元",
            value=f"🔊 {before.name}",
            inline=True
        )
        embed.add_field(
            name="移動先",
            value=f"🔊 {after.name}",
            inline=True
        )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed

    @staticmethod
    def voice_mute(
        member: discord.Member,
        muted: bool,
        by_server: bool = True
    ) -> discord.Embed:
        """VCミュートのEmbed"""
        if muted:
            title = "🔇 サーバーミュート" if by_server else "🔇 自己ミュート"
            color = discord.Color.orange()
        else:
            title = "🔊 サーバーミュート解除" if by_server else "🔊 自己ミュート解除"
            color = discord.Color.green()

        embed = discord.Embed(
            title=title,
            color=color,
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )

        if member.voice and member.voice.channel:
            embed.add_field(
                name="チャンネル",
                value=f"🔊 {member.voice.channel.name}",
                inline=True
            )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed

    @staticmethod
    def voice_deafen(
        member: discord.Member,
        deafened: bool,
        by_server: bool = True
    ) -> discord.Embed:
        """VCスピーカーミュートのEmbed"""
        if deafened:
            title = "🔇 サーバースピーカーミュート" if by_server else "🔇 自己スピーカーミュート"
            color = discord.Color.orange()
        else:
            title = "🔊 サーバースピーカーミュート解除" if by_server else "🔊 自己スピーカーミュート解除"
            color = discord.Color.green()

        embed = discord.Embed(
            title=title,
            color=color,
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="ユーザー",
            value=f"{member.mention} (`{member.id}`)",
            inline=True
        )

        if member.voice and member.voice.channel:
            embed.add_field(
                name="チャンネル",
                value=f"🔊 {member.voice.channel.name}",
                inline=True
            )

        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"ユーザーID: {member.id}")

        return embed
