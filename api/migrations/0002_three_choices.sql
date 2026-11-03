CREATE TABLE questions_three_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 10 AND 500),
  options TEXT NOT NULL CHECK (json_valid(options) AND json_array_length(options) = 3),
  answer_index INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 2),
  explanation TEXT NOT NULL,
  category TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO questions_three_choices (id, prompt, options, answer_index, explanation, category, position, created_at, updated_at)
SELECT
  id,
  prompt,
  json_array(json_extract(options, '$[0]'), json_extract(options, '$[1]'), json_extract(options, '$[2]')),
  answer_index,
  explanation,
  category,
  position,
  created_at,
  updated_at
FROM questions;

DROP TABLE questions;
ALTER TABLE questions_three_choices RENAME TO questions;
CREATE INDEX questions_position_idx ON questions(position, id);
