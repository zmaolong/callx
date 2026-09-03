# CallX 开发环境说明

## 快速开始

```powershell
nvm use 22.12.0
npm run init
npm run dev
```

- `npm run init`：首次使用时安装依赖并构建所有共享包。
- `npm run dev`：启动 Rsbuild 和 Electron 开发环境。
- 后续开发只需运行 `npm run dev`。

## 环境要求

- Node.js `v22.12.0`，项目根目录 `.nvmrc` 已固定版本。
- Windows、macOS、Linux 均可运行。
- 国内网络环境下 `.npmrc` 已配置 Electron 镜像。

## 启动日志

看到以下内容表示启动成功：

```text
✓ Detected dev server on port 3000
ℹ Starting Electron with BRUNO_DEV_PORT=3000
ready built in ...
```

如果 3000 端口被占用，Rsbuild 会自动使用 3001 等端口，Electron 会自动跟随实际端口。

## 常见提示

以下内容是警告，不影响运行：

- `ExperimentalWarning: SQLite is an experimental feature`
- 第三方库 `amdefine`、`flow-parser` 的构建提示
- `watcher add` 文件监听日志

不要在浏览器中直接打开 `http://localhost:3000`。Bruno 页面需要 Electron 的 preload 环境，正确方式是运行 `npm run dev` 并等待桌面窗口弹出。

## Electron 下载失败

如果 `npm run init` 后启动提示 Electron 未正确安装，执行：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

## Windows 文件锁

如果安装时出现 `EPERM` 或 `EBUSY`，先关闭正在运行的开发进程：

```powershell
taskkill /F /IM electron.exe
taskkill /F /IM node.exe
```

然后重新运行 `npm run init`。
