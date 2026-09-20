# 测试与校验

```bash
node check.js      # 样式表静态不变量
node selftest.js   # 反向验证 check.js 真能抓到那些问题
npm test           # 上面两项 + 配色 / 设置页 / 渲染 / 覆盖率 / 性能全部验证
```

本仓库的测试有一条贯穿原则：**从真实 `client.js` 里读值，不复述数值。** 复述只能测到副本——一次样式表编辑后，测试仍会对着旧数字通过。

第二条原则：**每条断言都做过反向对照（变异验证）。** 故意把被测行为改坏，确认该断言真的会失败。一个从未被观察到失败过的校验，不能算证据。

> **运行环境。** 带「真实浏览器」字样的脚本会 spawn 本机 Chromium 做无头渲染，需要本机安装 Chrome / Chromium / Edge。以下脚本是**纯进程内**的，任何环境都能跑：`check.js`、`selftest.js`、`palette-contrast`、`settings-rows`、`settings-locale`、`thunder-edges`、`contour-cusps`、`contour-smoothness`、`contour-roughness`、`contour-perf`、`prefs-key-mapping`、`prefs-write-latency`、`migrate-prefs`、`fork-identity-check`、`browser-discovery`（它不启动浏览器，只验证发现逻辑本身）。
>
> **浏览器怎么找、结果怎么取**（`test/lib/browser.js`，全仓唯一一处）。原先每个测试各自内联一份候选路径、只查机器级安装位置，也不校验存在性；Chrome 默认装在 `%LOCALAPPDATA%` 就找不到，于是「换一台机器」容易变成「一个测试都跑不起来，而且错误信息是空的」。现在顺序是：`CHROME_PATH` / `CHROME_BIN` / `EDGE_PATH` / `PUPPETEER_EXECUTABLE_PATH` → PATH 查询（`where` / `which`）→ 按用户安装 → 机器级安装 → `EdgeCore\<版本>`（Edge 152 起 Store 版布局里真实内核可能只在这里）。找不到时会打印**查过的全部路径**。
>
> 结果传递默认走 **DevTools 协议**而非 `--dump-dom` 的 stdout，因为后者在一类真实环境里根本不通：装了 Store(AppX) 版 Edge 的 Windows 上，`Application\msedge.exe` 只是跳转 stub，启动参数被转发进现有会话，`--version` 都没有输出，stdout 与 `--screenshot=` 文件通道全废（exit 0、空输出）。同一台机器上 `--remote-debugging-port` 却正常——headless 内核确实起来了，只是没人拿得到它的输出。所以传输层优先用 CDP（Node ≥ 22 自带 WebSocket，零依赖）取 `document.documentElement.outerHTML`，stdout 保留为后备，Linux/CI 行为不变；`--virtual-time-budget=N` 由 `Emulation.setVirtualTimePolicy` 复现（原生标志会在预算耗尽时让浏览器自行退出、把 CDP 连接一起带走；完全不快进则会让若干测试从 4 秒变成 120 秒）。
>
> 三个细节值得记下来，因为都咬过人：**清理残留进程必须按镜像名限定**（桥接子进程自己的命令行里也带着 profile 路径，不限定就会把正在写 stdout 的自己杀掉，症状恰好是「CDP 起不来」）；**子进程的超时必须早于父进程的 spawnSync 超时**（否则清理来不及跑，残留实例会让下一次启动被转发而连锁失败）；**CDP 模式会丢弃旧式 `--headless`**（改由传输层统一决定，避免两个标志并存带来的版本差异）。
>
> 清理用的 token 有一道**独特性门限**（`isUniqueToken`）：匹配是 PowerShell 的 `-like '*token*'`，大小写不敏感且只做子串判断，像 `profile` 这样的通用词会命中用户自己浏览器的 `--profile-directory="Profile 1"` 并把它们杀掉。因此只接受 mkdtemp 风格的 token（含分隔符或数字、且不是纯字母），宁可漏清理也不误杀；这条规则由 `test/browser-shot-cleanup.test.js` 正向与反向断言。
>
> `--screenshot=` 后备路径曾经**每张截图泄漏一个完整浏览器实例**：在 Store 版 Edge 上启动器转交请求后自己退出，「一次性进程」的假设不成立（实测一次 `thunder-shot` 留下 11 个进程），累积后让整套测试偶发 `page produced no results`。现在该路径会等截图落盘再按本次运行唯一的 profile token 清理；`test/browser-shot-cleanup.test.js` 通过**先删除全局 WebSocket** 强制走该路径，断言截图正常写出且事后零残留。
>
> **截图取帧的三条规矩**（都是踩出来的，详见 CHANGELOG 的「Screenshot transport made deterministic」）：
> 一、虚拟时钟预算耗尽后时钟停住、渲染器不产帧，`Page.captureScreenshot` 会挂到超时，所以截图前要让它再推进 `CLOCK_NUDGE_MS = 100` 毫秒——**这个量必须极小**，它的作用是「让合成器产一帧」而不是「让页面继续走」；曾经用 3000ms，立刻把 `thunder-shot` 全灭（它的 1400ms 预算必须落在雷霆大字 3 秒保持窗口内）。
> 二、快进定时器不等于已经绘制，所以截图前等两个 rAF；弹层这类有入场动画的元素还要等有限动画结束（`--wait-animations`，**按测试显式开启**——需要动画中途那一帧的测试不能开）。
> 三、就绪判定要同时看 `readyState` 与**页面 URL**，否则会在初始 `about:blank` 上误判「已就绪」，导航销毁执行上下文后求值抛 `page threw: Uncaught`。

---

## check.js — 样式表静态不变量

主题样式表是**一整个 JavaScript 模板字符串**，有几类改动会在「文件仍能解析」的情况下悄悄破坏效果。检查项：

| 检查 | 守的是什么 |
| --- | --- |
| 模板字符串内无反引号 | 写在 CSS 注释里也会提前闭合，整个 client bundle 解析失败 |
| 无 `${...}` | 在模板字符串里那是插值，不是 CSS |
| CSS 注释成对、花括号配平 | 花括号在剥离注释后再统计 |
| 顶层没有漏进散文 | 抓「注释提前闭合」——注释本身仍是配平的，真正的破坏是残留文字落到顶层、与下一条选择器黏在一起 |
| `--edge-word` / `--edge-gap` 在**实际生效的 CSS** 里有定义 | 注释里提到不算 |
| 10 个调色板变量全部有定义 | 缺任一变量都不会优雅降级：读它的每条声明都会被丢弃 |
| `body.theme-endfield-wuling` 块存在 | 缺这个块则切换按钮点了没反应 |
| 没有任何 `--edge-*` 变量在 `:root` 里引用 `--dsw-*` 令牌 | 结构化检查，守 [:root 陷阱](engineering-notes.md#变量必须声明在-body-而不是-root) |
| `client.js` 能编译 | 用 `vm.Script` 在进程内解析、不执行 |
| 回合状态标签仍通过 `background-image` 改色 | 写成 `color:` 对渐变文字无效，属于「改了但没生效」的静默失败 |

## selftest.js — 校验器自检

把上述每个真实问题注入 `client.js` 的**副本**并断言 `check.js` 确实失败，同时断言注入本身生效（避免空跑）。

---

## 配色

```bash
node test/palette-contrast.test.js   # 两套配色每个角色的对比度（从真实 CSS 里读值）
node test/palette-switch.test.js     # 真实浏览器里切换配色，22 项断言
node test/settings-buttons.test.js   # 强调色底上的按钮文字对比度（32 项，含回归守卫）
node test/hover-check.js             # 用 CDP 真的移动鼠标，验证真实 :hover 规则
node test/verify-shots.js            # 解码四张截图统计强调色像素
```

**`palette-contrast.test.js`** 从 `client.js` 的实际样式表里把变量读出来再验算。覆盖 27 项：实心底 + 墨色字达 AA、悬停底同样达标、渐变文字四个色标对**两种**可能底色都达 AA、暗色强调色作图标墨色 ≥3、两配色的等高线合成对比度相差 ≤20% 且高于 1.06 感知下限、hero 光晕不比原品牌蓝更响、两配色确实不同、强调色写成 6 位十六进制，以及**武陵青的亮度必须落在 45%–56% 区间且留在青碧色轴上**。

**`palette-switch.test.js`** 在真实浏览器里跑真实 `client.js`，并**按应用的真实方式把令牌写成 `<body>` 行内样式**——用样式表 `:root` 假装会让测试通过而线上坏掉，这种不对称正是它存在的理由。断言：默认是谷地黄且不带 class；11 个变量全部**非空**；`--dsw-alias-brand-primary` 在切换后**自动**变成青色（令牌层没有重新注册）；`rgba(var(--rgb), α)` 型半透明色块随之切换；渐变文字换色；**画布被重绘且新描边偏青**（B 通道高于 R）；关闭主题后不残留 class。

**`settings-buttons.test.js`** 读计算样式，用同特异度的 `.HOVERPROBE` 类替代 `:hover`。这是合理的层叠等价，但反向对照暴露了它的边界（见[验证方法论](engineering-notes.md#计算样式触发不了-hover)），因此有了下一个脚本。

**`hover-check.js`** 通过 DevTools 协议**真的移动鼠标**到按钮上，再截图量字形与填充的对比度。

**`verify-shots.js`** 只用 `zlib` 解码 PNG（不引依赖），按色相家族统计像素，用「黄 5.47% → 0.39%、青 0.42% → 5.40%、中性约 93% 不变」这样的数字代替「看起来像换了」。

---

## 设置页

```bash
node test/settings-rows.test.js     # 设置面板真实渲染 + 开关联动
node test/settings-durable-hold.test.js  # 命名空间未就绪时的写入 gate + 补写
node test/settings-off.test.js      # 关闭主题后设置页仍可读
node test/settings-locale.test.js   # 跟随语言设置（zh/en 词典对齐 + 切换生效）
```

**`settings-rows.test.js`** 不用浏览器也不用 React：以**记录型 `React` / `slots` + 假的 `ctx.settingsScope` 绑定器**（`test/fixtures/settings-scope.js`）在进程内跑一次真实 `apply()`，抓下设置面板真正的元素树。设置页是用户唯一能碰到这些开关的入口，而那里的错误（抛异常、漏 key、开关写错了 DSH 设置的字段）check.js 与画布测试都看不见。

> 说明：这个插件从 **`localStorage` 迁移到了 DSH 的持久化设置命名空间**（见 features.md / engineering-notes.md）。因此设置类测试不再往浏览器存储里塞值，而是驱动假的 `ctx.settingsScope` 绑定器——它在内存里扮演 `<settings.yaml>` 中的命名字段节。断言 10 行齐全且归入 4 个分组容器、key 唯一、分组标题（01 主题 / 02 背景 / 03 动画 / 04 娱乐）与配色样式规则都在、配色行默认显示谷地黄且按钮提供「切换武陵青」、点击把 `palette` 写成 `wuling`、存了 `wuling` 时反向提供「切换谷地黄」并标注 `#14d0d0`、图层关闭时子开关为 disabled、开启后恢复可用，雷霆大字与大字入场动画均默认为关、说明文字包含「任务开始」/「任务完成」与 3 秒、**子开关只写自己的字段而不误写主开关的**，以及点击确实写入文档里那个 DSH 设置字段。

**`settings-durable-hold.test.js`** 用**两阶段假 `ctx.settingsScope`** 复现那条真实告警：宿主半部 `ctx.settings.register(...)` 尚未跑、命名空间还没进 Host 的 served 列表前，scope 快照是 `{ status:'unavailable', writable:true, mode:'host' }`——单看 `writable` 会照写不误却落不到盘。它先在未就绪态切「圆角 / 武陵青」，断言**没有任何 `scope.set` 出线**（旧 bug 会打 `commit … status= unavailable` 并静默丢脏）；随后模拟文档 committed、命名空间进入 served 列表、快照翻为 `status:'ready'`，断言订阅路径把两份 held 编辑**自动补写**进 `settings.yaml`，且不会重复写两遍（replay 有 re-entrancy 护栏）。

**`settings-off.test.js`** 守的是设置页自己最脆弱的时刻：**开关按钮的强调色底来自主题样式表，而样式表随主题关闭被移除**。它在真实浏览器里加载真实 `client.js`，以应用**自己的默认令牌**（亮 / 暗两套）把主题关掉，用 `slots` 桩抓出真实元素树并物化成 DOM，然后断言每个按钮的合成对比度 ≥ 4.5。

> 这个测试抓到过真 bug：修复前暗色模式下「切换武陵青」与「切为静态」两个常亮按钮是 `#000` 落在透明底上、对深色面板仅约 1.1:1，修复后全部 ≥ 11.5:1。

**`settings-locale.test.js`** 配一个按运行时契约造形的假 `locale` 服务（`register(ns, dicts)` / `bind(ns)`，含 `active → en → 键名` 的查找链，并**复现真实服务对重复 `(ns, locale)` 的抛错**）。覆盖：注册了自己的命名空间；**en 与 zh 键集完全一致**、无空译文、且两种语言实质不同（防止「翻译」其实是复制）；注册声明了 `locale:`、`label` 是 thunk 且随语言变化；zh 渲染为中文而 **en 渲染无任何残留中文与中日韩标点**；未知语言回退到 en 而不漏键名；词典只注册一次、可随 `ctx.effect` 注销并重新注册；以及**完全没有 locale 服务时页面照常渲染为中文、且不声明 `locale:`**。

---

## 设置能否被读回（键 ↔ 字段）

```bash
node test/prefs-key-mapping.test.js   # 浏览器侧的偏好键 ↔ host schema 字段
node test/prefs-write-latency.test.js # 写后立刻回读：写透层 / 回相退役 / 未确认写不回滚
node test/migrate-prefs.test.js       # tools/migrate-prefs.js 的文本改写契约
```

**`prefs-key-mapping.test.js`** 存在的理由是一个真实缺陷：浏览器侧用连字符键
（`dsh-…-contour-speed`）寻址一个设置，而 host schema 的字段是驼峰（`contourSpeed`），
设置服务只按其**声明过的字段**提供命名空间。键→字段的映射一度写成「切掉前缀」，于是七个
带连字符的设置（`contourAnim` / `contourDir` / `contourSpeed` / `contourDensity` /
`contourScrollPause` / `watermarkPersist` / `thunderAnim`）写进去的值永远读不回来——写入却
报 `status= ready mode= host`、`settings.yaml` 里也确实有值，下次刷新却回到默认。单字段名
（`radius`、`thunder`）因为键尾与字段名恰好相同，把这个缺陷盖住了很久。

测试从两个**独立来源**取事实：client.js 里真实执行的偏好键（切出来放进 `vm` 跑，不复制
逻辑）与 index.js 真实导出的 `FIELD_DEFAULTS`。断言：每个键映射到一个已声明字段、每个声明
字段都有键可达、连字符键必须映射成驼峰（命名回归）、键不得硬编码包名（必须从 `PREFS_NS`
派生）、`slice(PREFS_NS.length + 1)` 只允许出现在 helper 里。**做过变异验证**：把映射改回
身份切片，它以「`CONTOUR_SPEED_KEY -> contour-speed` 不是已声明字段」逐条失败。

> **测试夹具曾经和实现同错，这才是缺陷潜伏的原因。** `test/fixtures/settings-scope.js`
> 与 `settings-scope.browser.js` 一度用同样的身份切片，于是 mock 与坏实现互相印证、建在其上
> 的测试全绿。现在两者都做与 client.js 相同的转换，并由同一测试断言这份一致性；另外，
> 往夹具里种一个 schema 未声明的字段不再是静默丢弃——Node 夹具直接抛错并点名该字段，页面
> 夹具在 DOM 里留 `data-endfield-scope-error` 标记，由 `test/lib/browser.js` 升级为明确失败
> （它一度因「夹具源码本身内联在页面里」而误报，因此只看真正的标记元素，这个边界也有测试）。

**`prefs-write-latency.test.js`** 钉住的是**时序**而不是取值：`ctx.settingsScope` 的 `scope.set()` 是异步提交的，所以「写完之后同一个 tick 里再读」必须读到**刚写的**值，否则任何「写完立刻读回再决策」的处理器都会用到上一次的值——用户那边的现象就是**挡位要点两次才生效**（第一次点击只让面板刷新）。夹具 `test/fixtures/settings-scope.js` 为此加了 `deferWrites` 模式：`set()` 只入队，真实的回相要等 `flush()`，于是原始时序能在 Node 里稳定复现。断言：写入在同 tick 内可读；夹具**确实**延迟了回写（防止测试因为夹具变成同步而假绿）；回相到达后以 scope 快照为准（写透层退役、不留陈旧值）；未经回相确认的写在页面内依然有效（不能被悄悄还原）；同步 scope 的老路径行为不变；开关这类**用字符串极性**存储的值经过写透层也不会被改写成布尔。
**做过变异验证**：注释掉 client.js 里那行 `if (prefsWritten.has(field)) return prefsWritten.get(field)`，它以 3 条失败（`an unconfirmed write reverted to "11"` 等）退出，恢复后全绿。

**`migrate-prefs.test.js`** 钉住 `tools/migrate-prefs.js` 的承诺：默认 dry-run 一个字节都不写、
`--write` 前先做带时间戳的备份、只迁移当前 schema 声明过的字段、其余段/注释/顺序逐字保留、
目标段已存在时拒绝写入（`--force` 才覆盖且不产生重复段）、`--kebab` 把历史连字符键转成驼峰
字段名且值仍是字符串（schema 是 `z.string()`，`radius: round` 与 `radius: "round"` 都能读，
但 `contourSpeed: 0` 会被拒），缺文件 / 缺源段给出一行明确信息而不是崩。

---

## 雷霆大字

```bash
node test/thunder-edges.test.js     # 边沿/生命周期/样式契约
node test/thunder-shot.js           # 真实渲染截图 + 像素对比度断言
node test/thunder-dismiss.test.js   # 点击关闭：真实指针事件 + 命中测试 + 监听器核账
```

**`thunder-edges.test.js`** 在进程内跑真实 `client.js`，配一个按运行时契约造形的假 `sessions` 服务和一个**可控时钟**，因此 3 秒窗口是被断言的而不是被等待的。覆盖：关闭时**不订阅**（零开销）；`false→true` 播「任务开始」、`true→false` 播「任务完成」；**同值连续推送 25 次不重复播报**；2999ms 仍在、3000ms 已隐藏；入场动画默认关闭时大字带静态标记、开启后不带，且两种状态下 3 秒时长都不变；系统「减少动态效果」压过已开启的动画开关；切进已在运行的会话不误报、但其结束仍播报；离开的会话被退订；关闭主题会移除大字并退订、重新开启会恢复；**服务迟到后仍能自动接上**；`ctx.effect` 拆除时释放全部订阅与节点。

另有 14 条**样式契约**断言（固定定位、居中、`pointer-events: none`、`font-weight: 900`、`clamp()` 字号、白色字面量、层级低于加载屏、`prefers-reduced-motion`、静态分支取消动画并强制 `opacity: 1`）——这些是本机无布局引擎时看不见、却最容易被后续重构悄悄改掉的视觉事实。

> 变异验证共 19 类：默认改成 opt-out、边沿退化成电平、去掉基线、时长改成 5s、两个词对调、不自动隐藏、去掉 `aria-hidden`、切换会话不退订、拆除不退订、白色换成令牌、粗体改成 400、层级盖过加载屏、服务缓存不重试、动画默认改成 opt-out、静态标记永不打 / 永远打、系统偏好不再覆盖、子开关误写主开关的键、子开关未禁用、静态分支丢掉 `opacity: 1`。

**`thunder-shot.js`** 补的是结构断言看不见的那一半：**像素**。它在真实浏览器里跑真实 `client.js`，通过主题自己的订阅路径触发播报，输出亮 / 暗 × 开始 / 完成共四张截图，然后解码 PNG 并断言：中央带的近白像素占比（字形确实出现）、压暗底确实压暗（亮色）或仍为近黑（暗色）、以及白字对压暗后表面的**合成对比度 ≥ 3**。

**`thunder-dismiss.test.js`** 守「点击任意处立即关闭」——这条只能在真实浏览器里验，因为它本质是个**命中测试**问题。18 条断言覆盖：大字在屏幕上时空白处与被覆盖按钮的顶层元素**仍是页面自己的元素**；点空白处大字立即消失且**这一次点击照常抵达**；点真实按钮则**既关掉大字又触发按钮**；控件调 `stopPropagation` 时仍能关闭（捕获阶段）而该控件自己的处理器照常收到事件；关闭后再点不报错、大字不复活；提前关闭会取消 3 秒定时器；以及**监听器收支平衡**——显示中恰好持有 1 个，关闭后归零。

> 变异验证 6 种写错的实现：不挂监听、**挂在遮罩上（点击黑洞）**、不摘监听、不取消定时器、用冒泡阶段、用 `click` 代替 `pointerdown`。

---

## 等高线背景

`check.js` 只能证明文件可解析，这不等于功能有效。这些脚本把**真实的 `client.js`** 切出来跑——几何与性能三个脚本在 Node 里桩掉 2d context 直接执行（不需要浏览器），其余把整页放进一个按安装态 bundle 复刻的应用 DOM/CSS 里并对实测像素断言：

```bash
node test/contour-cusps.test.js       # 几何：尖点 / 重复提取 / 顶点跳变 / 碎屑 / seed 生命周期，含每个「高原+悬崖」档位（Node）
node test/contour-smoothness.test.js  # 几何：曲线 vs 原始折线的最大转角（Node）
node test/contour-roughness.test.js   # 粗糙度阶梯：单调性 / 出厂档位 / 可读性上限 / 逐档出图 / 高原与悬崖（Node）
node test/prefs-write-latency.test.js # 设置写入的时序：写后立刻回读 / 回相退役 / 未确认写不回滚（Node）
node test/contour-perf.test.js        # 成本形状 + 实测量 + 滚动门控（Node）
node test/contour-render.test.js      # 21 项行为断言（浏览器）
node test/contour-specks.test.js      # 残渣过滤 + 随机种子 + 空白格（浏览器）
node test/contour-a11y.test.js        # prefers-reduced-motion 行为（浏览器）
node test/contour-coverage.test.js    # 8×5 分区墨迹覆盖率（浏览器）
node test/shoot.js                    # 输出亮/暗 × 两配色共四张截图供肉眼复核
```

不带浏览器也能跑完全部 Node 侧校验：`npm run test:node`。

**`contour-render.test.js`** 覆盖：关闭时不创建节点且**不改动应用底色**；开启时画布挂进应用外框、图层确实上色、不透明底色已让位；正文颜色不变且仍可命中测试（图层在其**之下**）；滚动开启时像素随时间变化、关闭后**完全静止**、**重新开启后再次变化**；暗色仍上色；拆除后节点归零。

> 这套脚本抓到了三个真实 bug，都不是解析错误：子开关在已挂载时失效、TDZ 崩溃隐患、重启动画的首帧是空转。详见[工程笔记](engineering-notes.md#等高线背景)。

**`contour-specks.test.js`** 守四件事，并逐一做了反向对照：改回写死种子 → 报「5 次加载地形完全相同」；关掉过滤器 → 报 9 条全画布外、15 条短描边、7 个小环；空白格门槛调回 1 → 空白格重现。（同样的碎屑属性在 Node 侧由 `contour-cusps` 复核：最短绘制等高线与最小环包围盒都必须高于过滤阈值。）

**`contour-cusps.test.js`** 量**真正画出来的曲线本身**：桩掉一个 2d context，让**原样切出的** `contourRenderCache()` 自己录下 `moveTo/lineTo/bezierCurveTo/closePath` 调用流（单次 `beginPath` + 每条路径一个 `moveTo`，因此先按 `moveTo` 切成子路径），再密集 de Casteljau 采样、逐点测转角（闭合环丢掉与起点重合的末样本后**按循环测，接缝一并计入**）。样条与路径布局不在测试里重算，所以测试不会悄悄偏离它要检查的渲染器。

扫描 6 种视口（含 320×240 与 2000×200 这类会被尺寸上限**钳制**的极端比例）× 2 档密度，断言：**没有尖点（>150°）**、**没有锐角**、中段仍平滑（p99 < 12°）、闭合环**确实是按环画的**、**同一条等高线不会被提取两次**、**同一条曲线内不会出现超过一个网格步长的顶点跳变**（阶梯式缝合走错层就会这样）、所有坐标有限且在纹理内、最短绘制等高线 ≥45px 且最小环包围盒 ≥25px（碎屑）、以及 seed 生命周期：**同 seed + 同尺寸重算出完全相同的地形**、**换 seed 得到不同地形**、**换密度复用同一个场**。实测：最大转角 1.1°、p99 0.6–0.7°、2358 条子路径、1304 个环。

这项里的「重复提取」与「顶点跳变」两条正是抓到真实缺陷的断言：`contourGenerateField()` 忘了把 `hCount` 放进返回对象，提取器解构出来是 `undefined`，于是**每条竖直边的 id 都成了 NaN**——`Int32Array` 把 NaN 静默存成 0，`es[NaN]` 又是空操作、永远不会打上时间戳，缝合走线因此从伪 id 出发并吐出**上一个等值层算出的顶点**。症状是同一圈等高线在多层被原样重复、以及路径中间出现跨越上百像素的瞬移；像素类测试全绿，因为没有像素被「画错」，只是画了不该画的东西。

**`contour-smoothness.test.js`** 把**真实的绘制函数原样切出**来跑，而不是重写一份等价逻辑。它把每条画出来的曲线与它来源的**原始 marching squares 折线**逐一对比（切分顺序一致），断言：每条都用**三次曲线**绘制（没有退化成直线段）、曲线**仍贴着等高线**（顶点偏差最差 2.6px、均值 0.35px）、且**最大转角**从原始折线的 175° 降到 0.6°。转角只在**两侧段长都 ≥0.3px** 时才计入——折返宽度小于描边粗细时，无论角度多大都看不见；同一条规则也用在 `contour-cusps` 上，两个脚本因此对「什么算可见拐角」保持一致。脚本顶部还记录了**为什么不能用「按弧长重采样后再比较」**：重采样会把 0.5px 宽的折返的两侧拉开到 1px，于是那个不可见的折返会被报成 158° 的「拐角」——实测症状就是本脚本曾在同一批曲线上报出两万多个锐角，而密集采样的 `contour-cusps` 只看到 1.1°。

**`contour-a11y.test.js`** 用 `--force-prefers-reduced-motion` 在**整个浏览器**层面施加该偏好（页面脚本无法切换它），然后在动效开关为「开」的前提下断言：图案仍渲染、**像素零变化**（滚动未启动）。该偏好在代码里是**每次协调实时读取**的（`thunder-edges` 会在同一进程里切换 `matchMedia` 来验证这一点），所以开着页面改变系统设置也会立刻生效。

**`contour-coverage.test.js`** 直接读**画布本身**而非截图：截图里应用自己的卡片、输入区遮罩和正文会盖住图案，无法回答「场里有没有空白」。它把画布切成 8×5 分区并统计墨迹占比。

**`contour-roughness.test.js`** 守的是「唯一会改变地形形状的那个设置」。它不检查有没有抛异常——粗糙度调错了不会抛异常，只会画出**坏地图**：某一档什么都不画、相邻两档画出来一模一样（滑块有半程是死的）、或者最粗糙那档糊成均匀噪点。现有套件全都发现不了：cusps / smoothness 原本只扫**出厂档**那一个地形，specks 只问单条线是不是碎屑。所以这个脚本按用户看到的方式量**整条阶梯**：四张参数表格式与单调性；出厂档**逐字等于出厂常量**（`280 / 0.5 / 5`，老用户升级后地图不变）；倍频阶梯在 5 种纹理尺寸下都不越过置乱表上限、且不会塌成 0 层；每一档都真的产出等高线；闭合环数**逐档递增**；没有一档画出碎屑；以及那条实测出来的可读性上限——**最细倍频的振幅占比 ≤12%**（超过它，最细那层就落在 10px 采样网格附近，画面从地形退化成噪点；实测最差 10.6%，出现在 4096×384 纹理的第 12 档）。

**`contour-roughness.test.js` 的后半段专测「高原 + 悬崖」**（第 10–12 档）。这里的关键是**指标选对**：阶梯会把许多零散短环换成少数长线束，所以「总笔画随档位增加」在这一段**不成立**（实测 575k → 569k px），拿它当判据会得出「这一档没生效」的错误结论。脚本改为直接量**场本身**：相邻网格点高度差 < 0.15%×range 的算**高原**、> 3%×range 的算**悬崖坡面**，两个阈值都是 range 的固定比例而非分位数（分位数会随效果一起移动，正好把自己的效果抵消掉）。断言项：表格前 9 档必须**恰好为 0**（默认档及以下逐位不变）；三个带阶梯的档位强度严格递增；高原占比从默认档 3.9% 涨到 32% / 54% / 68%；「悬崖占比」定义为 `steep / (1 - flat)`（在**剩余起伏**里的占比——用全图占比会朝效果反方向走：实测 33.6% → 26.9%，归一化后 35% → 83%）；第一个带阶梯的档位高原占比必须仍 < 50%（否则整屏空白，等于把图弄坏）。

**`contour-cusps.test.js` 现在把每一个带阶梯的档位单独扫一遍**（1152×648 与 320×240 × 两个密度），因为软阶梯是这次唯一有可能往高度场里塞进真尖角的改动。实测最大转角 1.1°，与不带阶梯的地形完全一致；「≥8° 转角」「顶点跳变」「碎屑阈值」等既有断言对这一段同样生效。

**`contour-perf.test.js`** 量的是新架构**承诺的成本形状**，而且不靠计时：桩掉 context 后驱动 300 帧，断言这一过程中**地形生成 0 次、等值线提取 0 次、纹理渲染 0 次**；改密度只重新提取 / 重绘各 1 次且**不重新生成地形**；改粗糙度则**恰恰相反**——必须重新生成 1 次、重新提取 1 次、重绘 1 次，且**用同一个 seed**（地形被重新调形而不是换地图；滑回出厂档必须逐字复原出发时的那张地形）。这里刻意让 `contourRoughnessIndex()` 走**真实的偏好读取路径**（与密度那个固定桩不同），所以「滑块 → 偏好 → 地形」这条链路也在测试范围内；沙箱里把 `setTimeout` 显式置空，引擎于是走「无定时器时同步重建」的分支，一次档位变更的成本才数得清。并**静态检查** `contourFrame()` 的源码里根本不出现建/提取/渲染三件套（帧函数在构造上就只能是「缓存平移」）。随后实测成本：

- 一次性构建（地形 → 等值线 → 平滑纹理）：`320×240` 17ms、`1152×648` 82ms、`1432×753` 89ms、`1920×1080` 95ms、`2000×200` 22ms、`1920×1080@2x` 28ms；
- 每帧：**1 次 `drawImage`**（大窗口跨接缝时最多 4 次）、约 0.001ms JS 时间，对照 120fps 的 8.3ms 预算；
- 纹理尺寸上限：单边 ≤4096 设备像素、面积 ≤8.3e6 CSS px²。

同一个脚本还逐条守住**滚动门控**：开着但被 reduced-motion 拦下、被启动加载屏拦下、被页面滚动暂停拦下、以及开关关闭时必须**不启动循环**；其中「清掉 reduced-motion 后循环恢复」这一条专门守住「偏好被实时读取而不是加载时缓存」。

实测（本机、Node 内）：一次性构建最差 96ms，每帧 blit p95 ≤0.002ms。

---

## 水印层叠

```bash
node test/watermark-stacking.test.js
```

四条结论都做了反向对照（故意改坏必须报错）：改回 `z-index:1` → 报 9945 px 越界；深色 alpha 调回 `0.16` → 报 1.558:1 过强；alpha 降到 `0.004` → 同时报「不可见」与「低于感知下限」。

这个测试的两个方法论坑（不能用命中测试判断 `pointer-events:none` 的层叠、两版渲染必须只差 alpha）见[验证方法论](engineering-notes.md#命中测试判断不了-pointer-events-none-的层叠)。

---

## 截图辅助

```bash
npm run shots          # 输出亮/暗 × 两配色共四张截图
npm run shots:verify   # 上面 + 解码统计强调色像素
```

这两个不是断言，是给肉眼复核用的。数值化的那一半在 `verify-shots.js` 里。
