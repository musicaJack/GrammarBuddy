# GrammarBuddy 共享契约（shared/）

三端（backend / web / firmware）的**单一真相来源**。变更流程：

1. 先改 `shared/`
2. 再改 backend → frontend → firmware
3. 更新 `version/compatibility.json`

## 目录

| 路径 | 用途 |
|------|------|
| `protocol/states.json` | UI 状态与 News phase 枚举 |
| `protocol/ws-envelope.schema.json` | WebSocket 消息外壳 |
| `protocol/actions.json` | control action 清单 |
| `ui-contract/input-map.yaml` | A/B 键语义 |
| `ui-contract/shake-config.json` | BMI270 摇一摇默认参数 |
| `design-tokens/stopwatch-theme.json` | 圆屏色值/字号 |
| `version/compatibility.json` | 协议与各客户端最低版本 |

## 校验（规划）

```bash
# 后续：scripts/check_shared_enums.py 对比 state.py / types/index.ts
```
