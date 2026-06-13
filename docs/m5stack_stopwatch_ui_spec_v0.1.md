# M5Stack StopWatch 英语语法学习系统 UI设计规范（Apple风格）

## 1. 项目概述
本UI系统用于 M5Stack StopWatch（圆形屏幕设备），用于儿童英语语法学习（美国小学水平）。

核心目标：
- 极简交互
- Apple风格视觉
- 语音驱动学习（ASR + GPT + TTS）
- 圆形屏幕适配（LVGL）

---

## 2. UI设计原则

### 2.1 核心关键词
- Calm（安静）
- Friendly（友好）
- Minimal（极简）
- One-action-per-screen（单任务）

### 2.2 圆形屏规范
- 所有UI必须适配圆形屏
- 信息结构：中心 + 环形 + 辅助层
- 禁止多列表/复杂布局
- 内容必须层级化

---

## 3. 视觉规范

### 3.1 色彩系统

| 类型 | 颜色 |
|------|------|
| 背景 | #0B0F14 |
| 主文字 | #FFFFFF |
| 次文字 | #AAB2C0 |
| 正确 | #34C759 |
| 错误 | #FF453A |
| 强调 | #0A84FF |

---

### 3.2 字体层级
- Large：核心句子
- Medium：提示语
- Small：辅助说明

推荐字体：
- SF Pro Rounded
- Inter Rounded

---

## 4. UI状态机设计

系统包含5种核心状态：

```text
HOME → LISTENING → THINKING → FEEDBACK → PRACTICE
```

---

## 5. 页面设计

## 5.1 HOME（主界面）

功能：
- 开始学习
- 显示学习进度

布局：

- 中央：Speak按钮
- 外圈：学习进度环
- 底部：提示语

文案：
- "Let’s Learn!"
- "Tap to start"

---

## 5.2 LISTENING（录音中）

功能：
- 用户正在说话

UI：
- 中央麦克风图标
- 声波动画
- “Listening...”

---

## 5.3 THINKING（AI处理中）

UI：
- loading dots
- “Checking your sentence”
- 紫蓝渐变呼吸动画

---

## 5.4 FEEDBACK（纠错界面）

核心界面：

结构：

❌ You said:
He go to school yesterday.

✔ Correct:
He went to school yesterday.

💡 Tip:
Use past tense for "yesterday"

🔁 Repeat prompt

设计原则：
- 错误红色只标重点词
- 正确绿色强调
- Tip弱化显示

---

## 5.5 PRACTICE（复述）

UI：
- AI语音播放
- “Repeat after me”
- 麦克风按钮

---

## 6. 动效设计

### 状态切换
- Home → Listening：zoom fade
- Listening → Thinking：blur fade
- Thinking → Feedback：slide up
- Feedback → Practice：snap

### 反馈动效
- 正确：绿色扩散
- 错误：轻微震动
- AI：呼吸动画

---

## 7. 圆形屏布局规则

三层结构：

- 外环：状态/进度
- 中环：提示信息
- 中心：核心交互

安全区域：
- 半径80%内布局内容

---

## 8. LVGL结构建议

```c
screen_home
screen_listening
screen_thinking
screen_feedback
screen_practice
```

状态机：

```c
enum UI_STATE {
  HOME,
  LISTENING,
  THINKING,
  FEEDBACK,
  PRACTICE
};
```

---

## 9. 教育交互逻辑

流程：

1. 用户说话
2. ASR识别
3. GPT纠错
4. TTS反馈
5. 用户重复

---

## 10. MVP功能

必须实现：
- 语音输入
- AI纠错
- TTS反馈
- 重复练习

---

## 11. UI核心理念总结

- 极简
- 情绪友好
- Apple风格
- 儿童可理解
- 圆屏优先设计

