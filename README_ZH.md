# Reply Suggestions — Diginno

[Tiếng Việt](./README.md) · [English](./README_EN.md) · **简体中文**

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 推荐下一句提问。助手回答后，空输入框中会出现灰色推荐。按 **Enter** 填入可编辑草稿，修改后再发送——**不会自动发送消息**。

此版本由 Diginno 独立维护，基于 [jabingu/dsh-reply-suggestions](https://github.com/jabingu/dsh-reply-suggestions)，保留上游 Git 历史和 MIT 许可证。它不是 DeepSeek 官方插件。

| 项目 | 版本 / 状态 |
| --- | --- |
| 插件 | `0.1.17-diginno.1` |
| 支持的 DSH | **`0.2.1-rc.5`** |
| 运行时验证平台 | macOS 上的 DSH Desktop |
| 构建/测试所需 Node.js | 22 或更高；CI 在 Windows/Linux 上测试 Node 22/24 |
| 许可证 | [MIT](./LICENSE) |

> 仅支持上述 DSH 版本。面向 rc.2 的上游 `0.1.17` 并非此维护版。请勿绕过兼容性检查，强行安装到其他 DSH 版本。

## 功能

- 根据最近一次用户提问和助手回答，生成一条相关的后续提问。
- 第一次按 **Enter** 只填入草稿；**Escape** 隐藏推荐。保留 DSH 的输入法确认及 Shift/Ctrl/Command/Alt+Enter 行为。
- 有草稿、附件、引用或待处理队列时延后生成；任务运行时隐藏推荐。
- 复用 DSH 已配置的 provider/model，无需再填 API key。
- 在插件详情页查看 Token、请求次数、失败/取消次数及费用估算。
- Diginno 版处理模型 `error`/`aborted` 终止：不缓存未完成文本，并保留已返回的用量。

## 演示

![灰色推荐与首次 Enter 填入草稿](./assets/reply-suggestions-demo-0.1.16.png)

图片由上游 `0.1.16` 客户端测试夹具生成，放置于模拟对话页面；**不是 rc.5 验收截图**，不含真实对话，也未调用模型。

## 安装

### 1. 从 Diginno 仓库打包

需要 Git 和 Node.js 22 或更高。构建与测试仅使用 Node 内置库，无需 `npm install`。

```sh
git clone https://github.com/diginno-net/dsh-reply-suggestions.git
cd dsh-reply-suggestions
npm run build
npm test
npm pack --ignore-scripts
```

生成 `dsh-reply-suggestions-0.1.17-diginno.1.tgz`。仓库已提交构建文件，上述流程会在打包前进行验证。`main` 上的代码可能变化，因此每次部署应保留实际验证过的 `.tgz`。

### 2. 安装到 DSH

1. 确认 DSH 为 **`0.2.1-rc.5`**，并已配置可用模型。
2. 打开 **插件（Plugins）**，检查是否已有 `dsh-reply-suggestions`。替换旧版前先备份，并遵循[替换/回滚说明](./MAINTENANCE.md)，不要重复安装同名包。
3. 选择 **添加插件（Add plugin）**，输入生成的 `.tgz` 的绝对路径并启用。
4. 按插件管理器的结果操作。仅在要求时重启，且应等待运行中的任务结束。
5. 完成一轮对话，保持输入框为空，等待推荐出现。按一次 Enter 填入，修改后按平常方式发送。

已验证的安装方式使用固定 tarball。修改源码或执行 `git pull` **不会更新正在运行的插件**。此维护版尚未验证通过 GitHub URL 直接安装。

## 模型、Token 与隐私

**每次生成推荐都会额外调用一次模型**，即使忽略推荐，也可能消耗 Token/配额。打开空闲对话也可能触发请求。默认沿用回答的 provider/model；缺少元数据时使用会话当前模型，也可通过配置覆盖。

- 仅使用最近一轮：用户文本最多 **400 个字符**，助手文本最多 **1,200 个字符**；不发送完整历史、推理内容或附件正文。
- 在本地压缩长文本中段并省略 Markdown 围栏代码块，可能遗漏重要细节。
- 输出上限 **96 Token**（不含输入）；DeepSeek 推荐请求关闭推理，不改变主对话设置。
- 输入框可用且空闲 **800 毫秒**后请求；最多缓存 64 条完成结果，最多同时执行两条不同的生成任务。
- 选取的文本仍会发送到已配置的提供方。本地用量记录不保存对话正文、附件或凭据。

## 用量与费用

打开 **插件 → Reply Suggestions**：左侧卡片可选今天、昨天、近 7 天或近 30 天；右侧显示从开始记录以来的历史总量。日期按 DSH Host 的本机时区计算。复用插件缓存不算新请求。缺失用量标记为未知而非零；失败/取消请求保留提供方已报告的 Token。查看或刷新统计不调用模型。

费用是**按 DeepSeek API 公开价计算的人民币估算**，不是实际账单或配额扣减。无匹配价格的 provider/model 标为未知或部分计费。每次请求保留当时的价格快照，更新价格不重算历史。

**更新价格**按钮读取[官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，不发送 API key 或对话。默认每 7 天检查；菜单支持每天、每 3/7/30 天或仅手动。自动失败后 24 小时重试；网络或解析失败保留旧价并报告错误。已保存的 UI 选择优先于初始配置。

数据位于 `DSH_HOME`（默认 `~/.dsh`）下的 `storages/dsh-reply-suggestions/`：`usage.jsonl` 保存用量，`prices.jsonl` 保存价格与周期。共用 `DSH_HOME` 的 profile 共享插件数据。不要将这些文件或 profile 备份提交到 GitHub。

## 可选配置

在当前 profile 的 `cordis.patch.yml` 中覆盖条目：

```yaml
- id: reply-suggestions
  config:
    enabled: true
    timeoutMs: 20000
    autoUpdatePrices: true
    priceUpdateDays: 7
    # provider: your-configured-provider
    # model: your-configured-model
```

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 生成推荐 |
| `timeoutMs` | `20000` | 超时，1,000～60,000 毫秒 |
| `provider` / `model` | 跟随对话 | DSH 中已配置的 provider/model |
| `autoUpdatePrices` | `true` | 自动检查；`false` 仍可手动更新 |
| `priceUpdateDays` | `7` | 保存 UI 选择前使用的周期，1～30 天 |

## 测试与故障排查

```sh
npm run build
npm test
# 可选：在 macOS 上安装了准确的 DSH rc.5 时执行：
DSH_TEST_ELECTRON='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' npm test
```

已安装应用验收使用独立的临时 profile、HOME、DSH_HOME 和假模型，不读取真实凭据或历史。2026-10-31 启用该测试时 **69/69 项通过**。可移植 CI 不运行依赖已安装应用的测试。参见 [CI 工作流](https://github.com/diginno-net/dsh-reply-suggestions/actions/workflows/test.yml)、[验证证据与限制](./VERIFICATION.md)和[维护/回滚手册](./MAINTENANCE.md)（英文）。

没有推荐时，先检查 DSH 版本和插件状态，确认任务已结束且输入框为空，再检查提供方错误或 `[reply-suggestions]` 日志。失败、超时或输出无效不会阻止普通输入。自动化测试不保证所有模型的推荐质量、实体手机键盘或真人输入法行为。

请在 [Diginno Issues](https://github.com/diginno-net/dsh-reply-suggestions/issues) 报错，附 DSH/插件版本、操作系统和复现步骤。提交前删除 Token、凭据及私人对话。三语 README 不代表插件 UI 已提供越南语本地化。

## 致谢与许可证

上游作者：[jabingu](https://github.com/jabingu/dsh-reply-suggestions)。Diginno 独立维护兼容版本，基于上游 `0.1.17`，提交 `1b6494b0d3de9d81f364a3a70642e352ec60387a`。保留 [MIT 许可证](./LICENSE)，不承诺自动支持未来 DSH 版本。
