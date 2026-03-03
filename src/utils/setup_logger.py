# src/utils/setup_logger.py

from loguru import logger
from rich.logging import RichHandler
import os


def setup_logger():
    logger.remove()

    # 1. コンソール出力
    logger.add(
        RichHandler(rich_tracebacks=True, markup=True),
        format="{message}",
        level="INFO"
    )

    # 2. ファイル出力 (Loguru標準)
    if not os.path.exists("logs"):
        os.makedirs("logs")

    logger.add(
        "logs/bot.log",
        rotation="1 MB",
        retention="10 days",
        compression="zip",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG",
        encoding="utf-8"
    )

    return logger