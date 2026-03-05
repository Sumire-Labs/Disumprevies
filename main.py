# main.py

import os
import logging
from dotenv import load_dotenv

import discord
from discord.ext import commands

from src.core.database import Database, init_tables
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

# データベース設定
POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB: str = os.getenv("POSTGRES_DB")
POSTGRES_USER: str = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD")

DATABASE_URL: str = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

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

        # データベース接続
        try:
            logger.info("データベースに接続します...")
            await Database.connect(DATABASE_URL)
            logger.success("データベースに接続しました")
        except Exception as e:
            logger.error(f"データベース接続に失敗しました: {e}")
            raise

        # テーブル初期化
        try:
            logger.info("テーブルを初期化します...")
            await init_tables()
            logger.success("テーブルの初期化が完了しました")
        except Exception as e:
            logger.error(f"テーブル初期化に失敗しました: {e}")
            raise

        # Cog の登録
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

        # コマンド同期
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

    async def close(self) -> None:
        """Bot終了時にデータベース接続を切断"""
        logger.info("データベース接続を切断します...")
        await Database.close()
        logger.success("データベース接続を切断しました")
        await super().close()

    async def on_ready(self):
        logger.success(f"{self.user.name}[{self.user.id}] は準備完了しました")


def validate_env() -> None:
    """環境変数のバリデーション"""
    if not DISCORD_TOKEN:
        logger.error("DISCORD_TOKEN が設定されていません")
        raise ValueError("DISCORD_TOKEN が設定されていません")

    if not POSTGRES_DB:
        logger.error("POSTGRES_DB が設定されていません")
        raise ValueError("POSTGRES_DB が設定されていません")

    if not POSTGRES_USER:
        logger.error("POSTGRES_USER が設定されていません")
        raise ValueError("POSTGRES_USER が設定されていません")

    if not POSTGRES_PASSWORD:
        logger.error("POSTGRES_PASSWORD が設定されていません")
        raise ValueError("POSTGRES_PASSWORD が設定されていません")


if __name__ == "__main__":
    validate_env()

    try:
        bot = Bot()
        bot.run(DISCORD_TOKEN, log_level=logging.ERROR)
    except Exception as e:
        logger.critical(f"Discord Bot の起動に失敗しました: {e}")
        raise
