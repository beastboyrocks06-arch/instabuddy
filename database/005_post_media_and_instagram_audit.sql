ALTER TABLE videos ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'VIDEO';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'video/mp4';

ALTER TABLE posts ALTER COLUMN video_id DROP NOT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'REEL';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS container_items text[] NOT NULL DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_fingerprint text;

UPDATE posts SET media_fingerprint = video_id::text WHERE media_fingerprint IS NULL AND video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS posts_media_dedupe
  ON posts(media_fingerprint, account_id, run_at) WHERE status <> 'CANCELLED' AND media_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_media (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES videos(id),
  position integer NOT NULL,
  PRIMARY KEY (post_id, position),
  UNIQUE (post_id, media_id)
);

CREATE INDEX IF NOT EXISTS post_media_media_id_idx ON post_media(media_id);
CREATE INDEX IF NOT EXISTS audit_action_at_idx ON audit(action, at DESC);
