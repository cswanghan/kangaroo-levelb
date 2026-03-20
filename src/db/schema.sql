CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    phone      TEXT,
    role       TEXT    NOT NULL DEFAULT 'user',
    status     TEXT    NOT NULL DEFAULT 'pending',
    invited_by INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    creator_id INTEGER NOT NULL,
    max_uses   INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
