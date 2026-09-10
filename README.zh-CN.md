# dsh-theme-endfield-contour-rework

`dsh-theme-endfield` 的 fork，重写了等高线动画引擎。用于 DeepSeek Harness (DSH) Web。

[English README →](README.md)

---

> **出处。** fork 自 [dsh-theme-endfield](https://github.com/ymh0000123/dsh-theme-endfield) —— **Copyright (c) ymh0000123**。上游 MIT 许可证在 [`LICENSE`](LICENSE) 中原样保留、未做改动；完整声明见 [`NOTICE.md`](NOTICE.md)。
>
> **AI 声明。** 本项目大量使用 AI 辅助开发：代码修改主要由 AI 生成，并经过运行测试、调试与迭代修正。**在生产环境使用前请自行审阅改动。**
>
> **仅在 DSH 0.1.1-rc.2**（`web` profile、Windows）上测试过。

---

## 关于本 fork

上游提供原始主题框架、样式系统、启动加载屏、设置基础设施与测试脚手架。本 fork 专注于替换其中的**等高线动画子系统**。

等高线背景改为由**预生成的可无缝平铺地形**渲染：图案一次性画进纹理，滚动时只平移这张纹理。上一版引擎每帧都要让场形变、再重新提取等值线，因此这里是**替换**（连同它的帧率设置一起去掉），而不是微调；等高线相关设置改为描述滚动方向、速度与疏密度。

实现细节、构建过程中发现并修复的缺陷及其实测数据见 [docs/engineering-notes.md](docs/engineering-notes.md)；完整改动清单见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

```bash
dsh plugin --profile web add github:DoctorxPriestess/dsh-theme-endfield-contour-rework
```

重启或重新加载 `web` profile 后生效。卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield-contour-rework
```

插件会自行挂载：`cordis.patch.yml` 已声明 bundle 行，不需要手改 profile 文件。

想固定版本而不是跟随 `main`，就装 release 的 tarball——这也正是 profile 里实际记录的形式（滚动 `github:` 安装最终也解析成它）：

```bash
dsh plugin --profile web add https://codeload.github.com/DoctorxPriestess/dsh-theme-endfield-contour-rework/tar.gz/refs/tags/v1.0.0
```

固定版本在这里有一件必须说清的理由：profile 的依赖项是一个 **tarball URL**，之后在该 profile 里跑 `pnpm install` 会**重新拉取那个 URL 指向的内容**。固定到 tag，就没有任何你没选择过的版本能覆盖插件。


仓库名与包名同为 `dsh-theme-endfield-contour-rework`：`add` 用仓库名，`rm` 用包名。包名是 DSH 记录进 profile、并由其派生设置命名空间的名字。

### 从其它安装换过来？

设置按命名空间存放，所以本包会从自己的默认值开始。若你之前用的是上游 `dsh-theme-endfield`（或本 fork 的旧包名），可以把已有主题设置段复制过来：

```bash
node tools/migrate-prefs.js                      # 预演：只打印将要写入的内容
node tools/migrate-prefs.js --kebab --write      # 实际写入（先自动备份）
```

它只迁移当前 schema 声明过的字段，`settings.yaml` 的其余部分逐字不动；目标段已存在时会拒绝写入，除非加 `--force`。运行时请先退出 DSH（或准备好它热加载）。

## 功能

全部在 **设置 › 终末地主题设置** 中调整：

- 主题总开关；配色（谷地黄 / 武陵青）；圆角（直角 / 圆角）；
- 等高线背景、等高线滚动开关、滚动方向（8 个方向）、滚动速度（`12 / 24 / 48 / 96 / 192` px/s）、等高线疏密度（稀疏 / 适中 / 密集 / 极密）；
- 背景水印，以及水印保持显示；
- 启动加载动画；
- 雷霆大字，以及大字入场动画。

几点值得知道的行为：

- 滚动速度以**像素/秒**表示，按实际帧间隔推进，因此 60 / 120 / 144 / 240 Hz 下观感一致；
- 改方向或速度只更新两个缓存数值；改疏密度则对**同一个地形**重新提取一次；
- 每次开启等高线背景都会生成新的随机地形；同一次会话里同 seed + 同尺寸必定重现同一地形；
- `prefers-reduced-motion` 实时读取：开启时图案静态渲染。

设置经 DSH 的设置命名空间持久化（Host `index.js` 注册，浏览器半部通过 `ctx.settingsScope` 读写），因此随重启、换端口恢复，DSH Desktop 下同样可用。文案跟随 DSH 的语言设置（中文 / 英文）。

## 截图

| 1 | 2 |
| --- | --- |
| ![截图 1](assets/screenshots1.webp) | ![截图 2](assets/screenshots2.webp) |

## 兼容性

测试环境：

- DSH：**0.1.1-rc.2**
- Profile：`web`
- 平台：Windows

其他 DSH 版本未做测试，可能无法正常工作；未来的 DSH 版本可能需要适配，尤其是设置 API、bundle 行格式或 client bundle 加载方式发生变化时。

本 fork 是一个**独立包**（`dsh-theme-endfield-contour-rework`），拥有自己的设置命名空间，因此可与上游并存安装、互不覆盖。但也正因为命名空间不同，**上游设置不会迁移过来**：本 fork 从自己的默认值开始。两者还会同时操作同一批 `<body>` class，所以不建议同时启用；装了本 fork 请关掉上游。

图案本身有两处上限：纹理单边不超过 4096 设备像素、面积不超过 8.3e6 CSS px²（超大画布上图案重复会更明显）；系统「减少动态效果」开启时静态渲染。

## 测试结果

最近一次：`test:ci` **27 / 27**（76 秒），环境为 Windows + DSH 0.1.1-rc.2 + Edge 152（Store 版，见下），另有非阻塞的覆盖率与性能检查。

| 检查 | 覆盖内容 | 结果 |
| --- | --- | --- |
| `npm run test:node` | 引擎几何、每帧成本、设置页、配色对比度、样式表护栏——不需要浏览器 | 通过 |
| `npm test` / `test:ci` | 同样这 27 项测试，其中 13 项驱动真实浏览器 | 27 / 27 |
| `test:fork` | fork 身份：包名 vs bundle 行 vs 命名空间 vs 键前缀（改名只做一半会静默失败） | 通过 |
| `contour-coverage`、`contour-perf` | 8×5 分区墨迹覆盖率；一次性构建成本与每帧成本 | 通过 |

```bash
npm run test:node              # 所有不需要浏览器的检查
npm test                      # 全量套件（其中 13 项驱动真实浏览器）
CHROME_PATH="/path/to/chrome" npm test   # PowerShell：$env:CHROME_PATH="C:\...\chrome.exe"
```

几何与成本检查会从 `client.js` 里原样切出真实函数、对着桩化的 2d context 运行，因此不需要浏览器，直接量到绘制出的曲线与每帧工作量。

浏览器测试需要可用的 Chromium。发现顺序：`CHROME_PATH`（以及 `CHROME_BIN` / `EDGE_PATH` / `PUPPETEER_EXECUTABLE_PATH`）→ `PATH` → 按用户安装 → 机器级安装 → `EdgeCore\<版本>`，找不到时会打印查过的全部路径。结果经 DevTools 协议取得，而不是读浏览器 stdout——在 Edge 为 Store(AppX) 版的机器上，启动器会把参数转发进已有会话，stdout 是空的。**在这类机器上跑浏览器测试前请先关掉你自己的浏览器窗口**：启动器会把请求转交进那个会话并忽略调试端口。每条检查断言了什么、阈值如何校准，见 [docs/testing.md](docs/testing.md)。

本 fork **未与上游的测试套件比对过**：从上游继承的部分浏览器测试断言的正是本 fork 有意改掉的东西。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/features.md](docs/features.md) | 功能行为、默认值、存储键与边界情况 |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射与对比度规则 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 算法、发现并修复的缺陷及实测数据、层叠、动画与性能 |
| [docs/testing.md](docs/testing.md) | 各检查断言了什么、阈值如何校准 |
| [CHANGELOG.md](CHANGELOG.md) | 本 fork 的改动清单 |
| [NOTICE.md](NOTICE.md) | 出处声明与 AI 声明 |

## 许可证与致谢

- 原始作品：**Copyright (c) ymh0000123** —— https://github.com/ymh0000123/dsh-theme-endfield
- 本 fork 以同样的 **MIT** 许可证发布；见 [LICENSE](LICENSE)（原样保留上游版本）与 [NOTICE.md](NOTICE.md)
- 主题风格参考《明日方舟：终末地》官网 https://endfield.hypergryph.com （仅作设计参考，未再分发任何素材）
