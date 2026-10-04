/**
 * settings-scope-020.test.js — preferences must survive a restart on the
 * 0.2.0-rc2 build (the "settings fall back to defaults" regression).
 *
 * 0.2.0-rc2 removed `settings.register()`: `@deepseek-ai/dsh-settings` now
 * derives each served namespace from the plugin entry's exported Config schema
 * and NAMES it after the profile ENTRY id ('theme-endfield-contour-rework',
 * from cordis.patch.yml) — never the package name. The 1.5.0 client bound only
 * the package-name namespace, so the mirror answered 'unavailable' forever, the
 * durable-write gate held every edit session-local, and each restart fell back
 * to the shipped defaults (while the host still kept the user's old values in
 * cordis.patch.yml — they were simply unreachable).
 *
 * The fix binds BOTH identities and adopts whichever scope the mirror reports
 * 'ready'. This harness simulates the 0.2.0 mirror exactly: the entry-id
 * namespace starts 'loading' and turns 'ready' later (the real mirror settles
 * asynchronously), the legacy package-name namespace answers 'unavailable'
 * while CARRYING a poisoned section the client must NOT read.
 *
 * Usage: node test/settings-scope-020.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { findChrome, execFileSync } = require(path.join(__dirname, 'lib', 'browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-scope-020-'))

const MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-alias-bg-layer-1:#f2f2ec;
        --dsw-alias-bg-layer-2:#dcddd6;--dsw-alias-label-secondary:#4a4c48;
        --dsw-font-family:Arial,sans-serif;--dsh-scrollbar-width:8px}
  body{margin:0;font-family:Arial,sans-serif}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:260px 1fr;grid-template-rows:100%;display:grid;
    position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}
  .pI_x6G_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);flex-direction:column;
    min-width:0;height:100%;display:flex}
  .wSkVaW_viewArea{flex:1 1 auto;padding:40px 60px;position:relative}
  .wSkVaW_composerSeat{z-index:7;background:linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
    var(--dsw-alias-bg-base) 36px);position:sticky;bottom:0;padding:20px 60px 28px}
</style></head><body><div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_sidebarCol"><div style="padding:14px">sidebar</div></div>
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root">
      <div class="wSkVaW_viewArea">
        <p class="msg" id="probe">Legibility probe paragraph sitting above the contour layer.</p>
      </div>
      <div class="wSkVaW_composerSeat"><div style="height:52px;border:1px solid var(--dsw-alias-border-l2)"></div></div>
    </div></div>
  </div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
/* 0.2.0-rc2 mirror simulation.
   - bind({namespace}) records every bind attempt.
   - The ENTRY-id namespace ('theme-endfield-contour-rework') starts 'loading'
     and turns 'ready' 400ms later with the seeded section (the real mirror
     settles after the first describe round-trip).
   - The legacy package-name namespace stays 'unavailable' forever AND would
     carry a poisoned enabled:'0' section if the client wrongly read it.
   - set() on the ready scope records [ns, field, value] like the real
     ConfigFormController write path. */
window.__BINDS__=[]; window.__SETS__=[]
const ENTRY_NS='theme-endfield-contour-rework'
const LEGACY_NS='dsh-theme-endfield-contour-rework'
function scope020(ns, kind, section, delay){
  let status = kind==='ready-delayed' ? 'loading' : 'unavailable'
  const listeners=[]
  const snap=()=>({ status, writable:true, mode:'host',
    value: status==='ready' ? Object.assign({},section) : undefined })
  if(kind==='ready-delayed') setTimeout(()=>{ status='ready'; listeners.forEach(l=>l()) }, delay)
  return { getSnapshot:snap,
    subscribe:(l)=>{ listeners.push(l); return ()=>{ const i=listeners.indexOf(l); if(i>=0)listeners.splice(i,1) } },
    set:(field,value)=>{ window.__SETS__.push([ns,field,String(value)]); return Promise.resolve() } }
}
const SEED={ enabled:'1', radius:'round', contour:'1', 'contour-anim':'1',
  palette:'valley', watermark:'1', loader:'0', thunder:'0' }
window.__prefs={ binder:{
  bind:({namespace})=>{
    window.__BINDS__.push(namespace)
    if(namespace===ENTRY_NS) return scope020(namespace,'ready-delayed',SEED,400)
    return scope020(namespace,'unavailable',{enabled:'0'})
  } } }
const mod=window.__MOD__.factory(()=>null)
const ctx={
  get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:(n==='settingsScope'?window.__prefs.binder:undefined),
  effect:(f)=>{window.__dispose__=f()},
}
window.__apply__=()=>mod.apply(ctx)
window.__run__=async()=>{
  const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
  window.__RESULTS__=[]
  window.__apply__()
  await sleep(120)
  /* While the mirror is still 'loading' the theme must run on defaults
     (enabled '1', square radius) instead of dying or reading the poisoned
     unavailable section. */
  R('boot (mirror loading): theme installs on defaults',
    window.__dshThemeEndfieldApplied===true
      && !document.body.classList.contains('theme-endfield-round'),
    'applied='+String(window.__dshThemeEndfieldApplied)+
    ' round='+String(document.body.classList.contains('theme-endfield-round')))
  R('boot: layer not yet mounted (contour unserved)', !document.querySelector('[data-endfield-contour]'))
  /* The client must have bound BOTH identities... */
  R('bound both candidate namespaces',
    window.__BINDS__.includes('theme-endfield-contour-rework')
      && window.__BINDS__.includes('dsh-theme-endfield-contour-rework'),
    JSON.stringify(window.__BINDS__))
  /* ...and after the entry-id namespace turns 'ready', adopt its section:
     radius round + contour on, and NOT the poisoned enabled:'0'. */
  await sleep(600)
  R('after ready: entry-id section adopted (radius round)',
    document.body.classList.contains('theme-endfield-round'),
    String(document.body.className))
  const wrap=document.querySelector('[data-endfield-contour]')
  R('after ready: contour section adopted (layer mounted)', !!wrap)
  R('poisoned unavailable legacy section NOT read',
    window.__dshThemeEndfieldApplied===true && !!wrap,
    'theme would be disabled if the unavailable section were adopted')
  if(typeof window.__dispose__==='function') window.__dispose__()
  await sleep(150)
  R('teardown: layer removed', document.querySelectorAll('[data-endfield-contour]').length===0)
  document.title='DONE '+JSON.stringify(window.__RESULTS__)
  return window.__RESULTS__
}
</script></body></html>`

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)')
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  const page = path.join(OUT, 'mock-scope-020.html')
  fs.writeFileSync(page, MOCK + '<script>window.addEventListener("load",()=>{window.__run__()})</' + 'script>')
  fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope020-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=15000', '--window-size=1000,700',
    '--user-data-dir=' + tmp, '--dump-dom', 'file:///' + page.replace(/\\\\/g, '/'),
  ]
  let dom = ''
  try {
    dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    console.error('FAIL  browser run failed: ' + e.message)
    process.exit(1)
  }
  const m = dom.match(/<title>DONE (\[.*?\])<\/title>/s)
  if (!m) {
    console.error('FAIL  page did not report results (assertions never completed).')
    const t = dom.match(/<title>(.*?)<\/title>/s)
    if (t) console.error('      title was: ' + t[1].slice(0, 300))
    process.exit(1)
  }
  let results
  try { results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) }
  catch (e) { console.error('FAIL  could not parse results: ' + e.message); process.exit(1) }

  let bad = 0
  for (const r of results) {
    if (r.pass) console.log('ok    ' + r.name + (r.detail ? '  (' + r.detail + ')' : ''))
    else { console.error('FAIL  ' + r.name + (r.detail ? '  -> ' + r.detail : '')); bad++ }
  }
  console.log('')
  if (bad) { console.error(bad + ' settings-scope 0.2.0 check(s) failed'); process.exit(1) }
  console.log('all ' + results.length + ' settings-scope 0.2.0 checks passed')
}

main()
