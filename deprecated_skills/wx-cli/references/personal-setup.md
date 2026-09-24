# 个人微信安装与初始化

仅在安装或初始化确有需要、且相应操作已获授权时使用。本文件中的重签名、
权限重置与重启属于环境变更，不是每次查询的前置步骤。

## Prerequisites

- macOS（Apple Silicon / Intel）或 Linux
- 微信桌面版 4.x 已安装并登录
- Node.js >= 14（npm 安装方式）或 curl（shell 安装方式）
- 首次 `wx init` 需要 `sudo`（内存扫描提取密钥）

---

## 安装

### 方式一：npm（推荐）

```bash
npm install -g @jackwener/wx-cli
```

### 方式二：curl

```bash
curl -fsSL https://raw.githubusercontent.com/jackwener/wx-cli/main/install.sh | bash
```

安装后验证：

```bash
wx --version
```

---

## 初始化（首次使用，只需一次）

### macOS（必须按顺序执行）

**第一步：对 WeChat 重新签名**（只需做一次，WeChat 更新后需重做）

```bash
codesign --force --deep --sign - /Applications/WeChat.app
```

如果报错 `signature in use` 或某个 dylib 签名损坏，先修复再签名：

```bash
codesign --remove-signature "/Applications/WeChat.app/Contents/Frameworks/vlc_plugins/librtp_mpeg4_plugin.dylib"
codesign --force --deep --sign - /Applications/WeChat.app
```

**第二步：清理 WeChat 在 macOS TCC 隐私数据库里的旧授权记录**（重签名后必做）

macOS TCC 按 `bundle id + csreq` 联合校验权限；csreq 编码自代码签名。重签名后旧 csreq 和新签名不再匹配，旧授权记录会 silent 失效（System Settings 仍把开关画成"已允许"，运行时实际拒绝）。把 WeChat 在 TCC 里的旧记录抹掉，让 macOS 在下次微信请求权限时按新签名重新生成 csreq：

```bash
tccutil reset ScreenCapture com.tencent.xinWeChat   # 截图 / 屏幕共享
tccutil reset Camera com.tencent.xinWeChat          # 视频通话 / 扫码
tccutil reset Microphone com.tencent.xinWeChat      # 语音消息 / 通话
tccutil reset AppleEvents com.tencent.xinWeChat     # 自动化 / 输入法
tccutil reset AddressBook com.tencent.xinWeChat     # 通讯录
tccutil reset SystemPolicyDocumentsFolder com.tencent.xinWeChat
tccutil reset SystemPolicyDownloadsFolder com.tencent.xinWeChat
tccutil reset SystemPolicyDesktopFolder com.tencent.xinWeChat
```

`tccutil` 对没有授权过的 service 会报 "No such bundle identifier"，是 no-op，不影响其他 service 的 reset。

**第三步：重启 WeChat**

```bash
killall WeChat && open /Applications/WeChat.app
# 等待微信完全登录后再继续
```

之后微信触发权限请求时按 GUI 提示重新允许即可。在 macOS 26 上，把 WeChat 加进 **隐私与安全 → 录屏与系统录音** 的上半区，**不要**只勾下半区的"仅系统录音"——后者不能授予截图权限。

**第四步：初始化**

```bash
sudo wx init
```

### Linux

```bash
sudo wx init
```

`wx init` 会自动：
1. 检测微信数据目录
2. 扫描进程内存，提取所有数据库密钥
3. 写入 `~/.wx-cli/config.json`

初始化完成后，后续所有命令无需 `sudo`，daemon 在首次调用时自动启动。

---
