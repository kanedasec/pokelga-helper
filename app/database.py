import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


def get_database_url() -> str:
    url = settings.database_url
    # Ensure data directory exists for SQLite
    if url.startswith("sqlite"):
        db_path = url.replace("sqlite:////", "/").replace("sqlite:///", "")
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return url


engine = create_engine(
    get_database_url(),
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
