# GrammarBuddy × M5Stack Launcher 集成说明 v0.2

> **Launcher 工程路径**：`C:/Users/sh_mu/code/M5_Stack_FIFAWatch`  
> **GrammarBuddy 固件**：`GrammarBuddy/firmware/`（独立 ESP-IDF，引用 FIFAWatch 平台）  
> **关联**：[three_client_solution_v0.4.md](./three_client_solution_v0.4.md)

---

## 0. 集成模式（v0.2）

GrammarBuddy 固件位于 **本仓库 `firmware/`**，编译时通过环境变量 **`FIFAWATCH_FIRMWARE`** 指向 FIFAWatch 的 `firmware/` 目录，**复用** HAL、Launcher、ChroneCore、components，**不复制**平台源码进 GrammarBuddy。

```text
GrammarBuddy/firmware/main/apps/app_grammabuddy/   ← 仅 GrammarBuddy 独有
GrammarBuddy/firmware/main/main.cpp                ← 注册 Launcher + GrammarBuddy
M5_Stack_FIFAWatch/firmware/main/hal/              ← 编译引用
M5_Stack_FIFAWatch/firmware/components/            ← EXTRA_COMPONENT_DIRS
```

## 1. Launcher 工程概览

`M5_Stack_FIFAWatch` 是 M5Stack StopWatch 的完整演示固件（ESP-IDF v5.5 + Mooncake + LVGL 9）。

| 组件 | 路径 / 说明 |
|------|-------------|
| 入口 | `firmware/main/main.cpp` |
| Launcher | `firmware/main/apps/app_launcher/` |
| 系统核心 | `firmware/main/apps/app_chrone_core/` — 表盘、WiFi、Settings |
| 配网 Setup | `firmware/main/apps/app_setup/` |
| HAL | `firmware/main/hal/` — 显示、音频、IMU、PMIC |
| 应用注册 | `firmware/main/apps/apps.h` + `main.cpp` `installApp()` |

当前已注册 App：

```cpp
// firmware/main/main.cpp
GetMooncake().installApp(std::make_unique<AppLauncher>());
GetMooncake().installApp(std::make_unique<AppSetup>());
GetMooncake().installApp(std::make_unique<AppFIFAWatch>());
GetMooncake().installApp(std::make_unique<AppChroneCore>());
```

GrammarBuddy 将以 **`AppGrammarBuddy`** 注册到 Mooncake（在 `GrammarBuddy/firmware/main/main.cpp`）。

FIFAWatch 原版还包含 `AppFIFAWatch`；GrammarBuddy 固件 **不安装** 该 App，以节省 Flash 并简化 Launcher 列表。

---

## 3. GrammarBuddy 固件目录（独立工程）

```text
GrammarBuddy/firmware/
├── CMakeLists.txt
├── main/
│   ├── CMakeLists.txt          # GLOB FIFAWatch 平台源 + app_grammabuddy
│   ├── main.cpp
│   ├── apps/apps_platform.h    # install_platform_apps()
│   └── apps/app_grammabuddy/
│       ├── app_grammabuddy.h / .cpp
│       ├── model/              # ws_client, audio, shake（规划）
│       └── view/               # LVGL screens（规划）
├── scripts/check_fifawatch.ps1
└── vendor/README.md            # 可选 submodule
```

构建步骤见 [../firmware/README.md](../firmware/README.md)。

## 4. GrammarBuddy 应复用的 Launcher 能力

| 能力 | Launcher 提供方 | 接口 / 位置 |
|------|----------------|-------------|
| **WiFi STA / 配网** | `app_chrone_core` | `chrone_core::GetWifiService()` — `isConnected()`、`requestConfigAp()` |
| **WiFi 凭据 NVS** | `wifi_service.cpp` | 命名空间 `"wifi"` |
| **屏幕亮度** | HAL | `GetHAL().setBackLightBrightness(int, bool save)` |
| **扬声器音量** | HAL | `GetHAL().setSpeakerVolume(int, bool save)` |
| **Settings UI** | `app_chrone_core` | `SettingsBridge` — 亮度、音量、时间等 |
| **SNTP 时间同步** | `app_chrone_core/service/sntp_sync` | WiFi 连上后同步 |
| **按键框架** | Mooncake / KeyManager | A/B、A+B 回 Launcher |
| **音频 Codec** | HAL + ES8311 | 麦克风采集、扬声器播放 |
| **IMU BMI270** | HAL | 见 §5 |

### 4.2 GrammarBuddy App 自行负责

| 能力 | 说明 |
|------|------|
| LVGL 教学 UI | 圆屏状态机屏幕 |
| WebSocket 客户端 | 连 GrammarBuddy 后端 `/ws/session` |
| 录音 → `audio_base64` | I2S / HAL 音频采集 |
| TTS 播放队列 | 接收 `data_base64`，ES8311 解码播放 |
| 后端 URL 配置 | App 内 Settings 子页 + NVS `grammabuddy/ws_url` |
| 摇一摇换主题 | BMI270 手势（HOME 场景） |

---

## 5. BMI270（IMU）集成

### 5.1 现有 HAL API

```cpp
// firmware/main/hal/hal.h
struct ImuData {
    float accelX, accelY, accelZ;
    float gyroX,  gyroY,  gyroZ;
};
void updateImuData();
const ImuData& getImuData() const;
```

实现：`firmware/main/hal/hal_imu.cpp` — 使用 `BMI270_BMM150_Sensor` 组件。

### 5.2 参考实现

`firmware/main/apps/app_imu/app_imu.cpp` 在 `onRunning()` 中：

```cpp
GetHAL().updateImuData();
const auto& imu = GetHAL().getImuData();
float motion = sqrt(imu.gyroX*imu.gyroX + imu.gyroY*imu.gyroY + imu.gyroZ*imu.gyroZ);
// 用于 UI 动画；GrammarBuddy 可改为 shake 阈值检测
```

### 5.3 GrammarBuddy 摇一摇

参数默认值见 `shared/ui-contract/shake-config.json`。

## 6. 网络与后端地址

### 6.1 WiFi

GrammarBuddy App **不**实现配网。启动时：

```cpp
if (!chrone_core::GetWifiService().isConnected()) {
    // 显示「请先在 Settings 连接 WiFi」+ 返回 Launcher 提示
}
```

用户通过 Launcher / Settings / Setup 完成 WiFi 配置（Captive Portal，见 `provisioning_view.cpp`）。

### 6.2 后端 URL

NVS 命名空间 **`grammabuddy`**：

| 键 | 默认 | 说明 |
|----|------|------|
| `ws_url` | `ws://192.168.1.100:8000/ws/session` | WebSocket |
| `api_url` | `http://192.168.1.100:8000` | REST（可选） |

**配置入口**：`AppGrammarBuddy` 内「设置 → 服务器地址」三屏 wizard（**不**修改 FIFAWatch ChroneCore Settings 源码）。

---

## 7. 按键与返回 Launcher

Launcher README 通用约定：

| 操作 | 行为 |
|------|------|
| A 单击 | 上一项 / 左 |
| B 单击 | 下一项 / 右 |
| **A + B 同时按住** | **GoHome → 返回 Launcher** |

GrammarBuddy 在 `onRunning()` 中通过 `KeyManager` 处理 A/B；**不要**拦截 A+B 长按，保留系统级回桌面。

教学语义映射见 [three_client_solution_v0.4.md §5.4](./three_client_solution_v0.4.md)。

---

## 8. 音频路径

| 方向 | 路径 |
|------|------|
| 录音 | HAL 麦克风 → PCM/WAV → Base64 → WS `asr` / `audio_base64` |
| 播放 | WS `tts` `data_base64` → 解码 → ES8311 → 扬声器 |

音量使用系统级 `GetHAL().setSpeakerVolume()`（Settings 已配置），App 内不重复做音量 UI。

硬件：PYB_AU_EN（ES8311+MIC）、PYB_SPK_EN（功放），见 FIFAWatch README §M5IOE1。

---

## 9. 与 GrammarBuddy 后端的协议

与 Web 模拟器 **完全相同**：

- 连接：`ws://<host>:8000/ws/session`
- 首包：`control` / `start_session` + `client_type: "stopwatch"`
- 消息类型：`control | asr | gpt | tts | error`

StopWatch **必须**走云端 ASR（`audio_base64`），与 Web 新闻路径一致。

---

## 10. 集成检查清单

### Phase 0 — 骨架

- [x] 创建 `app_grammabuddy` 骨架（`GrammarBuddy/firmware/`）
- [x] WS 客户端 + HOME 屏 + NVS `ws_url` 读取
- [ ] Launcher 图标 + 名称
- [x] WiFi 未连接时友好提示
- [x] WS 连接成功 / 失败 UI
- [x] A+B 可回 Launcher

### Phase 1 — 语法

- [ ] `start_session` grammar
- [ ] 录音 + ASR + FEEDBACK 分页 + TTS 播放
- [ ] PRACTICE 复述闭环

### Phase 2 — 新闻

- [ ] 分段 TTS 播报队列
- [ ] 3 轮对话
- [ ] WRAP_UP 分页

### Phase 3 — 增强

- [ ] NVS `ws_url` 配置 UI
- [ ] BMI270 摇一摇换主题
- [ ] `client_version` 上报

---

## 11. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-06-13 | 初版 |
| v0.2 | 2026-06-13 | 独立 `GrammarBuddy/firmware/` + FIFAWATCH_FIRMWARE 引用模式 |
