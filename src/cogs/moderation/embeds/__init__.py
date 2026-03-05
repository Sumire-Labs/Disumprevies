# src/cogs/moderation/embeds/__init__.py

from .infractions_embed import create_infractions_embed
from .result_embed import create_result_embed

__all__ = [
    "create_infractions_embed",
    "create_result_embed",
]
