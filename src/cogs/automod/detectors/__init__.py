# src\cogs\automod\detectors\__init__.py
from .base import DetectionResult, is_whitelisted
from .spam_detector import detect_spam
from .duplicate_detector import detect_duplicate
from .ngword_detector import detect_ngword
from .mention_detector import detect_mention
from .invite_detector import detect_invite
from .link_detector import detect_link

__all__ = [
    "DetectionResult",
    "is_whitelisted",
    "detect_spam",
    "detect_duplicate",
    "detect_ngword",
    "detect_mention",
    "detect_invite",
    "detect_link",
]
