# src/cogs/automod/detectors/new_account_detector.py

from datetime import datetime, timezone
from dataclasses import dataclass

import discord


@dataclass
class NewAccountResult:
    """新規アカウント検出結果"""
    is_new: bool
    account_age_days: int
    created_at: datetime


def check_new_account(
    member: discord.Member,
    threshold_days: int
) -> NewAccountResult:
    """新規アカウントかどうかをチェック"""
    now = datetime.now(timezone.utc)
    created_at = member.created_at
    age_days = (now - created_at).days

    return NewAccountResult(
        is_new=age_days < threshold_days,
        account_age_days=age_days,
        created_at=created_at
    )
