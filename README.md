# GrammarBuddy

面向小学生的实时英语语法学习系统（Web MVP → M5Stack 圆屏）。

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

详见 [docs/local_mvp_solution_v0.1.md](docs/local_mvp_solution_v0.1.md)
