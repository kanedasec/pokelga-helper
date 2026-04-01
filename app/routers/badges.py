from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user
from typing import List

router = APIRouter(prefix="/me/badges", tags=["badges"])


def _evaluate_gym_unlocks(db: Session):
    """Check all players' badges and update game meta gym unlock flags."""
    meta = db.query(models.GameMeta).filter(models.GameMeta.id == 1).first()
    if meta is None:
        return

    # Saffron unlocked when any player has Soul badge (Koga)
    if not meta.saffron_gym_unlocked:
        soul_earned = db.query(models.Badge).filter(
            models.Badge.badge_name == "soul",
            models.Badge.earned == True
        ).first()
        if soul_earned:
            meta.saffron_gym_unlocked = True

    # Viridian gym unlocked when any player has Volcano badge (Blaine)
    if not meta.viridian_gym_unlocked:
        volcano_earned = db.query(models.Badge).filter(
            models.Badge.badge_name == "volcano",
            models.Badge.earned == True
        ).first()
        if volcano_earned:
            meta.viridian_gym_unlocked = True

    # Victory Road unlocked when any player has Earth badge (Giovanni)
    if not meta.victory_road_unlocked:
        earth_earned = db.query(models.Badge).filter(
            models.Badge.badge_name == "earth",
            models.Badge.earned == True
        ).first()
        if earth_earned:
            meta.victory_road_unlocked = True

    db.flush()


@router.get("", response_model=List[schemas.BadgeOut])
def list_badges(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Badge).filter(
        models.Badge.user_id == current_user.id
    ).all()


@router.patch("/{badge_name}", response_model=schemas.BadgeOut)
def toggle_badge(
    badge_name: str,
    body: schemas.BadgeToggle,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    badge = db.query(models.Badge).filter(
        models.Badge.user_id == current_user.id,
        models.Badge.badge_name == badge_name,
    ).first()
    if badge is None:
        raise HTTPException(404, "Badge not found")

    badge.earned = body.earned
    badge.earned_at = datetime.now(timezone.utc) if body.earned else None

    db.flush()  # flush before querying badges in _evaluate_gym_unlocks
    _evaluate_gym_unlocks(db)
    db.commit()
    db.refresh(badge)
    return badge
