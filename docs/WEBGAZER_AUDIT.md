# WebGazer 3.5.3 源码核对与适配记录

核对对象为交接包中的 `vendor/webgazer-3.5.3/src/index.mjs`、`facemesh.mjs`、`params.mjs`、`ridgeReg.mjs` 及安装后同版本源代码；生产加载 npm 包自带的未修改 `dist/webgazer.js`。版本和完整性由项目锁文件固定，`scripts/prepare-webgazer.mjs` 再校验版本、复制文件并记录 bundle SHA-256。

## 已确认的行为

- `saveDataAcrossSessions(false)` 是 **实例方法**，修改 `webgazer.params.saveDataAcrossSessions`。在 `begin()` 之前调用阻止加载以前的训练数据；不使用陈旧文档的 `window.saveDataAcrossSessions`。
- `clearData()` 重置回归数据，并调用默认 localforage 的 `clear()`。尽管公开方法声明为 `async`，其内部 **没有等待 localforage.clear() 完成**。不可依靠 `await clearData()` 证明持久缓存删除完成。GitHub Pages 的同账号各项目共享 origin，因此本应用**不调用 clearData()**：使用公开 `getRegression()` 逐个调用官方 `reg.init()`，只重置当前模型；`saveDataAcrossSessions(false)` 禁止加载和保存默认 localforage 的训练数据。不会清空其他项目的默认缓存。研究数据仍使用独立命名的原生 IndexedDB。
- `setRegression()` 先读取并复制旧回归数据到新模型，所以必须先调用官方回归 `init()` 清训练，再选回归并再次 `init()`。新参与者使用独立 iframe JS realm，整个官方模型、Kalman 状态、平滑窗口、计时器均重新创建。
- `setGazeListener()` 替换唯一回调；`clearGazeListener()` 将其置为空函数。
- `init()` 在视频加载之前添加捕获阶段的 `click` 和 `mousemove` 自动训练监听器，然后等待 `loadeddata`。仅在 `await begin()` 后删除监听器存在泄漏窗口。适配器在容器插入时通过 MutationObserver 的微任务检查点移除监听器，早于首帧和后续用户事件；`begin()` 后、每次切换阶段及每次显式校准训练前再次删除。没有新增自动训练。
- `recordScreenPosition(x,y,'click')` 使用库最近眼部特征训练现有回归；仅在 `calibration` 阶段允许调用。本应用不实现或替换任何推断算法。
- `end()` 只暂停并删除 DOM，**不停止摄像头**。适配器保存实际 `getUserMedia()` 返回的流，清理时停止全部 track，再 `end()`，最后移除 iframe。权限晚到时先停止流，再以 AbortError 拒绝，避免后台泄露。
- `begin()` 返回 Promise，要等视频 loadeddata 和首轮预测（包括模型初始化）完成才 resolve。权限和首轮模型失败可以 reject；后续异步循环失败会成为 iframe 内未处理 rejection。本适配器分别捕获，并另设无回调 watchdog。60 秒总启动超时包括权限等待。
- `showVideoPreview(false)` 会影响个别显示标志，因此再次显示时明确恢复 `showVideo`、`showFaceOverlay`、`showFaceFeedbackBox`；始终关闭 `showPredictionPoints` 和 `storingPoints`。
- 回调在 4 点显示平滑和 `util.bound()` 之前执行；保存的 x/y 是库回调值，不是库的显示光点。回归内部是否启用 Kalman 由配置冻结，不增加平滑或裁切。
- 回调的 `elapsedTime` 在本轮异步推断等待之前计算。应用 `callbackTimeMs` 是父页面收到回调时的 `performance.now()`，两者都不是曝光时间。
- 回调包含 `eyeFeatures` 等对象，但适配器仅拷贝 x、y、elapsed；**不保存眼部图像或 landmark**。未校准时也可能只有 null 预测，所以人脸反馈只观察官方 tracker `getEyePatches()` 的真假返回结果；立即原样返回给库，不保留结果，不推导视线。

## 为什么使用单独 iframe

这是生命周期隔离，iframe 里面运行官方整个 WebGazer bundle。每次启动加载新的同源 `/vendor/webgazer-3.5.3/runtime.html` frame（真实 localhost URL，避免库对 about:blank 的 HTTPS 警告），每次停止删除；React 重渲染不能增加库实例。它固定覆盖父视口（100vw × 100vh）、无边框、无滚动、无鼠标交互；因此库屏幕 CSS 坐标与父页面一致。设备像素比不会再乘到样本坐标上。iframe 背景透明，仅按阶段显示官方视频预览；自由观看隐藏视频、框和视线光点。没有跨域服务或服务器端摄像头处理。

## 模型资源

`params.faceMeshSolutionPath` 在初始化前设置为 `/vendor/webgazer-3.5.3/mediapipe/face_mesh`。脚本将包内 face_mesh 的 JS、WASM、binarypb、packed assets 文件原样复制到公开目录；WebGazer dist 已包含其运行时 JS 依赖。生产路径不指向 CDN。是否真的完全离线仍需在目标 Chrome 中断网打开本地服务器、观察网络请求并完成真实摄像头验收；在此之前不宣称已验证完全离线。

## 仍需真实摄像头验证

自动化测试覆盖生命周期、权限拒绝、模型启动异常、自动鼠标监听删除、阶段训练隔离、null 回调、stream 释放与新参与者重置，但使用 mock 库，不能证明真实眼动接通或测量精度。

在本机 Chrome 打开 `http://localhost:5173`，允许摄像头，检查模型加载和人脸反馈，完成校准与独立验证。保持鼠标不动，依次看左/中/右大目标并观察真实回调变化；完成两画短流程并下载数据。此项只验证接通，不能作为科学精度证明。遇到失败，记录 UI 原始错误、Chrome 版本、系统、时间、控制台及本地资源请求状态。

官方来源：https://github.com/brownhci/WebGazer/tree/3.5.3 和 https://webgazer.cs.brown.edu/ 。官方发布说明确认 2026-02-24 为最后计划版本，之后更新不保证。

## 本次实际执行结果（2026-11-16）

- `npm test -- --run tests/webgazerAdapter.test.ts`：8/8 通过。使用 mock 库验证单实例启动、null 与越界坐标保留、显式校准训练隔离、鼠标训练关闭、权限失败、模型失败、延迟授权取消、第二参与者新实例和全部 track 释放。
- Chrome `tests/e2e/runtime.spec.ts`：官方真实 bundle 成功加载包内本地 WASM/model；Chrome 内置合成摄像头（非人脸视频）产生连续 null 回调；模型相关请求全为 localhost，未报告 Tracking，未产生研究会话或导出。阻断官方 bundle 请求时显示加载错误并不产生样本。两个用例通过。
- Chrome `tests/e2e/runtime-denied.spec.ts`：通过 Chrome 原生权限控制拒绝摄像头，适配器保留原始 NotAllowedError 并显示中文说明，样本为空。此用例禁用 Chrome 自动接受摄像头的测试参数。

浏览器运行最初被执行沙箱禁止监听本地端口，允许本机测试进程后完成。测试代码修正过 CDP 权限名称和隔离上下文设置；最终原生拒绝权限测试在不带自动授权标志的独立 worker 中通过。上述测试不等于真人摄像头接通或精度验证；真人验证仍待用户本机完成。
