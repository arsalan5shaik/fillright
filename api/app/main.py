from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.auth import CurrentUser, get_current_user
from app.routers import answers, resumes

app = FastAPI(title="FillRight API")
app.add_middleware(
    CORSMiddleware,
    # Local dev origins only for now — add the deployed Vercel URL here once
    # the website is actually deployed.
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(resumes.router)
app.include_router(answers.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/me", response_model=CurrentUser)
def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
