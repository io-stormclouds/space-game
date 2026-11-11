-- Plan 02 §7, R-26: the server's state in PostgreSQL. JSON as the server writes it, in `json`
-- columns (not `jsonb`): the text is kept as written, so every float comes back bit for bit and a
-- restored world replays exactly as from files.

CREATE TABLE accounts (
    id           text PRIMARY KEY,
    callsign_key text NOT NULL UNIQUE,
    account      json NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- only the hash of a session token (BLAKE2s); Unix seconds
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created    bigint NOT NULL,
    expires    bigint NOT NULL
);
CREATE INDEX sessions_expires ON sessions (expires);

-- a world's checkpoint (the whole save file and the step state), and what happened after it
CREATE TABLE world_snapshots (
    world_id    text PRIMARY KEY,
    saved_at_ms double precision NOT NULL,
    stored      json NOT NULL
);

CREATE TABLE world_log (
    world_id text NOT NULL,
    seq      bigserial NOT NULL,
    entry    json NOT NULL,
    PRIMARY KEY (world_id, seq)
);

-- the galaxy service's market (one row); tables per order and shipment come with SQL transactions
CREATE TABLE galaxy_state (
    id       integer PRIMARY KEY CHECK (id = 1),
    state    json NOT NULL,
    saved_at timestamptz NOT NULL DEFAULT now()
);
