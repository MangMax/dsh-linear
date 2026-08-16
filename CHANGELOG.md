# Changelog

本文件记录 dsh-linear 的版本级变更。格式遵循
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[Semantic Versioning](https://semver.org/)。

## [Unreleased]

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
