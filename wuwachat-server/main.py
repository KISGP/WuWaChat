import sys
import json
import asyncio
import sqlite3
import logging
from logging.handlers import RotatingFileHandler
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from model.chain import (
    get_runnable_with_history,
    get_session_history,
    _extract_text_content,
)
from utils.char import load_characters
from config import (
    RESOURCE_DIR,
    PROMPT_DIR,
    ARCHIVE_DIR,
    CHAR_YAML,
    RESOURCE_URL,
    LOG_FILE,
)
from type import (
    ChatRequest,
    ChatHistory,
    Message,
    SessionInfo,
    CharacterSessions,
    AllSessionsGroupedResponse,
    PromptUpdateRequest,
    TestConnectionRequest,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        RotatingFileHandler(
            LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
        ),
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger("wuwachat")
logger.propagate = False

# 统一 uvicorn 的日志格式和出口
class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find('"GET / HTTP/1.1" 200') == -1

for name in ["uvicorn.error", "uvicorn.access"]:
    uvicorn_logger = logging.getLogger(name)
    uvicorn_logger.handlers = logger.root.handlers
    uvicorn_logger.propagate = False
    
    if name == "uvicorn.access":
        uvicorn_logger.addFilter(HealthCheckFilter())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.mount("/resource", StaticFiles(directory=str(RESOURCE_DIR)), name="resource")


# 聊天接口，支持流式返回 AI 回复
@app.post("/chat/{char_id}/{session_id}")
async def chat(char_id: str, session_id: str, request: Request, chat_req: ChatRequest):
    from fastapi.responses import StreamingResponse
    from utils.prompt import get_system_prompt

    user_message = chat_req.message
    model_type = chat_req.model_type
    model_id = chat_req.model_id
    api_key = chat_req.api_key

    if (
        not char_id
        or not session_id
        or not user_message
        or not model_type
        or not model_id
    ):
        raise HTTPException(status_code=400)

    system_prompt = get_system_prompt(char_id)

    model = get_runnable_with_history(
        model_type=model_type, model_id=model_id, api_key=api_key
    )

    # 流式生成回答
    async def generate():
        try:
            async for chunk in model.astream(
                {"input": user_message, "system_prompt": system_prompt},
                config={"configurable": {"char_id": char_id, "session_id": session_id}},
            ):
                if await request.is_disconnected():
                    print(f"Client disconnected, stopping generation")
                    break

                # LangChain chunk 处理 — content 可能是 str 或 list[dict]
                if chunk.content:
                    content = chunk.content
                    if isinstance(content, list):
                        # Gemini 等返回 [{'type': 'text', 'text': '...'}, ...]
                        parts = []
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                parts.append(part.get("text", ""))
                            elif isinstance(part, str):
                                parts.append(part)
                        content = "".join(parts)
                    if content:
                        yield content
        except asyncio.CancelledError:
            pass
        except Exception as e:
            yield f"Error: {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


# 获取指定会话的聊天历史记录
@app.get("/history/{char_id}/{session_id}", response_model=ChatHistory)
async def get_chat_history(char_id: str, session_id: str):
    """
    获取指定会话的聊天历史记录
    """
    if not char_id or not session_id:
        raise HTTPException(status_code=400, detail="char_id 和 session_id 都不能为空")

    try:
        history = get_session_history(char_id, session_id)
        messages = await history.aget_messages()

        # 将 LangChain 消息转换为 Message 对象
        message_list = []
        for msg in messages:
            message_list.append(
                Message(type=msg.type, content=_extract_text_content(msg.content))
            )

        return ChatHistory(
            session_id=session_id, char_id=char_id, messages=message_list
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取聊天历史失败: {str(e)}")


# 按角色分类获取所有会话及其最后一条聊天消息
@app.get("/sessions", response_model=AllSessionsGroupedResponse)
async def get_all_chat_sessions_grouped():
    """
    按角色分类获取所有会话及其最后一条聊天消息
    返回格式：[{char_id, sessions: [...]}, ...]
    """
    grouped_sessions = {}

    if not ARCHIVE_DIR.exists():
        return []

    # 遍历所有 .db 文件
    for db_file in ARCHIVE_DIR.glob("*.db"):
        char_id = db_file.stem  # 获取文件名（不含扩展名）
        sessions_for_char = []

        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()

            # 获取所有 session_id 和对应的最后一条消息，按最后修改时间排序
            cursor.execute(
                """
                SELECT 
                    session_id, 
                    message,
                    COUNT(*) as message_count
                FROM message_store
                GROUP BY session_id
                ORDER BY MAX(id) DESC
            """
            )

            results = cursor.fetchall()
            for session_id, last_message_json, message_count in results:
                try:
                    msg_data = json.loads(last_message_json)
                    # 提取消息类型和内容
                    msg_type = msg_data.get("type", "unknown")
                    # AIMessageChunk 和 HumanMessageChunk 中的内容在 data.content
                    if "data" in msg_data:
                        content = msg_data["data"].get("content", "")
                    else:
                        content = msg_data.get("content", "")
                    content = _extract_text_content(content)

                    sessions_for_char.append(
                        SessionInfo(
                            session_id=session_id,
                            char_id=char_id,
                            last_message=Message(type=msg_type, content=content),
                            message_count=message_count,
                        )
                    )
                except Exception:
                    pass

            conn.close()

            if sessions_for_char:
                grouped_sessions[char_id] = sessions_for_char

        except Exception as e:
            print(f"Error reading database {db_file}: {e}")
            continue

    # 转换为 CharacterSessions 列表
    grouped = []
    for char_id in sorted(grouped_sessions.keys()):
        grouped.append(
            CharacterSessions(char_id=char_id, sessions=grouped_sessions[char_id])
        )

    return AllSessionsGroupedResponse(characters=grouped)


# 获取支持的模型列表
@app.get("/models")
async def support_models():
    from model.factory import LLMFactory

    return {"supported_models": LLMFactory.list_supported_models()}


@app.get("/chars")
def support_chars():
    """
    从 char.yaml 获取支持的角色列表
    """
    chars = load_characters(CHAR_YAML, RESOURCE_DIR, RESOURCE_URL)
    return {
        "supported_chars": [
            {
                "id": c["id"],
                "name": c["name"],
                "avatar": c["avatar"],
                "card_bg": c["card_bg"],
            }
            for c in chars
        ]
    }


@app.get("/prompt/{char_id}")
async def get_prompt(char_id: str):
    """
    获取指定角色的 prompt 内容
    """
    chars = load_characters(CHAR_YAML, RESOURCE_DIR, RESOURCE_URL)

    char = next((c for c in chars if c["id"] == char_id), None)
    if not char:
        raise HTTPException(
            status_code=404, detail=f"Character {char_id} not found in char.yaml"
        )

    prompt_path = PROMPT_DIR / char["prompt_file"]
    if not prompt_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Prompt file not found: {char['prompt_file']}"
        )

    try:
        content = prompt_path.read_text(encoding="utf-8")
        return {"char_id": char_id, "prompt": content}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error reading prompt file: {str(e)}"
        )


@app.patch("/prompt/{char_id}")
async def update_prompt(char_id: str, request: PromptUpdateRequest):
    """
    更新指定角色的 prompt 内容
    """
    chars = load_characters(CHAR_YAML, RESOURCE_DIR, RESOURCE_URL)

    char = next((c for c in chars if c["id"] == char_id), None)
    if not char:
        raise HTTPException(
            status_code=404, detail=f"Character {char_id} not found in char.yaml"
        )

    prompt_path = PROMPT_DIR / char["prompt_file"]
    if not prompt_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Prompt file not found: {char['prompt_file']}"
        )

    try:
        if request.prompt is not None:
            prompt_path.write_text(request.prompt, encoding="utf-8")
        return {
            "status": "success",
            "message": f"Prompt for {char_id} updated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating prompt file: {str(e)}"
        )


@app.post("/test-connection")
async def test_connection(request: TestConnectionRequest):
    """
    测试 LLM 连接是否正常
    """
    from model.factory import LLMFactory
    import asyncio

    try:
        llm = LLMFactory.create(
            model_type=request.model_type,
            model_id=request.model_id,
            api_key=request.api_key,
        )
        # 发送一条简单消息，设置 15 秒超时
        response = await asyncio.wait_for(
            llm.ainvoke("hi"),
            timeout=15,
        )
        return {
            "status": "success",
            "message": "连接成功",
            "response": response.content[:100] if response.content else "",
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="连接超时，请检查网络或模型配置")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_msg = str(e)
        # 提取有用的错误信息
        if (
            "api_key" in error_msg.lower()
            or "auth" in error_msg.lower()
            or "401" in error_msg
        ):
            detail = "API Key 无效或已过期"
        elif "model" in error_msg.lower() and (
            "not found" in error_msg.lower() or "404" in error_msg
        ):
            detail = f"模型不存在: {request.model_id}"
        elif "connect" in error_msg.lower() or "network" in error_msg.lower():
            detail = "无法连接到 API 服务器，请检查网络"
        else:
            detail = error_msg
        raise HTTPException(status_code=502, detail=detail)


@app.get("/")
async def health():
    """
    健康检查接口
    """
    return {"status": "ok"}


@app.get("/logs")
async def get_system_logs(lines: int = 100):
    """
    获取系统日志
    """
    if not LOG_FILE.exists():
        return {"logs": ["暂无日志"]}

    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
            return {"logs": all_lines[-lines:]}
    except Exception as e:
        logger.error(f"读取日志失败: {e}")
        raise HTTPException(status_code=500, detail="无法读取日志文件")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)
