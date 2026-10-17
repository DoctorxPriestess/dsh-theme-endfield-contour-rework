/**
 * verify-contour.js — prove the SHIPPED contour code actually renders.
 *
 * check.js proves client.js parses; that is not evidence the feature works. This
 * harness executes the REAL client.js in a headless browser against a mock of the
 * app's actual DOM and CSS (class-module names and the opaque bg-base fills taken
 * from the installed @deepseek-ai bundles), then asserts on measured pixels:
 *
 *   1. with the feature OFF nothing is created and no app style is altered;
 *   2. with it ON the canvases mount inside the app frame, the layer paints
 *      yellow-ish pixels, and the app's opaque backgrounds no longer hide it;
 *   3. body text ON TOP of the layer keeps its exact colour (the sheet must sit
 *      behind content, never wash it out);
 *   4. animation actually changes pixels over time, and stops when switched off;
 *   5. animation actually changes pixels, and stops when switched off;
 *   6. teardown removes every node.
 *
 * Usage: node verify-contour.js            (writes shots + exits non-zero on fail)
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

// This script lives in test/; the package it verifies is its parent.
const ROOT = path.resolve(__dirname, '..')
// Scratch page + the copy of client.js the page loads go to a temp directory, so
// running the tests never leaves artifacts inside the package.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-render-'))

// Browser discovery + result transport live in one shared module now: this file used to
// carry its own Windows-only candidate list, and every test fetched the page with
// --dump-dom through the browser's stdout (which a Store/AppX Edge launcher silently
// swallows). See test/lib/browser.js.
const { findChrome, describeSearch } = require(path.join(__dirname, 'lib', 'browser.js'))

/* The mock reproduces the parts of the real app that decide whether the layer is
   visible at all, with values read out of the installed bundles:
     .pI_x6G_frame     position:relative; OPAQUE background bg-base; no stacking ctx
     .pI_x6G_sidebarCol / _centerCol   grid children
     .wSkVaW_root      OPAQUE background bg-base   <- hid the layer before
     .wSkVaW_composerSeat  gradient scrim to bg-base
   If the theme's transparency rules regress, the pixel assertions below fail. */
const MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-alias-bg-layer-1:#f2f2ec;
        --dsw-alias-bg-layer-2:#dcddd6;--dsw-alias-label-secondary:#4a4c48;
        --dsw-font-family:Arial,sans-serif;--dsh-scrollbar-width:8px}
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
  .msg{font-size:15px;line-height:1.7;max-width:640px;color:var(--dsw-alias-label-primary)}
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
<script>
/* Minimal stand-ins for what the client half consumes. The theme calls
   theme.overrideTokens() and ctx.get('slots'); neither needs to be real for the
   contour layer, but they must not throw. */
window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}
</script>
<script src="./client.js"></script>
<script>
const mod=window.__MOD__.factory(()=>null)
/* The theme reads its switches through the dsh settingsScope seam, not
   localStorage. This page seeds a fake binder (theme on, contour starts OFF,
   loader off — exactly what the old localStorage lines expressed) and exposes it
   as window.__LS__ so the probe block below can flip switches via setItem() like
   the settings row does. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs=__endfieldSettingsScope({ enabled:'1', loader:'0' })
window.__LS__=__prefs
const ctx={
  get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:(n==='settingsScope'?__prefs.binder:undefined),
  effect:(f)=>{window.__dispose__=f()},
}
window.__apply__=()=>mod.apply(ctx)
</script>
</body></html>`

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)')
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  const page = path.join(OUT, 'mock-app.html')
  fs.writeFileSync(page, MOCK)
  // client.js must sit beside the mock so <script src="./client.js"> resolves.
  fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

  const script = `
    const CDP = require('${path.join(ROOT, 'node_modules').replace(/\\/g, '\\\\')}');
  `
  // Drive the browser over the DevTools protocol with no external dependency:
  // a tiny WebSocket client is more code than this task needs, so instead the
  // assertions are executed IN the page and reported through the page title,
  // which --dump-dom can retrieve. Simpler and dependency-free.
  const probe = `
  <script>
  window.__RESULTS__=[]
  const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
  const px=(cv)=>{ // count yellow-ish pixels + mean luminance of a canvas
    const c=cv.getContext('2d'); const d=c.getImageData(0,0,cv.width,cv.height).data
    let n=0,lum=0,tot=0
    for(let i=0;i<d.length;i+=4){
      const a=d[i+3]; if(a>6){ n++; }
      lum+=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])*(a/255); tot++
    }
    return {opaque:n,mean:lum/tot}
  }
  window.__run__=async()=>{
    const LS=window.__LS__
    // ---------- 1. feature OFF ----------
    LS.setItem('dsh-theme-endfield-contour-rework-enabled','1')
    LS.removeItem('dsh-theme-endfield-contour-rework-contour')
    LS.setItem('dsh-theme-endfield-contour-rework-loader','0')
    window.__apply__()
    await sleep(120)
    R('off: no contour node', document.querySelectorAll('[data-endfield-contour]').length===0)
    const frame=document.querySelector('.pI_x6G_frame')
    const conv=document.querySelector('.wSkVaW_root')
    const fbgOff=getComputedStyle(frame).backgroundColor
    const cbgOff=getComputedStyle(conv).backgroundColor
    R('off: frame keeps opaque bg', fbgOff==='rgb(232, 232, 226)', fbgOff)
    R('off: conversation keeps opaque bg', cbgOff==='rgb(232, 232, 226)', cbgOff)

    // ---------- 2. switch ON via the same storage the settings row writes ----------
    LS.setItem('dsh-theme-endfield-contour-rework-contour','1')
    LS.setItem('dsh-theme-endfield-contour-rework-contour-anim','1')
    // trigger the page observer the same way the app's own rendering would
    document.body.appendChild(document.createElement('span'))
    await sleep(400)
    const wrap=document.querySelector('[data-endfield-contour]')
    R('on: layer mounted', !!wrap)
    R('on: mounted INSIDE app frame', !!wrap && wrap.parentElement===frame,
      wrap?wrap.parentElement.className:'none')
    const lines=document.querySelector('[data-endfield-contour-lines]')
    R('on: line canvas exists', !!lines)
    // Exactly one canvas: the dot layer was removed, so a second one would be a leak.
    R('on: exactly one canvas', wrap && wrap.querySelectorAll('canvas').length===1,
      wrap?String(wrap.querySelectorAll('canvas').length):'none')
    R('on: canvas sized', !!lines && lines.width>200 && lines.height>200,
      lines?lines.width+'x'+lines.height:'none')
    /* The backing store must cover the whole frame at device resolution. It may be
       LARGER than the viewport: the sheet is painted once into a surface one period
       over, and the compositor slides it (client.js contourPaintSurface). */
    R('on: canvas covers the frame', !!lines && lines.width>=Math.round(innerWidth*devicePixelRatio)-2
      && lines.height>=Math.round(innerHeight*devicePixelRatio)-2,
      lines?lines.width+'x'+lines.height+' vs frame '+Math.round(innerWidth*devicePixelRatio)+'x'+Math.round(innerHeight*devicePixelRatio):'none')
    const fbgOn=getComputedStyle(frame).backgroundColor
    const cbgOn=getComputedStyle(conv).backgroundColor
    R('on: frame bg cleared', fbgOn==='rgba(0, 0, 0, 0)', fbgOn)
    R('on: conversation bg cleared (was hiding layer)', cbgOn==='rgba(0, 0, 0, 0)', cbgOn)
    const sb=document.querySelector('.pI_x6G_sidebarCol')
    R('on: sidebar bg cleared', getComputedStyle(sb).backgroundColor==='rgba(0, 0, 0, 0)')
    // z-order / hit-testing: the layer must never eat clicks
    R('on: layer ignores pointer events', getComputedStyle(wrap).pointerEvents==='none')
    const st=px(lines)
    R('on: contour actually painted', st.opaque>3000, 'opaquePx='+st.opaque)

    // ---------- 3. text legibility (layer is BEHIND content) ----------
    const probeEl=document.getElementById('probe')
    const col=getComputedStyle(probeEl).color
    R('text colour untouched', col==='rgb(16, 17, 16)', col)
    // the probe paragraph must be the top element at its own centre point
    const r=probeEl.getBoundingClientRect()
    const hit=document.elementFromPoint(r.left+8, r.top+r.height/2)
    R('text is hit-testable above layer', hit===probeEl, hit?hit.tagName+'.'+hit.className:'null')

    // ---------- 4. the sheet MOVES, and freezes when the animation is off -----
    /* Motion is no longer a repaint. The sheet is painted once and the compositor
       slides it (contourPaintSurface/contourBlit in client.js), so the canvas
       PIXELS are static BY DESIGN while the layer travels -- that is the
       optimisation this test is here to keep honest. So the observable is the
       layer's own geometry: the used transform plus the bounding rect. Reading
       the used transform (not style.transform) proves the browser really moved
       the layer rather than that some string was assigned.
       A cheap pixel hash is kept in the probe: if the size plan ever falls back to
       the per-frame blit (a viewport too large to budget a surface for), motion
       shows up as pixels instead, and this still passes. */
    const geom=()=>{
      const r=lines.getBoundingClientRect()
      return Math.round(r.left*100)+'|'+Math.round(r.top*100)+'|'+getComputedStyle(lines).transform
    }
    const hash=()=>{
      const d=lines.getContext('2d').getImageData(0,0,lines.width,lines.height).data
      let h=0; for(let i=3;i<d.length;i+=4096) h=(h*31+d[i])|0
      return h
    }
    const probe=()=>geom()+'#'+hash()
    /* Wait for the sheet to advance rather than for a fixed wall-clock window.
       Measured reason: this assertion was flaky at 2 failures in 6 runs, always
       with no change at all, because the page sleeps on wall-clock timers while
       the browser runs under --virtual-time-budget: the frame pass is throttled to
       24fps and gated on rAF, and headless delivers rAF callbacks irregularly, so a
       700 ms sleep sometimes spans ZERO callbacks. Polling for the first real move
       removes the race without weakening the assertion: it still fails if the
       animation genuinely does not run, it just fails after the budget. */
    const advance=async()=>{
      const before=probe()
      for(let i=0;i<40;i++){
        await sleep(120)
        const now=probe()
        if(now!==before) return now
      }
      return before
    }
    const a1=probe()
    const a2=await advance()
    R('anim on: sheet advances', a2!==a1, a1+' -> '+a2)
    /* The other half of the optimisation: the canvas must NOT be repainted while
       it animates. A non-zero pixel change here means frames went back to
       clearRect+drawImage, i.e. the per-frame upload came back. */
    const p1=hash(); await sleep(400); const p2=hash()
    R('anim on: canvas not repainted per frame', p1===p2, 'hash '+p1+' -> '+p2)
    LS.setItem('dsh-theme-endfield-contour-rework-contour-anim','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(500)
    const b1=probe(); await sleep(600); const b2=probe()
    R('anim off: sheet frozen', b1===b2, b1+' vs '+b2)
    // Static pattern must still be on screen after the animation is switched off.
    R('anim off: pattern still painted', px(lines).opaque>3000, 'opaquePx='+px(lines).opaque)

    // ---------- 5. animation back on keeps moving ----------
    LS.setItem('dsh-theme-endfield-contour-rework-contour-anim','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(300)
    const e1=probe()
    const e2=await advance()
    R('anim re-enabled: sheet advances again', e2!==e1, e1+' -> '+e2)

    // ---------- 6. dark scheme restroke ----------
    document.body.setAttribute('data-ds-dark-theme','')
    await sleep(250)
    R('dark: still painted', px(lines).opaque>3000)
    document.body.removeAttribute('data-ds-dark-theme')

    // ---------- 7. the 3D parallax view ----------
    /* Two branches, because the hardware rule is half the feature. This harness is
       headless Chrome on SwiftShader, which the shipped rule REJECTS, so:
         - with window.__CONTOUR_FORCE_GL__ the shader path is exercised for real
           (context, compile, link, program bound, draw calls running);
         - without it, selecting 视差 must leave NO gl layer and keep the flat sheet
           on screen -- that is the documented fallback, tested rather than assumed.
       The projection's arithmetic is pinned separately in contour-3d.test.js: this
       harness cannot read back a WebGL back buffer, so pixel claims about the shader
       would be fake evidence here. */
    window.__CONTOUR_FORCE_GL__ = true
    LS.setItem('dsh-theme-endfield-contour-rework-contour-view','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(700)
    const wrapBox=wrap.getBoundingClientRect()
    /* A view change alone is not a repaint, so the layer reconciliation draws that
       one frame itself (see contourReconcileView); the harness reports the result
       without pausing the movement first. */
    const glCv=document.querySelector('[data-endfield-contour-gl]')
    R('3d (forced): gl layer mounted', !!glCv, glCv?glCv.tagName:'none')
    const glBox=glCv?glCv.getBoundingClientRect():null
    R('3d (forced): gl layer covers the frame',
      !!glBox && Math.abs(glBox.width-wrapBox.width)<2 && Math.abs(glBox.height-wrapBox.height)<2,
      glBox?JSON.stringify({w:glBox.width,h:glBox.height,frame:wrapBox.width+'x'+wrapBox.height}):'none')
    const glCtx=glCv?glCv.getContext('webgl'):null
    const glProg=glCtx?glCtx.getParameter(glCtx.CURRENT_PROGRAM):null
    R('3d (forced): shader program is live (compile+link+draw ran)', !!glProg, glProg?'program bound':'no program')
    R('3d (forced): no webgl error', !!glCtx && glCtx.getError()===0, glCtx?String(glCtx.getError()):'no context')
    R('3d (forced): exactly one gl layer', document.querySelectorAll('[data-endfield-contour-gl]').length===1,
      String(document.querySelectorAll('[data-endfield-contour-gl]').length))
    /* The flat layer sits directly UNDER the gl layer, so whatever it still holds
       leaks through every pixel the shader leaves empty: two sets of lines at once
       (the straight sheet plus the displaced one). It must be released, not just
       covered -- and that also hands back the scroll surface's memory. */
    const flatCv=document.querySelector('[data-endfield-contour-lines]')
    R('3d (forced): the flat layer is released (1px backing store, no ink)',
      !!flatCv && flatCv.width===1 && flatCv.height===1 && px(flatCv).opaque===0,
      flatCv?('size='+flatCv.width+'x'+flatCv.height+' opaquePx='+px(flatCv).opaque):'no canvas')

    /* Why there is no pixel assertion on the GL canvas here: the context is created
       without preserveDrawingBuffer (keeping it would cost a full copy per frame),
       so readPixels is only valid inside the frame that drew it -- and this harness
       runs on a virtual clock that delivers rAF a handful of times per run
       (measured: 9 callbacks), so a readback in "the same frame as the engine" is
       not something a test here can rely on. The shader's arithmetic is pinned in
       contour-3d.test.js instead, and what a real GPU paints is the user's to see;
       claiming pixel evidence from this harness would be inventing it. */


    /* Now the honest devices: no force flag, and a fresh mount so the sticky
       "already checked" cache from the forced run does not carry over. */
    delete window.__CONTOUR_FORCE_GL__
    LS.setItem('dsh-theme-endfield-contour-rework-contour','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(300)
    LS.setItem('dsh-theme-endfield-contour-rework-contour','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(500)
    LS.setItem('dsh-theme-endfield-contour-rework-contour-view','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(600)
    const linesFb=document.querySelector('[data-endfield-contour-lines]')
    R('3d without hardware acceleration: gl layer refused',
      document.querySelectorAll('[data-endfield-contour-gl]').length===0,
      String(document.querySelectorAll('[data-endfield-contour-gl]').length)+' gl canvas')
    R('3d without hardware acceleration: flat sheet still painted',
      !!linesFb && px(linesFb).opaque>3000, linesFb?('opaquePx='+px(linesFb).opaque):'no canvas')

    /* A refusal must NOT be permanent. Live report: 3D worked on the first run and
       then never engaged again -- because the hardware verdict was cached forever and
       the first probe of a session lands while the GPU process is still warming up.
       Regression below: keep the layer mounted, flip hardware on, and ask for 3D
       again by TOGGLING THE VIEW only (no remount, no restart). */
    window.__CONTOUR_FORCE_GL__ = true
    LS.setItem('dsh-theme-endfield-contour-rework-contour-view','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(250)
    R('recovery: toggling to flat leaves no gl layer',
      document.querySelectorAll('[data-endfield-contour-gl]').length===0,
      String(document.querySelectorAll('[data-endfield-contour-gl]').length)+' gl canvas')
    LS.setItem('dsh-theme-endfield-contour-rework-contour-view','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(600)
    const glBack=document.querySelector('[data-endfield-contour-gl]')
    R('recovery: 3d engages again after a view toggle (no restart)',
      !!glBack, glBack?glBack.tagName:'none')
    delete window.__CONTOUR_FORCE_GL__

    /* And back to flat: the fallback path is symmetric -- and it does not need a
       repaint to happen on its own: dropping the layer is part of the same view
       reconciliation. */
    LS.setItem('dsh-theme-endfield-contour-rework-contour-view','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(600)
    const linesFlat=document.querySelector('[data-endfield-contour-lines]')
    R('back to flat: no gl layer', document.querySelectorAll('[data-endfield-contour-gl]').length===0)
    R('back to flat: sheet painted', !!linesFlat && px(linesFlat).opaque>3000,
      linesFlat?('opaquePx='+px(linesFlat).opaque):'no canvas')
    /* ...and the size it was shrunk from must come back, or the restored sheet
       would be drawn into a 1px canvas. */
    R('back to flat: flat layer regains the viewport size',
      !!linesFlat && linesFlat.width>1000 && linesFlat.height>500,
      linesFlat?(linesFlat.width+'x'+linesFlat.height):'no canvas')

    // ---------- 8. window resize / maximise must not rebuild per event ----------
    /* The live report was "switching or maximising the window freezes for several
       seconds". Two things made that: the scroll surface was reallocated and
       refilled on EVERY resize event (48M device px at this size), and the rebuild
       timer was armed on the first event, so the full regenerate ran while the
       window was still moving. This asserts the shape of the fix, not a stopwatch
       (the harness runs on a virtual clock): during a burst of resizes the surface is
       NOT repainted and the movement pauses; after the debounce the sheet is painted
       and moving again. The layer can be remounted during the burst, so every probe
       here re-queries the live canvas. */
    {
      const live=()=>document.querySelector('[data-endfield-contour-lines]')
      const liveProbe=()=>{
        const c=live()
        if(!c) return 'none'
        const r=c.getBoundingClientRect()
        const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data
        let h=0; for(let i=3;i<d.length;i+=4096) h=(h*31+d[i])|0
        return Math.round(r.left*100)+'|'+Math.round(r.top*100)+'|'+getComputedStyle(c).transform+'#'+h
      }
      /* One resize first, so the pause has engaged before the measured window --
         otherwise the frame that was already scheduled still moves the sheet and the
         comparison measures the wrong thing. */
      {
        const r=frame.getBoundingClientRect()
        frame.style.width=Math.round(r.width+40)+'px'
        await sleep(100)
      }
      const dragA=liveProbe()
      const sizeA=(()=>{const c=live(); return c?c.width+'x'+c.height:'none'})()
      for (let i=0;i<3;i++) {
        const r=frame.getBoundingClientRect()
        frame.style.width=Math.round(r.width+40)+'px'
        await sleep(70)
      }
      const dragB=liveProbe()
      /* The surface is dropped during a drag, so what must NOT happen is a
         viewport+period canvas (16M device px here) being allocated and filled on
         every event. Compare against the viewport, not against the previous size:
         dropping to the viewport-sized fallback is the fix. */
      const cNow=live()
      const fr=frame.getBoundingClientRect()
      const dprNow=window.devicePixelRatio||1
      const sizeB=(()=>{const c=live(); return c?c.width+'x'+c.height:'none'})()
      /* Two things must hold: the canvas never grows during the burst (a surface
         re-allocation per resize event is the freeze), and it stays inside the
         affordability cap that now gates the whole scroll plan. */
      /* The surface is viewport+pad now (CONTOUR_SURFACE_PAD, 160 device px), never
         viewport+period. A drag may legitimately repaint it once when the debounce
         fires, so the invariant to assert is the SIZE, not "unchanged": the old
         freeze was a period-sized canvas (16M+ device px here) reallocated per event. */
      const padOk=(()=>{
        const c=live()
        if(!c) return false
        const fr=frame.getBoundingClientRect()
        const dpr=window.devicePixelRatio||1
        /* CONTOUR_SURFACE_PAD is 512 device px (it used to be 160): the surface is the
           viewport plus that, never plus a whole period. */
        return c.width<=Math.round(fr.width*dpr)+560 && c.height<=Math.round(fr.height*dpr)+560
      })()
      R('resize drag: the surface stays viewport-sized (never viewport+period)', padOk, sizeA+' -> '+sizeB)
      const capPx=24e6
      R('resize drag: the canvas stays inside the surface cap',
        !!cNow && cNow.width*cNow.height<=capPx,
        cNow?(cNow.width+'x'+cNow.height+' = '+Math.round(cNow.width*cNow.height/1e6)+'M device px'):'no canvas')
      /* Compare the TRANSFORM only: a per-event blit legitimately repaints pixels,
         the pause is about the movement stopping. */
      const tf=()=>{const c=live(); return c?getComputedStyle(c).transform:'none'}
      /* Sampled WITH events still arriving: once the debounce has fired the sheet is
         allowed to move again (and one repaint restarts the transform at zero), so a
         pause measured after the drag proves nothing. */
      const dragOnce=async()=>{
        const r=frame.getBoundingClientRect()
        frame.style.width=Math.round(r.width+20)+'px'
      }
      await dragOnce()
      const tA=tf()
      await sleep(60)
      const tB=tf()
      await dragOnce()
      await sleep(60)
      const tC=tf()
      R('resize drag: movement pauses while the window moves', tA===tB && tB===tC, tA+' / '+tB+' / '+tC)
      await sleep(900)
      /* After the debounce the visible canvas must cover the enlarged frame again
         (a surface it can afford, or the viewport-sized fallback): during the drag it
         was allowed to lag. */
      const cEnd=live()
      const frEnd=frame.getBoundingClientRect()
      const dprEnd=window.devicePixelRatio||1
      R('resize done: the sheet covers the enlarged viewport',
        !!cEnd && cEnd.width>=Math.round(frEnd.width*dprEnd)-2 && cEnd.height>=Math.round(frEnd.height*dprEnd)-2,
        cEnd?(cEnd.width+'x'+cEnd.height+' for '+Math.round(frEnd.width*dprEnd)+'x'+Math.round(frEnd.height*dprEnd)):'no canvas')
      R('resize done: sheet still painted',
        (()=>{const c=live(); return !!c && px(c).opaque>3000})(),
        (()=>{const c=live(); return c?('opaquePx='+px(c).opaque):'no canvas'})())
    }

    // ---------- 9. teardown ----------
    if(typeof window.__dispose__==='function') window.__dispose__()
    await sleep(150)
    R('teardown: layer removed', document.querySelectorAll('[data-endfield-contour]').length===0)
    document.title='DONE '+JSON.stringify(window.__RESULTS__)
    return window.__RESULTS__
  }
  </script>`

  fs.writeFileSync(page, MOCK.replace('</body>', probe + '<script>window.addEventListener("load",()=>{window.__run__()})</' + 'script></body>'))

  const { execFileSync } = require(path.join(__dirname, 'lib', 'browser.js'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    // Budget covers the poll loop added in step 5 (up to ~4.8 s of sleeps) with
    // room to spare; too small a budget shows up as "page did not report results".
    '--virtual-time-budget=20000',
    '--window-size=1400,900',
    '--user-data-dir=' + tmp,
    '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ]
  let dom = ''
  try {
    dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
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
  if (bad) { console.error(bad + ' contour check(s) failed'); process.exit(1) }
  console.log('all ' + results.length + ' contour checks passed')
}

main()
