"""End-to-end RLS proof: create two throwaway auth users, give each a
resume_profiles row, impersonate each via SET ROLE + JWT claims, confirm
neither can see the other's row. Deletes both test users (and their data,
via ON DELETE CASCADE) when done, pass or fail.
"""

import json
import pathlib
import urllib.request
import uuid

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


def admin_request(base_url: str, service_key: str, method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        url=f"{base_url}/auth/v1/admin{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def impersonate_and_query(cur, user_id: str) -> list[str]:
    # is_local=false (last arg) -> session-level, survives past the single
    # implicit transaction each statement gets under autocommit.
    cur.execute("set role authenticated;")
    cur.execute(
        "select set_config('request.jwt.claims', %s, false);",
        (json.dumps({"sub": user_id, "role": "authenticated"}),),
    )
    cur.execute("select set_config('request.jwt.claim.sub', %s, false);", (user_id,))
    cur.execute("select auth.uid();")
    resolved_uid = cur.fetchone()[0]
    print(f"    auth.uid() resolved to: {resolved_uid} (expected {user_id})")
    cur.execute("select profile_name from resume_profiles order by profile_name;")
    rows = [r[0] for r in cur.fetchall()]
    cur.execute("reset role;")
    return rows


def main() -> None:
    env = load_env(ROOT / ".env")
    base_url = env["SUPABASE_URL"]
    service_key = env["SUPABASE_SERVICE_ROLE_KEY"]
    db_url = env["SUPABASE_DB_URL"]

    tag = uuid.uuid4().hex[:8]
    user_ids = []
    try:
        for label in ("a", "b"):
            created = admin_request(
                base_url,
                service_key,
                "POST",
                "/users",
                {
                    "email": f"rls-test-{tag}-{label}@example.invalid",
                    "password": uuid.uuid4().hex,
                    "email_confirm": True,
                },
            )
            user_ids.append(created["id"])
        user_a, user_b = user_ids
        print(f"Created test users: a={user_a} b={user_b}")

        with psycopg.connect(db_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "insert into resume_profiles (user_id, profile_name) values (%s, %s);",
                    (user_a, f"Resume-A-{tag}"),
                )
                cur.execute(
                    "insert into resume_profiles (user_id, profile_name) values (%s, %s);",
                    (user_b, f"Resume-B-{tag}"),
                )

                seen_as_a = impersonate_and_query(cur, user_a)
                seen_as_b = impersonate_and_query(cur, user_b)

        print(f"Rows visible as user A: {seen_as_a}")
        print(f"Rows visible as user B: {seen_as_b}")

        ok = (
            seen_as_a == [f"Resume-A-{tag}"]
            and seen_as_b == [f"Resume-B-{tag}"]
        )
        print("PASS: RLS isolates each user's rows" if ok else "FAIL: cross-user leak detected")

    finally:
        for uid in user_ids:
            try:
                admin_request(base_url, service_key, "DELETE", f"/users/{uid}")
                print(f"Cleaned up test user {uid}")
            except Exception as exc:  # noqa: BLE001
                print(f"WARNING: failed to delete test user {uid}: {exc}")


if __name__ == "__main__":
    main()
