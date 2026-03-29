from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class RoleEnum(str, Enum):
    admin = "admin"
    operator = "operator"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)
    role: RoleEnum = RoleEnum.operator


class UserUpdate(BaseModel):
    role: RoleEnum | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    role: RoleEnum
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class VoiceRecordCreateResult(BaseModel):
    raw_transcript: str
    parsed_command: str | None
    parsed_identifier: str | None


class VoiceRecordOut(BaseModel):
    id: int
    user_id: int
    username: str | None = None
    audio_url: str
    raw_transcript: str
    parsed_command: str | None
    parsed_identifier: str | None
    confirmed_transcript: str | None
    is_confirmed: bool
    operator_confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VoiceRecordConfirm(BaseModel):
    confirmed_transcript: str = Field(min_length=1)
    parsed_command: str | None = None
    parsed_identifier: str | None = None


class VoiceRecordListFilter(BaseModel):
    command: str | None = None
    identifier: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    operator_id: int | None = None
