# src/core/database/init_tables.py

from .connection import Database

INIT_SQL = """
-- サーバーごとの基本設定
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id BIGINT PRIMARY KEY,
    point_expiry_days INT DEFAULT 30,
    log_retention_days INT DEFAULT 30,
    mute_role_id BIGINT,
    spam_count INT DEFAULT 5,
    spam_seconds INT DEFAULT 5,
    mention_limit INT DEFAULT 10,
    new_account_days INT DEFAULT 7,
    raid_count INT DEFAULT 10,
    raid_seconds INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 違反種別とポイント定義
CREATE TABLE IF NOT EXISTS violation_types (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    default_points INT NOT NULL,
    expiry_days INT,
    UNIQUE(guild_id, name)
);

-- 違反履歴
CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    violation_type_id INT REFERENCES violation_types(id),
    points INT NOT NULL,
    reason TEXT,
    message_id BIGINT,
    channel_id BIGINT,
    moderator_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by BIGINT,
    deleted_at TIMESTAMP
);

-- 処分履歴
CREATE TABLE IF NOT EXISTS punishments (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL,
    reason TEXT,
    duration_minutes INT,
    total_points INT,
    moderator_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- NGワードリスト
CREATE TABLE IF NOT EXISTS ngwords (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    word VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, word)
);

-- 検出除外ロール
CREATE TABLE IF NOT EXISTS whitelist_roles (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, role_id)
);

-- 検出除外チャンネル
CREATE TABLE IF NOT EXISTS whitelist_channels (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    channel_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, channel_id)
);

-- ログ出力先設定
CREATE TABLE IF NOT EXISTS log_settings (
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    log_type VARCHAR(30) NOT NULL,
    channel_id BIGINT,
    is_enabled BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (guild_id, log_type)
);

-- ログ除外対象
CREATE TABLE IF NOT EXISTS log_ignores (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    target_type VARCHAR(10) NOT NULL,
    target_id BIGINT NOT NULL,
    UNIQUE(guild_id, target_type, target_id)
);

-- メッセージログ
CREATE TABLE IF NOT EXISTS message_logs (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    content VARCHAR(500),
    has_attachments BOOLEAN DEFAULT FALSE,
    event_type VARCHAR(20) NOT NULL,
    reason VARCHAR(30),
    created_at TIMESTAMP NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(guild_id, user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_violations_expires ON violations(expires_at) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_punishments_active ON punishments(guild_id, user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_message_logs_guild_user ON message_logs(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ngwords_guild ON ngwords(guild_id);
"""


async def init_tables() -> None:
    """全テーブルを初期化"""
    pool = Database.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(INIT_SQL)
