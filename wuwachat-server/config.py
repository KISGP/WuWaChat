from pathlib import Path
import sys
import os

# 获取 exe 或脚本所在目录
if getattr(sys, 'frozen', False):
    # 打包后的 exe 所在目录
    BASE_DIR = Path(sys.executable).parent
else:
    # 开发环境
    BASE_DIR = Path(__file__).resolve().parent

# 数据目录
DATA_DIR = BASE_DIR / "data"
os.makedirs(DATA_DIR, exist_ok=True)

# 提示词目录
PROMPT_DIR = DATA_DIR / "prompt"
os.makedirs(PROMPT_DIR, exist_ok=True)

# 资源目录
RESOURCE_DIR = DATA_DIR / "resource"
os.makedirs(RESOURCE_DIR, exist_ok=True)

# 聊天记录目录
ARCHIVE_DIR = DATA_DIR / "archive"
os.makedirs(ARCHIVE_DIR, exist_ok=True)

# 日志目录
LOG_DIR = BASE_DIR / "logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"

# 角色配置文件
CHAR_YAML = DATA_DIR / "char.yaml"

# 资源 URL
RESOURCE_URL = "http://127.0.0.1:8000/resource"

