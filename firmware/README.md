# GrammarBuddy StopWatch 固件

独立 ESP-IDF 工程，运行于 M5Stack StopWatch（466×466 圆屏）。

**不重复开发**：WiFi 配网、亮度/音量、Launcher、HAL、BMI270 等从 [M5_Stack_FIFAWatch](https://github.com/...) 引用。

## 架构

```text
GrammarBuddy/firmware/          ← 本仓库（GrammarBuddy 专属 App + main）
        │
        │  FIFAWATCH_FIRMWARE 指向
        ▼
M5_Stack_FIFAWatch/firmware/    ←  sibling 或 submodule（HAL / Launcher / components）
        │
        └── components/         ← Mooncake、LVGL、M5GFX、BMI270…
```

本工程 **仅新增** `main/apps/app_grammabuddy/`；`main.cpp` 注册 Launcher + 系统 App + GrammarBuddy（**不含** FIFAWatch 世界杯 App）。

## 前置条件

- ESP-IDF **v5.5.x**（与 FIFAWatch 一致）
- 已克隆 **M5_Stack_FIFAWatch** 并完成其 `components` 拉取（见 FIFAWatch `firmware/README.md`）

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `FIFAWATCH_FIRMWARE` | FIFAWatch 的 `firmware/` 绝对路径 | `../../M5_Stack_FIFAWatch/firmware`（与 GrammarBuddy 同级） |

PowerShell 示例：

```powershell
$env:FIFAWATCH_FIRMWARE = "C:\Users\sh_mu\code\M5_Stack_FIFAWatch\firmware"
```

## 首次构建

```powershell
cd firmware

# 1. 确认 FIFAWatch 路径
.\scripts\check_fifawatch.ps1

# 2. 若 configure 失败过，务必删掉整个 build 目录（不要手动 mkdir build）
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue

# 3. 构建（必须先 set-target esp32s3）
#    若曾 configure 失败，可删 dependencies.lock 后重试
Remove-Item -Force dependencies.lock -ErrorAction SilentlyContinue
idf.py set-target esp32s3
idf.py build
# idf.py flash monitor
```

## 目录

```text
firmware/
├── CMakeLists.txt
├── sdkconfig.defaults          # 可从 FIFAWatch 复制
├── main/
│   ├── CMakeLists.txt          # 引用 FIFAWatch HAL/Launcher 源
│   ├── Kconfig.projbuild       # ChroneCore weather (required by chrone_weather)
│   ├── idf_component.yml
│   ├── main.cpp
│   └── apps/
│       └── app_grammabuddy/    # GrammarBuddy 教学 App
├── scripts/
│   └── check_fifawatch.ps1
└── vendor/
    └── README.md               # 可选 git submodule 说明
```

## 已安装 App（main.cpp）

| App | 来源 | 作用 |
|-----|------|------|
| AppLauncher | FIFAWatch | 应用列表 |
| AppSetup | FIFAWatch | 首次 WiFi 引导 |
| AppChroneCore | FIFAWatch | 表盘、Settings（亮度/音量）、WiFi 服务 |
| **AppGrammarBuddy** | **本仓库** | 英语教学 |

## 托管组件（Component Registry）

`main/idf_component.yml` 声明：`esp_codec_dev`、`esp-dsp`、`esp_websocket_client`（**IDF 5.x 起 WebSocket 不在核心 IDF 里**）。

## 后端地址

- `ws_url` — 默认 `ws://192.168.1.100:8000/ws/session`
- 在 App 内「设置 → 服务器」修改（见 `app_grammabuddy` 规划）

## 文档

- [../docs/three_client_solution_v0.4.md](../docs/three_client_solution_v0.4.md)
- [../docs/launcher_integration_v0.2.md](../docs/launcher_integration_v0.2.md)
