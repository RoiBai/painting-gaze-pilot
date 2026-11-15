# 第三方来源与许可证

WebGazer **3.5.3** 精确固定于 package.json / package-lock.json。

- 官方源代码：https://github.com/brownhci/WebGazer/tree/3.5.3
- 官方发布：https://github.com/brownhci/WebGazer/releases/tag/3.5.3
- 官方说明：https://webgazer.cs.brown.edu/
- npm：https://registry.npmjs.org/webgazer/3.5.3
- 官方包许可证：GPL-3.0-or-later，保留于 public/vendor/webgazer-3.5.3/LICENSE.md；包内 src/ 可通过 npm ci 在 node_modules/webgazer/src 查阅。
- 官方确认 2026-02-24 是最终计划发布，后续更新不保证。本项目没有修改其推断或回归实现。
- 原交接包 integrity：sha512-i6P97fWeixASmHWrJxgLUICugqV6qljIafi2ne6p0WYXAuldpwoaFRkedKFcu/qm95d128gdUxhOr336estXOw==；锁文件保留 registry integrity，prepare 脚本记录实际 bundle SHA-256。

React / React DOM 18.3.1：Meta，MIT；Vite 6.1.0：MIT；TypeScript 5.7.3：Apache-2.0；fflate 0.8.2：MIT；Vitest 3.0.5：MIT；Playwright 1.51.1：Apache-2.0。WebGazer 原包依赖及其 model/WASM 均按原样保留，不声称归本项目所有。完整传递依赖版本以 package-lock.json 为准，包自带许可证保留在 node_modules；scripts/collect-licenses.mjs 可重新汇集至 third-party-licenses。

绘画与数字图像来源单独记录于 public/materials/provenance.json 与 docs/MATERIALS.md。沿用传统题名，不把存在争议的画中皇帝身份作为已定论事实。素材仅按用户请求供本机研究测试，未公开发布。
