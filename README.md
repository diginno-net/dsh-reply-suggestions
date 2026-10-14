# Reply Suggestions

**简体中文** · [English](./README_EN.md)

根据上一轮对话，自动推荐下一句提问。回车填入，编辑后再发送。

一个为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供输入框推荐的插件。助手回答结束后，输入框为空时显示灰色推荐；按回车将它变成可编辑的草稿，不会自动发送。

| 项目 | 当前版本 |
| --- | --- |
| 插件 | `0.1.4` |
| 已核对的官方桌面版 | `0.2.0-rc.2` |
| 许可证 | [MIT](./LICENSE) |

## 功能

- 根据最近一次用户问题和助手回答，生成一条相关的后续提问。
- 第一次按 **Enter** 把推荐填入草稿，可继续编辑；之后按 Harness 原有规则发送。
- 按 **Escape** 隐藏当前推荐。
- 保留中文输入法确认和 Shift/Ctrl/Command/Alt+Enter 的原有行为。
- 输入框有草稿、附件、引用或待处理队列时延后生成；任务运行时不显示推荐。
- 使用 Harness 已配置的模型和凭据，不需要另填 API Key。

## 安装

### 从 GitHub 安装

1. 打开 DSH 的 **插件** 页面，先检查是否已安装 `dsh-reply-suggestions`。已安装时使用更新入口，避免重复添加。
2. 确认官方桌面版为 `0.2.0-rc.2`。
3. 点击 **添加插件**，在“包名或地址”中填写：

   ```text
   https://github.com/jabingu/dsh-reply-suggestions
   ```

4. 按应用提示完成加载并启用，重启 DSH。
5. 完成一次普通对话，保持输入框为空，等待灰色推荐出现。

仓库包含构建好的 `lib/`，安装前无需自行构建。DSH peer 版本锁定为 `0.2.0-rc.2`；其他版本需要先核对接口。

### 从本地目录安装

下载仓库 ZIP 并解压，或克隆仓库。检查插件尚未安装后，在同一添加入口填写包含 `package.json` 的目录绝对路径，启用后重启 DSH。

官方桌面 profile 由应用管理，请使用桌面插件页面。确实使用 `dsh web` 的用户可在插件目录执行：

```powershell
dsh plugin --profile web list --depth=0
# 确认尚未安装后再添加：
dsh plugin --profile web add .
```

更新本地链接安装时，更新已链接目录中的文件并重启 DSH 即可，无需重复安装。

## 使用示例

发送：

> 请用两三句话解释什么是插件，并举一个生活中的类比。不要调用工具或创建文件。

回答完成后，可能出现“能给我一个最简单的插件示例吗？”的灰色推荐。按一次 Enter 填入，修改后再发送。具体内容由模型生成，随对话变化。

## 模型与 token 消耗

每次生成推荐会额外调用一次模型，即使没有采用推荐，也已产生该次请求的用量。默认沿用助手回答记录的 provider/model；rc.2 记录缺少元数据时，使用会话当前模型投影。

插件通过以下方式限制开销：

- 只读取上一轮正文，不传整段历史、推理块或附件内容。
- 用户问题最多 **400 个字符**，助手回答最多 **1,200 个字符**；客户端和 Host 均执行限制。
- 长文本保留约前三分之一和后三分之二，中段标记省略；Markdown 围栏代码块在本地省略，保留周围说明及行内代码。
- 使用较短提示词，输出上限为 **96 token**；此上限不包含输入 token。
- DeepSeek 的推荐请求关闭深度思考，不改变主对话的推理设置。
- 输入框可用且空闲 **800 毫秒**后才请求；等待期间开始输入会取消定时器。
- 已发起请求后输入文字会暂时隐藏推荐，结果可在清空草稿后复用，避免取消重试。切换会话、开始新一轮或卸载仍取消旧请求。
- Host 最多缓存 64 条已完成结果，最多同时生成两条推荐。

相比旧版，上下文上限从 14,000 降到 1,600 字符，减少约 88.6%；这不是每次实际 token 的节省比例。压缩可能让推荐忽略回答中段和代码细节。插件不额外调用模型进行摘要。

## 可选配置

一般无需配置。如需指定其他已在 Harness 配置好的模型，可在使用中的 profile 的 `cordis.patch.yml` 中覆盖：

```yaml
- id: reply-suggestions
  config:
    enabled: true
    timeoutMs: 20000
    provider: your-configured-provider
    model: your-configured-model
```

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 是否生成推荐 |
| `timeoutMs` | `20000` | 超时毫秒数，允许 1,000～60,000 |
| `provider` | 跟随对话 | 可选，必须是已配置的提供方 |
| `model` | 跟随对话 | 可选，必须是该提供方可用的模型 |

失败、超时或输出不符合要求时，输入框保留普通行为。可在客户端控制台查找 `[reply-suggestions]` 诊断。

## 开发

Node.js 22 或更高版本可以直接构建并运行测试，无需安装构建依赖：

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs
```

```text
src/common.mjs       RPC 契约、上下文压缩、键盘保护
src/engine.mjs       模型请求、预算、缓存与超时
src/index.mjs        Host 服务注册
src/client.cjs       灰色推荐、生成时机、草稿填入
lib/                 已构建的 Host 和客户端文件
locale/              插件名称和中英文介绍
scripts/build.mjs    无额外构建依赖的打包脚本
tests/               行为和客户端生命周期测试
```

实现使用官方 Typert/Gateway RPC、`llm.stream`、`conversation.input.overlay` 槽位、会话快照和草稿动作。布局定位依赖 rc.2 的 composer DOM 标记，版本变更时需要重新检查。

## 验证范围

- 24 项自动化测试通过，覆盖回车填入、输入法组合事件、长按保护、会话隔离、上下文预算、延后生成、缓存和取消。
- 使用官方 rc.2 安装包中的 Cordis、Typert 和 Host/Client Gateway，验证了实际插件 fiber 的挂载、RPC 和卸载，模型使用 stub。
- `0.1.2` 曾在真实 rc.2 桌面端验证推荐生成、显示、首次 Enter 填入、编辑、Shift+Enter 换行、发送、Escape 和会话切换。
- `0.1.3` 的用量优化及 `0.1.4` 的展示元数据更新已通过自动化和资源检查；没有重新进行真实模型质量或桌面视觉验收。

其他 Harness 版本、第三方桌面壳和真人输入法选词需要另行实测。模型生成的推荐可以修改或忽略。

## 许可证

[MIT](./LICENSE)
