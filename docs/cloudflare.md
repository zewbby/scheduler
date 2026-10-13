# Cloudflare 同步部署

冲冲冲使用本地优先的数据方式：没有网络时仍能新增、修改和完成日程。后端于 2026-10-13 部署到当前授权的 Cloudflare 账号，0.3.0 增加头像接口与 `0002_profile.sql` 迁移。

当前服务：[冲冲冲同步服务](https://liubai-planner-20261013.qiansiwanlv-d64678.workers.dev/api/health)。Worker 与 D1 名称继续沿用 `liubai-planner-20261013`，保留已有数据。服务地址已预置，首次登录需要联网；成功登录后可离线使用。部署元数据保存在 `cloudflare/deployment.json`。

以下步骤用于在其他 Cloudflare 账号重新部署或维护现有服务；当前已部署的版本无需重复创建数据库或配置密钥。

## 1. 创建数据库

以下 PowerShell 命令在项目根目录执行。需要 Node.js 24 或更新版本、pnpm 和你的 Cloudflare 账号。首次运行 `pnpm dlx` 会下载 Wrangler 4。

```powershell
pnpm dlx wrangler@4 login
pnpm dlx wrangler@4 d1 create liubai-planner
```

在其他账号创建时，把创建结果中的 `database_id` 与 `database_name` 填入 `cloudflare/wrangler.jsonc`，同时替换该文件的 `account_id` 和 Worker 名称。保留绑定名称 `DB`。当前配置指向已经部署的专用数据库，维护现有服务时直接使用现有名称。

```powershell
pnpm dlx wrangler@4 d1 migrations apply liubai-planner --remote --config cloudflare/wrangler.jsonc
```

## 2. 设置同步密钥并发布

先通过 `node scripts/configure-account.mjs` 从隐藏标准输入提供一行含 username、password 的 JSON，生成本机 `.local/account.json`。文件保存随机盐与 PBKDF2 校验值，被 Git 忽略，也不会进入客户端构建。将该记录配置为 Cloudflare Secret，再生成服务端签发的随机同步凭据：

```powershell
Get-Content -LiteralPath .local/account.json -Raw | pnpm dlx wrangler@4 secret put ACCOUNT_PASSWORD_RECORD --config cloudflare/wrangler.jsonc
node scripts/new-sync-secret.mjs | pnpm dlx wrangler@4 secret put SYNC_TOKEN --config cloudflare/wrangler.jsonc
pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.jsonc
```

部署后，在设置的「账号连接」中填写 Worker 地址、日程本账号及密码。服务端验证密码后返回同步凭据，Windows 将它加密保存在本机。密码不写入客户端本地配置、导出备份或服务端日志。登录接口按来源 IP 限制 15 分钟内最多 8 次连续尝试；成功登录会重置计数。

本机登录可以离线使用，属于进入日程界面的本机校验；Cloudflare 接口会独立验证账号和同步凭据。当前是一个个人工作区，登录成功的设备都访问这一个日程本。

以下高级密钥方式也保留，适用于自行管理同步凭据的使用者：

用密码管理器生成一段随机的 32–512 字符密钥，或在自己的终端运行下面的命令生成 32 字节随机值。妥善保存生成结果，所有设备都要填写同一段密钥。

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
pnpm dlx wrangler@4 secret put SYNC_TOKEN --config cloudflare/wrangler.jsonc
pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.jsonc
```

`secret put` 会交互式要求粘贴密钥。不要把真实密钥写进 `wrangler.jsonc`、源码、Git 或构建包。部署完成后会返回类似 `https://liubai-sync.YOUR-SUBDOMAIN.workers.dev` 的地址。

在冲冲冲的同步设置中填写这个地址与密钥，连接后执行同步。其他设备填写相同配置；一台设备新增日程后，另一台同步即可看到。首次配置、切换服务器或更换工作区时，客户端从游标 `0` 获取完整数据。

一套 Worker + D1 是**一个个人工作区**，持有密钥即可读写该工作区的全部日程。当前没有多用户注册、邀请、权限分级或端到端加密。数据库由你的 Cloudflare 账号管理。轮换密钥时再次执行 `secret put SYNC_TOKEN`，并更新每台设备的设置。

## 3. 本地验证

```powershell
Copy-Item cloudflare/.dev.vars.example cloudflare/.dev.vars
```

编辑 `.dev.vars`，将示例密钥换成你自己的开发密钥。这一文件已经在 `cloudflare/.gitignore` 中排除。开发环境与线上环境使用不同密钥。

```powershell
pnpm dlx wrangler@4 d1 migrations apply liubai-planner --local --config cloudflare/wrangler.jsonc
pnpm dlx wrangler@4 dev --config cloudflare/wrangler.jsonc
```

Wrangler 显示本地地址后，在客户端设置中填写该地址。开发前端的默认来源 `http://localhost:5173` 与 `http://127.0.0.1:5173` 已放行。

后端测试无需 Cloudflare 登录、真实数据库或网络：

```powershell
node --test cloudflare/test/*.test.mjs
```

测试通过 Node 内置 SQLite 运行实际迁移和实际 SQL，覆盖账号验证、登录次数限制、两个设备互相同步、增量查询、重复重试、同时间戳冲突、离线删除、恢复后的旧游标、批量写入、鉴权、CORS、输入校验与事务回滚。线上 Worker 也已通过真实账号与独立测试记录的往返验证，测试记录已清理。

## 4. 来源与客户端

`ALLOWED_ORIGINS` 是用逗号分隔的来源列表。默认包含本地 Vite、预览、`app://liubai` 及预留的 Capacitor 来源；使用自定义网页域名时，添加准确的 `https://域名`，然后重新部署。

`ALLOW_FILE_ORIGIN: "true"` 支持 Electron 从 `file://` 载入页面时发送的 `Origin: null`。如果客户端完全改用自己的应用协议，可将它设为 `"false"`。不发送 Origin 的原生 HTTP 客户端也能连接。所有数据接口始终要求 Bearer 密钥；CORS 不是用户身份校验。

`GET /api/health` 是不包含个人数据的公开服务标识，返回服务名称和协议版本；它不验证数据库迁移或密钥。成功执行 `POST /api/sync` 才证明完整同步链路可用。

## 5. 同步协议 v1

```http
POST /api/sync
Authorization: Bearer <SYNC_TOKEN>
Content-Type: application/json
```

请求示例：

```json
{
  "since": 0,
  "items": [{
    "id": "event-20261013-a",
    "title": "阅读与笔记",
    "date": "2026-10-13",
    "startTime": "20:00",
    "endTime": "20:45",
    "category": "growth",
    "notes": "读完一章，记下一个想法。",
    "completed": false,
    "updatedAt": 1791892800000,
    "deleted": false
  }]
}
```

字段约束：`id` 长度 1–128，仅字母、数字、短横线、下划线；`title` 不可为空，最多 200 字符；`notes` 最多 10000 字符；`category` 仅 `work`、`life`、`growth`。日期必须是有效的 `YYYY-MM-DD`。日卡片待办的 `startTime` 与 `endTime` 都为空；旧时间日程继续接受有效的 24 小时制 `HH:mm` 区间。可选 `createdAt` 用于保持新增顺序，必须不晚于 `updatedAt`。`updatedAt` 为正整数毫秒时间戳，不能超过服务器当前时间五分钟。

每次请求最多 250 个不同 ID、请求体最多 2 MiB。更多待发送条目应拆成多批，每批成功后处理服务器结果。`items: []` 可只拉取更新。`since` 为上一轮成功保存的游标，`0` 表示完整拉取。

响应结构：

```json
{
  "items": [],
  "cursor": 42,
  "full": false,
  "serverTime": 1791892800000
}
```

`items` 包含游标之后变化的全部记录，也始终包含本次提交 ID 的服务器最终版本，每条记录额外带有 `revision`。因此旧设备提交被拒绝的旧版本后，也会收到正确版本。游标与返回记录来自同一事务快照。服务器会检测超出当前数据库版本的旧游标并返回完整快照。

合并规则与客户端实现约定：

1. 同一 ID 的较大 `updatedAt` 获胜；相同时间戳时 `deleted: true` 获胜；仍相同时，比较规范化 JSON 的字典顺序，较大值获胜。规范化键顺序为 `id,title,date,startTime,endTime,category,notes,completed,updatedAt,deleted`，所有非 ASCII UTF-16 单元编码为小写 `\uXXXX`。后端 `canonicalPayload()` 实现了该序列化。
2. 删除是保留全部字段并设置 `deleted: true` 的墓碑记录，不能物理移除。删除时间也要更新。服务器长期保留墓碑，防止久未联网的设备恢复已删除条目。
3. 请求前记录本次发送版本。成功响应可替换这些准确的旧版本；如果用户在网络请求期间又编辑了本地记录，应保留新编辑，并在下一轮继续上传。
4. 将服务器合并结果、待同步队列和游标一起持久化，完成后再显示成功。网络失败、鉴权失败、无效响应或存储失败时保留待发送数据，重试相同内容是幂等的。
5. 响应缺少某个 ID **不代表删除**；即使 `full: true` 也先合并记录，保留尚未上传的本地条目。跨设备时间使用日历日期与本地钟表时间，当前版本不自动换算时区，也不支持跨午夜的单条日程。

这是整条记录的最后修改获胜协议，同一条日程在两台离线设备同时修改时，只保留获胜版本，不做字段级合并。计划数据量按个人日程设计，拉取结果没有静默截断。

错误统一返回 `{ "error": { "code": "...", "message": "..." } }`，HTTP 状态包括 `400` 校验失败、`401` 密钥不正确、`403` 来源未放行、`413` 内容过大、`415` 内容类型错误、`503` 未配置或存储暂时不可用。不要在失败时清空本地待同步记录。

## 6. 备份与维护

头像使用 `GET /api/profile` 与 `PUT /api/profile`，要求相同 Bearer 凭据。内容为 `{avatarId, image, updatedAt}`；预设标识为 `notebook-yellow`、`notebook-blue`、`notebook-peach`，`image` 为 null；自定义头像标识为 `custom`，图片只接受 PNG、JPEG、WebP 的 data URL，最长 180000 字符。后端验证图片签名并保留较新时间戳的版本；客户端在联网、重新聚焦与定时同步时拉取头像，上传失败会保留本机修改。

上线后可通过 Cloudflare 控制台管理 D1，并定期导出自己的数据库：

```powershell
pnpm dlx wrangler@4 d1 export liubai-planner --remote --output liubai-backup.sql --config cloudflare/wrangler.jsonc
```

数据库备份含私人日程，保存到你控制的位置。恢复备份或更换数据库后，让客户端执行一次完整同步。不要手工清除墓碑或重置版本号后继续沿用旧增量游标。

实现使用 Cloudflare 官方 [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/) 中的参数绑定、事务批处理及 `first-primary` 会话；密钥配置参考 [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
