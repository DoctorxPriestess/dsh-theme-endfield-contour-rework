# 交接报告 — dsh-theme-endfield-contour-rework

> 所有结论标注证据强度：**FACT** = 文件/工具输出直接得到，**INFERENCE** = 由事实推断（需再验证），
> **UNKNOWN** = 未验证。

---

## 1. 一句话状态

**性能轮已完成、已打包并已装入 desktop profile**：2D 纹理构建从单个 **2112 ms** 长任务
改为按 40k 地形点分片让出，最长任务 **383 ms**；2D 线画布与旧版**逐字节相同**
（0 / 5,401,004 像素差）；3D 播放主线程 1204 → **98.2 ms / 3 s**。源码在
`D:\AI Misc\dsh-theme-endfield-contour-rework`，`main` HEAD = `4bd7754`（`client.js`
sha256 前缀 `f7ad0a06`），版本 **1.5.16**，tgz 已放进 `local-build`，profile 已指向它，
**重启 DSH 后生效**。`npm run test:node` **525 ok / 0 失败**，`test:browser` 通过；
`settings-020-integration` 的 4 项失败在基线 `b7be147` 上同样存在（既有问题，非本轮引入）。

---

## 2. 代码与安装状态（FACT）

| 项 | 值 |
|---|---|
| 源码目录 | `D:\AI Misc\dsh-theme-endfield-contour-rework` |
| 分支 / HEAD | `main` / `4bd7754`（`client.js` sha256 `f7ad0a06…`） |
| 已安装版本 | **1.5.16**：sha256 `f7ad0a06…`（分帧渲染 + 3D desynchronized；**需重启 DSH 才生效**） |
| 安装包 | `…\.dsh\backups\local-build\dsh-theme-endfield-contour-rework-1.5.16.tgz` |
| 版本号 | `package.json` **1.5.16**（已升版） |
| 远端 | `origin`（GitHub, HTTPS）落后本地提交，**未推送** |
| 未跟踪文件 | `.dsh-ops/`（工具审计目录，可忽略；`WORKLOG.md` 为代理日志） |
| 备用实验 | 分支 `wip/seam-torus`（ping-pong 相机方案，**已否决**，见 §6.4） |

### 测试状态（FACT，本轮实测）
- `npm run test:node`：**525 ok / 0 失败**。
- `npm run test:browser`：通过（含新增 `contour-async-build.test.js`：不设同步钩子，
  等 `data-endfield-contour-ready="1"`，并断言就绪前线画布 0 像素）。
- `node test/contour-render.test.js`：**45 项通过**；`host-config-resolution` 通过。
- `npm run test:ci`：在 `settings-020-integration.test.js` 的 4 项失败处中断；
  **该失败在基线 `b7be147` 上同样复现**（用 `git archive` 的同源副本实测），非本轮引入。
- 像素 A/B（同一源码、同步 vs 分片、固定种子）：线画布 PNG **0 / 5,401,004 像素差**，
  hash 1617012213 / ink 407211 两边相同。

### 回滚方式
- 代码：`git revert 4bd7754`。
- 安装回滚：重装 `…\.dsh\backups\local-build\dsh-theme-endfield-contour-rework-1.5.15-fix33.tgz`
  （`cd ~/.dsh/profiles/desktop && pnpm add file:…-1.5.15-fix33.tgz`），或
  `undo_restore mode="id" snapshot_id="20261019-070416-0ad2"`，然后重启 DSH。

---

## 3. 这个项目是什么

上游 [`dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield) 的 MIT fork：给
DSH 桌面端加一条**等高线地形背景**（噪声场 → marching squares 提等高线 → 描边成贴图 → 平移播放），
外加 Endfield 风格配色与若干 UI 皮肤规则。引擎全部在单文件 `client.js`（约 7.7k 行）。渲染三条路径：

1. **2D 合成器路径（默认）**：贴图 + 一块「视口 + 512 设备像素」的滚动画布，每帧只写一次 `transform`。
2. **2D 回落路径**：无 transform 环境或超大视口时，每帧整幅 blit 视口。
3. **3D 视差路径**：一个全屏 WebGL shader，按每像素高度反解摄像机、raymarch 求交、footprint AA。

---

## 4. 本轮改动（提交 `d30fbf5`，一提交一主题）

| 位置 | 改动 |
|---|---|
| `contourTargetTexture` | 子图尺寸按 `CONTOUR_STEP*2`（20px）向上取整；每边上限先向下取整到同一网格。乘 2 是为了 `周期×dpr` 在 1.25/1.5/2 上都是整数（3D shader 的 `fract()` 需要整纹素周期）。 |
| `contourExtractLevel` | **在环面上提取**：边/顶点按周期寻址（跨缝相对的两格压同一 id），行走时坐标连续展开，环按扫描顺序起走。热路径无取模（1 期数据直接读 F 的重复行/列）。 |
| `contourSeamShifts`（新，纯函数） | 给出一条轮廓需要描边的整周期平移集合；每个点恰好一个平移落在画面内 → **不会重墨**。 |
| `contourRenderCache` | 按平移分组描边；未平移的那组永远画（保证「一条轮廓一个 subpath」的契约）。 |
| `test/contour-seam.test.js`（新，403 行，11 项） | 计划尺寸闭合、设备周期为整数、场严格闭合、闭合图上无端点、无顶点跳动、`contourSeamShifts` 每点恰好画一次（9 种包围盒）。 |
| `test/contour-cusps.test.js` | 坐标窗口改为「图 ± 两个周期」，新增「闭合图上无端点」断言。 |
| `package.json` | 新增 `test:seam`，并把 seam 测试并入 `test:node` / `test:ci`。 |

---

## 5. 接缝：上一轮的结论是错的（这是本轮最重要的更正）

### 5.1 `field_check.js` 量错了东西（FACT）
旧探针比较 `F[0]` 与 `F[cols-2]`——两者相差一格，量的是**梯度**，不是周期闭合。真正的闭合是
`F[0]` 与 `F[cols-1]`，而 `test/contour-roughness.test.js` **一直在断言后者为 0**（每个 roughness
stop 都 bit 级相等）。也就是说：**场从来就是严格周期的**，「接缝在地形本身」不成立。

### 5.2 真正的两处缺陷（FACT + INFERENCE）
1. **尺寸没落在采样网格上**（`1432x753@2x` → 2D 图 3712、3D 图 1792，都是 `%10 == 2`）。
   边界那格是残格：跨缝的等值线与对侧延续点最多差一格，且随窗口尺寸变化——这就是「某些窗口
   尺寸下 2D 也能看到缝」。
2. **轮廓被边界切断**：提取止于最后一行/列，跨缝的线在两侧各是一条 butt 端帽的断头，各自独立
   平滑；短于 `KEEP_LEN` 的碎段还会被丢掉。`1920x1280` 上 245 条轮廓里 **108 条**有端点落在边界。

### 5.3 修复后的实测（FACT，同种子同尺寸 A/B，只切换「是否环绕」）
`scratch/terrain-lab/seam_metric.js`：指标是接缝两侧列/行的平均 |Δalpha|，以及它与内部所有列
边界的 95 百分位之比（1.0 = 与普通内部列边界无法区分）。

| 场景 | 切开（旧） | 环绕（新） |
|---|---|---|
| 2D 3560x1680@2x 左右接缝 | 4.97（1.15× 内部 p95） | **3.68（0.85×）** |
| 2D 3560x1680@2x 上下接缝 | 4.27 | **3.71** |
| 3D 1700x900@2x 左右接缝 | 3.59（0.56×） | **2.13（0.33×）** |
| 3D 1700x900@2x 上下接缝 | 9.27（越出内部 max） | **7.67（内部 p95 7.98 之内）** |
| 1920x1280 有端点的轮廓 / 总数 | 137 / 245 | **180 / 180（0 条）** |

### 5.4 已知残留（诚实清单级）
- **缠绕轮廓有且只有一处自由端**：一条环周期缠绕的等值线在环面上必然要「剪一刀」，那一处仍按
  开链平滑（亚像素差别，不在缝上，位于扫描起点＝图的上缘）。曾用「按到角距离排序起点」改善，
  实测 **120ms/次重建**，已撤销（cusps 测试最差转角两种情况都是 1.1°）。
- 像素指标只能在无头 Chromium + 固定种子下比较，**真机观感未验证**（见 §11）。

---

## 6. 性能：本轮的代价与旧结论

### 6.1 本轮新增的构建成本（FACT，`contour-perf.test.js` p50，同机同测法）
| 视口 | 旧 | 新 | 变化 |
|---|---|---|---|
| 320x240 | 47.4 ms | 49.0 ms | +3% |
| 1152x648 | 173.6 ms | 196.4 ms | +13% |
| 1432x753 | 223.3 ms | 270.8 ms | +21% |
| 1920x1080 | 241.8 ms | 323.8 ms | +34% |
| 2000x200 | 87.8 ms | 111.9 ms | +27% |

拆解（`torus_check.js` 计时，4620x2600）：生成不变（103ms），**提取 +25ms**（85→110ms，环面地址
与坐标展开），其余约 +55ms 是渲染——跨缝的轮廓要多描一遍才能把对侧延续画上。第一版实现曾把
提取拖到 4 倍（240ms vs 61ms），原因是内层每格都做取模 + 每层对顶点排序找“最靠角的起点”
（≈120ms/次重建）；两者都已去掉：现在内层只读 F 的重复行/列，排序换成扫描顺序。
**每帧成本未变**（300 帧 0 次重建，blit p95 ≤ 0.002ms）。重建只在挂载/尺寸变化/粗糙度切换时发生。

### 6.2 上一轮已实证的根因仍然有效（FACT）
`contourSchemeObserver` 无条件重描整图 + 重传整块纹理（body class 变化）已修为签名比较。
修复前 body class 变化 13 次 → 重描 14 次；修复后 120 次 → 1 次。

### 6.3 未证实的部分（UNKNOWN）
JS/DOM 层无泄漏（98 秒浸泡、21335 帧、强制 GC 后堆 3–9MB 振荡）。若仍「长跑必卡」，
剩余嫌疑是驱动层与 3D 全屏 shader 的持续负载；判断方法：看设置里 3D 是否被看门狗自动关掉、
控制台是否有 `frame watchdog` 日志。

### 6.4 分帧渲染 + 3D desynchronized（本轮，FACT）

测量环境：隔离 `DSH_HOME`、独立 `dsh --profile web --port 5391`、真实 Edge（ANGLE
Vulkan / RTX 4090 Laptop）、1578×909 @ DPR 1.5、固定随机种子、水印关闭。

| 指标 | 同步（旧行为） | 分片（新） |
|---|---|---|
| 2D 构建最长主线程任务 | **2112 ms** | **383 ms** |
| 2D 首张画布可见 | 2505 ms | 2473 ms |
| 2D 线画布像素 | — | 逐字节相同（0 / 5,401,004 像素差） |
| 3D 挂载最长任务 | — | 269 ms |
| 3D 播放主线程 / 3 s | 1204 ms（desync 前） | **98.2 ms** |

分片构建的阶段耗时（同一次挂载）：生成 76 ms、提取 60 ms、分片描边总墙钟 ~1490 ms、
surface 重绘 31 ms。**总墙钟没有变短**（首帧 2473 vs 2505 ms）：省下的是主线程连续占用，
不是总栅格量。要再缩短首帧需要把描边/平滑搬到 worker（OffscreenCanvas + CSP/GPU 兼容性
未验证，本轮未做，标记 UNKNOWN）。

证据文件：`D:\AI Misc\dsh-perf-lab\artifacts\measure-ab-async.json`、
`measure-ab-sync.json`、`measure-chunk-3d.json`、`run-ab-async.log` / `run-ab-sync.log`；
截图对比 `canvas-ab-async.png` / `canvas-ab-sync.png`。

---

## 7. 已被否决的路线（不要重复）

| 做法 | 结果 |
|---|---|
| 加宽描边 / 调描边颜色 | 只掩盖 1–2px，接缝仍在 |
| 在另一侧补画延续（wrap pass，`wip/seam-torus`） | 断口 77.6% → 62.2%，**不能消除**（尺寸未闭合，几何仍是两段） |
| 不改尺寸只看像素 | 残格相位差会随窗口变化，永远修不干净 |
| 不做环绕（相机来回走 ping-pong） | 结构上无接缝，但运动方向会周期反转（用户未接受） |
| 压缩 3D 周期（1.5×） | 重复落在画面内，更糟 |
| 按到角距离排序环起点 | 效果亚像素级，代价 120ms/次重建，已撤销 |

---

## 8. 关键常量（当前主线）

| 常量 | 值 | 含义 |
|---|---|---|
| `CONTOUR_STEP` | 10 | 采样网格步长（CSS px），也是子图尺寸的取整单位 ×2 |
| `CONTOUR_BASE_CELL` | 370 | 最大噪声格长 |
| `CONTOUR_SURFACE_PAD` | 512 | 2D 滚动画布余量（设备 px） |
| `CONTOUR_SHEET_MAX_DEVICE_PX` | 24e6 | 图面积硬上限（约 96MB） |
| `CONTOUR_MEM_BUDGET` | 150e6 | 贴图+画布总预算 |
| `CONTOUR_WATCH_DT` / `_NET` | 0.05s / 40 | 看门狗阈值 |
| `CONTOUR_3D_STEPS` | 10 | 3D raymarch 步数 |
| `CONTOUR_HOLLOW_ENABLED` | true | 镂空开关；`contourHollowWanted()` 还要求 3D 视图，所以只开在 3D，已由 `contour-hollow.test.js` C 组钉住 |

---

## 9. 工具库存（`C:\Users\ControlxSaria\.dsh\scratch\terrain-lab`）

| 脚本 | 用途 |
|---|---|
| `torus_check.js [WxH…]` | 场的闭合、网格闭合、轮廓是否还有端点、最大步长、提取耗时；`CLIENT=<path>` 可对比任意版本 |
| `seam_metric.js <tag> [WxH] [dpr] [--3d]` | 无头 Chromium 里出图并量接缝：内部列/行边界分布 vs 接缝；`CUT=1` 关掉环绕做 A/B，`FORCE=WxH:DPR` 锁定图尺寸，`FORCE3D=1` 用 3D 那张图；产物在 `out/`（`*-tile.png` 2×2 拼接、`*-seam-x/y.png` 8× 接缝放大） |
| `lattice.js` | 列出能闭合噪声格点 + 网格的尺寸（历史用途） |
| `sheet_edge.js` / `seam_image.js` | 旧的边界像素统计 / 2×2 出图（指标弱，已被上面两个取代） |
| `shot3d2.js <flat\|parallax> <tag> [WxH] [dpr]` | SwiftShader 出图（看 3D 观感） |
| `soak2.js <秒>` | 实时浸泡（堆/节点/样式/canvas/帧数） |
| `repaint_probe.js` | 数「整图重描」次数（body class 根因验证） |
| `field_check.js` | **指标错了，不要再当判据**（比的是 gradient） |

---

## 10. 接手时建议的第一步

1. 在真机页面里看：深色 + 浅色、2D + 3D、把窗口拖到几个不同尺寸，确认接缝消失。
2. 若要装新版本：见 §12（打包 → `dsh plugin add` → 重启 DSH）。
3. 若真机仍能看到缝：先用 `seam_metric.js` 在当前图尺寸上量 `CUT=1` vs 默认，确认是"我们以为
   修好的那条缝"还是别的（例如深色配色下的 AA 观感、3D 的亚像素门）。
4. 镂空已经定案为「只在 3D 视图开」（`CONTOUR_HOLLOW_ENABLED = true` + `contourHollowWanted()` 要求
   `isContourView3D()`），2D 逐字节不变；要复核的是**真机上的开销与观感**（第二张 sheet + 一层绘制）。

---

## 11. 诚实清单（不要当已解决）

- **接缝的几何已经证明是环面**（无端点、场 bit 级闭合、周期×dpr 为整数），像素指标也确有改善，
  但**真机观感未验证**——所有「无缝」的结论都仅限 headless Chromium + 固定种子。
- **构建耗时 +23~38%**（§6.1）。不是每帧成本，但真机重建会多等几十毫秒。
- **「装了就卡死」**只修过一个已实证的根因（body class 整图重传），用户是否仍复现未知。
- **CoT 黑矩形**在去掉加色后是否消失，未获用户确认。
- **3D 在真机上的实际帧率与观感**未测（headless 只有 SwiftShader）。
- **缠绕轮廓的那一处自由端**（§5.4）仍在。

---

## 12. 安装 / 发布流程（fix15 已按此装过，2026-10-19）

```
cd "D:\AI Misc\dsh-theme-endfield-contour-rework"
npm pack --pack-destination "C:\Users\ControlxSaria\.dsh\backups\local-build"
dsh plugin --profile desktop add "C:\Users\ControlxSaria\.dsh\backups\local-build\dsh-theme-endfield-contour-rework-1.5.3-fix15.tgz"
# 重启 DSH 生效
```
装之前先 `undo_snapshot`（配置快照），出问题 `undo_restore mode=undo`。
