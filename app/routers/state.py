from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.deps import get_current_user

router = APIRouter(prefix="/me/state", tags=["state"])


@router.patch("", response_model=schemas.StateOut)
def update_state(
    body: schemas.StateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    state = db.query(models.PlayerState).filter(
        models.PlayerState.user_id == current_user.id
    ).first()

    if state is None:
        raise HTTPException(404, "Player state not found")

    updates = body.model_dump(exclude_none=True)

    if "pp" in updates:
        updates["pp"] = max(0, min(6, updates["pp"]))
    if "ko_tokens" in updates:
        updates["ko_tokens"] = max(0, min(4, updates["ko_tokens"]))

    for field, value in updates.items():
        setattr(state, field, value)

    db.commit()
    db.refresh(state)
    return schemas.StateOut.model_validate(state)
