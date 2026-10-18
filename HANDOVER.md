# 交接报告 — dsh-theme-endfield-contour-rework

> 生成时间：本次会话结束点。所有结论都标注了证据强度：**FACT** = 文件/工具输出直接得到，
> **INFERENCE** = 由事实推断（需再验证），**UNKNOWN** = 未验证。

---

## 1. 一句话状态

主题插件**已安装并可用**（profile `desktop`，`client.js` sha256 前缀 `7d833e6d`），源码在
`D:\AI Misc\dsh-theme-endfield-contour-rework`，`main` 分支 HEAD = `fa05b97`，工作树干净，
**未推送 origin**。唯一未解决的视觉问题是**背景图的重复接缝**（详见 §6），性能类问题已有
三处实证修复（§5）。

---

## 2. 代码与安装状态（FACT）

| 项 | 值 |
|---|---|
| 源码目录 | `D:\AI Misc\dsh-theme-endfield-contour-rework` |
| 分支 / HEAD | `main` / `fa05b97`（`client.js` sha256 `7d833e6d20a3c9ae…`） |
| 已安装版本 | 与 HEAD 完全一致（`…\.dsh\profiles\desktop\node_modules\dsh-theme-endfield-contour-rework\client.js` sha256 同为 `7d833e6d…`） |
| 安装包 | `C:\Users\ControlxSaria\.dsh\backups\local-build\dsh-theme-endfield-contour-rework-1.5.3-fix14.tgz` |
| 历史安装包 | 同目录 `-fix7 … -fix14`、`-1.5.3.tgz` |
| 版本号 | `package.json` 仍是 **1.5.3**，未升版 |
| 远端 | `origin`（GitHub, HTTPS）落后 12+ 个本地提交，**未推送** |
| 未提交实验 | 分支 `wip/seam-torus`（提交一次，见 §6），与 `main` 无关 |
| 未跟踪文件 | `WORKLOG.md`（代理工作日志，可忽略/删除） |

### 测试状态（FACT）
`npm run test:node` 在 `fa05b97` 上：**433 项 ok，0 失败**（contour 41、perf/A1–A8、3d、hollow、
rendering 系列、settings、loader）。`node check.js` 语法检查通过。

### 回滚方式
- 配置快照：`undo_restore mode=id snapshot_id=20261017-200500-ad54`
- 换回上游：`dsh plugin --profile desktop add github:DoctorxPriestess/dsh-theme-endfield-contour-rework`
- 兼容安全模式：`undo_safe_mode action="on"` 后重启 DSH

---

## 3. 这个项目是什么

上游 [`dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield) 的 MIT fork：给
DSH 桌面端加一条**等高线地形背景**（一张噪声场 → marching squares 提等高线 → 描边成贴图 →
平移播放），外加 Endfield 风格配色与若干 UI 皮肤规则。全部引擎代码在单文件 `client.js`
（约 7.2k 行）。渲染有三条路径：

1. **2D 合成器路径（默认）**：贴图 + 一块「视口 + 512 设备像素」的滚动画布（`contourPaintSurface`），
   每帧只写一次 `transform`。
2. **2D 回落路径**：无 transform 环境或超大视口时，每帧整幅 blit 视口。
3. **3D 视差路径**：一个 WebGL 全屏 shader，按每像素高度反解摄像机、raymarch 求交、footprint AA。

---

## 4. 本次会话完成的改动（按提交，均有测试）

| 提交 | 内容 |
|---|---|
| `e9284cc` | 镂空合成不再往透明像素加色（曾出现发光椭圆环 / 暗斑） |
| `bbf359d` | 帧率：去掉 30fps 限流，运动抽成纯函数并测 60/120/144Hz 同速，3D 加亚像素门 |
| `741d7f0` | 长跑加固：隐藏窗口不绘制、帧预算看门狗（先关 3D 再停动画，**仅本会话**）、3D 步进 14→10、预算按真实设备像素计 |
| `fa05b97` | **性能根因修复**：`<body>` class 变化不再重描整张图并重传整块纹理（见 §5） |
| `364a2a1` | 回滚 fix12 的「清列边框」规则（用户要求） |
| `022e3f0` | （已被上面回滚）列边框规则 |

另有一条更早的取舍已落地（提交在 `e9284cc` 之前）：
- 2D 滚动画布由「视口 + 一个周期」改为「视口 + 512 设备像素」，`1432x753@2x` 下 259MB → 18MB；
  漂移吃掉半个 pad 才补画一次。
- 窗口变大**不再重建地形**（图是视口的 2.5–2.9 倍），只有窗口超过整张图才重建。
- 视图切换共用一个图（不再为 3D 单独重建）。

---

## 5. 性能问题：已实证的根因（FACT + INFERENCE）

### 5.1 已修：body class 触发整图重描 + 整块纹理重传（根因）
`contourSchemeObserver` 监听 `<body>` 的 `class` / `data-ds-dark-theme`，回调**无条件**调用
`contourRepaint()`。描边颜色只由两个布尔决定（深色？雾凇配色？），所以绝大多数 class 变化
颜色没变却付出了：整张图重描（6ms）**且**该 canvas 的 GPU 纹理失效 → 下次合成**重传整块**
（1610×1006@2x 下约 134MB）。应用在流式输出期间不停改 body class，于是重传随会话时长累积。

实测（`scratch/terrain-lab/repaint_probe.js`，统计 `ctx.stroke` 次数）：

| | body class 变化 | 整图重描 |
|---|---|---|
| 修复前 | 13 | **14** |
| 修复后 | 120 | **1** |

修复：签名比较 + 同帧合并；图另加 24M 设备像素硬上限（96MB）。

### 5.2 已加的三道保险（无法证明是根因，但降低风险）
- 隐藏/最小化窗口不绘制（`!docHidden()` + `visibilitychange` 回前台重画）。
- 帧预算看门狗：单帧 >50ms 净计 40 帧 → 先关 3D、再停动画；**只影响本次会话**，不写偏好。
  （早期版本会写偏好，导致「每次启动都被降级」，已修。）
- 3D 变便宜：步进 10、3D 图 ≤6M 设备像素。

### 5.3 未证实的部分（UNKNOWN）
JS/DOM 层**没有泄漏**：真实 Chromium 浸泡 98 秒 / 21,335 帧 / 5 次视图翻转，强制 GC 后
堆在 3–9MB 振荡、DOM 节点 26–30、样式表恒 2、canvas 1–2（`scratch/terrain-lab/soak2.js`）。
若安装后仍「长跑必卡死」，剩余嫌疑是**驱动层**（该机器会话记录出现「Apple Music 导致显卡崩溃」），
以及 3D 全屏 shader 的持续负载。判断方法：卡死时看设置里 3D 是否被看门狗自动关掉、
控制台是否有 `frame watchdog` 日志。

---

## 6. 未解决：画面内的重复接缝（这是当前的阻塞项）

### 6.1 现象（用户报告，FACT）
- 3D 下画面**正中**有一条明显接缝（因为 shader 的 `uv` 原点在屏幕中心，`offset=0` 时接缝落在正中）。
- 2D 缩放到一定窗口尺寸也会看到。
- 用户要求：**画面内不许出现拼接**，「生成时就是一体」。

### 6.2 已量到的关键数据（FACT，来自 `scratch/terrain-lab/field_check.js`）
直接把场生成函数读回来，比较「sheet 左边界 vs 右边界内侧」与「上边界 vs 下边界内侧」：

| 尺寸 | x 方向误差 | y 方向误差 |
|---|---|---|
| 7372×3032 | 3.47% | 9.98% |
| 7628×3088 | 15.41% | 10.15% |
| 1432×753 | 5.35% | 11.74% |
| 2960×1850 | 10.04% | 14.80% |

（单位：占完整高度范围的百分比）

**结论：接缝在「地形本身」，不是绘图缺陷。补画、加宽描边都无法修复。**

另一组（`sheet_edge.js`，读 sheet 像素）：左右边界「一侧有墨另一侧没有」的行占比
66.7%（不补画）/ 62.2%（补画）——补画只能减轻，不能消除，与上面的结论一致。

### 6.3 根因（INFERENCE，已有代码级依据）
- 噪声是**整数格点周期**：`px0 = round(tw / baseCell)`，坐标按 `x/tw*px0` 映射，
  所以只有在 `x = tw` 处噪声坐标正好落在整数格 `px0` 时才严格连续。
- 采样网格是 `cols = ceil(tw/step) + 1`，`step = 10`。当 `tw` 不是 10 的整数倍时，
  最后一个采样点被夹在 `tw` 之前 → 存在**残格**，`x = tw` 处的真实场值与 `x = 0` 不再相等。
  代码里 stage 6 只在 `|(cols-1)*step - tw| < 1e-6` 时才强制把最后一列设为首列，
  这也印证了「只有网格精确闭合才无缝」。
- 同时 `tw` 若不是「噪声格长的整数倍」（`tw / px0` 非整数），两套周期就对不齐。

**需要的修复（下一步）**：让 sheet 尺寸同时满足
1. `tw = px0 * cell`，`cell` 为整数（噪声格点闭合）；
2. `cell` 是 `CONTOUR_STEP` 的整数倍（采样网格闭合，`cols-1 = tw/step`）。

即 `tw` 必须是 `10` 的倍数，且 `tw / px0` 也是 `10` 的倍数。
`scratch/terrain-lab/lattice.js` 可列出满足条件的尺寸（例如 1780–1830 一带在默认 baseCell 下闭合）。

### 6.4 已被否决的路线（不要重复）
| 做法 | 结果 |
|---|---|
| 加宽描边 / 调描边颜色 | 只掩盖 1–2px，接缝仍在 |
| 在另一侧补画延续（wrap pass，已实现于 `wip/seam-torus`） | 把断口从 77.6% 降到 62.2%，**不能消除** |
| 把尺寸量化到 128 的倍数 | 反而制造残格（4352 不是 10 的倍数） |
| 不做环绕（相机来回走） | 结构上不可能有接缝，但运动方向会周期反转（用户未接受，也未否决） |
| 缩短 3D 周期（1.5×） | 会让重复落在画面内，**更糟** |

### 6.5 若要继续：具体入口
- `contourGenerateField`（`client.js` 约 2363 行）：`px0/py0` 与 `cols/rows` 的定义处。
- `contourTargetTexture`（约 3.7k 行）：尺寸规划，当前有一个 `closeSize` 实验版本在
  `wip/seam-torus` 分支上，未在主线上。
- 验证脚本：`field_check.js`（量场误差）、`sheet_edge.js`（量像素接缝）、
  `seam_image.js`（2×2 平铺出图）、`lattice.js`（列出闭合尺寸）。

目标验收：`field_check.js` 在选定尺寸上误差 < 0.01%，`sheet_edge.js` 的不匹配率接近
「内部任意一列」的基线（约 20–25%，那部分是平行于接缝的线，属于正常值）。

---

## 7. 其他已知问题与未决项

| 项 | 状态 |
|---|---|
| 镂空（cave/洞） | 主线 `CONTOUR_HOLLOW_ENABLED = false`。曾出现发光环、暗斑、坑沿硬断层，均已修但仍不理想；`wip/seam-torus` 上还带着「坑的遮罩带放宽」的实验。建议在接缝问题解决前保持关闭。 |
| 3D 图与 2D 图是否共用 | 共用（`three=false` 硬编码在 `contourBuildTexture`），避免切换视图时重建。 |
| 「展开 CoT 后黑色闪烁」 | 曾判断为 WebGL 绘制缓冲，已加 `preserveDrawingBuffer: true`；用户后续澄清是**对话框区域的黑色矩形**，与镂空的加色合成同源，`e9284cc` 已去掉加色。**未再收到用户确认**。 |
| 三次 Q1–Q3 取舍（裁切/共用图/pad=512） | 已按用户答复 A/B/B 落地。 |
| 版本与发布 | 仍 1.5.3、未推送；用户要求「先本地验证」。 |

---

## 8. 关键常量（当前主线）

| 常量 | 值 | 含义 |
|---|---|---|
| `CONTOUR_STEP` | 10 | 采样网格步长（CSS px） |
| `CONTOUR_BASE_CELL` | 370 | 最大噪声格长 |
| `CONTOUR_SURFACE_PAD` | 512 | 2D 滚动画布余量（设备 px） |
| `CONTOUR_SHEET_MAX_DEVICE_PX` | 24e6 | 图面积硬上限（约 96MB） |
| `CONTOUR_MEM_BUDGET` | 150e6 | 贴图+画布总预算 |
| `CONTOUR_WATCH_DT` / `_NET` | 0.05s / 40 | 看门狗阈值 |
| `CONTOUR_3D_STEPS` | 10 | 3D raymarch 步数 |
| `CONTOUR_3D_DEPTH` / `_RISE` / `_REF` | 0.12 / 0.04 / 0.5 | 视差强度 |
| `CONTOUR_HOLLOW_ENABLED` | false | 镂空开关 |

---

## 9. 工具库存（都在 `C:\Users\ControlxSaria\.dsh\scratch\terrain-lab`）

| 脚本 | 用途 |
|---|---|
| `soak2.js <秒>` | 实时浸泡：堆/节点/样式/canvas/帧数，模拟流式 token 与视图翻转 |
| `repaint_probe.js` | 数「整图重描」次数（性能根因验证） |
| `field_check.js` | 量**场本身**在边界处的误差（交接的核心证据） |
| `sheet_edge.js` | 读 sheet 像素，量左右/上下边界不匹配率；`NOWRAP=1` 出对照 |
| `seam_image.js` | 出 2×2 平铺图与接缝放大图（`out/seam-*.png`、`out/strip-*.png`） |
| `lattice.js <w> <h> <dpr>` | 列出能闭合噪声格点 + 网格的尺寸 |
| `shot3d2.js <flat\|parallax> <tag> [WxH] [dpr]` | SwiftShader 出图 |
| `soak.js` | 早期虚拟时间浸泡（rAF 会被饿死，已基本弃用） |

历史产物：`out/seam-compare.png`（左旧右新）、`out/seam-overview.png`（2×2 平铺）、
`out/sheet-edge-wrap.png` / `-nowrap.png`（6× 边界条）。

---

## 10. 接手时建议的第一步

1. `git switch wip/seam-torus` 看实验（或直接从 `field_check.js` 现状开始）。
2. 用 `lattice.js` 选一个 `tw = px0 * cell`（`cell` 为 10 的倍数）的尺寸，
   在 `contourTargetTexture` 里强制产出该尺寸。
3. 用 `field_check.js` 验证误差 < 0.01%（这是「生成时就是一体」的判据）。
4. 误差达标后，`sheet_edge.js` 应回到内部基线；此时**删掉 wrap 补画**（不再需要）。
5. 再谈镂空是否开启。

---

## 11. 诚实清单（不要当已解决）

- **接缝未修好**。主线（已安装的 fix14）仍有接缝；真正的原因已定位到场生成层，但修复未落地。
- **「装了就卡死」只修了一个已实证的根因**（body class → 整图重传），用户是否仍复现未知。
- **CoT 黑矩形**在去掉加色后是否消失，未获用户确认。
- **3D 在真机上的实际帧率与观感**未测（headless 只有 SwiftShader，读不到硬件回读缓冲）。
- 所有「无缝」的说法都必须以 `field_check.js` 的数字为准，不以肉眼为准。
