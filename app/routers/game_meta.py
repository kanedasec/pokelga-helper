from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user, get_admin_user

router = APIRouter(prefix="/game", tags=["game"])


def _get_or_create_meta(db: Session) -> models.GameMeta:
    meta = db.query(models.GameMeta).filter(models.GameMeta.id == 1).first()
    if meta is None:
        meta = models.GameMeta(id=1)
        db.add(meta)
        db.commit()
        db.refresh(meta)
    return meta


@router.get("", response_model=schemas.GameMetaOut)
def get_game_meta(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_or_create_meta(db)


@router.patch("", response_model=schemas.GameMetaOut)
def update_game_meta(
    body: schemas.GameMetaUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    meta = _get_or_create_meta(db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(meta, field, value)
    db.commit()
    db.refresh(meta)
    return meta


@router.get("/positions")
def board_positions(current_user: models.User = Depends(get_current_user)):
    from app.config import BOARD_POSITIONS
    return {"positions": BOARD_POSITIONS}
