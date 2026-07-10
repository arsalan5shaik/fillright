"""Read-only sanity check of the applied schema: tables, RLS status, policies, seed data."""

import pathlib

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
    db_url = env["SUPABASE_DB_URL"]

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            print("=== Tables + RLS enabled ===")
            cur.execute(
                """
                select c.relname, c.relrowsecurity
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                order by c.relname;
                """
            )
            for name, rls in cur.fetchall():
                print(f"  {name:<25} rls_enabled={rls}")

            print("\n=== Policies per table ===")
            cur.execute(
                """
                select tablename, policyname, cmd
                from pg_policies
                where schemaname = 'public'
                order by tablename, policyname;
                """
            )
            for table, policy, cmd in cur.fetchall():
                print(f"  {table:<25} {policy:<35} ({cmd})")

            print("\n=== common_questions seed ===")
            cur.execute(
                "select count(*), count(*) filter (where is_sensitive) from common_questions;"
            )
            total, sensitive = cur.fetchone()
            print(f"  total={total} sensitive={sensitive}")

            print("\n=== pgvector extension + embedding index ===")
            cur.execute("select extname, extversion from pg_extension where extname = 'vector';")
            print(f"  {cur.fetchone()}")
            cur.execute(
                "select indexname from pg_indexes where tablename = 'answer_bank' and indexname like '%embedding%';"
            )
            print(f"  {cur.fetchone()}")


if __name__ == "__main__":
    main()
