# GrammarBuddy 生产部署计划与手册

> 目标：将 **backend** + **PC 前端** 部署到与 [mySite](https://github.com/musicajack/mysite) 相同的生产机，通过 **子路径** 访问：  
> **`https://www.beingdigital.cn/GrammarBuddy/`**  
> **不含** StopWatch 固件（固件仍在本机编译烧录；生产只提供 API/WebSocket 服务）。

---

## 1. 访问地址与麦克风

| 用途 | URL |
|------|-----|
| PC 浏览器 | `https://www.beingdigital.cn/GrammarBuddy/` |
| 手机圆屏模式 | `https://www.beingdigital.cn/GrammarBuddy/?device=1` |
| API | `https://www.beingdigital.cn/GrammarBuddy/api/...` |
| WebSocket | `wss://www.beingdigital.cn/GrammarBuddy/ws/session` |
| 健康检查 | `https://www.beingdigital.cn/GrammarBuddy/health` |

**麦克风**：浏览器要求 **HTTPS + 受信任证书**。  
生产复用 mySite 已有 `beingdigital.cn` 证书（`ngx/conf.d/cert/`），**无需单独申请证书**。  
本地开发用 Vite 自签名 HTTPS（`npm run dev`），手机需手动信任证书。

---

## 2. 架构

```text
Internet (443, www.beingdigital.cn)
              │
    ┌─────────▼──────────┐
    │ beingdigital-website│  mySite Nginx，终结 TLS
    │ location /GrammarBuddy/ → proxy
    └─────────┬──────────┘
              │ Docker network: beingdigital-shared
    ┌─────────▼──────────┐
    │ grammarbuddy-web    │  静态 SPA + 反代 api/ws
    └─────────┬──────────┘
              │ grammarbuddy-net
    ┌─────────▼──────────┐
    │ grammarbuddy-api    │  FastAPI :8000
    └────────────────────┘
```

- 前端 Vite `base: /GrammarBuddy/`（见 `frontend/.env.production`）
- 前端 API/WS 通过 `withBase()` / `wsSessionUrl()` 自动带前缀
- mySite 只需 **一条** `location /GrammarBuddy/` 反代到 `grammarbuddy-web`

---

## 3. 仓库内交付物

```text
GrammarBuddy/
├── backend/Dockerfile
├── frontend/Dockerfile          # npm build → /GrammarBuddy/ 静态
├── deploy/nginx.conf            # web 容器内路由
├── deploy/mysite-nginx-snippet.conf
├── docker-compose.yml
└── frontend/.env.production     # VITE_BASE_PATH=/GrammarBuddy/
```

---

## 4. 部署脚本（推荐）

仓库 `deploy/` 目录：

| 脚本 | 用途 |
|------|------|
| `setup-first-time.sh` | 服务器首次：克隆仓库、创建网络、生成 `.env` |
| `deploy.sh` | 日常部署：`docker compose build && up -d` + 健康检查 |
| `verify.sh` | 部署后冒烟测试（curl health / api / 首页） |

### 4.1 服务器首次（只需一次）

```bash
ssh lighthouse@<SERVER>
git clone git@github.com:<owner>/GrammarBuddy.git ~/GrammarBuddy
cd ~/GrammarBuddy
chmod +x deploy/*.sh
bash deploy/setup-first-time.sh
# 编辑 backend/.env 填入密钥后：
bash deploy/deploy.sh
```

### 4.2 日常更新（手动）

```bash
cd ~/GrammarBuddy
git pull
bash deploy/deploy.sh
```

### 4.3 Git push 自动部署（GitHub Actions）

推送 `main` 后 workflow `.github/workflows/deploy.yml` 会 SSH 到服务器执行 `git pull` + `deploy/deploy.sh`。

在 GitHub 仓库 **Settings → Secrets → Actions** 配置（可与 mySite 相同）：

| Secret | 示例 |
|--------|------|
| `SSH_PRIVATE_KEY` | 部署用私钥 |
| `SERVER_HOST` | 服务器 IP/域名 |
| `SERVER_USER` | `lighthouse` |
| `DEPLOY_PATH` | `/home/lighthouse/GrammarBuddy` |
| `SSH_PASSPHRASE` | 可选 |
| `GRAMMARBUDDY_BASE_URL` | 可选，默认 `https://www.beingdigital.cn/GrammarBuddy` |

---

## 5. 服务器首次部署（手动逐步）

### 5.1 准备

```bash
# 生产机（用户 lighthouse，与 mySite 相同）
ssh lighthouse@<SERVER>

# 共享网络（若 mySite 已创建可跳过）
docker network create beingdigital-shared

# 克隆
mkdir -p ~/GrammarBuddy && cd ~/GrammarBuddy
git clone git@github.com:<owner>/GrammarBuddy.git .
```

### 5.2 后端环境变量

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

**生产必填**：

```bash
DASHSCOPE_API_KEY=sk-xxxxxxxx
CORS_ORIGINS=https://www.beingdigital.cn,https://beingdigital.cn
```

### 5.3 启动容器

```bash
bash deploy/deploy.sh
```

或手动：

```bash
docker compose build
docker compose up -d
docker compose ps
```

GrammarBuddy **不映射公网端口**；`grammarbuddy-web` 仅通过 `beingdigital-shared` 网络被 mySite Nginx 访问。

### 5.4 集成 mySite Nginx（必做）

GrammarBuddy 容器**不会**直接暴露 443；必须在 mySite 里加反代，否则 `/GrammarBuddy/` 会被主站 `location /` 或静态资源规则误处理。

**两步：**

1. 复制 `deploy/mysite-nginx-map.conf` → mySite 的 `ngx/conf.d/00-websocket-map.conf`（WebSocket 需要 `$connection_upgrade`）

2. 在 `ngx/conf.d/default.conf` 的 HTTPS `server { }` 内、**正则静态 location 之前**加入 `deploy/mysite-nginx-snippet.conf` 的内容（注意 `^~` 前缀，避免 `/GrammarBuddy/assets/*.js` 被主站静态规则截走）

mySite `docker-compose.yml` **不用改**（已有 `beingdigital-shared` 网络）。重新 build/push mySite 镜像或部署后生效。

**不需要**改 mySite 的 SSL 证书（继续用现有 `beingdigital.cn` 证书即可）。

```nginx
location = /GrammarBuddy {
    return 301 /GrammarBuddy/;
}

location ^~ /GrammarBuddy/ {
    resolver 127.0.0.11 valid=10s;
    set $grammarbuddy_web "grammarbuddy-web:80";
    proxy_pass http://$grammarbuddy_web;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

## 6. 更新流程

```bash
cd ~/GrammarBuddy
git pull
bash deploy/deploy.sh
bash deploy/verify.sh
```

---

## 7. 上线验证

| 检查项 | 命令 / 方式 | 期望 |
|--------|-------------|------|
| 健康 | `curl -s https://www.beingdigital.cn/GrammarBuddy/health` | `{"status":"ok"}` |
| 版本 | `curl -s https://www.beingdigital.cn/GrammarBuddy/api/version` | JSON |
| 课时 | `curl -s https://www.beingdigital.cn/GrammarBuddy/api/lessons` | `lessons` 数组 |
| 前端 | 浏览器打开 `/GrammarBuddy/` | 主题首页 |
| WebSocket | DevTools → Network → WS | `/GrammarBuddy/ws/session` 101 |
| 手机麦克风 | `/GrammarBuddy/?device=1` | 点击 Start 后可录音 |

---

## 8. StopWatch（可选）

固件配网 `ws_url` 改为：

```text
wss://www.beingdigital.cn/GrammarBuddy/ws/session
```

---

## 9. 安全与运维

- `DASHSCOPE_API_KEY` 仅服务器 `backend/.env`，勿提交 Git
- 新闻历史：`backend/data/news_history/` 已挂载卷
- 证书由 mySite 统一维护；GrammarBuddy 容器内为 HTTP 80，不处理 TLS

---

## 10. 与 mySite 对比

| mySite | GrammarBuddy |
|--------|----------------|
| 纯静态单容器 | API + Web 双容器 |
| 根路径 `/` | 子路径 `/GrammarBuddy/` |
| 无 WebSocket | 需 WS 升级与长超时 |
| 无后端密钥 | 必须 `backend/.env` |

---

## 11. GitHub Actions（可选，对齐 mySite）

Secrets 可与 mySite 共用：`SSH_PRIVATE_KEY`、`SERVER_HOST`、`SERVER_USER`、`DEPLOY_PATH`、`GHCR_TOKEN`。

流程：push `main` → 构建 `grammarbuddy-api` / `grammarbuddy-web` 镜像 → SSH 到服务器 `docker compose pull && up -d`。

详见 mySite `.github/workflows/deploy.yml` 作模板。
