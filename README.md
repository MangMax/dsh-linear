# dsh-linear

**DeepSeek Harness 原生 Linear Connector** — 一个 Cordis 插件，为 Harness
Agent 提供 Linear 工作区能力：查询、创建、更新 issue，评论、附件、项目、
团队、cycle、文档、发布、客户等，通过 OAuth（PKCE）或个人 API Key 连接。

```text
安装 dsh-linear
      ↓
连接 Linear (OAuth / API Key)
      ↓
Harness 注册 Linear 原生工具
      ↓
Agent 使用自然语言操作 Linear
```

## 特性

- **56 个语义化工具**（33 读 + 23 写），对齐 Linear 官方 MCP 工具面
  （Agent Mode / 原始 GraphQL 除外）
- **两种认证**：OAuth + PKCE（网页授权，新标签页完成）与 Personal API
  Key；设置**实时切换，无需重启**
- **写操作全门控**：`writePolicy` = ask（默认）/ allow / deny，管道级统一生效
- **语义解析**：issue / 团队 / 项目 / 状态 / 用户 / 标签全部可用名称引用
  （`ENG-123`、URL、UUID 均可），歧义返回候选列表，绝不猜测
- **可靠性**：错误归一化（模型永远看不到 GraphQL 堆栈）、429/5xx 自动
  重试、元数据缓存、无损 JSON 输出
- **配置卡片**：Settings → Plugins 中的 Linear Connector 卡片，中英文双语，
  保存即时生效
- **跨平台**：纯 Node 实现，Windows / macOS / Linux 行为一致；文件上传
  为宿主侧一步式，零 shell 命令

## Requirements

| 依赖             | 版本                             |
| ---------------- | -------------------------------- |
| Node.js          | ≥ 20                             |
| pnpm             | 11.x                             |
| DeepSeek Harness | `0.1.0-rc.6` wave（peer 已锁定） |
| 工具链           | Vite+ (`vp`) 0.2.x               |

## Install

```bash
dsh plugin --profile <name> add dsh-linear
```

本地开发安装（打包后）：

```bash
pnpm build                       # vp pack → dist/
pnpm pack                        # → dsh-linear-0.1.0.tgz
dsh plugin --profile web add ./dsh-linear-0.1.0.tgz
```

安装即挂载：`dsh plugin add` 会把 `dsh-linear` 追加进 profile 的 bundle
栈并合并插件的 patch（`cordis.patch.yml`），无需手改配置。

## Connect

### OAuth（推荐）

> **硬性前置**：插件不内置 `client_id` / `client_secret`。需要在
> [Linear Developer Settings](https://linear.app/settings/api) 创建
> OAuth 应用，并注册回调地址：
>
> ```text
> http://127.0.0.1:<web-port>/integrations/linear/oauth/callback
> ```
>
> 端口必须与 web server 实际监听端口一致。

1. 打开 Harness 网页 → Settings → Plugins → **Linear Connector** 卡片
2. 认证方式选 OAuth，填入 clientId / clientSecret / redirectUri → 保存
   （即时生效）
3. 点 **Connect** → 新标签页打开 Linear 授权页 → 授权完成
4. 卡片自动刷新为 `已连接`（Disconnect / Reconnect 随时可用）

### API Key

1. 卡片中认证方式切到 **API Key** → 填入 Personal API Key → 保存
2. 凭据写入 `DSH_LINEAR_API_KEY`，状态即变为已连接

两种模式的配置（认证方式、凭据、写策略）都可在卡片里实时切换，无需
重启 Harness。Token 永不出现在设置界面；`writePolicy` 等也可在卡片外经
profile patch 配置。

## Available Tools

### 连接

| 工具                       | 说明                                      |
| -------------------------- | ----------------------------------------- |
| `linear_connection_status` | 连接状态机 / 工作区 / 当前用户 / 友好指引 |

### Issue

| 工具                       | 读写   | 说明                                             |
| -------------------------- | ------ | ------------------------------------------------ |
| `linear_search_issues`     | 读     | 多条件搜索（分页，默认 20 / 上限 50）            |
| `linear_get_issue`         | 读     | 按 `ENG-123` / URL / UUID 取 issue               |
| `linear_get_issue_context` | 读     | 一次聚合 issue 全上下文 + 最近评论               |
| `linear_list_comments`     | 读     | 某 issue 的评论（分页）                          |
| `linear_list_attachments`  | 读     | 某 issue 的附件列表                              |
| `linear_create_issue`      | **写** | 语义名称（team/project/status/assignee/labels）  |
| `linear_update_issue`      | **写** | 仅显式字段；`null` 清空 project/assignee/dueDate |
| `linear_add_comment`       | **写** | 追加评论                                         |
| `linear_update_comment`    | **写** | 更新评论正文（按 ID）                            |
| `linear_delete_comment`    | **写** | 删除评论（按 ID）                                |

### 用户 / 团队 / 元数据

| 工具                                    | 读写   | 说明                                              |
| --------------------------------------- | ------ | ------------------------------------------------- |
| `linear_list_users` / `linear_get_user` | 读     | 工作区用户（分页 / 按名称·邮箱·ID）               |
| `linear_get_profile`                    | 读     | 当前登录用户资料                                  |
| `linear_list_teams` / `linear_get_team` | 读     | 团队列表 / 详情（issue 数 · cycles · triage）     |
| `linear_list_cycles`                    | 读     | 团队 cycle 列表（分页）                           |
| `linear_list_issue_statuses`            | 读     | 某团队的 workflow states（`status` 参数取值来源） |
| `linear_get_issue_status`               | 读     | 按名称 / ID 取单个 workflow state                 |
| `linear_list_issue_labels`              | 读     | 工作区（或某团队）的 issue 标签                   |
| `linear_create_issue_label`             | **写** | 创建 issue 标签                                   |

### 项目 / 里程碑 / 状态更新

| 工具                                                                                          | 读写   | 说明                                      |
| --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| `linear_list_projects` / `linear_get_project`                                                 | 读     | 项目列表（team/status/名称过滤）/ 详情    |
| `linear_list_milestones` / `linear_get_milestone`                                             | 读     | 里程碑（可按项目过滤）/ ID·URL·名称取单个 |
| `linear_create_milestone` / `linear_update_milestone`                                         | **写** | 创建 / 更新里程碑                         |
| `linear_list_status_updates` / `linear_get_status_update`                                     | 读     | 项目状态更新（可按项目过滤）              |
| `linear_create_status_update` / `linear_update_status_update` / `linear_delete_status_update` | **写** | 发布 / 更新 / 归档状态更新                |

### 文档 / Initiative / 发布 / 客户

| 工具                                                                                                           | 读写   | 说明                                     |
| -------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| `linear_list_documents` / `linear_get_document`                                                                | 读     | 工作区文档（分页 / ID·URL）              |
| `linear_list_initiatives` / `linear_get_initiative`                                                            | 读     | initiative 列表 / 详情                   |
| `linear_list_initiative_labels`                                                                                | 读     | initiative 标签                          |
| `linear_create_initiative` / `linear_create_initiative_label`                                                  | **写** | 创建 initiative / 标签                   |
| `linear_list_releases` / `linear_get_release`                                                                  | 读     | 发布列表 / 详情                          |
| `linear_list_release_pipelines`                                                                                | 读     | 发布管线（stage）列表                    |
| `linear_list_release_notes` / `linear_get_release_note`                                                        | 读     | 发布说明列表 / Markdown 详情             |
| `linear_create_release`                                                                                        | **写** | 在指定管线创建 release（管线按名称解析） |
| `linear_list_customers` / `linear_get_customer`                                                                | 读     | 客户列表 / 详情                          |
| `linear_create_customer` / `linear_update_customer` / `linear_delete_customer` / `linear_delete_customer_need` | **写** | 客户增改删 / 归档客户需求                |

### 附件

| 工具                                   | 读写   | 说明                                                                  |
| -------------------------------------- | ------ | --------------------------------------------------------------------- |
| `linear_create_attachment`             | **写** | 外部 URL 链接为附件（同 URL 重链更新）                                |
| `linear_upload_attachment_file`        | **写** | **一步式文件上传**（宿主侧 read→PUT→finalize，跨平台零 shell，≤20MB） |
| `linear_prepare_attachment_upload`     | **写** | 签名直传准备（60s 窗口，返回逐字 headers 与双平台示例）               |
| `linear_create_attachment_from_upload` | **写** | 把已上传的 assetUrl 链接为附件                                        |
| `linear_delete_attachment`             | **写** | 删除附件（按 ID）                                                     |

## Write Permissions

所有写工具统一走管道级门控（`writePolicy`）：

```text
ask（默认） → 每次写操作需用户审批（会话禁用审批时 fail-closed 拒绝）
allow      → 直接执行
deny       → 一律拒绝
```

- 写工具保持纯净：门控在工具执行前生效，工具自身不含审批逻辑
- 删除类工具与创建类同等级门控，无额外白名单
- 读工具永远自动放行

## Configuration

| 字段                                                  | 默认               | 说明                                                        |
| ----------------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| `authMode`                                            | `oauth`            | `oauth` / `apiKey`（卡片可实时切换）                        |
| `credentialRef`                                       | `DSH_LINEAR_OAUTH` | OAuth bundle 引用；apiKey 模式自动落到 `DSH_LINEAR_API_KEY` |
| `oauthClientId` / `oauthClientSecret` / `redirectUri` | —                  | OAuth 应用凭据与回调（secret 保存后不回显）                 |
| `writePolicy`                                         | `ask`              | 写门控（卡片可实时切换）                                    |
| `actorMode`                                           | `user`             | Linear 侧身份（Agent Mode 需要 `app`）                      |
| `defaultTeam` / `defaultProject`                      | —                  | 创建 issue 缺省值                                           |
| `searchLimit` / `commentsLimit`                       | 20                 | 分页默认值                                                  |

所有字段 `applies: live`——保存即生效，无需重启。

## Compatibility

| 维度             | 验证                               |
| ---------------- | ---------------------------------- |
| DeepSeek Harness | `0.1.0-rc.6` wave（peer 锁定）     |
| Node.js          | 20 / 22 / 24                       |
| OS               | Windows / macOS / Linux（CI 矩阵） |
| `@linear/sdk`    | 90.x                               |
| `oauth4webapi`   | 3.x                                |
| pnpm             | 11.x                               |

## Security

- Secret 一律经 `ctx.credentials`，禁止写入配置 / 日志 / 测试 fixture
- OAuth：PKCE S256 + state 校验 + loopback 回调；scope 最小化
  （`read,write`，不申请 `admin`）
- 写操作默认 `ask`；删除类工具同等门控
- 签名上传 URL / headers 绝不入日志；错误输出不泄漏 token 与堆栈

## Development

```bash
pnpm install
pnpm check        # vp check（格式 + lint + 类型）
pnpm test         # vp test（unit / contract / integration / smoke）
pnpm test:e2e     # 真实 Linear E2E（需 LINEAR_TEST_API_KEY）
pnpm build        # vp pack + 浏览器卡片构建
pnpm pack         # 产出可安装 tgz（prepack 跑全门禁）
pnpm release      # bumpp 版本 + tag
```

- 测试分层：`tests/unit`（纯逻辑）/ `tests/contract`（SDK 边界 mock）/
  `tests/integration`（最小 Cordis Context）/ `tests/smoke`（包面 + 内容
  检查）/ `tests/e2e`（真实 Linear，可选）
- CI：Windows / macOS / Linux × Node 20/22/24 全量门禁；推 `v*` tag 触发
  发布（npm publish + provenance）

## Troubleshooting

- **写工具报 "the user rejected tool"** — 会话审批策略的自动拒绝
  （`writePolicy: ask` 且会话禁用审批提示），调用未到达 Linear。放行：
  配置 `writePolicy: allow` 或在启用审批的会话中操作
- **429 / 5xx 频繁出现** — 插件已自动重试（最多 2 次、指数退避；写操作
  仅 429 重试）。仍失败时报 `RATE_LIMITED` / `NETWORK_ERROR` 单行错误
- **`USAGE_LIMIT_EXCEEDED`** — 工作区套餐配额（如免费版 active issue 上
  限），非权限问题：归档部分 issue 或升级套餐
- **OAuth 回调失败** — `redirectUri` 与 Linear 应用注册值逐字符一致，且
  端口与 web server 实际监听端口一致
- **OAuth 未连接** — 确认 `oauthClientId` / `redirectUri` 已配置且授权
  完成；或切换 API Key 模式
- **状态 expired / revoked** — 会话过期/被撤销：点 Reconnect 重新授权
- **上传 PUT 403** — 签名窗口 60 秒过期或 header 未逐字携带；优先使用
  `linear_upload_attachment_file`（宿主侧一步式，无此问题）
