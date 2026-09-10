#!/usr/bin/env node
/**
 * browser.js — 全仓唯一一处「找浏览器」与「把页面结果取出来」的实现。
 *
 * 为什么值得单独一个模块（两个都是踩过的真实问题）：
 *
 * 1) **发现**：原先每个测试各自内联一份候选路径，只有机器级安装位置
 *    （`C:\Program Files\...`）。可 Chrome 默认就是**按用户**安装到
 *    `%LOCALAPPDATA%`，而 Store 版 Edge 连 `Program Files` 下那个 exe 都只是
 *    启动 stub。于是「换一台 Windows 机器」很容易变成「一个测试都跑不起来，
 *    而且错误信息是空的」。这里把候选、环境变量、PATH 查询集中一处，失败时能
 *    打印出**查过哪些路径**。
 *
 * 2) **传输**：这些测试原先靠 `--dump-dom` 从浏览器 stdout 取结果。实测在装了
 *    Store(AppX) 版 Edge 的 Windows 上这条路彻底不通：`Application\msedge.exe`
 *    只是跳转 stub，启动参数被转发进现有会话，`--version` 都没有输出，stdout 与
 *    `--screenshot=` 文件通道全废（exit 0、空输出）。但同一台机器上
 *    `--remote-debugging-port` 正常：headless 内核确实起来了，只是没人拿得到它的
 *    输出。所以这里**优先走 DevTools 协议**（Node ≥ 22 自带 WebSocket，零依赖），
 *    取 `document.documentElement.outerHTML`，与 `--dump-dom` 语义等价；stdout 保留
 *    为后备，于是 Linux/CI 上原有行为一字不变。
 *
 * 调用点是**同步**的（各测试是 CJS 顶层脚本，没有顶层 await），而 CDP 只能异步驱动。
 * 桥接办法：spawnSync 起一个子 Node 进程（本文件自身的 `--cdp-dump` 模式）去做异步
 * 部分，把 DOM 打到 stdout 上。于是调用点的形状与 `execFileSync` 完全一致：
 *
 *   const dom = dumpDom(chrome, args, 120000)      // 原来是 execFileSync(chrome, args, {...})
 *   screenshot(chrome, args, pngPath, 120000)      // 原来是 args 里的 --screenshot=...
 *
 * 页面结果的约定（沿用各测试既有写法）：结束时把 `document.title` 设成
 * `'LABEL ' + JSON.stringify(results)`。所以「title 变了」就是完成信号——CDP 模式下
 * 按这个信号按真实时间等待，比 `--virtual-time-budget` 更贴近真实，也不受版本差异影响。
 *
 * 环境变量：`CHROME_PATH` / `CHROME_BIN` / `EDGE_PATH` / `PUPPETEER_EXECUTABLE_PATH`
 * 任一指定时优先采用（CI 就是用 CHROME_PATH 指 Ubuntu 上的 google-chrome）。
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const http = require('http')
const { execFileSync, spawn, spawnSync } = require('child_process')

const IS_WIN = process.platform === 'win32'
const HAS_WS = typeof WebSocket === 'function'

/* ------------------------------------------------------------------ *
 * 发现
 * ------------------------------------------------------------------ */

const env = (k) => (process.env[k] && String(process.env[k]).trim()) || ''

function windowsCandidates() {
  const local = env('LOCALAPPDATA') || path.join(os.homedir(), 'AppData', 'Local')
  const pf = env('ProgramFiles') || 'C:\\Program Files'
  const pf86 = env('ProgramFiles(x86)') || 'C:\\Program Files (x86)'
  return [
    // 按用户安装（Chrome 的默认装法；新版 Edge 也会用）
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Chromium', 'Application', 'chrome.exe'),
    path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(local, 'Google', 'Chrome SxS', 'Application', 'chrome.exe'),
    // 机器级安装
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Chromium', 'Application', 'chrome.exe'),
    path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(pf, 'Vivaldi', 'Application', 'vivaldi.exe'),
  ]
}

function posixCandidates() {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
}

/** `where`/`which` 查 PATH：有些机器把浏览器放进 PATH，或装了 portable 版。 */
function pathCandidates() {
  const names = IS_WIN
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe', 'brave.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave']
  const out = []
  for (const n of names) {
    try {
      const r = execFileSync(IS_WIN ? 'where' : 'which', [n], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
      })
      for (const line of String(r).split(/\r?\n/)) { const p = line.trim(); if (p) out.push(p) }
    } catch (e) { /* not on PATH */ }
  }
  return out
}

/** Edge 152 起真实内核可能只在 EdgeCore 下（Store 版布局），版本目录要展开。 */
function edgeCoreCandidates() {
  if (!IS_WIN) return []
  const roots = [
    path.join(env('ProgramFiles(x86)') || 'C:\\Program Files (x86)', 'Microsoft', 'EdgeCore'),
    path.join(env('ProgramFiles') || 'C:\\Program Files', 'Microsoft', 'EdgeCore'),
  ]
  const out = []
  for (const root of roots) {
    let versions = []
    try { versions = fs.readdirSync(root) } catch (e) { continue }
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) // 版本新→旧
    for (const v of versions) out.push(path.join(root, v, 'msedge.exe'))
  }
  return out
}

const explicitCandidates = () => [
  env('CHROME_PATH'), env('CHROME_BIN'), env('EDGE_PATH'), env('PUPPETEER_EXECUTABLE_PATH'),
].filter(Boolean)

function allCandidates() {
  return IS_WIN
    ? [...explicitCandidates(), ...pathCandidates(), ...windowsCandidates(), ...edgeCoreCandidates()]
    : [...explicitCandidates(), ...pathCandidates(), ...posixCandidates()]
}

let cached
/**
 * 返回可用的 Chromium 可执行文件绝对路径，找不到返回 null。
 * 顺序：显式环境变量 → PATH → 按用户/机器级安装（Chrome 排在 Edge 前，因为
 * Store 版 Edge 的启动器可能只是转发 stub）。
 */
function findChrome() {
  if (cached) return cached
  for (const p of allCandidates()) {
    try { if (fs.statSync(p).isFile()) { cached = p; return cached } } catch (e) { /* keep looking */ }
  }
  return null
}

/** 找不到浏览器时的诊断：列出查过的路径，而不是只说一句失败。 */
function describeSearch() {
  const list = allCandidates()
  return [
    'FAIL  no Chrome/Edge found (set CHROME_PATH)',
    '     已检查以下候选：',
    ...['CHROME_PATH', 'CHROME_BIN', 'EDGE_PATH', 'PUPPETEER_EXECUTABLE_PATH'].map((k) => `       ${k}=${process.env[k] || '(未设置)'}`),
    ...list.map((p) => '       ' + p),
    '     可用 CHROME_PATH 显式指定，例如：',
    IS_WIN
      ? '       set CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '       export CHROME_PATH=/usr/bin/google-chrome',
  ].join('\n')
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

const isUrl = (a) => /^(file|http|https|data):/i.test(a)

function parseArgs(args) {
  const o = { url: '', windowSize: '', flags: [], profileDir: '', screenshot: '', dump: false, budget: 0, waitAnimations: false }
  for (const a of args) {
    if (isUrl(a)) { o.url = a; continue }
    if (a === '--dump-dom') { o.dump = true; continue }
    if (a.startsWith('--screenshot=')) { o.screenshot = a.slice('--screenshot='.length); continue }
    if (a.startsWith('--user-data-dir=')) { o.profileDir = a.slice('--user-data-dir='.length); continue }
    if (a.startsWith('--window-size=')) { o.windowSize = a.slice('--window-size='.length); continue }
    // 截图前额外等「有限的 CSS 动画/过渡」结束。**默认关**：有几个测试要的正是动画中途的
    // 那一帧（雷霆大字在 3 秒后自动隐藏，等动画结束就什么都拍不到）。需要的测试显式传它。
    if (a === '--wait-animations') { o.waitAnimations = true; continue }
    // 我们自己会加 --headless=new；调用点里若还留着旧式 `--headless`，两个标志并存会
    // 变成「哪个生效」的版本差异问题。CDP 模式下统一由这里决定，stdout 后备路径仍用
    // 调用点原样的参数（那里需要 --headless）。
    if (a === '--headless' || a.startsWith('--headless=')) continue
    // 虚拟时钟不丢：下面用 CDP 的 Emulation.setVirtualTimePolicy 复现它的语义。
    // 调用点写 `--virtual-time-budget=N` 的意思就是「把定时器快进 N 毫秒再取结果」，
    // 直接透传给浏览器会让它在预算耗尽时自行退出、把 CDP 连接一起带走；而完全不快进
    // 则让几个测试从 4 秒变成 120 秒（实测）。所以记下来，由 CDP 驱动。
    if (a.startsWith('--virtual-time-budget=')) { o.budget = parseInt(a.slice('--virtual-time-budget='.length), 10) || 0; continue }
    o.flags.push(a)
  }
  return o
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(timeoutMs || 3000, () => { req.destroy(); resolve(null) })
  })
}

function httpGetText(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(body))
    })
    req.on('error', () => resolve(''))
    req.setTimeout(timeoutMs || 3000, () => { req.destroy(); resolve('') })
  })
}

/* ------------------------------------------------------------------ *
 * 进程清理（Windows 上 stub 会另起进程，必须按 profile 目录定向清理）
 * ------------------------------------------------------------------ */

function killTree(pid) {
  try {
    if (IS_WIN) execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', timeout: 20000 })
    else process.kill(pid, 'SIGKILL')
  } catch (e) { /* already gone */ }
}

/** 按命令行里的唯一 profile token 清理残留浏览器进程。
 *
 * 为什么需要它：Store(AppX) 版 Edge 的启动器会把请求转交给「真正的浏览器进程」，
 * 那个进程**不是**我们的子进程，`kill(child.pid)` 碰不到它。实测它的命令行里带着
 * 我们的 `--user-data-dir` 与 `--remote-debugging-port`，所以按唯一的 profile 名字
 * 定向匹配是可靠的。
 *
 * 两条护栏，都是踩出来的：
 *   - **必须按镜像名限定**。子进程（我们的 node 桥）自己的命令行里也带着同一个
 *     profile 路径，不限定镜像名就会把「正在写 stdout 的自己」杀掉——症状是子进程
 *     以 -1 退出、stdout 一个字节都没有，看起来像 CDP 起不来。
 *   - 绝不按进程名大范围杀，那会关掉用户正在用的浏览器。
 *   - **token 必须够独特**。匹配是 PowerShell 的 `-like '*token*'`，它对大小写不敏感，
 *     只用 `$_.CommandLine` 做子串判断；像 `profile` 这样的通用词会命中用户自己浏览器
 *     的 `--profile-directory="Profile 1"`，把他们正在用的窗口杀掉。调用方传的是
 *     `mkdtemp` 生成的唯一目录名（`test-XXXXXX` 级别），这里再加一道长度门限：
 *     短于 12 个字符的一律拒绝，宁可漏清理也不误杀。
 *
 * POSIX 上不需要这套：浏览器就是我们的子进程，`killTree` 已经够了。
 */
const BROWSER_IMAGES = ['msedge.exe', 'chrome.exe', 'brave.exe', 'chromium.exe', 'vivaldi.exe']
const MIN_KILL_TOKEN = 8

/**
 * 这个 token 是否独特到可以拿去做子串匹配。
 *
 * 判据不是「够长」而是「看得出是生成出来的」：`mkdtemp` 的名字总是
 * `<前缀>-<6 位随机>` 或 `<前缀><6 位随机>`，因此必然含有分隔符或数字；而危险的
 * 通用词（`profile`、`chrome`、`userdata`）是纯字母。纯字母 + 短于 8 位一律拒绝，
 * 宁可漏清理也不误杀。
 */
function isUniqueToken(token) {
  const t = String(token || '')
  if (t.length < MIN_KILL_TOKEN) return false
  return /[-_0-9]/.test(t) && !/^[A-Za-z]+$/.test(t)
}

function killByProfile(token) {
  if (!token || !IS_WIN) return
  if (!isUniqueToken(token)) {
    process.stderr.write('[browser.js] refusing to clean up with the generic token ' + JSON.stringify(String(token))
      + ': a case-insensitive substring match could kill the user\'s own browser\n')
    return
  }
  try {
    const names = BROWSER_IMAGES.map((n) => `Name='${n}'`).join(' or ')
    const ps = `Get-CimInstance Win32_Process -Filter "${names}"` +
      ` | Where-Object { $_.CommandLine -like '*${token}*' }` +
      ' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 30000 })
  } catch (e) { /* best effort */ }
}

/**
 * 优雅关闭：连到**浏览器级** CDP 端点发 `Browser.close`。
 * 这是唯一能可靠结束「不是我们子进程」的那个浏览器的办法（实测能把进程清到 0）。
 */
function closeBrowser(port, versionJson) {
  return new Promise((resolve) => {
    let wsUrl = ''
    try { wsUrl = JSON.parse(versionJson).webSocketDebuggerUrl } catch (e) { resolve(false); return }
    if (!wsUrl) { resolve(false); return }
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    let ws
    try { ws = new WebSocket(wsUrl) } catch (e) { finish(false); return }
    const t = setTimeout(() => { try { ws.close() } catch (e) { /* ignore */ } finish(false) }, 6000)
    ws.addEventListener('open', () => { try { ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })) } catch (e) { finish(false) } })
    ws.addEventListener('close', () => { clearTimeout(t); finish(true) })
    ws.addEventListener('error', () => { clearTimeout(t); finish(true) })
  })
}

/* ------------------------------------------------------------------ *
 * CDP
 * ------------------------------------------------------------------ */

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map() }

  /** 订阅一个 CDP 事件（`Emulation.virtualTimeBudgetExpired` 之类）。 */
  on(method, cb) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(cb)
  }

  static async connect(wsUrl, timeoutMs) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP websocket connect timeout')), timeoutMs || 15000)
      ws.addEventListener('open', () => { clearTimeout(t); resolve() }, { once: true })
      ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('CDP websocket error')) }, { once: true })
    })
    const cdp = new Cdp(ws)
    ws.addEventListener('message', (ev) => {
      let msg
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) } catch (e) { return }
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        else resolve(msg.result)
      } else if (msg.method && cdp.handlers.has(msg.method)) {
        for (const cb of cdp.handlers.get(msg.method)) { try { cb(msg.params) } catch (e) { /* ignore */ } }
      }
    })
    return cdp
  }

  send(method, params, timeoutMs) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try { this.ws.send(JSON.stringify({ id, method, params: params || {} })) }
      catch (e) { this.pending.delete(id); reject(e); return }
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)) }
      }, timeoutMs || 60000)
    })
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
    if (r && r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.text || 'unknown'))
    return r && r.result ? r.result.value : undefined
  }

  /** 求值一个返回 Promise 的表达式（rAF 之类的「等一帧」）。 */
  async evalAsync(expression, timeoutMs) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs || 15000)
    if (r && r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.text || 'unknown'))
    return r && r.result ? r.result.value : undefined
  }

  close() { try { this.ws.close() } catch (e) { /* ignore */ } }
}

/** 启动 headless + CDP，等到页面报告完成（title 变化），回调拿到一个已连上的会话。 */
async function withPage(exe, o, timeoutMs, fn) {
  const port = await freePort()
  const token = o.profileDir ? path.basename(o.profileDir) : 'endfield-' + Date.now().toString(36) + '-' + port
  const profile = o.profileDir || path.join(os.tmpdir(), token)
  if (!o.profileDir) fs.mkdirSync(profile, { recursive: true })
  const flags = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    ...o.flags,
    ...(o.windowSize ? ['--window-size=' + o.windowSize] : []),
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    o.url,
  ]
  // 总超时在开头一次性算好，**两段等待共享它**。这很重要：父进程是 spawnSync，
  // 它的 timeout 到点会直接杀掉子进程，那样 finally 里的清理就来不及跑，残留的浏览器
  // 会让下一次启动被「转发」而连锁失败（实测踩过）。所以子进程必须总能自己按时结束。
  const until = Date.now() + (timeoutMs || 60000)
  const child = spawn(exe, flags, { stdio: 'ignore', windowsHide: true })
  let cdp = null
  let version = ''
  try {
    let target = null
    const targetDeadline = Math.min(until, Date.now() + 20000)
    while (!target && Date.now() < targetDeadline) {
      version = await httpGetText('http://127.0.0.1:' + port + '/json/version', 2000)
      const list = await httpGetJson('http://127.0.0.1:' + port + '/json/list', 2000)
      if (Array.isArray(list)) target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (!target) await sleep(200)
    }
    if (!target) {
      throw new Error(
        'CDP target not available after ' + Math.round((20000) / 1000) + 's: the browser never exposed a debug port. ' +
        'On Windows this usually means the launch was HANDED OFF to an already running browser session ' +
        '(the Store/AppX Edge launcher forwards arguments and silently ignores --user-data-dir and ' +
        '--remote-debugging-port), or the binary found is a launcher stub rather than a real browser. ' +
        'Close the running browser, or point CHROME_PATH at a real Chrome/Chromium build.',
      )
    }
    cdp = await Cdp.connect(target.webSocketDebuggerUrl, 15000)
    /* 就绪判定必须**同时**看 readyState 与真实 URL。
       只等 readyState==='complete' 会误判：连上调试端口时浏览器常常还停在初始
       about:blank（那已经是 complete），随后跳到 file:// 页面会销毁执行上下文，于是紧接着
       的求值撞上 "page threw: Uncaught"，整个测试报「页面没有报告结果」——实测偶发、
       看起来像页面坏了，其实是挂载竞态。 */
    let ready = false
    const wantUrl = o.url || ''
    while (!ready && Date.now() < until) {
      try {
        const state = await cdp.eval('JSON.stringify({ r: document.readyState, h: String(location.href) })')
        const parsed = state ? JSON.parse(state) : null
        if (parsed && parsed.r === 'complete' && parsed.h && parsed.h !== 'about:blank') {
          // file:// 页面在 URL 上可能带查询/编码差异，因此只比较去掉协议的路径部分。
          const strip = (u) => String(u).replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/')
          ready = !wantUrl || strip(parsed.h) === strip(wantUrl)
        }
      } catch (e) { /* 上下文可能正在销毁：重试 */ }
      if (!ready) await sleep(100)
    }

    /* 虚拟时钟：调用点写 `--virtual-time-budget=N` 的意图是「把 N 毫秒的定时器快进掉
       再取结果」。原生标志会连 CDP 连接一起带走（浏览器在预算耗尽时自行退出），所以改由
       CDP 驱动：load 之后设置策略，等 `virtualTimeBudgetExpired` 或 title 变化，谁先到
       算谁。不快进也不影响正确性，只是几个测试会从 4 秒变成 120 秒（实测）。 */
    let budgetExpired = false
    if (o.budget > 0) {
      cdp.on('Emulation.virtualTimeBudgetExpired', () => { budgetExpired = true })
      try {
        await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: o.budget })
      } catch (e) {
        process.stderr.write('[browser.js] virtual time unavailable (' + e.message + '); waiting in real time\n')
      }
    }

    const initial = await cdp.eval('String(document.title)')
    let title = initial
    while (title === initial && !budgetExpired && Date.now() < until) {
      await sleep(100)
      try { title = await cdp.eval('String(document.title)') } catch (e) { break }
    }
    return await fn(cdp)
  } finally {
    if (cdp) cdp.close()
    // 先优雅关闭（能结束那个不是我们子进程的真身），再定向清理，最后兜底杀子树。
    await closeBrowser(port, version)
    killByProfile(token)
    killTree(child.pid)
    if (!o.profileDir) { try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) { /* ignore */ } }
  }
}

/**
 * 恢复虚拟时钟时推进多少毫秒。
 *
 * **必须小**：这只是为了「让合成器产出一帧」，而不是「让页面继续演进」。测试用
 * `--virtual-time-budget=N` 把页面停在某个**精确时刻**再截图，额外推进就等于把那个时刻往
 * 后挪。实测把它设成 3000ms 时，`thunder-shot` 立刻全灭——它的 budget 是 1400ms，要停在
 * 雷霆大字的 3 秒保持窗口内，+3000ms 直接跨过自动隐藏，拍出四张空页面（该测试的文件头
 * 恰好记着同一个坑：祖先代码用 4000ms 预算时也拍到过空页面）。
 * 100ms 足够两次 rAF（虚拟时间下约 16ms 一帧），又远小于各测试依赖的时间边界。
 */
const CLOCK_NUDGE_MS = 100

/**
 * 截图前把虚拟时钟从「暂停」恢复到「推进」。
 *
 * 为什么必须做：预算耗尽后虚拟时钟停住，**渲染器不再产帧**，`Page.captureScreenshot`
 * 于是等一个永远不会到来的新帧直到超时（实测 60 秒），随后回退到 `--screenshot=`，而回退
 * 路径在装了 Store 版 Edge 的机器上截出的是未绘制的错误帧——于是像素断言给出荒谬结论
 * （「画在弹层之上」、17.3:1 对比度），而同一份代码下一轮又全部通过。
 */
async function resumeVirtualClock(cdp) {
  try {
    const expired = new Promise((resolve) => { cdp.on('Emulation.virtualTimeBudgetExpired', () => resolve(true)) })
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: CLOCK_NUDGE_MS }, 10000)
    await Promise.race([expired, sleep(1500)])
  } catch (e) { /* 恢复不了也不致命：下面还有重试与后备路径 */ }
}

/** 取一张 PNG（base64 -> Buffer），失败时先恢复时钟再重试一次。 */
async function capturePng(cdp, attempts) {
  const total = attempts || 2
  let last = null
  for (let i = 1; i <= total; i++) {
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 15000)
      if (shot && shot.data) return Buffer.from(shot.data, 'base64')
      last = new Error('Page.captureScreenshot returned no data')
    } catch (e) {
      last = e
      if (i < total) {
        process.stderr.write('[browser.js] screenshot attempt ' + i + ' failed (' + e.message + '); resuming virtual time and retrying\n')
        await resumeVirtualClock(cdp)
        await sleep(200)
      }
    }
  }
  throw last || new Error('screenshot failed')
}

/** 子进程模式：CDP 取 DOM，打到 stdout（父进程 spawnSync 同步读取）。 */
async function childDump(exe, args, timeoutMs) {
  const o = parseArgs(args)
  const html = await withPage(exe, o, timeoutMs, (cdp) => cdp.eval('document.documentElement.outerHTML'))
  process.stdout.write(typeof html === 'string' ? '<!DOCTYPE html>\n' + html : '')
}

/**
 * 等页面真的产出过绘制帧；可选地再等**有限的** CSS 动画/过渡结束。
 *
 * 两个真实症状，都由这里兜住：
 *   1) 虚拟时钟快进时定时器瞬间跑完，但合成器未必已经产出对应帧 —— 截图会拿到绘制之前的
 *      状态。实测症状是两张本该不同的截图完全相同（断言随之得出「水印只有 0 px 变化」）。
 *   2) 弹层之类的元素有入场动画（translate/opacity）。在动画中途截图，它的**像素**位置与
 *      DOM 报告的位置不一致（实测同一页面出现过 y=244 与 y=315 两种），于是「弹层外框的
 *      圆角处」露出后面的水印，被零容忍的「框内不得有任何像素变化」断言判成失败。
 *
 * 第 2 项**必须由调用点显式开启**（`--wait-animations`）：有些测试要的正是动画中途那一帧，
 * 全局等动画结束会把它们拍糊——实测把 `thunder-shot` 拍成「大字根本没出现」，因为大字的
 * 自动隐藏在 3 秒，等动画结束就跨过了那个时刻。另外只等有限动画：`iterations: Infinity`
 * 的动画永远不会 finished，等它会把每次截图都拖到超时。
 */
async function waitForPaint(cdp, waitAnimations) {
  const animPart = waitAnimations
    ? ' try {'
      + '  const anims = (document.getAnimations ? document.getAnimations() : []).filter((a) => {'
      + '   try { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;'
      + '    if (!t) return false; if (t.iterations === Infinity) return false;'
      + '    return (t.duration || 0) <= 3000 } catch (e) { return false } });'
      + '  if (anims.length) await Promise.all(anims.map((a) => a.finished.catch(() => {})));'
      + ' } catch (e) {}'
    : ''
  const expr = '(async () => {' + animPart
    + ' await new Promise((resolve) => { let n = 0; const step = () => { if (++n >= 2) resolve(1); else requestAnimationFrame(step) }; requestAnimationFrame(step) });'
    + ' return 1 })()'
  try {
    await cdp.evalAsync(expr, 8000)
  } catch (e) {
    // 页面不可达/帧不来都不致命：下面还有重试与后备路径。
    await sleep(200)
  }
}

/** 子进程模式：CDP 截图写文件。 */
async function childShot(exe, args, file, timeoutMs) {
  const o = parseArgs(args)
  await withPage(exe, o, timeoutMs, async (cdp) => {
    await cdp.send('Page.enable')
    // 快进过虚拟时间的页面，时钟已经停住（渲染器不产帧，截图会挂到超时）；先让它推进
    // 一小段（见 CLOCK_NUDGE_MS：只够产帧，不能挪动测试依赖的时刻），等真实绘制帧出现，
    // 然后才截图。
    if (o.budget > 0) await resumeVirtualClock(cdp)
    await waitForPaint(cdp, o.waitAnimations)
    const png = await capturePng(cdp, 2)
    fs.writeFileSync(file, png)
  })
}

/* ------------------------------------------------------------------ *
 * 同步桥（spawnSync 一个子 Node 跑上面的异步部分）
 * ------------------------------------------------------------------ */

function runChild(mode, exe, args, timeoutMs, extra) {
  const res = spawnSync(process.execPath, [__filename, mode, '--exe=' + exe, '--timeout=' + (timeoutMs || 120000), ...(extra || []), '--', ...args], {
    encoding: 'utf8', timeout: (timeoutMs || 120000) + 60000, maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  })
  return res
}

/**
 * 夹具自检：页面侧 settings 夹具（test/fixtures/settings-scope.browser.js）遇到
 * 「未声明字段」会在 DOM 里留下 data-endfield-scope-error 标记。这里把它升级为
 * 明确失败——否则该页面测试只是在量 schema 默认值，还看着像通过。
 */
function assertNoFixtureErrors(html) {
  if (typeof html !== 'string' || html.indexOf('data-endfield-scope-error') < 0) return html
  const seen = new Set()
  const re = /data-endfield-scope-error="([^"]*)"/g
  let hit
  while ((hit = re.exec(html)) !== null) seen.add(hit[1])
  if (!seen.size) {
    // The marker string can legitimately appear as SOURCE (the fixture snippet is
    // inlined into the page's inline <script>) without any element carrying it.
    // Only a real marker element means a page seeded an undeclared field.
    if (!/<[a-zA-Z][^>]*\sdata-endfield-scope-error\s*=/.test(html)) return html
  }
  const ctx = /[\s\S]{0,120}data-endfield-scope-error[\s\S]{0,160}/.exec(html)
  throw new Error('test page seeded an undeclared settings field: ' + JSON.stringify(Array.from(seen).join(', '))
    + ' — the real settings service serves declared fields only, so the page silently measured a schema default instead.'
    + '\n  context: ' + (ctx ? ctx[0].replace(/\s+/g, ' ').slice(0, 260) : '(none)'))
}

/** 同步睡眠（Node 允许主线程 Atomics.wait；退化时用短自旋兜底）。 */
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch (e) {
    const end = Date.now() + ms
    while (Date.now() < end) { /* fallback only */ }
  }
}

/**
 * 本次运行唯一的标识，用于定向清理：**只用 profile 目录名**。
 *
 * 端口号也是唯一的，但它只有 5 位数字，作为子串去匹配浏览器命令行时既可能撞上
 * 用户自己开的调试端口，也可能撞上命令行里的其它数字，风险大于收益；而每个
 * headless 调用都由测试自己传 `--user-data-dir=<mkdtemp>`，profile 名足够独特。
 * 因此没有 profile 目录时不清理（与旧行为一致），而不是退化成按端口匹配。
 */
function runTokens(args) {
  const out = []
  for (const a of args) {
    const s = String(a)
    if (s.startsWith('--user-data-dir=')) out.push(path.basename(s.slice('--user-data-dir='.length)))
  }
  return out.filter((t) => isUniqueToken(t))
}

/**
 * stdout 后备路径的收尾。
 *
 * 这条路径把浏览器当作「跑完就退出」的一次性进程——在正常安装上确实如此，所以
 * 原先没有清理。但在 Store(AppX) 版 Edge 这类机器上，`Application\msedge.exe` 只是
 * 启动器：它把请求转交给真正的实例后自己退出，于是**每张截图都会在后台留下一个完整
 * 实例**（实测一次 thunder-shot = 11 个进程）。这些实例会一直占用内存，并让后续
 * 启动互相干扰——表现为整套测试偶发「page produced no results」。
 *
 * 按本次运行唯一的 profile 名 / 调试端口定向清理，且只匹配浏览器镜像名
 * （绝不能按进程名大范围杀，那会关掉用户自己的浏览器）。
 */
function cleanupAfterStdoutRun(args) {
  if (!IS_WIN) return
  for (const token of runTokens(args)) killByProfile(token)
}

/** 等截图文件落盘（转交出去的真身是异步写的），最多等 timeoutMs。 */
function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = -1
  while (Date.now() < deadline) {
    let size = -1
    try { size = fs.statSync(file).size } catch (e) { size = -1 }
    if (size > 8 && size === last) return true
    last = size
    sleepSync(120)
  }
  return false
}

/**
 * 跑一个 headless 页面并返回 DOM 字符串（等价于 `--dump-dom` 的 stdout）。
 * 优先 CDP；CDP 不可用或起不来时退回 stdout，因此 Linux/CI 行为不变。
 */
function dumpDom(exe, args, timeoutMs) {
  const bin = exe || findChrome()
  if (!bin) throw new Error(describeSearch())
  if (HAS_WS) {
    const r = runChild('--cdp-dump', bin, args, timeoutMs)
    if (r.status === 0 && r.stdout) return assertNoFixtureErrors(String(r.stdout))
    const why = r.error ? r.error.message : ('exit ' + r.status + ' ' + String(r.stderr || '').trim().slice(0, 200))
    process.stderr.write('[browser.js] CDP dump unavailable (' + why + '); falling back to --dump-dom\n')
  }
  const text = stdoutRun(bin, args, timeoutMs)
  cleanupAfterStdoutRun(args)
  return assertNoFixtureErrors(text)
}

/** CDP 截图；失败时退回浏览器自带的 `--screenshot=`。 */
function screenshot(exe, args, file, timeoutMs) {
  const bin = exe || findChrome()
  if (!bin) throw new Error(describeSearch())
  const base = args.filter((a) => !String(a).startsWith('--screenshot='))
  if (HAS_WS) {
    // 两次尝试：一次失败常见于启动/渲染时序，重开一次通常就好；此后才用浏览器自带的
    // 后备路径——而那条路径在装了 Store 版 Edge 的机器上可能截出未绘制的错误帧
    // （实测让像素断言得出「画在弹层之上」这种荒谬结论），所以值得先重试 CDP。
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = runChild('--cdp-shot', bin, base, timeoutMs, ['--file=' + file])
      if (r.status === 0 && fs.existsSync(file) && fs.statSync(file).size > 8) return file
      const why = r.error ? r.error.message : ('exit ' + r.status + ' ' + String(r.stderr || '').trim().slice(0, 200))
      if (attempt === 1) {
        process.stderr.write('[browser.js] CDP screenshot failed (' + why + '); retrying once\n')
        try { fs.rmSync(file, { force: true }) } catch (e) { /* ignore */ }
        continue
      }
      process.stderr.write('[browser.js] CDP screenshot unavailable (' + why + '); falling back to --screenshot=\n')
    }
  }
  const full = base.concat(['--screenshot=' + file])
  stdoutRun(bin, full, timeoutMs)
  // 文件是转交出去的真身异步写的：先等它落盘，再清理，否则既可能截断也可能漏进程。
  waitForFile(file, 5000)
  cleanupAfterStdoutRun(full)
  return file
}

/**
 * 关掉一个我们自己启动的 headless 实例，按可靠度从高到低依次尝试：
 *   1) 浏览器级 CDP `Browser.close`——唯一能结束「不是我们子进程」的那个真身的办法
 *      （Store 版 Edge 的启动器会把请求转交出去，spawn 返回的 pid 其实只是 stub，
 *      对它 kill 什么也不会发生：实测留下一个完整的九进程实例）；
 *   2) 按唯一 profile token 定向清理；
 *   3) 杀子树。
 * 给自带 CDP 管线的脚本（hover-check.js）复用。
 */
async function shutdownBrowser(port, profileDir) {
  let version = ''
  if (port) version = await httpGetText('http://127.0.0.1:' + port + '/json/version', 2000)
  await closeBrowser(port, version)
  if (profileDir) killByProfile(path.basename(profileDir))
}

/* ------------------------------------------------------------------ *
 * execFileSync 兼容壳
 * ------------------------------------------------------------------ */

const REAL = require('child_process').execFileSync

/**
 * 与 `child_process.execFileSync` 同形的薄壳：**只拦两种 headless 取结果的用法**
 * （`--dump-dom` 与 `--screenshot=`），把它们改走 CDP；其余调用（解 PNG、跑
 * PowerShell 之类）原样转交。于是各测试的调用点一个字都不用改，只是 require 的来源
 * 从 `child_process` 换成这里——这是在 14 个测试里铺开 CDP 传输的最小改动面。
 *
 * 用文件名后缀判断「这是不是一个浏览器」而不是 path.basename：Windows 路径在 POSIX 上
 * 不会被当作路径切分，basename 于是匹配不上。
 */
const BROWSER_IMAGE = /(chrome|msedge|chromium|brave|vivaldi)(\.exe)?["']?\s*$/i

function execFileSyncShim(file, args, opts) {
  if (typeof file === 'string' && BROWSER_IMAGE.test(file) && Array.isArray(args)) {
    const timeoutMs = (opts && opts.timeout) || 120000
    const shot = args.find((a) => typeof a === 'string' && a.startsWith('--screenshot='))
    if (shot) return screenshot(file, args, shot.slice('--screenshot='.length), timeoutMs)
    if (args.includes('--dump-dom')) return dumpDom(file, args, timeoutMs)
  }
  return REAL(file, args, opts)
}

function stdoutRun(exe, args, timeoutMs) {
  try {
    const out = execFileSync(exe, args, {
      encoding: 'utf8', timeout: timeoutMs || 120000, stdio: ['ignore', 'pipe', 'ignore'],
    })
    return String(out)
  } catch (e) {
    // 某些构建在 dump-dom 之后返回非零，但 stdout 里仍有内容——沿用既有容忍度。
    if (e && typeof e.stdout === 'string' && e.stdout.length) return e.stdout
    throw e
  }
}

/* ------------------------------------------------------------------ *
 * 子进程入口
 * ------------------------------------------------------------------ */

if (require.main === module && /^--cdp-(dump|shot)$/.test(process.argv[2] || '')) {
  const mode = process.argv[2]
  const rest = process.argv.slice(3)
  const sep = rest.indexOf('--')
  const opts = rest.slice(0, sep < 0 ? rest.length : sep)
  const args = sep < 0 ? [] : rest.slice(sep + 1)
  const get = (k) => { const hit = opts.find((a) => a.startsWith(k + '=')); return hit ? hit.slice(k.length + 1) : '' }
  const exe = get('--exe') || findChrome()
  const timeoutMs = parseInt(get('--timeout'), 10) || 120000
  if (!exe) { process.stderr.write(describeSearch() + '\n'); process.exit(3) }
  const job = mode === '--cdp-dump' ? childDump(exe, args, timeoutMs) : childShot(exe, args, get('--file'), timeoutMs)
  job.then(() => process.exit(0)).catch((e) => {
    process.stderr.write('CDP ' + mode + ' failed: ' + (e && e.message ? e.message : String(e)) + '\n')
    process.exit(4)
  })
} else {
  module.exports = {
    findChrome,
    describeSearch,
    dumpDom,
    screenshot,
    parseArgs,
    assertNoFixtureErrors,
    isUniqueToken,
    execFileSync: execFileSyncShim,
    shutdownBrowser,
    HAS_WS,
    IS_WIN,
  }
}
