from fastapi import Depends, FastAPI

from app.core.auth import CurrentUser, get_current_user
from app.routers import resumes

app = FastAPI(title="FillRight API")
app.include_router(resumes.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/me", response_model=CurrentUser)
def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
