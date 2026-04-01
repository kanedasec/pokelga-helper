from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from app.config import PLAYER_COLORS
from typing import List, Optional

router = APIRouter(prefix="/players", tags=["players"])


def _build_public(user: models.User) -> schemas.PlayerPublicOut:
    return schemas.PlayerPublicOut(
        user_id=user.id,
        username=user.username,
        color=user.color,
        state=schemas.StateOut.model_validate(user.state) if user.state else None,
        pokemon=[schemas.PokemonOut.model_validate(p) for p in user.pokemon],
        badges=[schemas.BadgeOut.model_validate(b) for b in user.badges],
        events=[schemas.EventOut.model_validate(e) for e in user.events],
        item_card_count=len(user.items),
    )


def _build_private(user: models.User) -> schemas.PlayerPrivateOut:
    pub = _build_public(user)
    return schemas.PlayerPrivateOut(
        **pub.model_dump(),
        items=[schemas.ItemOut.model_validate(i) for i in user.items],
    )


def _load_user(db: Session, color: str) -> Optional[models.User]:
    return (
        db.query(models.User)
        .options(
            joinedload(models.User.state),
            joinedload(models.User.pokemon),
            joinedload(models.User.badges),
            joinedload(models.User.items),
            joinedload(models.User.events),
        )
        .filter(models.User.color == color)
        .first()
    )


@router.get("", response_model=List[dict])
def all_players(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns public view of all 6 color slots (empty slots have registered=false)."""
    result = []
    for color in PLAYER_COLORS:
        user = _load_user(db, color)
        if user is None:
            result.append({"color": color, "registered": False})
        else:
            data = _build_public(user).model_dump()
            data["registered"] = True
            result.append(data)
    return result


@router.get("/me", response_model=schemas.PlayerPrivateOut)
def my_full_data(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.color == "admin":
        raise HTTPException(403, "Admin has no player profile")
    user = _load_user(db, current_user.color)
    return _build_private(user)


@router.get("/{color}", response_model=dict)
def player_by_color(
    color: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = _load_user(db, color)
    if user is None:
        raise HTTPException(404, "No player registered with that color")
    if user.id == current_user.id:
        return _build_private(user).model_dump()
    return _build_public(user).model_dump()
