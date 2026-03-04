from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_community.chat_message_histories import SQLChatMessageHistory
from langchain_core.messages import BaseMessage
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.runnables.utils import ConfigurableFieldSpec
from sqlalchemy.ext.asyncio import create_async_engine
from functools import lru_cache
from typing import Sequence


def _extract_text_content(content) -> str:
    """将 LangChain 的 content（str 或 list[dict]）统一转为纯文本"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, str):
                parts.append(part)
        return "".join(parts)
    return str(content)

def _normalize_content(content) -> str:
    """将 LangChain content（str 或 list[dict]）转为纯文本"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, str):
                parts.append(part)
        return "".join(parts)
    return str(content)


class NormalizedSQLChatMessageHistory(SQLChatMessageHistory):
    """存储前将 AI 回复的 content 规范化为纯文本"""

    def add_message(self, message: BaseMessage) -> None:
        message.content = _normalize_content(message.content)
        super().add_message(message)

    async def aadd_messages(self, messages: Sequence[BaseMessage]) -> None:
        for msg in messages:
            msg.content = _normalize_content(msg.content)
        await super().aadd_messages(messages)


prompt = ChatPromptTemplate.from_messages(
    [
        ("system", "{system_prompt}"),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}"),
    ]
)


def get_session_history(char_id: str, session_id: str):
    from config import ARCHIVE_DIR
    engine = create_async_engine(f"sqlite+aiosqlite:///{ARCHIVE_DIR}/{char_id}.db")
    return NormalizedSQLChatMessageHistory(session_id=session_id, connection=engine)


@lru_cache(maxsize=4)
def get_runnable_with_history(model_type: str, model_id: str, api_key: str):
    from model.factory import LLMFactory
    
    llm = LLMFactory.create(model_type=model_type, model_id=model_id, api_key=api_key)

    chain = prompt | llm

    return RunnableWithMessageHistory(
        chain,
        get_session_history,
        input_messages_key="input",
        history_messages_key="history",
        history_factory_config=[
            ConfigurableFieldSpec(
                id="char_id",
                annotation=str,
                name="Character ID",
                description="The character ID for the chat history",
                default="",
                is_shared=True,
            ),
            ConfigurableFieldSpec(
                id="session_id",
                annotation=str,
                name="Session ID",
                description="The session ID for the chat history",
                default="",
                is_shared=True,
            ),
        ],
    )
