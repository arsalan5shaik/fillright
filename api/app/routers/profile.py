from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import CurrentUser, get_current_user
from app.core.security import decrypt_value, encrypt_value
from app.db.postgrest import user_scoped_client
from app.schemas.profile import WorkdayCredentialsIn, WorkdayCredentialsOut

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/workday-credentials", response_model=WorkdayCredentialsOut)
def get_workday_credentials(user: CurrentUser = Depends(get_current_user)) -> WorkdayCredentialsOut:
    with user_scoped_client(user.access_token) as client:
        resp = client.get(
            "/workday_credentials",
            params={"select": "email,encrypted_password", "user_id": f"eq.{user.id}"},
        )
        resp.raise_for_status()
        rows = resp.json()

    if not rows:
        return WorkdayCredentialsOut(email=None, password=None)

    row = rows[0]
    password = decrypt_value(row["encrypted_password"]) if row["encrypted_password"] else None
    return WorkdayCredentialsOut(email=row["email"], password=password)


@router.put("/workday-credentials", response_model=WorkdayCredentialsOut)
def set_workday_credentials(
    body: WorkdayCredentialsIn, user: CurrentUser = Depends(get_current_user)
) -> WorkdayCredentialsOut:
    encrypted = encrypt_value(body.password)
    with user_scoped_client(user.access_token) as client:
        resp = client.post(
            "/workday_credentials",
            params={"on_conflict": "user_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json={"user_id": user.id, "email": body.email, "encrypted_password": encrypted},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Failed to save credentials: {resp.text}")

    return WorkdayCredentialsOut(email=body.email, password=body.password)
