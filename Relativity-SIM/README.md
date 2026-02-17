# Relativity-SIM

简要说明（面向开发者 / AI 代理）——快速上手与代码关联

## 概述
- 本子目录为高精度“狭义相对论时间膨胀”前端模拟器，界面位于 `index.html`，脚本分为两部分：数值引擎 `js/simulation.js` 和 UI 交互 `js/main.js`。
- 该工具仅为静态前端（没有 `server.py`），可直接用浏览器打开或通过静态服务器提供。

## 依赖
- 使用 Decimal.js（在 `index.html` 从 CDN 引入，版本 `10.4.3`）。

## 脚本加载与调用关系
1. `index.html` 按顺序以 `defer` 加载：
   - 先加载 `decimal.min.js`（全局 `Decimal`）。
   - 再加载 `js/simulation.js`：设置 `Decimal.set(...)`、定义并在浏览器环境下创建单例 `window.relativitySimulator`，并暴露 `window.RelativitySimulatorUtils`（工具函数集合）。
   - 最后加载 `js/main.js`：初始化 UI、读取 DOM、绑定事件，并使用 `window.relativitySimulator` 与 `window.RelativitySimulatorUtils`。

2. 交互流程（简化）：用户操作 → `main.js` 处理事件 → 调用 `simulator` API（如 `updateSpeed`, `updateTimeUnit`, `start/pause`）或工具函数 → `simulation.js` 执行高精度计算 → `main.js` 更新 DOM/Canvas。

## 主要文件职责
- `js/simulation.js`：高精度计算、`RelativitySimulator` 类、工具函数（γ因子、时间膨胀、格式化等）；在全局挂载单例与工具集合；同时提供 CommonJS 导出以方便测试。
- `js/main.js`：UI 逻辑、事件绑定、Canvas 渲染、进度/计时控制、精度网格生成以及与 `simulation.js` 的交互。
- `index.html`：DOM 元素与控件（重要 id 见下节），并引入 Decimal.js + 两个脚本。

## 重要 DOM id（`main.js` 使用）
- 控件：`inputDistance`, `sliderSpeed`, `sliderFine`, `sliderMultiplier`, `timeUnitSelect`, `btnPlay`, `btnPause`, `btnReset`, `btnMaxPrecision`。
- 显示：`dispEarthTime`, `dispShipTime`, `dispProgressPercent`, `dispDistance`, `gammaValue`, `fullPrecisionDisplay`。
- 画布：`simCanvas`。
- 精度网格容器：`precisionGridContainer`（由 `main.js` 动态生成 64 个格子）。

## 本地运行 / 调试
- 直接用浏览器打开：在文件管理器中双击 `index.html`（file://）。
- 或在项目根或 `Relativity-SIM` 目录使用轻量静态服务器（推荐，用于避免某些浏览器模块/路径限制）：

```bash
cd Relativity-SIM
python -m http.server 8000
# 然后打开 http://localhost:8000
```

- 在浏览器控制台可直接访问：
  - `window.relativitySimulator`（单例）
  - `window.RelativitySimulatorUtils`（工具函数）
  示例：
  - `window.relativitySimulator.getCurrentState()`
  - `window.RelativitySimulatorUtils.calculateLorentzFactor(Decimal('0.5'))`

## 调试提示 / 注意事项
- `simulation.js` 在加载时通过 `Decimal.set(...)` 配置非常高的精度和极端的科学计数法阈值；这会产生很长的数字字符串并增加内存占用，调试时可临时降低 `precision`。
- 若出现“模拟器未初始化”或“script 未加载”类错误：检查脚本加载顺序（Decimal → simulation.js → main.js）和 CDN 可用性；可以把 `decimal.min.js` 下载为本地文件并更新 `index.html` 引用。
- 因为 `Relativity-SIM` 没有后端，`main_server.py` 不会将其作为可启动子进程（main_server 只会识别包含 `server.py` 的目录）。

## 需要我做的事情（可选）
- 将这份说明插入代码顶部注释，或把 README 同步到仓库根 README；或生成一个简易时序图（Mermaid）来可视化调用顺序。请告诉我你想要的下一步。
