# 数据、恢复与导出

研究数据使用独立 IndexedDB `painting-pilot-study-v1`，不与 WebGazer/localforage 的校准库共用。`sessions` 保存配置、质量、计时、几何、验证摘要与热图设置；`samples`、`events`、`responses`、`validation` 以 128 行分块保存，元数据与新块在同一事务中提交。应用定期保存，阶段切换也保存。清除校准不清除研究记录。

刷新恢复的是最后成功提交的批次；未完成会话及未完成曝光区间标记 `interrupted`。不补回未提交样本、不推算消失期间的曝光、不沿用旧页单调时钟继续采集。重新开始必须建立新会话并重新校准。恢复事件的 `timeMs` 是原页面最后已保存时间，事件详情另记恢复 UTC。不要清除浏览器网站数据，否则本地记录会被删除。

每次下载以模式、匿名编号、唯一 sessionId 为前缀。ZIP 内有独立会话文件夹；正式与预览文件名明确区分。单文件下载使用同样前缀。全部 CSV 均带 UTF-8 BOM，按 RFC 4180 转义双引号、逗号和真实换行；缺失值为空单元格，数值零保持为 `0`，布尔值为 `true`/`false`。自由文本原样保留；用 CSV 解析器读取，不能逐行 split 后按逗号拆分。

- `gaze_samples.csv` 保留真实回调，包括 null 回调、画外预测、暂停期间回调。没有回调的时间段由事件与时间间隔反映，不生成补点。坐标单位是 CSS px；图像归一化坐标使用实际显示内容矩形。
- `phase_events.csv` 记录流程、故障、暂停/恢复和几何变化，`detail` 是 JSON 字符串。
- `responses.csv` 保存原话、信心、不知道/跳过、作答耗时和阶段；末尾追加本次顺序、问卷版本、会话内冻结的题目原文、题序、分析角色与多选记录。共同问卷不要求信心评分，对应 `confidence` 为空。
- `background.csv` 仅在会话实际保存了新背景问卷时生成，每人三行；保存学习或工作领域、艺术学习经历、绘画兴趣。旧会话不补造背景回答，也不将旧 `artBackground` 自动转换为这三项。
- `validation.csv` 保存训练目标与独立验证/漂移目标的观察。`training` 区分明确训练，`settling` 区分目标出现后的等待期；未收到有效预测时误差为空。
- `session.json` 包含完整会话快照（含配置、素材版本、全部记录、实际依赖版本、几何、计时、质量和热图设置）及导出计算说明。
- 每幅画的 `heatmap_<paintingId>.png` 在图内标注参与者、材料、有效样本数、有效展示/墙钟时长、验证状态和可视化参数。无数据时保留原图并注明“无可用数据”。素材文件不再可用或尺寸不符时，PNG 导出明确失败；CSV/JSON 单文件仍可下载。
- 每幅画的 `scanpath_<paintingId>.png` 按时间顺序绘制摄像头视线估计轨迹。导出总是覆盖完整时段，不跟随页面回放窗口；显示抽稀、编号、断线和颜色参数，以及绘制范围、样本数和分段数写入 `session.json.exportMetadata.scanpathRenders`。旧会话没有轨迹参数时使用默认值并写入导出快照，原始采样记录保持不变。保存新背景问卷的两景原始导出共十个文件：五个 CSV、一个 JSON 和四幅 PNG；无新背景的旧会话仍为九个文件。

## 共同问卷、背景与回答对应

当前计划为 `common-four-v2`：N03、N05 射箭→蹴鞠，N04、N06 蹴鞠→射箭，全部使用 `common-viewing-v1` 共同问卷。每景流程为观看 60 秒 → 五道共同看后问题 → 固定讲解卡 → 两道共同反馈问题。背景在开始时填写一次，结果页显示实际观看顺序与共同问卷。

`session.json.assignment` 保存 `planVersion`、`participantId`、`order`（AB/BA）、`questionVariant`（当前为 `common`）、`questionVersion` 和 `paintingOrder`；`session.json.order` 保存实际顺序。`session.json.config.paintings[].pre/post` 保存真正展示的题目、提示、可选项和质性编码参考。题目与分配在开始会话时冻结，之后修改网页默认值不会重写已有记录。

`responses.csv` 的既有前十七列维持原顺序，回答原话不变。其中原有分组列及新增分析列如下：

| 列 | 含义 |
| --- | --- |
| `planVersion` | 本次冻结的分配方案版本 |
| `questionVariant` | 当前共同问卷为 `common`；历史甲题为 `alpha`，乙题为 `beta` |
| `questionVersion` | 本次冻结的题目版本 |
| `sceneOrder` | 本次分配的观看顺序代码，AB 为射箭→蹴鞠，BA 为蹴鞠→射箭 |
| `paintingOrder` | 实际画作 ID 顺序的 JSON 数组，可据此与画作数据关联 |
| `questionPrompt` | 从会话冻结配置读取的 pre/post 或 interview 题目原文；不匹配的题号、观看经验选项和解释卡阅读记录留空 |
| `questionIndex` | 从冻结题目数组读取的阶段内题序，从 1 开始；讲解前 1–5，讲解后 1–2；题号未找到则为空 |
| `analysisRole` | 冻结题目中的分析角色；旧题目没有该字段时为空，不按编号或当前题库倒推 |
| `selectedOptionIds` | 多选项稳定 ID 的 JSON 数组；没有该记录时为空，明确记录空数组时保留 `[]` |
| `selectedOptionLabels` | 按同一次会话冻结选项还原的标签 JSON 数组，不引用网页当前标签 |
| `otherText` | 选择“其他”时的补充文字，原样保留 |

`analysisRole` 对应：讲解前第 1–3 题为 `spontaneous`（自主陈述的整体理解、主动需求、具体疑问），第 4 题为 `prompted`（定向追问活动及判断依据），第 5 题为 `classification`（困难分类）；讲解后两题为 `card-feedback`。困难分类最后才出现，“没有明显困难”与其他选项互斥。不能把定向追问后出现的关系解释计为自发发现。

按 `participantId`／`sessionId`、`paintingId` 和 `phase` 将每人的原先解释、疑问与卡片反馈对应起来，结合实际卡片阅读／跳过记录提出内容修改建议。讲解前后是同一人的两个阶段，不是 control group 与 experimental group；仅凭前后变化不能认定讲解有效。导出 JSON 的 `exportMetadata.questionnaireAnalysis` 也记录这些区分。

`background.csv` 列为 `sessionId, participantId, backgroundVersion, questionId, questionPrompt, answer, answerCode`。题号为 `studyField`、`artEducation`、`paintingInterest`；艺术学习编码为 `none`（没有）、`short`（短期课程或兴趣学习）、`long`（长期或专业学习）；兴趣为 1–5，1＝完全没有兴趣，5＝非常有兴趣。教育经历的 `answer` 用本会话冻结的标签，`answerCode` 保留稳定编码；领域文本和兴趣数值分别原样保存。`session.json.background` 保留完整回答、题目原文、选项和量表端点，可与回答表按 sessionId 对应。

历史 `crossed-four-v1` 的甲／乙题本仍按原始配置回看与导出，不升级或重分组。没有 `assignment` 且没有保存共同问卷版本的旧会话，分组列留空；没有 `assignment` 但配置明确保存共同问卷版本的自定顺序会话，题本与题目版本按其配置导出，其余分组列为空。`questionPrompt` 始终查本会话自己的题目。`session.json.responses` 不会被新 CSV 展示列改写。合并旧／新记录前应检查 `questionVersion`、`questionPrompt`，不能将不同问题直接当成同一题。

本地导入保留全部这些冻结记录，并拒绝超出 1–5 的兴趣值、未知背景选项、多选项不在本次题目中、重复选项、互斥项同时选中或未选择“其他”却附带补充文字的损坏记录。

## 事后参考校正的附加文件

当保存的验证与漂移记录足以建立参考校正时，一键 ZIP 在原始文件之外附加派生文件；缺少可用参考时仍可导出完整原始记录，不生成冒充已校正的图片。

- `gaze_samples_corrected.csv` 是另存的派生坐标表，以 sessionId、sampleIndex、trialId 对应原始回调；原始 `gaze_samples.csv` 和 `session.json.samples` 不会被覆盖。原始 null 不被补点，校正后画外坐标不夹到图像边缘。
- `correction.json` 保存算法版本、采用的检查运行与校准版本、每段校正是否可用及原因、变换参数、绘制参数和实际输出尺寸。它是重建校正图的审计依据。
- `heatmap_<paintingId>_corrected.png` 和 `scanpath_<paintingId>_corrected.png` 是明确标注“事后参考校正”的附加图。只为有可用参考的画作生成，不替换对应的原始图。轨迹仍导出完整时段。

两幅画都可校正时，新背景会话共十六个文件（原始十个，加一份派生 CSV、一份校正 JSON 和四幅校正 PNG）；无新背景的旧会话为十五个。只有部分画作可校正时，附加 PNG 数量相应减少，可用范围和未校正原因保留在 `correction.json`。

校正使用先前检查点作为参考，不能证明自由观看时每一个落点的真实位置，也不等同于新的独立准确度验证。原始会话质量、验证通过/失败结果、冻结合格线和全部原始回调继续保留；校正不将低质量记录自动改为通过。

`callbackTimeMs` 来自本页 `performance.now()`；`timeOrigin + callbackTimeMs` 可以映射到 UTC。`libraryElapsedMs` 是库提供的时间。回调时间不是摄像头曝光时间，数据不是硬件同步记录。`confidence` 保留为空，因为该库未提供这一字段。导出没有眼部像素或视频帧。

## 密度图的可重建定义

`eligibleSamples` 只选同 sessionId、participantId、paintingId 的 `free_view`、非暂停、`predictionAvailable`、`insideImage` 样本；视口/图像坐标必须有限，归一化坐标位于 `[0,1]`。画外点不会夹到边界。

每点权重 1。像素中心为 `imageNormX * (width - 1)`、`imageNormY * (height - 1)`。采用二维高斯核，σ 为 `kernelPx`（导出图像区像素），每个轴在 `ceil(3σ)` 范围截断；边缘只裁掉超出画布的核，不移动样本或重新分配权重。像素密度除以本画最大值，颜色按固定蓝→青→黄→红 RGB 控制点线性插值，alpha 为归一化密度乘所选 opacity。算法常量见 `src/heatmap.ts` 的 `HEATMAP_ALGORITHM`。

默认图像区宽 1000 px，高度保持素材原始比例；上下元数据区分别为 166、80 px。`session.json.exportMetadata.heatmapRenders` 保存每幅图的实际分辨率、参数、样本数和 AOI 设置。PNG 导出默认关闭 AOI；结果页 AOI 开关仅作研究者定位。

同一浏览器/字体环境下，使用导出 `session.json` 调用 `renderHeatmap(session, painting, session.heatmap, false)` 可重建同一 PNG；跨操作系统字体栅格化可能改变文字像素，密度计算定义不变。自动浏览器测试会对导出 PNG 与从其 JSON 重建的 PNG 做逐字节比较。密度不是注视时长，单图红色不能直接跨人比较。第一版不识别 fixations/saccades，不插值成固定采样率。

结果页显示的实际回调率为非暂停 `free_view` 回调数（含 null）除以有效展示秒数。这是实测回调频率，不是定位准确率。

轨迹算法、时间轴、缺口断线与可重建定义详见 [Scan path 说明](SCANPATH.md)。
