# GrammarBuddy 三端解决方案 v0.4

> **状态**：已确认方向，待分阶段落地  
> **日期**：2026-06-13  
> **关联文档**：
> - [local_mvp_solution_v0.1.md](./local_mvp_solution_v0.1.md) — Web MVP 实现细节
> - [m5stack_stopwatch_ui_spec_v0.1.md](./m5stack_stopwatch_ui_spec_v0.1.md) — 圆屏 UI 视觉规范
> - [m5stack_ai_core_design_full_v0.1.md](./m5stack_ai_core_design_full_v0.1.md) — 通信协议 PART 2
> - [launcher_integration_v0.2.md](./launcher_integration_v0.2.md) — StopWatch Launcher 集成
> - [qwen_api_stack_survey_v0.1.md](./qwen_api_stack_survey_v0.1.md) — 千问 API 调研

---

## 0. 已确认决策摘要

| # | 议题 | 决定 |
|---|------|------|
| 1 | 客户端策略 | **方案 B**：Web 保留为设计模拟器；StopWatch 固件单独开发 |
| 2 | 架构形态 | **三端 + 契约层**：后端 + PC 模拟器 + StopWatch 固件 |
| 3 | 会话模型 | **多会话（multi-session）**，非多租户 SaaS |
| 4 | StopWatch 角色 | **瘦终端（Thin Client）**：ASR/TTS/LLM 全在云端 |
| 5 | 主通信协议 | **WebSocket + JSON**（`/ws/session`） |
| 6 | 能力取舍 | 练习历史、完整 transcript 仅 Web；设备长文 **A/B 翻页** |
| 7 | 硬件平台 | 复用 `M5_Stack_FIFAWatch` Launcher（WiFi/亮度/音量），GrammarBuddy 作为新 App 接入 |
| 8 | 扩展输入 | BMI270 支持「摇一摇」换主题（HOME 场景，需防抖） |

---

## 1. 三端定位

```text
┌─────────────────────────────────────────────────────────────┐
│                    shared/ 契约层（规划）                      │
│   protocol · ui-contract · design-tokens · compatibility    │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
    ┌───────────▼──────────┐  ┌───────▼──────────────────────┐
    │ ① PC 模拟器           │  │ ② StopWatch 固件              │
    │ frontend/ (React)    │  │ M5_Stack_FIFAWatch + 新 App   │
    │ 设计预览 / 协议联调    │  │ LVGL 圆屏 + A/B 键 + 板载音频  │
    └───────────┬──────────┘  └───────┬──────────────────────┘
                │                     │
                └──────────┬──────────┘
                           │ WebSocket + REST
                ┌──────────▼──────────┐
                │ ③ 后端服务           │
                │ backend/ (FastAPI)  │
                │ 会话状态机 · 千问 API │
                └─────────────────────┘
```

### 1.1 ① PC 模拟器（`frontend/`）

| 职责 | 不做 |
|------|------|
| 按 UI 契约渲染圆屏各状态 | 不作为量产唯一 UI |
| 联调 WebSocket 协议、跑语法/新闻全流程 | 不堆设备没有的侧栏（`device` 模式下） |
| 练习历史、运营向功能 | 不在设备模式依赖浏览器 ASR 作为唯一路径 |

**设备预览模式（规划）**：URL `?device=1` — 隐藏侧栏 transcript/历史，启用 A/B 键盘映射，与 StopWatch 行为对齐。

### 1.2 ② StopWatch 固件

- 基于 **M5Stack StopWatch**（ESP32-S3，466×466 圆屏 AMOLED）
- 接入现有 **Mooncake Launcher**（见 [launcher_integration_v0.2.md](./launcher_integration_v0.2.md)）
- **LVGL** 实现教学 UI；**不重复** WiFi 配网、系统亮度/音量
- 本地只做：麦克风采集、ES8311 解码播放、UI 渲染、按键/IMU 输入

### 1.3 ③ 后端服务（`backend/`）

- 唯一业务大脑：Grammar / News 状态机、千问 LLM / ASR / TTS
- 对客户端透明：通过 `client_type` 识别来源，**不改变**核心教学逻辑
- REST 辅助：健康检查、新闻练习历史、TTS 代理

---

## 2. 会话与并发：不是多租户

### 2.1 当前实现

后端 `SessionManager` 以 `session_id`（UUID）为键，内存字典存储多个独立会话：

```python
# backend/app/session/manager.py
self._sessions: dict[str, SessionState] = {}
```

每个客户端建立独立 WebSocket → 调用 `start_session` → 获得独立 `session_id`。PC 与 StopWatch **可同时连接同一后端**，互不干扰。

### 2.2 模型定义

| 概念 | GrammarBuddy 现状 | 说明 |
|------|-------------------|------|
| 多租户（Tenant） | ❌ 无 | 无学校/家庭账号隔离 |
| 多会话（Session） | ✅ 有 | 一连接一会话 |
| 用户登录 | ❌ 无 | 单用户 MVP |
| 设备绑定 | ❌ 未实现 | 可选 `device_id` 仅用于日志 |

### 2.3 规划增强（S0）

`start_session` 扩展字段：

```json
{
  "action": "start_session",
  "activity_type": "grammar",
  "lesson_id": "past_simple",
  "client_type": "web_simulator",
  "client_version": "0.3.1",
  "protocol_version": "1.0.0",
  "device_id": "optional-uuid"
}
```

后端返回 `GET /api/version` 供客户端做兼容性检查。

---

## 3. 瘦终端与语音路径

StopWatch **不在本地运行** LLM / ASR / TTS 模型。

```text
┌──────── StopWatch ────────┐
│ MIC → PCM/WAV             │
│ WS  → audio_base64 上传    │
│ WS  ← tts data_base64     │
│ ES8311 解码 → 扬声器       │
│ LVGL  ← ui_state / gpt    │
└─────────────┬─────────────┘
              │ WebSocket
┌─────────────▼─────────────┐
│ FastAPI                    │
│  · qwen3.5-plus (LLM)     │
│  · qwen3-asr-flash (ASR)  │
│  · qwen3-tts-flash (TTS)  │
└───────────────────────────┘
```

### 3.1 与 PC 模拟器的 ASR 差异

| 客户端 | 语法 ASR | 新闻 ASR |
|--------|----------|----------|
| Web MVP | 浏览器 Web Speech（调试便利） | `audio_base64` → 云端 |
| StopWatch | **必须** `audio_base64` → 云端 | 同左 |

后端已支持 `audio_base64` 路径（`handler.py`、`news_handler.py` → `asr.py`）。

### 3.2 TTS

- 后端合成，按段推送 `type: tts` + `data_base64`
- 设备端维护播放队列；播报暂停/继续由 **客户端本地队列** 处理（与 Web 新闻播报修复一致）
- 可选：设备通过 REST `/api/tts/proxy` 拉取 URL，减轻 WS 大包

---

## 4. 通信协议

### 4.1 主轴：WebSocket

| 项 | 值 |
|----|-----|
| 端点 | `ws://<host>:8000/ws/session` |
| Envelope | `{ "type", "session_id", "payload" }` |
| type | `control` \| `asr` \| `gpt` \| `tts` \| `error` |

与 [m5stack_ai_core_design_full_v0.1.md](./m5stack_ai_core_design_full_v0.1.md) PART 2 及当前 `backend/app/ws/` 实现一致。

### 4.2 辅助：REST

| 路径 | 用途 | 设备 |
|------|------|------|
| `GET /api/health` | 健康检查 | ✅ |
| `GET /api/version` | 协议/版本（规划） | ✅ |
| `GET /api/news/history` | 练习历史 | ❌ 首版仅 Web |
| `GET /api/tts/proxy` | TTS URL 代理 | 可选 |

---

## 5. UI 统一与同步策略

### 5.1 三层契约

| 层 | 必须一致 | 实现 |
|----|----------|------|
| **协议层** | WS 消息、状态枚举、payload 字段 | `shared/protocol/`（规划） |
| **UI 契约层** | 屏清单、分页规则、A/B 语义、文案 key | `shared/ui-contract/`（规划） |
| **UI 实现层** | 视觉层级一致即可 | React vs LVGL |

### 5.2 圆屏 UI 一致性能达到什么程度

| 可对齐 | 必然不同 |
|--------|----------|
| 466×466 圆屏布局（Web 可用 360 或 466 缩放） | Web 侧栏 / Debug 面板 |
| 色值、字体层级（UI spec） | 字体渲染引擎 |
| 五态 + 新闻各 phase 屏幕 | 动效精度（LVGL 简化） |

**目标**：圆屏主区域 **85%～95%** 视觉与交互一致；Web `?device=1` 作为设备预览。

### 5.3 设备能力取舍

| 功能 | PC 模拟器 | StopWatch |
|------|-----------|-----------|
| 语法 / 新闻全流程 | ✅ | ✅ |
| 分段 TTS 播报 | ✅ | ✅ |
| 练习历史 | ✅ REST | ❌ 首版不做 |
| 对话 transcript 长列表 | ✅ 侧栏 | ❌ → **分页** 1～2 行/页 |
| FEEDBACK 三段 | ✅ 一屏 | ✅ **A/B 翻页** |
| WRAP_UP 总结 | ✅ 多段面板 | ✅ 多页 wizard |
| Debug 文本直发 | ✅ | ❌ |

### 5.4 按键映射（StopWatch 为主）

Launcher 通用约定（`M5_Stack_FIFAWatch`）：

| 操作 | StopWatch |
|------|-----------|
| A 单击 | 上一项 / 左 / **主操作**（GrammarBuddy 可覆写语义） |
| B 单击 | 下一项 / 右 / **次操作** |
| A+B 长按 | 返回 Launcher |

GrammarBuddy App 建议映射（写入 `shared/ui-contract/input-map.yaml`）：

| ui_state | BtnA | BtnB |
|----------|------|------|
| HOME | 开始 / 选语法 | 选新闻 |
| LISTENING | 结束录音提交 | 取消 |
| BROADCAST | 暂停/继续 TTS | — |
| FEEDBACK（多页） | 下一页 | 上一页 |
| WRAP_UP（多页） | 下一页 | 上一页 |

---

## 6. BMI270 与「摇一摇」

### 6.1 Launcher 现有能力

`M5_Stack_FIFAWatch` 已通过 HAL 封装 BMI270：

| 文件 | 说明 |
|------|------|
| `firmware/main/hal/hal_imu.cpp` | `imu_init()`、`updateImuData()` |
| `firmware/main/hal/hal.h` | `ImuData { accelX/Y/Z, gyroX/Y/Z }` |
| `firmware/main/apps/app_imu/` | 参考：用 gyro 模长检测 motion |

依赖组件：`BMI270_BMM150_Sensor`（见 `firmware/repos.json`）。

### 6.2 GrammarBuddy 规划用法

| 场景 | 摇一摇行为 | 备注 |
|------|------------|------|
| HOME / 选主题 | 切换到下一个 `lesson_id` | 发 `control: switch_lesson` 或本地轮换后 `start_session` |
| 新闻 HOME | 换一条新闻 | `control: refetch_news`（需后端支持） |
| LISTENING / THINKING | **禁用** | 防误触 |
| FEEDBACK / PRACTICE | **禁用** | 用 A/B |

**实现要点**：

- 在 App `onRunning()` 中调用 `GetHAL().updateImuData()`，计算加速度/陀螺仪模长阈值
- 防抖：500ms～1s 内只触发一次；需校准儿童手持噪声
- 可选：复用 `app_imu` 中 motion 计算逻辑，提取为 `hal/` 或 `chrone_core` 公共 `ShakeDetector`

---

## 7. Launcher 集成（不重复造轮子）

GrammarBuddy **不**在固件内重做：

- WiFi 配网（Captive Portal）
- 屏幕亮度、扬声器音量
- 应用列表与返回桌面

由 **M5_Stack_FIFAWatch** 的 HAL / Launcher / ChroneCore 提供；GrammarBuddy 仓库内 **`firmware/` 独立 ESP-IDF 工程** 通过 `FIFAWATCH_FIRMWARE` 引用上述平台代码，详见 [launcher_integration_v0.2.md](./launcher_integration_v0.2.md)。

后端地址存入 NVS 命名空间 `grammabuddy`、键 `ws_url`；在 **App 内「设置 → 服务器地址」** 配置（不修改 FIFAWatch ChroneCore Settings 源码）。

---

## 8. 仓库与目录规划

```text
GrammarBuddy/
├── backend/              # ③ 后端
├── frontend/             # ① PC 模拟器
├── firmware/             # ② StopWatch 固件（独立 ESP-IDF 工程）✅ 已确认
│   ├── main/apps/app_grammabuddy/
│   └── vendor/           # 可选 submodule；默认 sibling FIFAWatch
├── shared/               # 契约层 ✅ S0 已建
│   ├── protocol/
│   ├── ui-contract/
│   ├── design-tokens/
│   └── version/
└── docs/
```

### 8.1 固件策略（已确认）

**GrammarBuddy 独立 `firmware/`**，不放入 FIFAWatch 仓库。

| 项 | 决定 |
|----|------|
| 工程位置 | `GrammarBuddy/firmware/` |
| 平台代码 | 编译时引用 `M5_Stack_FIFAWatch/firmware`（sibling 或 `FIFAWATCH_FIRMWARE` 环境变量） |
| 本仓库独有 | `app_grammabuddy/` + 精简 `main.cpp`（无 FIFAWatch 世界杯 App） |
| 依赖 components | 使用 FIFAWatch 已拉取的 `components/`（Mooncake、LVGL、BMI270…） |

构建说明见 [firmware/README.md](../firmware/README.md)。

---

## 9. 版本与同步开发流程

### 9.1 版本号

| 层级 | 示例 | 变更时机 |
|------|------|----------|
| `protocol_version` | 1.0.0 | WS 字段 / 状态机 breaking change |
| `backend_version` | 0.4.0 | 服务部署 |
| `client_version` | web 0.3.x / fw 0.1.x | 各客户端发布 |

### 9.2 Feature 落地顺序

```text
1. 更新 shared/ 契约（protocol + ui-contract）
2. 后端实现
3. Web 模拟器对齐（可先 merge，用于联调）
4. StopWatch App 对齐
5. 更新 compatibility.json + CHANGELOG
```

### 9.3 CI 建议（轻量）

- `shared/` 变更 → 校验 Python `UIState` / TS enum 一致
- Golden WS 会话回放（可选）

---

## 10. 分阶段路线图

| 阶段 | 目标 | 后端 | Web | StopWatch |
|------|------|------|-----|-----------|
| **S0** | 契约奠基 | `client_type`、version API | `?device=1`、types 对齐 shared | `firmware/` 骨架 + WS 连通 |
| **S1** | 语法闭环 | ASR 路径稳定 | FEEDBACK 分页 | HOME→PRACTICE + TTS 队列 |
| **S2** | 新闻闭环 | 分段 TTS by capability | 无侧栏 NewsApp | 播报 + 3 轮对话 + WRAP_UP 分页 |
| **S3** | 一致性与发版 | compatibility 校验 | 显示协议版本 | OTA、版本上报 |
| **S4** | 增强 | 历史 API 稳定 | 历史/报表 | 摇一摇换主题、可选摘要屏 |

---

## 11. 状态机参考（与代码对齐）

### 11.1 语法（`backend/app/session/state.py`）

```text
HOME → ASKING → LISTENING → THINKING → FEEDBACK → PRACTICE
  → PRACTICE_SUCCESS → (下一题) / SCENARIO_COMPLETE → HOME
```

### 11.2 新闻（`NewsPhase` + `NewsUIState`）

```text
FETCH → BROADCAST → OPEN_QUESTION → DIALOGUE → WRAP_UP → COMPLETE
```

前端类型见 `frontend/src/types/index.ts`；固件须使用 **相同字符串枚举**。

---

## 12. 已确认决策（原开放问题）

| 议题 | 决定 |
|------|------|
| 固件位置 | ✅ **`GrammarBuddy/firmware/`** 独立 ESP-IDF 工程 |
| `ws_url` / `api_url` | NVS 命名空间 **`grammabuddy`**；App 内「设置 → 服务器地址」 |
| `switch_lesson` / `refetch_news` | 纳入 **protocol v1.0 optional**（见 `shared/protocol/actions.json`） |
| Shake 阈值 | 默认见 `shared/ui-contract/shake-config.json`；S4 实机校准 |
| TTS 传输 | **v1.0 保持 JSON base64**；二进制帧留 v1.1 |
| `shared/` S0 | ✅ 已建 `protocol/`、`ui-contract/`、`design-tokens/`、`version/` |
| Web 设备预览 | S0：`?device=1` 隐藏侧栏 + A/B 键盘映射 |

---

## 13. 文档修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.4 | 2026-06-13 | 三端方案 B、Launcher/BMI270 集成、会话模型、瘦终端、契约层 |
| v0.4.1 | 2026-06-13 | 固件独立 `firmware/`、`shared/` S0、开放问题结案 |
