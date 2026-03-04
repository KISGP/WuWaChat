from pydantic import BaseModel
from typing import List, Optional

class PromptUpdateRequest(BaseModel):
    prompt: Optional[str] = None


class TestConnectionRequest(BaseModel):
    model_type: str
    model_id: str
    api_key: Optional[str] = None
class ChatRequest(BaseModel):
    # 用户发送的消息
    message: str
    model_type: str
    model_id: str
    api_key: str


class Message(BaseModel):
    type: str
    content: str


class ChatHistory(BaseModel):
    session_id: str
    char_id: str
    messages: List[Message]


class SessionInfo(BaseModel):
    session_id: str
    char_id: str
    last_message: Message
    message_count: int


class CharacterSessions(BaseModel):
    char_id: str
    sessions: List[SessionInfo]


class AllSessionsGroupedResponse(BaseModel):
    characters: List[CharacterSessions]
