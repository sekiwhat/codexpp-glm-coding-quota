# GLM Coding Plan 余额

在 Codex 输入框下方显示 GLM Coding Plan 的 **5 小时额度** 与 **每周额度** 剩余积分，并在悬停时展示已用、剩余比例与重置时间。

## 工作方式

- 拓展后台默认读取 Codex++ 网关配置（`~/.codex-session-delete/gateway.json`）里 `open.bigmodel.cn` 供应商的 API Key；也可以在拓展设置里手动填写 Coding Plan Key。
- 用该 Key 请求智谱控制台额度接口 `GET https://www.bigmodel.cn/api/monitor/usage/quota/limit`，返回 `data.limits` 中的 `unit=3`（5 小时）与 `unit=6`（每周）两个窗口。
- 结果在后台缓存 60 秒；界面默认每 5 分钟刷新一次，点击余额条可立即强制刷新。

## 安装

把整个 `glm-coding-quota` 目录放到：

- macOS / Linux：`~/.config/Codex++/user_scripts/`
- Windows：`%APPDATA%\Codex++\user_scripts\`

然后在 Codex++ 管理页点击「热重载拓展」。

## 显示说明

- `5h 482/2,000`：5 小时窗口剩余 482 积分，总额度 2,000。
- `周 7,944/10,000`：每周窗口剩余 7,944 积分，总额度 10,000。
- 进度条按「已用比例」着色：绿色为充足，黄色为已用 70% 以上，红色为已用 90% 以上。
