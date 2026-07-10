"""Apply supabase/migrations/*.sql (and optionally seed.sql) to SUPABASE_DB_URL.

Usage:
    py supabase/apply_migrations.py [--seed]
    py supabase/apply_migrations.py 0003_grants.sql   # apply specific file(s) only

Reads SUPABASE_DB_URL from the repo-root .env file. One-off tool for local/dev
use until this project has a real migration runner (Supabase CLI, alembic, etc).
"""

import pathlib
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_env(path: pathlib.Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def main() -> None:
    env = load_env(ROOT / ".env")
    db_url = env.get("SUPABASE_DB_URL", "")
    if not db_url or "[YOUR-PASSWORD]" in db_url:
        print("SUPABASE_DB_URL is missing or not filled in .env", file=sys.stderr)
        sys.exit(1)

    migrations_dir = ROOT / "supabase" / "migrations"
    explicit = [a for a in sys.argv[1:] if a != "--seed"]
    if explicit:
        files = [migrations_dir / name for name in explicit]
    else:
        files = sorted(migrations_dir.glob("*.sql"))
    if not files:
        print("No migration files found.", file=sys.stderr)
        sys.exit(1)

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            for f in files:
                print(f"Applying {f.relative_to(ROOT)} ...")
                cur.execute(f.read_text())

            if "--seed" in sys.argv:
                seed_file = ROOT / "supabase" / "seed.sql"
                print(f"Applying {seed_file.relative_to(ROOT)} ...")
                cur.execute(seed_file.read_text())

        conn.commit()

    print("Done.")


if __name__ == "__main__":
    main()
