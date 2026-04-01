from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey, DateTime, Text, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from app.config import PLAYER_COLORS


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    color = Column(String(10), unique=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    state = relationship("PlayerState", back_populates="user", uselist=False, cascade="all, delete-orphan")
    pokemon = relationship("Pokemon", back_populates="user", cascade="all, delete-orphan")
    badges = relationship("Badge", back_populates="user", cascade="all, delete-orphan")
    items = relationship("ItemCard", back_populates="user", cascade="all, delete-orphan")
    events = relationship("EventCard", back_populates="user", cascade="all, delete-orphan")


class PlayerState(Base):
    __tablename__ = "player_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    pp = Column(Integer, default=1)
    board_position = Column(String(100), default="Pallet Town")
    ko_tokens = Column(Integer, default=0)
    tree_tokens = Column(Integer, default=0)
    boulder_tokens = Column(Integer, default=0)
    title_card_name = Column(String(100), nullable=True)
    title_card_vp = Column(Integer, default=0)
    notes = Column(Text, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="state")


class Pokemon(Base):
    __tablename__ = "pokemon"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    deck_color = Column(String(10), default="green")  # green, blue, red
    level_up_counters = Column(Integer, default=0)
    is_ko = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)
    in_storage = Column(Boolean, default=False)
    printed_atk_pwr = Column(Integer, default=0)
    evolves_from_id = Column(Integer, ForeignKey("pokemon.id", ondelete="SET NULL"), nullable=True)
    slot_order = Column(Integer, default=0)

    user = relationship("User", back_populates="pokemon")
    evolves_from = relationship("Pokemon", remote_side=[id], foreign_keys=[evolves_from_id])


class Badge(Base):
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    badge_name = Column(String(50), nullable=False)   # boulder, cascade, etc.
    display_name = Column(String(100), nullable=False)
    gym_leader = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    earned = Column(Boolean, default=False)
    earned_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="badges")


class ItemCard(Base):
    __tablename__ = "item_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    card_type = Column(String(20), default="field")  # battle, field, poke_ball
    value = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="items")


class EventCard(Base):
    __tablename__ = "event_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    effect_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="events")


class GameMeta(Base):
    __tablename__ = "game_meta"

    id = Column(Integer, primary_key=True, default=1)
    saffron_gym_unlocked = Column(Boolean, default=False)
    viridian_gym_unlocked = Column(Boolean, default=False)
    victory_road_unlocked = Column(Boolean, default=False)
    game_ended = Column(Boolean, default=False)
    winner_color = Column(String(10), nullable=True)
    game_status = Column(String(20), default="setup")   # setup | active | ended
    game_number = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameResult(Base):
    __tablename__ = "game_results"

    id = Column(Integer, primary_key=True, index=True)
    game_number = Column(Integer, nullable=False)
    ended_at = Column(DateTime(timezone=True), server_default=func.now())
    results_json = Column(Text, nullable=False)
