#!/usr/bin/env node
/**
 * iWiki CLI 安装脚本 (跨平台 Node.js 版本)
 *
 * 支持 Linux / macOS / Windows，无额外依赖（仅用 Node.js 内置模块）。
 * 适用于没有 Python 但有 Node.js 环境的机器（如部分 Windows + Agent 软件）。
 *
 * 用法:
 *   node install_cli.js                         # 安装最新版本
 *   node install_cli.js --version v0.0.7        # 安装指定版本
 *   node install_cli.js --dir ~/.local/bin      # 安装到自定义目录
 *   node install_cli.js --check                 # 仅检查最新版本
 */

"use strict";

const https = require("https");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

// ── 配置 ───────────────────────────────────────────────────────────────────
const MIRRORS_BASE = "https://mirrors.tencent.com/repository/generic/iwiki-cli";
const BINARY_NAME = "iwiki-cli";

// ── 颜色输出 ───────────────────────────────────────────────────────────────
const _NO_COLOR =
  process.env.NO_COLOR ||
  (process.platform === "win32" && !process.env.WT_SESSION);

function _c(code, text) {
  if (_NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function info(msg) {
  console.log(`${_c("34", "[INFO]")} ${msg}`);
}
function success(msg) {
  console.log(`${_c("32", "[ OK ]")} ${msg}`);
}
function warn(msg) {
  console.log(`${_c("33", "[ ! ]")} ${msg}`);
}
function errorExit(msg) {
  console.error(`${_c("31", "[ X ]")} ${msg}`);
  process.exit(1);
}

// ── 系统检测 ───────────────────────────────────────────────────────────────
function detectOS() {
  const p = process.platform;
  if (p === "linux") return "linux";
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  errorExit(`不支持的操作系统: ${p}`);
}

function detectArch() {
  // Node 18+ 可用 process.arch；arm64 和 x64 是标准值
  const arch = process.arch;
  if (arch === "x64") return "amd64";
  if (arch === "arm64") return "arm64";
  // 兜底：通过环境变量推断
  const hostArch = os.arch();
  if (hostArch === "x64") return "amd64";
  if (hostArch === "arm64") return "arm64";
  errorExit(`不支持的架构: ${arch || hostArch}`);
}

function defaultInstallDir(osName) {
  const home = os.homedir();
  if (osName === "darwin") return path.join(home, ".iwiki");
  if (osName === "windows") {
    const local =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(local, "iwiki-cli");
  }
  // linux
  return "/usr/local/iwiki-cli";
}

// ── 网络工具 ───────────────────────────────────────────────────────────────
/**
 * 发起 HTTP(S) 请求，返回 Buffer（或写入文件）。
 * @param {string} url
 * @param {object} opts - { dest?: string, timeout?: number, method?: string }
 * @returns {Promise<Buffer|string>}
 */
function request(url, opts = {}) {
  const { dest, timeout = 120000, method = "GET" } = opts;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      { method, headers: { "User-Agent": "iwiki-cli-installer/1.0" }, timeout },
      (res) => {
        // 处理重定向
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          resolve(request(res.headers.location, opts));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        const chunks = [];
        let stream = res;
        let fileStream = null;

        if (dest) {
          fileStream = fs.createWriteStream(dest);
          stream.pipe(fileStream);
          fileStream.on("finish", () => {
            fileStream.close(() => resolve(dest));
          });
          fileStream.on("error", reject);
        } else {
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        }
        stream.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`请求超时 (${timeout}ms): ${url}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function download(url, dest, timeout = 120000) {
  try {
    return await request(url, { dest, timeout });
  } catch (e) {
    errorExit(`下载失败: ${e.message}\n  地址: ${url}`);
  }
}

async function fetchJSON(url) {
  try {
    const buf = await request(url, { timeout: 15000 });
    return JSON.parse(buf.toString());
  } catch {
    return null;
  }
}

async function headHeader(url, headerName) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      { method: "HEAD", headers: { "User-Agent": "iwiki-cli-installer/1.0" }, timeout: 15000 },
      (res) => {
        resolve((res.headers[headerName.toLowerCase()] || "").trim());
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    req.on("error", () => resolve(""));
    req.end();
  });
}

// ── 版本获取 ───────────────────────────────────────────────────────────────
async function fetchLatestVersion() {
  info("正在获取最新版本...");
  const obj = await fetchJSON(`${MIRRORS_BASE}/version.json`);
  if (obj && obj.version) return obj.version;
  errorExit("无法获取最新版本号，请通过 --version 手动指定版本");
}

// ── 文件校验 ───────────────────────────────────────────────────────────────
function validateBinary(filepath, osName) {
  const stat = fs.statSync(filepath);
  if (stat.size === 0) errorExit("下载文件为空");

  const fd = fs.openSync(filepath, "r");
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);

  if (osName === "windows") {
    // PE 文件以 MZ 开头
    if (buf.toString("ascii", 0, 2) !== "MZ") {
      errorExit(
        "下载内容不是有效的 Windows 可执行文件（可能是 HTML 错误页），请检查版本号或网络"
      );
    }
  } else {
    // ELF: 7f 45 4c 46  |  Mach-O: various magic numbers
    const validMagics = [
      [0x7f, 0x45, 0x4c, 0x46], // ELF (Linux)
      [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit
      [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit
      [0xca, 0xfe, 0xba, 0xbe], // Mach-O Universal
      [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64-bit (BE)
      [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit (BE)
    ];
    const match = validMagics.some((m) =>
      m.every((v, i) => buf[i] === v)
    );
    if (!match) {
      errorExit(
        "下载内容不是有效的可执行文件（可能是 HTML 错误页），请检查版本号或网络"
      );
    }
  }
}

async function verifyChecksum(filepath, url) {
  info("正在验证 checksum...");
  let expected = await headHeader(url, "X-Checksum-Sha256");
  if (!expected) expected = await headHeader(url, "x-checksum-sha256");
  if (!expected) {
    warn("未获取到 X-Checksum-Sha256 响应头，跳过 checksum 验证");
    return;
  }

  return new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filepath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      const actual = hash.digest("hex");
      expected = expected.toLowerCase().trim();
      if (actual === expected) {
        success(`checksum 验证通过 (sha256: ${actual.slice(0, 16)}...)`);
      } else {
        errorExit(
          `checksum 验证失败！\n  期望: ${expected}\n  实际: ${actual}\n文件可能已损坏或被篡改，请重试`
        );
      }
      resolve();
    });
    stream.on("error", () => {
      warn("读取文件失败，跳过 checksum 验证");
      resolve();
    });
  });
}

// ── PATH 管理 ──────────────────────────────────────────────────────────────
function ensureInPath(installDir, osName) {
  const pathSep = osName === "windows" ? ";" : ":";
  const pathDirs = (process.env.PATH || "").split(pathSep);
  const norm = path.resolve(installDir).toLowerCase();
  if (pathDirs.some((d) => path.resolve(d).toLowerCase() === norm)) return;

  if (osName === "windows") {
    _addToPathWindows(installDir);
  } else {
    _addToPathUnix(installDir);
  }
}

function _addToPathUnix(installDir) {
  const shell = path.basename(process.env.SHELL || "bash");
  const home = os.homedir();
  let candidates;

  if (shell === "zsh") {
    candidates = [path.join(home, ".zshrc"), path.join(home, ".zprofile")];
  } else if (shell === "fish") {
    candidates = [
      path.join(home, ".config", "fish", "conf.d", "iwiki-cli.fish"),
    ];
  } else {
    candidates = [
      path.join(home, ".bashrc"),
      path.join(home, ".bash_profile"),
      path.join(home, ".profile"),
    ];
  }

  let exportLine = `export PATH="$PATH:${installDir}"`;
  if (shell === "fish") exportLine = `fish_add_path ${installDir}`;

  // 找到第一个已存在的配置文件，或使用第一个候选
  let rcFile = candidates[0];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      rcFile = c;
      break;
    }
  }

  // 检查是否已经写过
  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, "utf8");
    if (content.includes(installDir)) {
      success(`PATH 已在 ${rcFile} 中配置`);
      process.env.PATH = `${process.env.PATH}:${installDir}`;
      return;
    }
  }

  // 写入
  try {
    fs.mkdirSync(path.dirname(rcFile), { recursive: true });
    fs.appendFileSync(rcFile, `\n# iWiki CLI\n${exportLine}\n`);
    process.env.PATH = `${process.env.PATH}:${installDir}`;
    success(`已自动添加到 ${rcFile}（新终端窗口自动生效）`);
  } catch (e) {
    warn(`无法写入 ${rcFile}: ${e.message}`);
    warn(`请手动添加: ${exportLine}`);
  }
}

function _addToPathWindows(installDir) {
  // 通过 PowerShell 读写用户注册表中的 PATH 环境变量
  const psScript = `
    $key = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($key -and ($key.ToLower().Split(';') -contains '${installDir.toLowerCase()}')) {
        Write-Output 'ALREADY'
    } else {
        $newPath = if ($key) { "$key;${installDir}" } else { "${installDir}" }
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
        Write-Output 'ADDED'
    }
  `.trim();

  try {
    const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
      encoding: "utf8",
      timeout: 10000,
    }).trim();
    if (result === "ALREADY") {
      success("PATH 已在用户环境变量中配置");
    } else {
      success("已将安装目录添加到用户 PATH（新终端窗口自动生效）");
    }
    process.env.PATH = `${process.env.PATH};${installDir}`;
  } catch {
    warn(
      `无法自动添加 PATH，请手动将 ${installDir} 添加到系统环境变量 PATH 中`
    );
  }
}

// ── 参数解析 ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = { version: "", dir: "", check: false };
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case "--version":
      case "-v":
        args.version = raw[++i] || "";
        break;
      case "--dir":
      case "-d":
        args.dir = raw[++i] || "";
        break;
      case "--check":
      case "-c":
        args.check = true;
        break;
      case "--help":
      case "-h":
        console.log(`
iWiki CLI 安装脚本 (Node.js 版)

用法:
  node install_cli.js                         安装最新版本
  node install_cli.js --version v0.0.7        安装指定版本
  node install_cli.js --dir ~/.local/bin      安装到自定义目录
  node install_cli.js --check                 仅检查最新版本

环境变量:
  IWIKI_CLI_VERSION        等同于 --version
  IWIKI_CLI_INSTALL_DIR    等同于 --dir
`);
        process.exit(0);
        break;
      default:
        if (raw[i].startsWith("--version=")) args.version = raw[i].slice(10);
        else if (raw[i].startsWith("--dir=")) args.dir = raw[i].slice(6);
        else warn(`未知参数: ${raw[i]}`);
    }
  }
  // 环境变量兜底
  if (!args.version) args.version = process.env.IWIKI_CLI_VERSION || "";
  if (!args.dir) args.dir = process.env.IWIKI_CLI_INSTALL_DIR || "";
  return args;
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  console.log();

  // 检测系统
  const osName = detectOS();
  const arch = detectArch();
  success(`系统: ${osName}/${arch}`);

  // 确定版本
  let version = args.version || (await fetchLatestVersion());
  if (!version) errorExit("版本号为空，请通过 --version 手动指定版本");
  success(`目标版本: ${version}`);

  if (args.check) {
    console.log(`\n最新版本: ${version}`);
    return;
  }

  // 确定安装目录
  let installDir = args.dir || defaultInstallDir(osName);
  installDir = installDir.replace(/^~/, os.homedir());

  // 构建下载 URL
  const ext = osName === "windows" ? ".exe" : "";
  const filename = `${BINARY_NAME}-${version}-${osName}-${arch}${ext}`;
  const url = `${MIRRORS_BASE}/${version}/${filename}`;
  info(`下载地址: ${url}`);

  // 创建安装目录
  fs.mkdirSync(installDir, { recursive: true });

  // 下载到临时文件
  info("正在下载...");
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `iwiki-cli-download-${Date.now()}${ext}`);

  try {
    await download(url, tmpPath);

    // 校验文件格式
    validateBinary(tmpPath, osName);

    // Checksum 验证
    await verifyChecksum(tmpPath, url);

    // 移动到安装目录
    const binaryExt = osName === "windows" ? ".exe" : "";
    const dest = path.join(installDir, `${BINARY_NAME}${binaryExt}`);

    // 如果目标已存在且被占用 (Windows)，先尝试删除
    if (fs.existsSync(dest)) {
      try {
        fs.unlinkSync(dest);
      } catch {
        const old = dest + ".old";
        if (fs.existsSync(old)) fs.unlinkSync(old);
        fs.renameSync(dest, old);
      }
    }

    fs.renameSync(tmpPath, dest);

    // 设置可执行权限 (Unix)
    if (osName !== "windows") {
      fs.chmodSync(dest, 0o755);
    }

    // macOS: 移除 quarantine 属性
    if (osName === "darwin") {
      try {
        execSync(`xattr -d com.apple.quarantine "${dest}" 2>/dev/null`, {
          stdio: "ignore",
        });
      } catch {
        // 忽略
      }
    }

    success(`已安装到: ${dest}`);
  } finally {
    // 清理临时文件
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // 忽略
      }
    }
  }

  // PATH 处理
  ensureInPath(installDir, osName);

  // 完成提示
  console.log();
  success(`iWiki CLI ${version} 安装成功！`);
  console.log();
  console.log(`  登录:  ${BINARY_NAME} auth login`);
  console.log(`  帮助:  ${BINARY_NAME} --help`);
  console.log();
}

main().catch((e) => errorExit(e.message));
