/**
 * contour-render-020.test.js — the contour sheet must stay visible on the
 * 0.2.0-rc2 build of the app shell.
 *
 * 1.4.x anchored the "clear the opaque backgrounds" rules on css-module HASHES
 * of the 0.1.x build ('wSkVaW_root', 'ydkMvW_root'). 0.2.0-rc2 rehashed every
 * module (conversation root is now 'Dc7zOa_root', the columns are
 * 'BynINW_centerCol'/'BynINW_rightbarCol' and the centre column itself paints
 * bg-base), so the clearance rules matched NOTHING and the sheet — although
 * mounted — sat behind three opaque fills: the user saw no contour background
 * at all. This harness runs the REAL client.js against a fixture with the
 * 0.2.0-rc2 class names (read out of the installed @deepseek-ai bundles) and
 * asserts on computed styles + measured canvas pixels.
 *
 * Usage: node test/contour-render-020.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { findChrome, execFileSync } = require(path.join(__dirname, 'lib', 'browser.js'))
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-render-020-'))

/* 0.2.0-rc2 shape, values from the installed bundles: frame + centre column +
   right column + conversation root ALL paint an opaque var(--dsw-alias-bg-base). */
const MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-font-family:Arial,sans-serif}
  .BynINW_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:260px 1fr 320px;grid-template-rows:100%;display:grid;
    position:relative;overflow:hidden}
  .BynINW_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}
  .BynINW_centerCol{background:var(--dsw-alias-bg-base);
    flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .BynINW_rightbarCol{background:var(--dsw-alias-bg-base);
    border-left:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}
  .Dc7zOa_root{background:var(--dsw-alias-bg-base);flex-direction:column;
    min-width:0;height:100%;display:flex;position:relative}
  .Dc7zOa_viewArea{flex:1 1 auto;padding:40px 60px;position:relative}
  .Dc7zOa_composerSeat{z-index:7;background:linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
    var(--dsw-alias-bg-base) 36px);position:sticky;bottom:0;padding:20px 60px 28px}
  .msg{font-size:15px;line-height:1.7;max-width:640px;color:var(--dsw-alias-label-primary)}
</style></head><body><div id="root">
  <div class="BynINW_frame">
    <div class="BynINW_sidebarCol"><div style="padding:14px">sidebar</div></div>
    <div class="BynINW_centerCol"><div class="Dc7zOa_root">
      <div class="Dc7zOa_viewArea">
        <p class="msg" id="probe">Legibility probe paragraph sitting above the contour layer.</p>
      </div>
      <div class="Dc7zOa_composerSeat"><div style="height:52px;border:1px solid var(--dsw-alias-border-l2)"></div></div>
    </div></div>
    <div class="BynINW_rightbarCol"><div style="padding:14px">details</div></div>
  </div>
</div>
<script>
window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}
</script>
<script src="./client.js"></script>
<script>
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs=__endfieldSettingsScope({ enabled:'1', loader:'0' })
const mod=window.__MOD__.factory(()=>null)
const ctx={
  get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:(n==='settingsScope'?__prefs.binder:undefined),
  effect:(f)=>{window.__dispose__=f()},
}
window.__apply__=()=>mod.apply(ctx)
window.__run__=async()=>{
  const LS=__prefs
  const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
  window.__RESULTS__=[]
  LS.setItem('dsh-theme-endfield-contour-rework-enabled','1')
  LS.setItem('dsh-theme-endfield-contour-rework-contour','1')
  window.__apply__()
  document.body.appendChild(document.createElement('span'))
  await sleep(500)
  const frame=document.querySelector('.BynINW_frame')
  const conv=document.querySelector('.Dc7zOa_root')
  const wrap=document.querySelector('[data-endfield-contour]')
  R('layer mounted', !!wrap)
  R('mounted INSIDE app frame', !!wrap && wrap.parentElement===frame,
    wrap?String(wrap.parentElement.className):'none')
  const lines=document.querySelector('[data-endfield-contour-lines]')
  R('line canvas painted', !!lines && (()=>{ const d=lines.getContext('2d').getImageData(0,0,lines.width,lines.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>6) n++; return n>3000 })(), lines?lines.width+'x'+lines.height:'none')
  /* THE regression: every opaque fill above the sheet must be cleared. */
  const bg=(el)=>getComputedStyle(el).backgroundColor
  R('frame bg cleared', bg(frame)==='rgba(0, 0, 0, 0)', bg(frame))
  R('0.2.0 centre column bg cleared', bg(document.querySelector('.BynINW_centerCol'))==='rgba(0, 0, 0, 0)', bg(document.querySelector('.BynINW_centerCol')))
  R('0.2.0 right column bg cleared', bg(document.querySelector('.BynINW_rightbarCol'))==='rgba(0, 0, 0, 0)', bg(document.querySelector('.BynINW_rightbarCol')))
  R('0.2.0 conversation root bg cleared', bg(conv)==='rgba(0, 0, 0, 0)', bg(conv))
  R('sidebar bg cleared', bg(document.querySelector('.BynINW_sidebarCol'))==='rgba(0, 0, 0, 0)', bg(document.querySelector('.BynINW_sidebarCol')))
  const probeEl=document.getElementById('probe')
  const r=probeEl.getBoundingClientRect()
  const hit=document.elementFromPoint(r.left+8, r.top+r.height/2)
  R('text is hit-testable above layer', hit===probeEl, hit?hit.tagName+'.'+hit.className:'null')
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
  const page = path.join(OUT, 'mock-app-020.html')
  fs.writeFileSync(page, MOCK + '<script>window.addEventListener("load",()=>{window.__run__()})</' + 'script>')
  fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contour020-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=15000', '--window-size=1400,900',
    '--user-data-dir=' + tmp, '--dump-dom', 'file:///' + page.replace(/\\/g, '/'),
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
  if (bad) { console.error(bad + ' contour 0.2.0 check(s) failed'); process.exit(1) }
  console.log('all ' + results.length + ' contour 0.2.0 checks passed')
}

main()
