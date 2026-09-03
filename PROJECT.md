# CallX 项目说明

本项目基于开源项目 [Bruno](https://github.com/usebruno/bruno) fork，保留 Bruno 的 API 客户端能力，并在此基础上开发日常使用功能。

## 分支约定

- `main`：跟踪 Bruno 上游代码，只用于同步上游更新。
- `callx/main`：CallX 长期开发分支，新增功能和修复先进入这里。
- `callx/release-<version>`：版本发布分支，从 `callx/main` 切出，发布期间只接受必要修复。
- `callx/feature-<name>`：功能开发分支，完成后合并回 `callx/main`。
- `callx/bugfix-<name>`：问题修复分支，完成后合并回 `callx/main`。

## 上游仓库

```bash
git remote -v
# origin    https://github.com/zmaolong/callx.git
# upstream  https://github.com/usebruno/bruno.git
```

## 同步上游

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

git checkout callx/main
git merge main
git push origin callx/main
```

## 版本发布

```bash
git checkout callx/main
git checkout -b callx/release-0.0.1
git push -u origin callx/release-0.0.1
```

发布分支只处理版本固化和必要的 bug 修复，不新增功能。发布完成后按需创建版本标签：

```bash
git tag v0.0.1
git push origin callx/release-0.0.1 --tags
```

## 开发环境

首次搭建环境请使用 Node.js `v22.12.0`（见 `.nvmrc`）：

```bash
nvm use 22.12.0
npm run init
npm run dev
```

其中 `npm run init` 会安装依赖并构建共享包，后续正常开发只需运行 `npm run dev`。

详细开发说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。
