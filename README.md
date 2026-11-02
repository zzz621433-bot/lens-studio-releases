# 灵感镜 Lens Studio

Windows 桌面创作与文案审阅工具。这里用于公开安装包发版与联网更新，不包含用户文稿、接口密钥或私人配置。

## 下载与使用

1. 打开 [最新版本](https://github.com/zzz621433-bot/lens-studio-releases/releases/latest)，下载 `Lens-Studio-版本-win-x64.exe`。
2. 保存并退出旧版后打开新版。普通使用者下载公开安装包不需要登录 GitHub。
3. 在“接口与设置”配置自己的模型或数据接口；公开包不含共享 API 密钥。
4. 后续在“软件更新”点击“立即检查”，按提示下载升级。

## 已安装旧版的用户

如果软件仍使用某台电脑的 `C:/.../update.json`，请将更新源改成下面的公开地址并保存：

```text
https://raw.githubusercontent.com/zzz621433-bot/lens-studio-releases/main/update.json
```

新公开发行包已内置此地址。检查更新和下载均不需要用户的 GitHub Token。

## 功能

- 文案工作台与资料库
- 依据可更新 PDF 违规库的文案检索、引用核对和局部修改建议
- 逐处采纳或撤销改动，原文保留
- 直播复盘

检索使用用户自行配置的模型服务，可能产生接口费用。输出需要人工核实，不保证平台过审。

## 更新完整性

各版本安装包放在 Releases；`update.json` 提供版本、下载地址、大小和 SHA256。软件校验下载文件后才进入升级流程。GitHub 的访问情况取决于使用者网络。
