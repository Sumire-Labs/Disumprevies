# main.py

import os
import logging
from dotenv import load_dotenv

import discord
from discord.ext import commands

from src.utils.setup_logger import setup_logger

logger = setup_logger()

load_dotenv()

# インテントの設定
intents = discord.Intents.default()
intents.members = True
intents.message_content = True

# 環境変数の読み込み
DISCORD_TOKEN: str = os.getenv("DISCORD_TOKEN")
DEVELOPMENT_GUILD_ID: int = int(os.getenv("DEVELOPMENT_GUILD_ID", "0"))
COMMAND_PREFIX: str = os.getenv("COMMAND_PREFIX", "!")

# Cog の登録
COGS: list[str] = [
    "src.cogs.logger",
    "src.cogs.automod",
    "src.cogs.moderation"
]


class Bot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix=COMMAND_PREFIX,
            intents=intents,
            help_command=None,
        )

    async def setup_hook(self) -> None:
        logger.info("初期化シーケンスを開始します...")

        try:
            logger.info("Cog の登録を開始します")
            if COGS:
                for cog in COGS:
                    await self.load_extension(cog)
                    logger.info(f"{cog} を登録しました")
            else:
                logger.warning("ロードする Cog が設定されていません")
        except Exception as e:
            logger.error(f"Cog の登録に失敗しました: {e}")
            raise
        else:
            logger.success("Cog の登録が完了しました")

        if DEVELOPMENT_GUILD_ID == 0:
            try:
                logger.info("開発用サーバー ID が設定されていないため、グローバルコマンドを登録します")
                synced = await self.tree.sync(guild=None)
                logger.success(f"グローバルコマンドの登録に成功しました。登録されたコマンド数: {len(synced)}")
            except Exception as e:
                logger.error(f"グローバルコマンドの登録に失敗しました: {e}")
                raise
        else:
            try:
                logger.info("開発用サーバー ID が設定されているため、開発用サーバーにコマンドを登録します")
                synced = await self.tree.sync(guild=discord.Object(id=DEVELOPMENT_GUILD_ID))
                logger.success(f"開発用サーバーにコマンドの登録に成功しました。登録されたコマンド数: {len(synced)}")
            except Exception as e:
                logger.error(f"開発用サーバーにコマンドの登録に失敗しました: {e}")
                raise

        logger.success("初期化シーケンスが完了しました")

    async def on_ready(self):
        logger.success(f"{self.user.name}[{self.user.id}] は準備完了しました")


if __name__ == "__main__":
    if DISCORD_TOKEN:
        try:
            bot = Bot()
            bot.run(DISCORD_TOKEN, log_level=logging.ERROR)
        except Exception as e:
            logger.critical(f"Discord Bot の起動に失敗しました: {e}")
            raise
    else:
        logger.error("DISCORD_TOKEN が設定されていません。環境変数を確認してください。")
        raise ValueError("DISCORD_TOKEN が設定されていません。")
