from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, auth as auth_utils
from app.deps import get_current_user
from app.config import PLAYER_COLORS, BADGES
from app.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


def _seed_player(db: Session, user: models.User):
    """Create default state + all 8 badge rows for a new user."""
    db.add(models.PlayerState(user_id=user.id))
    for b in BADGES:
        db.add(models.Badge(
            user_id=user.id,
            badge_name=b["name"],
            display_name=b["display"],
            gym_leader=b["gym_leader"],
            city=b["city"],
        ))
    db.flush()


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not auth_utils.verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    token = auth_utils.create_access_token(user.id, user.color, user.username, user.is_admin)
    return schemas.TokenResponse(
        access_token=token, color=user.color,
        username=user.username, user_id=user.id, is_admin=user.is_admin
    )


@router.get("/me")
def me(current_user: models.User = Depends(get_current_user)):
    return {"user_id": current_user.id, "username": current_user.username, "color": current_user.color}


@router.get("/available-colors")
def available_colors(db: Session = Depends(get_db)):
    taken = {u.color for u in db.query(models.User.color).filter(models.User.color != "admin").all()}
    return {
        "colors": [
            {"color": c, "taken": c in taken}
            for c in PLAYER_COLORS
        ]
    }
