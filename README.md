# ☁️ Cloudflare SaaS & Tunnel 模块化管理助手 (Telegram Bot)

基于 Cloudflare Workers 纯 Serverless 架构构建的 Telegram 机器人。将繁琐的 Cloudflare SaaS 回退源设置、Tunnel Ingress 路由下发以及 Custom Hostnames 绑定操作，全部浓缩为几条简单的 Telegram 交互指令。

无需再在复杂的 Cloudflare 控制台中来回跳转，只需在手机上点按几下，即可秒级完成内网穿透与外网自定义域名的全套 HTTPS 路由打通。

> **⚠️ 免责声明**
> 本项目的核心代码与逻辑架构主要由 AI 生成。虽然已在实际环境中跑通了核心流程并经过了基础容错处理，但**未经专业级的安全审计与极端并发测试**。
> 请在使用前自行审查代码逻辑。因使用本项目导致的任何 Cloudflare 账户配置混乱、域名解析异常、服务中断或数据损失，概不负责。**Use at your own risk!**

## ✨ 核心特性

* **⚡ 纯 Serverless 架构**：依托 Cloudflare Workers 与 KV 存储，零服务器运维成本，即插即用。
* **🛡️ 极致安全**：严格的 `ADMIN_TG_ID` 白名单强拦截，拒绝任何未授权的越权访问。
* **🤖 状态机与防呆设计**：上下文感知。机器人会自动记录你当前锁定的隧道与端口，并在你遗漏步骤时提供“保姆级”的下一步操作引导。
* **🔗 全自动路由下发**：一条指令自动完成：修改 Tunnel 配置文件 -> 下发 DNS CNAME 记录 -> 绑定 SaaS 自定义主机名并申请 SSL 证书。
* **🎯 灵活的原子化命令**：高度解耦，支持随时单独切换优选 CNAME 或单独设置当前区域的 SaaS 回退源。

---

## 🛠️ 部署指南

### 1. 准备工作
* 拥有一个 [Cloudflare](https://dash.cloudflare.com/) 账号，并获取具备 **DNS、SaaS 和 Tunnel 读写权限**的 API Token。
* 获取你的 Cloudflare Account ID（在控制台首页或域名概述页右侧栏）。
* 向 Telegram [@BotFather](https://t.me/BotFather) 申请一个 Bot，并获取对应的 `Bot Token`。
* 获取你个人的 Telegram User ID（可通过 [@userinfobot](https://t.me/userinfobot) 获取，纯数字）。

### 2. 创建 KV 命名空间
进入 Cloudflare 控制台 -> **Workers & Pages** -> **KV**，创建一个新的命名空间，例如命名为 `saas_bot_kv`。

### 3. 配置 Workers 与环境变量
1. 创建一个新的 Cloudflare Worker，将本项目 `_worker.js` 中的完整代码粘贴进去并部署。
2. 在该 Worker 的 **Settings (设置)** -> **Variables (变量)** 中，配置以下环境变量与绑定：

**Environment Variables (环境变量):**

| 变量名称 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `CF_API_TOKEN` | Secret (加密) | Cloudflare API 令牌 | `abc123_xyz...` |
| `CF_ACCOUNT_ID` | Text (明文) | Cloudflare 账户 ID | `32位字符串` |
| `TG_BOT_TOKEN` | Secret (加密) | Telegram Bot Token | `123456:ABC-DEF...` |
| `ADMIN_TG_ID` | Text (明文) | 授权的 TG 用户 ID（多个用逗号分隔）| `110227,990227` |

**KV Namespace Bindings (KV 绑定):**
* **Variable name**: 必须严格填写 **`SAAS_KV`**
* **KV namespace**: 选择你刚才在第 2 步创建的命名空间（如 `saas_bot_kv`）

### 4. 激活 Webhook 路由
如果你使用的是 Cloudflare 默认的 `workers.dev` 域名，请确保它在你的网络环境下可以被 Telegram 官方服务器访问。

如果绑定了自定义域名（例如 `bot.yourdomain.com`）：
1. 在 Worker 的 **Triggers (触发器)** 中添加该自定义域。
2. 在浏览器中访问以下链接，强制 Telegram 将消息推送到你的 Worker：
   ```text
   [https://api.telegram.org/bot](https://api.telegram.org/bot)[你的TG_BOT_TOKEN]/setWebhook?url=https://[你的Worker域名]&drop_pending_updates=true
