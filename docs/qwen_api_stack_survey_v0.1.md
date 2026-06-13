# 千问（Qwen）API 能力调研 — GrammarBuddy 适用性 v0.1

> 调研目的：确认阿里云百炼 DashScope 是否提供 ASR / TTS，以及如何与 `qwen3.5` 文本模型组合用于 GrammarBuddy。
>
> 调研日期：2026-06-13

---

## 1. 结论（一句话）

**千问在百炼平台上同时提供 LLM、ASR、TTS，但它们是独立 API；`qwen3.5-plus` 本身不会「听懂」或「说话」，需要分别调用语音识别与语音合成模型。**

GrammarBuddy 可以 **100% 使用千问生态** 实现「纠错大脑 + 语音反馈」，ASR 在 MVP 阶段可继续用浏览器，后续切 **`qwen3-asr-flash-realtime`**。

---

## 2. 能力矩阵

| 模块 | 是否有 API | 推荐模型 | 协议 | 英语支持 |
|------|------------|----------|------|----------|
| 语法纠错 / 教学 JSON | ✅ | `qwen3.5-plus` / `qwen3.5-flash` | HTTP（OpenAI 兼容或 DashScope） | ✅ |
| TTS 非实时 | ✅ | `qwen3-tts-flash` | HTTP `MultiModalConversation` | ✅ `language_type=English` |
| TTS 实时 | ✅ | `qwen3-tts-instruct-flash-realtime` 等 | WebSocket | ✅ |
| TTS 语调指令 | ✅ | `qwen3-tts-instruct-flash` | HTTP + `instructions` | 中/英 instructions |
| ASR 文件转写 | ✅ | `qwen3-asr-flash` | HTTP 异步 | ✅ 多语种 |
| ASR 实时 | ✅ | `qwen3-asr-flash-realtime` | WebSocket | ✅ |
| 其他 ASR | ✅ | `fun-asr`、`paraformer-*` | 各协议 | 部分 |

**统一鉴权**：所有服务使用同一个 **`DASHSCOPE_API_KEY`**（百炼控制台获取）。

**地域注意**：中国内地用 `dashscope.aliyuncs.com`；国际/新加坡用 `dashscope-intl.aliyuncs.com` 或新版 workspace 域名。Key 与 endpoint 必须匹配。

---

## 3. LLM：`qwen3.5-plus`（语法大脑）

### 3.1 模型名称

百炼可用型号示例（以控制台为准）：

- `qwen3.5-plus`（推荐，质量与成本平衡）
- `qwen3.5-flash`（更快、更省）
- 带日期快照版如 `qwen3.5-plus-2026-02-15`（生产建议锁定版本）

### 3.2 结构化 JSON 输出

GrammarBuddy 需要 GPT 输出固定 JSON（`evaluation`、`correction`、`tts` 等），千问支持 **JSON Mode**：

```python
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {"role": "system", "content": "You are an English teacher. Return JSON only."},
        {"role": "user", "content": "Evaluate: He go to school yesterday."},
    ],
    response_format={"type": "json_object"},
    extra_body={"enable_thinking": False},  # 必须关闭思考模式
)
print(response.choices[0].message.content)
```

**注意：**

1. System 或 User 消息中须包含 **「JSON」** 字样（官方要求）。
2. **思考模式（thinking）与 JSON Mode 互斥**；`qwen3.5-plus` 默认可能开启 thinking，须显式 `enable_thinking=false`。
3. JSON Mode 保证合法 JSON，不保证字段完全符合 schema → 后端仍用 Pydantic 校验 + retry。

文档：[千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

---

## 4. TTS：`qwen3-tts-flash`

### 4.1 调用方式

```python
import os
import dashscope

dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

response = dashscope.MultiModalConversation.call(
    model="qwen3-tts-flash",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    text="Good try! Let's fix it together.",
    voice="Cherry",
    language_type="English",
    stream=False,
)

# 非流式：返回 OSS 音频 URL（24 小时有效）
print(response.output.audio.url)

# 流式 stream=True：返回 base64 音频 chunk
```

### 4.2 模型族

| 模型 | 用途 |
|------|------|
| `qwen3-tts-flash` | 非实时，低延迟，按字符计费，**MVP 推荐** |
| `qwen3-tts-instruct-flash` | 非实时 + **自然语言 instructions** 控制语速/语调 |
| `qwen-tts-realtime` / `qwen3-tts-*-realtime` | WebSocket 实时合成 |
| `qwen3-tts-vc` / `qwen3-tts-vd` | 声音克隆 / 声音设计 |

### 4.3 GrammarBuddy 建议

- MVP：`qwen3-tts-flash` + `language_type="English"` + 音色 `Cherry`（或其他英文友好音色，以控制台列表为准）。
- 若需「温和、慢速、儿童教师」风格：改用 **`qwen3-tts-instruct-flash`**：

```python
response = dashscope.MultiModalConversation.call(
    model="qwen3-tts-instruct-flash",
    text="Good try! Let's fix it together.",
    voice="Cherry",
    language_type="English",
    instructions="Speak slowly and warmly, like a patient elementary school English teacher.",
    optimize_instructions=True,
)
```

文档：[Qwen-TTS API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)

---

## 5. ASR：`qwen3-asr-flash` / `qwen3-asr-flash-realtime`

### 5.1 非实时（文件）

适合批量、录音文件；不适合 GrammarBuddy 实时对话主路径。

- 模型：`qwen3-asr-flash`
- 协议：HTTP 异步任务（上传文件 URL 或文件）

### 5.2 实时（推荐用于 LISTENING）

- 模型：**`qwen3-asr-flash-realtime`**
- 协议：WebSocket

```
wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime
```

Headers：

```
Authorization: Bearer $DASHSCOPE_API_KEY
OpenAI-Beta: realtime=v1
```

交互流程：

1. `session.update` — 配置 PCM 16kHz、语言 `en`、VAD 或 Manual 模式
2. `input_audio_buffer.append` — 持续发送 base64 音频块
3. 服务端返回 `transcript.delta` / `transcript.completed`
4. `session.finish` — 结束

**VAD 模式**：自动检测说话起止，适合「点击开始说话、说完自动识别」。
**Manual 模式**：客户端发 `input_audio_buffer.commit`，适合「按住说话」。

文档：
- [实时语音识别（Qwen-ASR-Realtime）Python SDK](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-python-sdk)
- [Qwen-ASR Realtime WebSocket API](https://docs.qwencloud.com/api-reference/speech-recognition/qwen-asr-realtime/websocket-api)

### 5.3 与 MVP 浏览器 ASR 对比

| | 浏览器 Web Speech | 千问 ASR Realtime |
|--|-------------------|-------------------|
| 接入难度 | 低（纯前端） | 中（需后端 WS 中继或前端直连） |
| 英语质量 | 一般，因浏览器而异 | 较稳定 |
| 与 M5Stack 一致 | 否 | **是**（设备 → 后端 → 千问） |
| 成本 | 免费 | 按量计费 |

**建议**：MVP Phase 2 仍用浏览器 ASR；**Phase 2b 或 M5Stack 前** 切千问 ASR。

---

## 6. GrammarBuddy 推荐技术栈（千问版）

```text
┌─────────────┐     asr_final (text)      ┌──────────────────────────────┐
│ Web 前端    │ ────────────────────────► │ FastAPI 后端                  │
│ Web Speech  │                           │  • grammar_qwen (qwen3.5-plus)│
│ + 圆屏 UI   │ ◄── gpt JSON + tts audio ─│  • tts (qwen3-tts-flash)      │
└─────────────┘                           └──────────────────────────────┘
                                                    │
                                                    ▼
                                          DashScope (百炼)
                                          同一 DASHSCOPE_API_KEY
```

后续升级 ASR：

```text
Web/M5Stack 麦克风 ──audio_chunk──► 后端 ──WS──► qwen3-asr-flash-realtime
```

---

## 7. 环境变量示例

```env
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

QWEN_MODEL=qwen3.5-plus
QWEN_ENABLE_THINKING=false

QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=Cherry
QWEN_TTS_LANGUAGE=English

# Phase 2b
QWEN_ASR_MODEL=qwen3-asr-flash-realtime
QWEN_ASR_WS_URL=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
```

---

## 8. Python 依赖

```text
dashscope>=1.24.5      # TTS MultiModalConversation、ASR SDK
openai>=1.0            # 可选：OpenAI 兼容方式调 qwen3.5
fastapi
uvicorn
pydantic-settings
```

---

## 9. 常见问题

**Q：`qwen3.5` 能不能一个 API 同时听、想、说？**

A：不能作为单一 chat 接口完成。可选方案：
- **拆分调用**（推荐）：ASR 模型 → LLM → TTS 模型（GrammarBuddy 架构）
- **Qwen-Omni Realtime**：端到端实时多模态，适合对话助手，但输出格式与 GrammarBuddy 固定 JSON 教学结构不匹配，**不推荐** 作为 MVP 主路径

**Q：TTS 能否读英文句子且发音自然？**

A：可以。设置 `language_type="English"`，文本用英文。

**Q：是否必须用新加坡/北京特定 endpoint？**

A：Key 与 endpoint 地域必须一致；开发阶段在百炼控制台确认账号地域后固定配置。

---

## 10. 参考链接

| 主题 | 链接 |
|------|------|
| 百炼控制台 | https://bailian.console.aliyun.com/ |
| 获取 API Key | https://help.aliyun.com/zh/model-studio/get-api-key |
| Qwen-TTS 非实时 | https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide |
| Qwen-TTS API 参数 | https://help.aliyun.com/zh/model-studio/qwen-tts-api |
| Qwen-ASR 实时 SDK | https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-python-sdk |
| 结构化 JSON 输出 | https://help.aliyun.com/zh/model-studio/qwen-structured-output |
| DashScope Python SDK | https://github.com/dashscope/dashscope-sdk-python |

---

*文档版本：v0.1 | 状态：调研完成*
