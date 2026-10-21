# 1024节 · 我画 AI 猜

面向小学生与亲子家庭的绘画小游戏：玩家在平板或电脑上绘画，AI 实时猜测，工作人员根据结算发放活动标记。

**[点击在线试玩](https://hcypkumain.github.io/I-Draw-AI-Guess-PKUCS-1024/)**

## 玩法

- 每局随机 2 题，每题最多 3 秒准备，落笔立即开始 20 秒绘画；未动笔也会在准备结束后自动开始。猜中或超时后自动换题；整局通常约 30–60 秒，也可提前完成。
- 简单档：至少猜中 1 题，获得 1 个标记。
- 困难档：两题全部猜中，获得 2 个标记；未达标获得 0 个标记。
- 自由练习不计时、不发标记。支持鼠标、手指和触控笔。
- 正式题库 239 题：简单档 189 题、困难档 50 题；另有 106 题待验证，可自由练习识别。困难档每题先完成 5 笔线条再开始猜，简单档和练习随画随猜。模型仍识别全部 345 类，仍需儿童现场校准。完整名单见[类别判定说明](类别判定说明.md)。
- 每档独立洗牌，一轮抽完才重复；换轮也避开最近 4 道已显示的题目，避免相邻两局重复。抽题进度保存在当前浏览器，刷新后继续；不同设备分别记录。自由练习不消耗题库，提前退出不跳过尚未显示的第二题。
- 保留“树／椰子树”等上下位类别的明确兼容判题规则。

## 本地使用

用现代浏览器直接打开 `index.html`，等待“AI 已就绪”。网页内嵌运行库和模型，无需 API Key，画作在浏览器内识别，不上传。

平板与笔记本在同一 Wi-Fi 或热点时，可在本目录运行：

```powershell
python serve.py --lan
```

然后在平板浏览器输入终端显示的 `Tablet (same Wi-Fi)` 地址。使用在线试玩链接时，无需启动电脑上的服务器。

## 调整题库与验证

`index.html` 的 `embeddedQuestions` 保留全部模型类别元数据。`level` 为 `easy` 或 `hard`；`enabled: false` 会暂停正式抽题，须填写 `reviewReason`。修改启用列表或档位后，旧抽题进度会自动失效并按新题库重新洗牌；模型类别和兼容答案不受影响。

本轮调整依据与恢复条件见 [难度调整说明](难度调整说明.md)。安装 Node.js 后，运行 `node --test tests/game.test.cjs` 检查题库、去重、计时和结算，无需安装 npm 依赖。

## 文件与部署

- `index.html`：完整游戏、TensorFlow.js 与 DoodleNet 模型。
- `.nojekyll`：GitHub Pages 静态发布配置。
- [试玩说明](试玩说明.md)：设备使用、规则和限制。
- [类别判定说明](类别判定说明.md)：完整兼容规则。
- [验证记录](验证记录.md)：已完成的功能检查与测试边界。
- [GitHub 发布指南](GitHub发布指南.md)：部署与更新方法。

GitHub Pages 从 `main` 分支根目录发布，更新文件并推送后会自动重新部署。

## 来源与许可

- [DoodleNet](https://github.com/yining1023/doodleNet)：Yining Shi 发布的 Quick Draw 345 类分类模型。本项目保留其标签顺序与模型权重。原仓库未发现清晰的独立权重许可，正式公开活动或商业使用前须核实授权。
- [Quick Draw 数据集](https://github.com/googlecreativelab/quickdraw-dataset)：CC BY 4.0；数据许可不能直接替代模型权重许可。
- [TensorFlow.js](https://github.com/tensorflow/tfjs)：Apache 2.0，许可全文见 [TensorFlow-LICENSE.txt](TensorFlow-LICENSE.txt)。

本仓库没有为第三方模型权重另行授予许可。识别与实际通过率仍需使用最终平板及儿童画作进行现场试测。
