from config import PROMPT_DIR, CHAR_YAML, RESOURCE_DIR, RESOURCE_URL
from utils.char import load_characters


def get_system_prompt(char_id: str) -> str:
    """
    根据 char_id 从 char.yaml 查找对应的 prompt 文件并读取内容
    """
    chars = load_characters(CHAR_YAML, RESOURCE_DIR, RESOURCE_URL)
    
    char = next((c for c in chars if c["id"] == char_id), None)
    if not char:
        raise FileNotFoundError(f"找不到 id 为 '{char_id}' 的角色配置")

    prompt_path = PROMPT_DIR / char["prompt_file"]
    if not prompt_path.exists():
        raise FileNotFoundError(f"找不到 prompt 文件: {char['prompt_file']}")

    return prompt_path.read_text(encoding="utf-8")
