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

从[研究者分配表](https://roibai.github.io/painting-gaze-pilot/?preview=design)复制 P01–P06 的专属链接，每人一个编号。扩展招募时可展开至 P36。作者演练请使用 [P00](https://roibai.github.io/painting-gaze-pilot/?participant=P00)，每次试用独立保存在本机，可重新打开或导出 ZIP。P00 可选“只试一景”，从蹴鞠、马球、射箭中选一景，再任选顺序、随机或眼动讲解。完成该景问卷后直接进入试用结果。P01–P36 的专属链接锁定编号和排程。

> 请用电脑 Chrome 打开你的专属链接，填写背景并允许摄像头。完成校准后会看到三个不同的画面，每段 1 分钟。请自然看画和阅读卡片，每段结束后评价体验。最后请一次下载完整 ZIP，并把这个文件发给我。摄像头在本机估计视线，回答和观看记录保存在你的浏览器里。

## 本地数据与导出

P01–P36 的记录保存在各自浏览器的 IndexedDB 中。参与者自行发送 ZIP 后，研究者可从研究者页一次选择多份 ZIP 比较评分，或在首页导入一份 ZIP 查看卡片、视线和问卷明细。P00 以研究者试用身份保存在同一浏览器，归档页单独列出，正式研究汇总自动排除。

三景会话 ZIP 包括背景、逐次原始视线回调、验证、流程事件、回答、卡片曝光、卡片停留、三条件评分、逐题工作负荷和画面回忆共十份 CSV，另有完整 `session.json`、三幅热图和三幅轨迹图。有可用校正参考的场景另附校正结果。中途中断的参与者也可导出已有记录，状态会标为中断。[各字段说明](../README.md)

发布或更新不会读取本机浏览器研究记录，也不会把记录放进代码仓库。不要将参与者 ZIP/CSV/JSON 添加进仓库。清除网站数据、使用无痕窗口或更换浏览器可能让本地记录无法再次打开，所以每次结束应立即下载 ZIP。

自动化测试使用隔离浏览器及明确的测试夹具。上线成功仅表示软件和资源可访问，不能代替真人摄像头定位质量检查；默认预览模式和原有材料核查标记继续保留。
