
# M5Stack StopWatch 英语语法学习系统
## AI核心设计合集（UI + GPT + ASR + TTS）

---

# =========================
# PART 1: UI + GPT-5.5 PROMPT 联动设计
# =========================

# 🧠 1. 核心思想

UI = GPT-5.5 教学大脑的“可视化层”

系统本质：
- GPT = 老师（大脑）
- UI = 黑板（展示）
- ASR = 学生输入
- TTS = 老师发声

---

# 🔁 2. 完整闭环

User Voice
→ ASR
→ GPT-5.5
→ JSON教学结构
→ LVGL UI渲染
→ TTS语音反馈
→ 用户重复

---

# 📦 3. GPT输入结构

```json
{
  "user_text": "He go to school yesterday",
  "grade": 3,
  "mode": "grammar_practice",
  "lesson_type": "past_tense"
}
```

---

# 📤 4. GPT输出（核心）

```json
{
  "ui_state": "FEEDBACK",

  "evaluation": {
    "is_correct": false,
    "score": 65
  },

  "correction": {
    "correct_sentence": "He went to school yesterday.",
    "error_type": "past_tense",
    "highlight": {
      "wrong": ["go"],
      "correct": ["went"]
    }
  },

  "teaching": {
    "simple_explanation": "We use 'went' for past time.",
    "kid_explanation": "Yesterday means past, so we say went."
  },

  "tts": {
    "primary": "Good try! Let's fix it together.",
    "repeat_prompt": "Now you try!"
  },

  "next_step": {
    "action": "REPEAT",
    "question": "What did you do yesterday?"
  }
}
```

---

# 🎨 5. UI渲染规则

❌ 错误句（红）
✔ 正确句（绿）
💡 Tip（灰）

---

# 🧠 6. UI状态机

HOME
→ LISTENING
→ THINKING
→ FEEDBACK
→ PRACTICE

---

# =========================
# PART 2: ASR → GPT → TTS 通信协议
# =========================

# 📡 1. 系统架构

Device
→ ASR
→ GPT-5.5
→ TTS
→ Device UI

---

# 🔁 2. Session结构

```json
{
  "session_id": "uuid",
  "device_id": "m5stack",
  "grade": 3,
  "mode": "grammar_practice"
}
```

---

# 🎤 3. ASR协议

## 请求

```json
{
  "type": "audio_chunk",
  "session_id": "uuid",
  "sample_rate": 16000
}
```

## 返回

```json
{
  "type": "asr_final",
  "text": "He go to school yesterday.",
  "confidence": 0.94
}
```

---

# 🧠 4. GPT协议（核心）

```json
{
  "session_id": "uuid",

  "ui_state": "FEEDBACK",

  "asr_text": "He go to school yesterday.",

  "correction": {
    "correct_sentence": "He went to school yesterday."
  },

  "teaching": {
    "simple_explanation": "Use past tense for yesterday"
  },

  "tts": {
    "primary": "Good try! Let's fix it together."
  },

  "next_step": {
    "action": "REPEAT",
    "question": "What did you do yesterday?"
  }
}
```

---

# 🔊 5. TTS协议

## 请求

```json
{
  "text": "Good try! Let's fix it together.",
  "voice": "en_us_teacher",
  "speed": 0.85
}
```

---

## 返回

```json
{
  "type": "tts_audio_chunk",
  "data": "binary_audio"
}
```

---

# 🔌 6. WebSocket统一协议

```json
{
  "type": "asr | gpt | tts | control",
  "session_id": "uuid",
  "payload": {}
}
```

---

# 🧠 7. 状态机

IDLE
→ LISTENING
→ THINKING
→ FEEDBACK
→ PRACTICE

---

# 🚀 8. 核心设计总结

- GPT = 教学大脑
- UI = 渲染层
- ASR = 输入
- TTS = 输出
- JSON = 唯一通信语言
