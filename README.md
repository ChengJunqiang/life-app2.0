# Life App

Vue 3 + TypeScript + Vite + Capacitor 7 手机客户端，与电脑端 `life-web` 共用现有 `life-api`。iPhone 和 Android 使用同一套业务页面，原生工程分别位于 `ios/` 和 `android/`。

## 数据与功能

```text
iPhone / Android App ── HTTP / HTTPS ── life-api ── MySQL
电脑 life-web       ── HTTP / HTTPS ──────┘     └── Redis 登录会话
```

- 密码登录、退出和登录过期处理。
- 云端新增记账、账目明细、筛选、分页、查看、修改和删除。
- 年度/月度收入支出、结余、12 个月趋势和月度支出分类。
- 分类和支付方式读取服务端数据字典，统计沿用 Web 版的接口与口径。

业务数据只通过 API 读写，不在 App 中保存账目数据库，没有 IndexedDB、离线队列或手动同步。会话凭证只保存在当前进程内存中，冷启动需重新登录；密码不保存。断网不能提交记账；保存得到服务端确认后才显示成功。对于写入超时等无法确认结果的情况，应先查询账目确认，再决定是否重试，避免重复记账。

旧版本已经写入 IndexedDB 的内容不会自动上传，也不会在升级时删除。如果旧 App 中有尚未上传的账目，请在更换客户端前保留原始数据并单独安排导出迁移。

## 默认 API 与开发覆盖

App 默认连接阿里云 `life_dev` API：`http://123.56.173.230`。登录页面只展示账号、密码和按需图形验证码，不展示连接设置；使用时无需填写服务地址。

使用 Node 20 或更新版本，在此目录安装依赖：

```bash
npm ci
```

开发环境或后续 HTTPS 地址可以通过构建变量覆盖。需要覆盖时再创建 `.env.local`，例如连接本机 API：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3002
```

配置的是 API 服务的基础地址，**不要追加 `/life`**，客户端会自行追加各业务路径。如果 HTTPS 反向代理统一使用路径前缀，可填写 `https://example.com/api`，使后端业务路径成为 `/api/life/...`。不要填写 MySQL 连接地址、数据库账号或密码。Vite 环境变量会进入前端资源，不能存放秘密。

修改环境文件后需要重启开发服务；已打包 App 的环境地址需要重新打包后才会更新。除当前明确配置的阿里云 HTTP 来源外，发布构建仅接受 HTTPS 服务地址。

开发构建还允许 `localhost`、`127.0.0.1`、`::1` 和 Android 模拟器宿主 `10.0.2.2` 的 HTTP API。iOS 模拟器可用 `http://127.0.0.1:3002`；真机的 `localhost` 指手机本身，开发覆盖应使用可访问的 HTTPS 地址。原生 ATS、Android 明文流量和 WebView 策略独立生效；客户端策略不会允许任意 HTTP 或关闭证书验证。

## Web 开发与非构建检查

```bash
npm run web
npm run typecheck
npm test
```

Web 开发地址默认为 `http://localhost:5174`。也可以从上一级目录执行 `npm run app:web`。

自动化测试使用模拟 API，不连接阿里云、不读写真实数据库。类型检查及模拟测试通过，不等于云端部署或手机运行验证。

## 双平台原生工程

`capacitor.config.ts` 固定应用 ID 为 `com.life.mobile`，使用本地打包资源 `dist/`；发布配置不依赖电脑开发服务器。iOS 和 Android 工程源码都应纳入 Git，Pods、Gradle 输出、复制的 Web 资源、个人签名和本机 SDK 路径由 `.gitignore` 排除。

如需补建缺失的工程：

```bash
npm run cap:prepare
# 或只准备一个平台
npm run cap:prepare -- android
```

此命令只生成原生工程及 Android 依赖描述，不编译、不同步旧 Web 包，也不覆盖已有工程。原生工程未包含本次功能的已构建资源，第一次运行前仍需完成下面的构建与同步。

**以下命令会构建 Web 资源或原生应用，需在准备好工具链后由你明确启动。**

准备发布资源并同步到两个平台：

```bash
npm run cap:sync
npm run cap:ios
npm run cap:android
```

`cap:sync` 包含 Web 构建和 Capacitor 同步。随后在 Xcode / Android Studio 中运行、签名或打包。iOS 使用 Xcode 和 CocoaPods，当前工程最低 iOS 15.4（账目表单使用 WebView 原生支持的 HTML 对话框）；Android 使用 Android Studio、JDK 21 和 Android SDK 35，最低 Android API 23。签名证书、Apple Team、Android keystore 等由本机工具链配置，不写入仓库。

开发时启动模拟器并使用热重载（也会进行原生编译）：

```bash
npm run dev:ios
npm run dev:android
```

默认热重载页面地址为 iOS 模拟器 `127.0.0.1:5174`、Android 模拟器 `10.0.2.2:5174`。真机可通过 `LIFE_APP_HOST` 指定电脑局域网地址，例如 `LIFE_APP_HOST=192.168.1.20 npm run dev:ios`；该变量控制页面热重载地址，不是 API 地址。退出时脚本清理原生配置中的热重载 `server.url`；发布前仍应重新执行 `cap:sync`，确保复制的是当前发布资源。

## 接入现有 life-api

使用现有接口，无需新增 `/life/sync/*`：

| 功能 | 接口 |
| --- | --- |
| 登录图形验证码 | `POST /life/auth/captcha` |
| 登录 / 当前用户 / 退出 | `POST /life/auth/login`、`GET /life/auth/info`、`POST /life/auth/logout` |
| 分类 / 支付方式 | `GET /life/dictionaries/options/query?type=item_type`、`type=pay_type` |
| 明细 / 单条详情 | `GET /life/items/query`、`GET /life/items/query/:id` |
| 新增 / 修改 / 删除 | `POST /life/items/create`、`PUT /life/items/update`、`DELETE /life/items/delete` |
| 总额 / 月度 / 分类统计 | `GET /life/items/reports/total/query`、`monthly/query`、`by-type/query` |

请求使用 JSON 和 `Authorization: Bearer ...`。客户端同时检查 HTTP 状态和现有 API 的业务 `status`；部分字典接口成功时没有 `status`。金额可能由 MySQL 返回字符串，客户端统一转换用于展示。

正常登录使用预设服务地址，通过 JSON 提交账号密码。API 按账号或来源 IP 统计连续失败，达到 3 次后会在登录错误中返回 `captchaRequired: true`；App 随后调用 `POST /life/auth/captcha`，显示 API 自己生成的 5 位 PNG 图形验证码，无需域名或外部验证脚本。客户端不自行判定失败阈值。

验证码有效期为 2 分钟；登录提交将 `captchaId` 和 `captchaCode` 一并放在 JSON body。每次提交后清除旧图片和答案，失败仍需验证时重新获取，不自动重试登录。图片加载失败、过期或未填写答案时不会降级为密码登录；可点击“刷新验证码”重试。切换账号或服务地址立即清除密码和旧挑战，过时响应不会覆盖当前页面。密码、验证码和会话凭证不会放入 URL 或持久化存储。API 必须部署对应版本并强制校验，客户端显示不能替代后端检查。

只有拥有财务管理 `item` 权限的普通用户或管理员可以进入 App 的记账与统计页面；权限与数据归属仍由服务端逐请求检查。HTTP 403 显示权限错误，429 提示稍后重试，503 提示服务暂不可用；这些错误不会误清除仍有效的登录。登录请求的 401 也不会触发另一个已登录会话的过期处理。

云端部署与联调需核对：

1. 阿里云 `life-api` Node 服务使用对应版本，并配置其 MySQL 和 Redis 连接。当前登录依赖 Redis，不是只安装 MySQL 即可使用。
2. 核对现有数据库表结构、数据字典和迁移数据，用真实业务账号验证权限及统计口径。
3. 配置 HTTPS 反向代理。浏览器请求需允许开发地址，打包后的 WebView 来源分别为 iOS `capacitor://localhost` 和 Android `https://localhost`；如收紧 CORS，保留对应来源及 `Authorization`、`Content-Type` 请求头。
4. 与 `life-api` 的安全分支配套部署，配置服务端限流、权限及会话撤销；核对旧密码迁移行为后再开放公网。客户端校验不能替代后端保护。
5. 默认使用预设阿里云 API；如需切换 HTTPS 或开发服务，在构建时覆盖地址，再执行云端接口联调及 iPhone / Android 真机验证。

普通用户的数据范围由 `life-api` 决定；管理员在现有 Web/API 中默认可查看所有用户数据，App 沿用该规则。转出和转入保留独立类型，不计入统计中的收入、支出和结余。
