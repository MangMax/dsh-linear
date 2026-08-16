# Changelog

本文件记录 dsh-linear 的版本级变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[Semantic Versioning](https://semver.org/)。

## [Unreleased]

### Changed

- OAuth 授权回调页（`/integrations/linear/oauth/callback`）重做为与主界面
  统一的样式：内嵌 DSW 设计令牌（浅色/深色双主题，跟随系统
  `prefers-color-scheme`）、居中卡片 + 状态图标（成功绿勾 / 失败红叉）、
  GUI 字体栈与按钮规范，新增「返回 Harness」主按钮（成功页另有「关闭
  标签页」）；错误页不渲染任何脚本，消息转义与 no-store 语义保持。
- 设置卡片改为三 tab 布局：**连接**（状态 + Connect/Reconnect/Disconnect）、
  **认证**（authMode 与 OAuth 凭据 / API Key）、**行为**（writePolicy /
  actorMode / 默认值 / 分页上限）；保存·放弃按钮常驻底部，任何 tab 均可
  保存，切换 tab 不丢失草稿；英文 savedNote 文案修正为即时生效。

### Added

- 设置卡片补齐全部用户面字段：`writePolicy`（ask/allow/deny 下拉）、
  `actorMode`（user/app 下拉）、`defaultTeam` / `defaultProject`（文本）、
  `searchLimit` / `commentsLimit`（数字，带 1–50 / 正整数范围校验）；
  浏览器可写白名单同步扩展（actorMode / defaultTeam / defaultProject /
  searchLimit / commentsLimit）；全部保存即时生效。

### Added

- 首个完整版：56 个 Linear 工具（33 读 + 23 写），对齐 Linear 官方 MCP
  工具面（Agent Mode / 原始 GraphQL 除外）
- OAuth + PKCE 网页授权与 API Key 两种认证，设置实时切换（`applies:
live`，无需重启）
- Settings → Plugins 配置卡片（中英文双语，折叠面板，Connect /
  Reconnect / Disconnect 与设置表单）
- 管道级写门控（`writePolicy`：ask / allow / deny）
- 语义解析（名称 / 标识符 / URL / UUID，歧义返回候选）、错误归一化、
  429/5xx 自动重试、元数据缓存、token-fingerprint 客户端缓存
- 附件全链路：URL 链接、签名直传（prepare / finalize）、一步式文件上传
  （宿主侧，跨平台零 shell）
- 跨平台：Windows / macOS / Linux CI 矩阵；纯 Node 实现，无 shell 依赖
- 真实 Linear E2E 套件（`LINEAR_TEST_API_KEY`）与 npm 发布工作流
