# GrammarBuddy

面向小学生的实时英语语法学习系统（Web 模拟器 + StopWatch 固件 + Python 后端）。

```text
GrammarBuddy/
├── backend/     # FastAPI + WebSocket
├── frontend/    # PC 圆屏模拟器
├── firmware/    # StopWatch ESP-IDF（引用 M5_Stack_FIFAWatch 平台）
└── shared/      # 三端契约
```

## 本地启动

### 1. 后端（Python）

```powershell
cd backend
copy .env.example .env
# 在 .env 中填入你的 DASHSCOPE_API_KEY（阿里云百炼，国内北京）

py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. 前端（React）

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173

**StopWatch 设备预览模式**：http://localhost:5173/?device=1（隐藏侧栏，466 圆屏，A/B 键盘映射）

API 版本：http://localhost:8000/api/version

### 3. 快速测试（无需麦克风）

1. 右侧 Debug 面板点击「新建 Session」
2. 确认句子 `He go to school yesterday.` 后点击「发送文本」
3. 圆屏应显示 FEEDBACK（红/绿高亮 + Tip），并播放千问 TTS

## 技术栈

- **LLM**：千问 `qwen3.5-plus`（DashScope，JSON Mode）
- **TTS**：千问 `qwen3-tts-flash`
- **ASR**：浏览器 Web Speech API（MVP）
- **前端**：React + Vite + TypeScript
- **后端**：FastAPI + WebSocket

文档：

- [三端解决方案 v0.4](docs/three_client_solution_v0.4.md) — PC 模拟器 + StopWatch + 后端
- [Launcher 集成说明](docs/launcher_integration_v0.2.md) — `M5_Stack_FIFAWatch`
- [本地 MVP 方案](docs/local_mvp_solution_v0.1.md)
