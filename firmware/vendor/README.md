# Vendor / Submodule（可选）

默认通过 **sibling 目录** 引用 `M5_Stack_FIFAWatch`（与 GrammarBuddy 同级）：

```text
code/
├── GrammarBuddy/firmware/
└── M5_Stack_FIFAWatch/firmware/
```

也可使用 git submodule：

```bash
git submodule add <fifawatch-repo-url> firmware/vendor/fifawatch
export FIFAWATCH_FIRMWARE="$(pwd)/firmware/vendor/fifawatch/firmware"
```

本目录不强制 submodule；CI 应设置 `FIFAWATCH_FIRMWARE` 环境变量。
