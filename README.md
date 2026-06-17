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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

StopWatch 固件需直连后端时，`--host 0.0.0.0` 必填。若仅用手机浏览器测 Web 前端，后端监听 `127.0.0.1` 也可（请求经 Vite 代理转发）。

### 2. 前端（React）

```powershell
cd frontend
npm install
npm run dev
```

本机：https://localhost:5173（首次需接受自签名证书警告）

**手机 / 平板（同一 WiFi）**：`npm run dev` 启动后终端会显示 Network 地址，请用 **https**：

```text
https://192.168.3.219:5173
```

圆屏预览：`https://192.168.3.219:5173/?device=1`

说明：

- 已启用 `@vitejs/plugin-basic-ssl` 自签名 HTTPS，手机浏览器才能使用麦克风。
- 手机首次打开会提示证书不受信任，选择「继续访问」或「高级 → 继续」即可。
- `server.host: true`，`/api` 与 `/ws` 由 dev 服务器代理到本机 `127.0.0.1:8000`，手机只需能访问 PC 的 **5173** 端口。
- Windows 防火墙需放行 **5173**（与后端 8000 类似）；WiFi 建议设为「专用网络」。
- **若 https://IP:5173 提示「无法提供安全链接」**：多半是 5173 上还在跑旧的 **HTTP** 版 dev 服务。关掉所有 `npm run dev` 后重新启动，以终端打印的 **https://** 地址为准（已设 `strictPort`，不会悄悄换到别的端口）。

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

- [生产部署（子路径 /GrammarBuddy/）](docs/deploy-production.md) — 含 `deploy/*.sh` 与 GitHub Actions
- [三端解决方案 v0.4](docs/three_client_solution_v0.4.md) — PC 模拟器 + StopWatch + 后端
- [Launcher 集成说明](docs/launcher_integration_v0.2.md) — `M5_Stack_FIFAWatch`
- [本地 MVP 方案](docs/local_mvp_solution_v0.1.md)
