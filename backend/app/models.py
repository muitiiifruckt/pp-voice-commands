import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x], native_enum=False),
        default=UserRole.operator,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    voice_records: Mapped[list["VoiceRecord"]] = relationship("VoiceRecord", back_populates="user")


class VoiceRecord(Base):
    __tablename__ = "voice_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    audio_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_transcript: Mapped[str] = mapped_column(Text, default="", nullable=False)
    parsed_command: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parsed_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True)
    confirmed_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    operator_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user: Mapped["User"] = relationship("User", back_populates="voice_records")
