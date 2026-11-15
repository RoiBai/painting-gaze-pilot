# GitHub Pages 部署

网站：<https://roibai.github.io/painting-gaze-pilot/>。源码仓库：<https://github.com/RoiBai/painting-gaze-pilot>。

本项目是静态网站。GitHub Pages 提供 HTTPS，摄像头计算、IndexedDB 保存和 ZIP 打包均在访问者的浏览器内执行。应用没有提交研究数据的接口。网页和模型的正常下载请求由 GitHub 处理，不代表研究数据上传。

## 构建与发布

1. 将本目录作为独立 GitHub 仓库的根目录。仅发布网站源码、画作、固定版本模型、说明和自动化测试，不发布父目录的其他研究文件或参与者导出包。
2. 仓库 Settings → Pages → Source 选择 GitHub Actions。
3. 推送 `codex/github-pages` 或 `main`，或在 Actions 手动运行 Deploy pilot to GitHub Pages。

`.github/workflows/pages.yml` 安装锁定依赖、运行单元测试、构建并上传 `dist`，再使用 GitHub 官方 Pages action 发布。`VITE_BASE_PATH` 来自 Pages 的 `base_path`；仓库子路径下的图片、WebGazer iframe、脚本和模型统一解析。模型随网站托管，不依赖第三方模型 CDN。

手动验证仓库子路径构建：

```sh
VITE_BASE_PATH=/painting-gaze-pilot/ npm run build
npm run preview -- --host 127.0.0.1
```

打开 `http://localhost:4173/painting-gaze-pilot/`。本机开发仍可使用 `npm run dev` 和原来的根路径，线上与 localhost 的浏览器记录彼此独立。

## 发给朋友

使用最终发布的 HTTPS 链接。可加 `?participant=N01` 到 `?participant=N06` 为不同朋友预选匿名编号，编号控制默认 AB/BA 顺序。请使用电脑 Chrome 普通窗口；初次打开需下载绘画与模型，保持网页加载完成。

可转发的说明：

> 请用电脑 Chrome 打开链接，按分配的编号参加。允许摄像头后完成校准、两段各 1 分钟的看画和问题。最后点击「一键导出全部数据 ZIP」，把下载的 ZIP 文件发给我即可。摄像头视频不会保存，回答和视线数据先保存在你的浏览器里，不会自动上传。

## 本地数据与导出

每位参与者在自己的浏览器 IndexedDB 中保存记录。朋友完成后必须手动发送 ZIP；仅打开网站不会让研究者获得数据。会话 ID 独立生成，ZIP 文件名包含模式、匿名编号和会话 ID。

ZIP 的原始部分包含四个 CSV、完整 `session.json` 和两幅画各自的密度图、Scan path PNG，共九个文件。具备可用校正参考时另附派生坐标 CSV、`correction.json` 与明确标注的校正图；两幅画都可校正时共十五个文件。所有原始回调（包括 null 和画外点）、验证、回答及参数继续保留，校正不会覆盖原始部分或改变质量判定。若在中途退出，页面也可导出已有记录，明确标为未完成。下载后不要改动文件内容。

发布或更新不会读取本机浏览器研究记录，也不会把记录放进代码仓库。不要将参与者 ZIP/CSV/JSON 添加进仓库。清除网站数据、使用无痕窗口或更换浏览器可能让本地记录无法再次打开，所以每次结束应立即下载 ZIP。

自动化测试使用隔离浏览器及明确的测试夹具。上线成功仅表示软件和资源可访问，不能代替真人摄像头定位质量检查；默认预览模式和原有材料核查标记继续保留。
