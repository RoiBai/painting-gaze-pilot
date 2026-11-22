# Pilot 2 操作与修改文件

## 本轮材料

蹴鞠 6 张（72 秒），马球 7 张（84 秒），射箭 9 张（108 秒）。三个条件各自呈现所在场景的全部部位。研究者可以在[素材预览](https://roibai.github.io/painting-gaze-pilot/?preview=design&materials=uci#materials-preview)逐张查看画面、抠图、配色和文字。

22 张透明抠图来自研究组的 [Figma 设计](https://www.figma.com/design/GNDr3uSWe4p1gTUT1JAvO2/Untitled)。讲解摘自研究组文档的 [HCI-Rsrch的文字](https://docs.google.com/document/d/1nmLVQhTI-FBsTaoQ1fTbFi7D-af4369ZklsrKXgG6pI/edit?tab=t.ajn42a3ymxv0) 分页。每张卡在会话配置中保留节点号、文字来源、区域、配色和轮廓。球杖卡摘录了骑马持棍击球的文字。新版马球杆头回忆题按实际抠图的环形评分。

每个部位先在原画位置亮起，再放大。抠图搭在同一块色板的左缘，标题与文字在板上展开，阅读结束时整组淡出。蹴鞠的敞轩只动两边的灯笼和侍卫，踢球者的踢腿带动鞠球。挥杆、举旗、陪伴宣宗的内侍和敞轩侍卫各用原画加两张生成姿势做三帧循环。生成帧局部配准到原画，人物头部、坐骑和建筑保持在同一位置。宣宗、围踢群像、单独展示的鞠球和树保持原姿。

马球顺序讲解先展示球杖，再看骑手。骑手在卡片出现约 0.9 秒时开始抬手引杆。人物放大时已经在动，挥杆循环贯穿阅读时段，最后人物与文字板一起淡出。

射箭场景的三种讲解均为 108 秒，九张卡各占 10 秒。羽箭取自 Figma 图层 `1:6`，箭尖朝左。羽箭卡文字收起后，箭保持放大时的长度飞向原画中的靶心。系统根据实际落靶时刻决定此后箭靶卡上是否显示这支箭。

- **顺序讲解**在第 52、62、72 秒依次展示弓手、羽箭和箭靶。弓手边拉弓边接受介绍，画面从手中羽箭接到羽箭特写，再从落靶接到箭靶讲解。三张之间的看画时间移到这段连续讲解的前后。
- **随机讲解**将九张卡一次打乱，每张出现一次。箭靶可以最先以空靶出现。羽箭卡独立出现时，从原画弓手手部放大羽箭。飞行结束后按本次随机顺序继续。[P00 随机示例：箭靶、弓手、羽箭](https://roibai.github.io/painting-gaze-pilot/?participant=P00&preview=layout&scene=ming-xingle-archery&order=random&seed=353)
- **眼动讲解**在只显示原画的选卡时段累计注视。第一次稳定看弓手或他手中的箭，先讲弓手。卡收起后，在同一区域重新看满约 1.1 秒，才讲羽箭。直接稳定看靶可以先讲靶。读卡和追随飞箭时照常记录眼动，下一次选卡只采用新的注视样本。到 2 秒仍未触发时按预定规则补选，并记录原因。

新会话的材料版本为 `ming-uci-collage-v7`。曝光表的 `paperPresentation` 栏保存当时的布局、视口坐标、暂停恢复时的动效进度、减少动态效果设置和实际落靶时刻。旧 ZIP 以各自记录的版本回看和汇总。`card_exposures.csv` 中的 `selectionSource`、`selectionReason` 和 `dwellMs` 可用于区分稳定注视触发、超时补选和最后一张剩余卡。

## 先试一遍

打开 [P00 研究者试用](https://roibai.github.io/painting-gaze-pilot/?participant=P00)。含抠图的场景按区域数量分配时长，每张卡 10 秒、每轮 12 秒。眼动条件在选择阶段稳定看向尚未讲解的区域约 1.1 秒即可出卡，最迟在第 2 秒选卡。提前出卡时也会提前收起，三种条件在同一场景的观看时间和单卡可读时间一致。P00 默认完整观看蹴鞠（顺序）、马球（随机）、射箭（眼动）。每次试用单独保存，完成或中断后均可查看数据行、回放、下载完整 ZIP。在同一浏览器的 P00 入口选择“本机 P00 研究者试用”即可重新打开。P00 带有研究者试用标记，研究评分汇总与回忆盲评自动排除。

只检查排版时，可以在 P00 取消“记录眼动”再点“开始排版预览”，或直接打开[免眼动预览](https://roibai.github.io/painting-gaze-pilot/?participant=P00&preview=layout)。可切换顺序或随机讲解、暂停、选部位或逐张看。此入口跳过相机、校准和问卷，仅播放素材。

P00 可选“只试一景”，从蹴鞠、马球、射箭中选一景，再任选顺序、随机或眼动讲解。完成该景问卷后直接进入试用结果。P01–P36 的专属链接锁定编号和排程。

参与者仍按 P01–P36 的既有排程观看。每景最后一张卡关闭后，场景与卡片同时收起，暂停眼动预测。所有人先在同一页填写六项负荷评分，再在同一页回答该场景的三道细节回忆题。此后才出现补充反馈，三景结束后再访谈。两页问卷均不限时。P01–P36 在原标签页刷新会恢复草稿和已提交的页。若下一景还需用摄像头，刷新后会重新连接并校准。观看途中刷新会保留中断试次，并重看当前景。

## 回看和阅卷

1. 在[研究者页](https://roibai.github.io/painting-gaze-pilot/?preview=design#session-review)打开参与者发来的 ZIP，找到“分时段视线回看”。选择场景，随后选择“第 2 张卡”或某个“无卡”时段。发生过重看时，可以选具体观看轮次。
2. 点击播放或拖动时间轴，查看摄像头估计位置怎样在卡片、原画与其他位置之间移动。轨迹按当时的浏览器视口和卡片边界绘制。缺失、暂停、超出视口、间隔超过 150 毫秒时断线。有记录的 P 会话可单独下载该时段的 PNG 和 CSV。旧版三条件 P 会话如保留了卡片曝光记录，也能按实际出卡时间查看。
3. 在[画面回忆盲评](https://roibai.github.io/painting-gaze-pilot/?review=blind)单独选入 ZIP。盲评页按固定题序显示题干、参与者原文与参考答案示例。手动选择 0 或 1，保留同义表达。已选“记不清”的题可评 0。未提交、未评分的题留空，三题均评分后才得到 0–3 分的场景总分。下载带评分的 ZIP 副本可保存进度。
4. `pilot_workload.csv` 保存每景六项原始分、问卷版本、场景、条件和页提交时刻。六项都有值时，`pilot_ratings.csv` 的 `rawTLX` 是它们的算术平均。自评表现从好到差计 0–100，直接计入。0 分有效，缺项时总分留空。`pilot_recall.csv` 共九行，含逐题原文、记不清标记、卡片 ID、该卡首次实际出场序号、提交时间、逐题人工分和场景总分。草稿与已提交回答可按提交时间区分。
5. 在射箭场景可以单选「羽箭飞行」「羽箭已落靶」或「落靶后回到原画」等时段，对照参与者什么时候看向靶区。ZIP 的 `gaze_samples.csv` 逐行给出 `archeryPhase` 和 `gazeInOriginalTargetAoi`。后者按原画靶区坐标判断，即使该处被卡片盖住也会记录。视线缺失或超出视口时留空。飞行中的靶区样本与回到原画后的靶区样本可以分别统计，实际选卡原因见曝光表。

## 修改文件清单

下列路径均相对于仓库根目录。

| 用途 | 文件 |
| --- | --- |
| 两页问卷、材料和题目 | `src/PilotSurveyPages.tsx`、`src/pilotSurvey.ts`、`src/pilotQuestions.ts`、`src/pilotMaterials.ts`、`src/types.ts`、`src/study.ts` |
| 观看时序、停采与刷新恢复 | `src/engine.ts`、`src/machine.ts`、`src/webgazerAdapter.ts`、`src/pilotResume.ts`、`src/storage.ts` |
| 前台、研究者入口和下载页 | `src/App.tsx`、`src/PilotLanding.tsx`、`src/ParticipantDownload.tsx`、`src/Questionnaire.tsx`、`src/PilotGroupRatings.tsx`、`src/style.css` |
| 卡片及无卡时段回看 | `src/Results.tsx`、`src/PilotSegmentReview.tsx`、`src/pilotSegments.ts`、`src/pilotSegmentCanvas.ts`、`src/pilotSegmentReview.css` |
| 导入、导出与盲评 | `src/pilotSurveyRecords.ts`、`src/cardMetrics.ts`、`src/export.ts`、`src/importSession.ts`、`src/PilotBlindReview.tsx`、`src/pilotRecallRubric.ts` |
| 配置和说明 | `README.md`、`docs/PILOT2.md`、`docs/DEPLOYMENT.md`、`package.json`、`package-lock.json` |
| 单元测试和测试样本 | `tests/pilotSurvey.test.ts`、`tests/pilot2SurveyExport.test.ts`、`tests/pilot2SurveyFixture.ts`、`tests/pilotSegments.test.ts`、`tests/pilotSegmentFixture.ts`、`tests/pilotEngine.test.ts`、`tests/webgazerAdapter.test.ts` |
| 浏览器与部署验收 | `tests/e2e/pilot-flow.spec.ts`、`tests/e2e/pilot-segment-review.spec.ts`、`tests/e2e/pilot2-blind.spec.ts`、`tests/e2e/pilot2-practice.spec.ts`、`tests/e2e/pilot2-tabs.spec.ts`、`tests/pages/pilot.spec.ts` |
