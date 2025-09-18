/* ========= PlayWorld Splash (single-file bundle) =========
   Usage:
     <script src="scripts/splash.bundle.js"></script>
     Splash.play({
       manifestUrl: './gallery-manifest.json',
       // or images: [ ... ],
       title: 'PLAYWORLD',
       tag: 'PowerUp',
       onDone: () => {}   // called when sequence finishes (or after Skip)
     });
     Splash.status('Priming data…');   // update message
     Splash.showSkip(true);            // show Skip when auth complete
========================================================== */

(function () {
  const DEFAULTS = {
    manifestUrl: './gallery-manifest.json',
    images: null,
    shots: 22,
    holdMs: 300, xfadeMs: 150,
    tiltDeg: 10,
    kenScale: 1.08, panX: '10px', panY: '8px',
    wordmarkDelayMs: 40,
    arriveFrac: 0.9,
    finalHoldMs: 900,
    title: 'PLAYWORLD',
    tag: 'PowerUp',
    onDone: null
  };

  const api = {
    play: (opts) => start(Object.assign({}, DEFAULTS, opts || {})),
    status: (text) => setStatus(text),
    showSkip: (on) => setSkip(on),
    end: () => endSequence(true),
    destroy: () => destroy()
  };
  window.Splash = api;

  let els = {};
  let timers = [];
  let doneCb = null;
  function clearTimers() { timers.forEach(t => clearTimeout(t)); timers.length = 0; }

  /* ---------- DOM + CSS (injected once) ---------- */
  function ensureDom() {
    if (document.getElementById('pw-splash-root')) return;

    const css = `
:root{
  --accent: var(--accent, #00ffc6);
  --dashboard-bg: var(--bg, var(--dashboard-bg, #0e1415));
}
#pw-splash-root{position:fixed;inset:0;z-index:9999;background:#000;display:none;opacity:1;transition:opacity .42s ease-in;overflow:hidden}
#pw-splash-root.fade-out{opacity:0;pointer-events:none}
.pw-montage{position:absolute;inset:0;overflow:hidden;isolation:isolate}
.pw-shot{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transform:scale(1) translate3d(0,0,0);will-change:opacity,transform}
@keyframes pw-shotLife{
  0%{opacity:0;transform:scale(1) rotate(0deg) translate3d(0,0,0)}
  12%{opacity:1}
  82%{opacity:1;transform:scale(var(--pw-ken)) rotate(var(--pw-tilt)) translate3d(var(--pw-panx),var(--pw-pany),0)}
  100%{opacity:0;transform:scale(var(--pw-ken)) rotate(var(--pw-tilt)) translate3d(var(--pw-panx),var(--pw-pany),0)}
}
.pw-lens{position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(120% 120% at 50% 50%, rgba(255,0,0,.22), rgba(255,0,0,.42)),
    linear-gradient(to bottom, rgba(180,0,0,.38), rgba(80,0,0,.30));
  mix-blend-mode:multiply;filter:saturate(1.75) contrast(1.5);opacity:.9}
.pw-vignette{pointer-events:none;position:absolute;inset:0;
  background:
    radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,.6) 100%),
    linear-gradient(to top, rgba(0,0,0,.22), rgba(0,0,0,0) 30% 70%, rgba(0,0,0,.3));
  mix-blend-mode:multiply}
.pw-lock{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.pw-wrap{opacity:0}
@keyframes pw-titleArrive{
  0%{transform:scale(2.2);opacity:0}
  30%{opacity:.45}
  70%{opacity:.85}
  100%{transform:scale(1.06);opacity:1}
}
.pw-title{font-family:Impact,Haettenschweiler,"Arial Narrow Bold","Bebas Neue",sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.06em;font-size:clamp(42px,12vw,160px);color:#fff;text-shadow:0 4px 12px rgba(0,0,0,.35)}
.pw-tag{margin-top:.7rem;font-family:"Segoe UI",Arial,sans-serif;letter-spacing:.35em;font-weight:700;font-size:clamp(11px,1.2vw,14px);color:#fff;opacity:.95;position:relative;padding-top:.6rem;text-transform:uppercase}
.pw-tag::before{content:"";position:absolute;left:50%;transform:translateX(-50%);top:0;width:8.5ch;height:2px;background:#fff;opacity:.6;border-radius:2px}
.pw-final{position:absolute;inset:0;display:grid;place-items:center;background:var(--dashboard-bg);opacity:0;transition:opacity .42s ease-in}
.pw-final.show{opacity:1}
.pw-skip{position:absolute;right:16px;bottom:16px;z-index:3;background:rgba(0,0,0,.45);color:#fff;padding:.55rem .8rem;border-radius:999px;border:1px solid rgba(255,255,255,.25);font:500 .9rem/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer;display:none}
.pw-skip:hover{background:rgba(0,0,0,.65)}
.pw-status{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:2;color:#cfe7e4;font:600 12px/1.4 Inter,system-ui,Segoe UI,Arial,sans-serif;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.18);padding:8px 12px;border-radius:10px;min-width:220px;text-align:center;letter-spacing:.02em;box-shadow:0 8px 22px rgba(0,0,0,.35)}
@keyframes pw-montageFadeOut{0%{opacity:1}85%{opacity:1}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){.pw-shot,.pw-wrap{animation:none !important}}
`;
    const style = document.createElement('style');
    style.id = 'pw-splash-style';
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'pw-splash-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="pw-montage" id="pw-montage"></div>
      <div class="pw-lens" aria-hidden="true"></div>
      <div class="pw-vignette" aria-hidden="true"></div>

      <div class="pw-lock" aria-hidden="true">
        <div class="pw-wrap">
          <div class="pw-title" id="pw-title"></div>
          <div class="pw-tag" id="pw-tag"></div>
        </div>
      </div>

      <div class="pw-final" id="pw-final" aria-hidden="true"></div>
      <div class="pw-status" id="pw-status" aria-live="polite"></div>
      <button class="pw-skip" id="pw-skip" type="button" aria-label="Skip Intro">Skip Intro</button>
    `;
    document.body.appendChild(root);

    els.root  = root;
    els.mont  = root.querySelector('#pw-montage');
    els.lens  = root.querySelector('.pw-lens');
    els.wrap  = root.querySelector('.pw-wrap');
    els.title = root.querySelector('#pw-title');
    els.tag   = root.querySelector('#pw-tag');
    els.final = root.querySelector('#pw-final');
    els.status= root.querySelector('#pw-status');
    els.skip  = root.querySelector('#pw-skip');
    els.skip.addEventListener('click', () => endSequence(true), { passive: true });
  }

  /* ---------- Fetch + normalize manifest ---------- */
  async function fetchUrls(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const arr = await r.json();
      return (Array.isArray(arr) ? arr : [])
        .filter(u => typeof u === 'string' && u.startsWith('http'))
        .map(u => u
          .replace(/-\d+x\d+(?=\.\w+$)/i, '')            // -1024x768
          .replace(/-(scaled|min)(-\d+)?(?=\.\w+$)/i, '')// -scaled / -min
        )
        .filter(u => /\.(jpe?g|webp)$/i.test(u));
    } catch { return []; }
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- Helpers exposed to outer world ---------- */
  function setStatus(text) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.style.display = text ? 'block' : 'none';
  }
  function setSkip(on) {
    if (!els.skip) return;
    els.skip.style.display = on ? 'inline-block' : 'none';
  }

  /* ---------- Core sequence ---------- */
  async function start(opts) {
    ensureDom();
    doneCb = typeof opts.onDone === 'function' ? opts.onDone : null;

    let urls = Array.isArray(opts.images) && opts.images.length
      ? opts.images.slice()
      : await fetchUrls(opts.manifestUrl);
    if (!urls.length) return;

    if (urls.length > opts.shots) urls = shuffle(urls).slice(0, opts.shots);

    els.root.style.display = 'block';
    document.documentElement.style.overflow = 'hidden';

    els.title.textContent = opts.title;
    els.tag.textContent   = opts.tag;
    setStatus('Starting…');
    setSkip(false);

    els.mont.innerHTML = '';
    const step = opts.holdMs + opts.xfadeMs;
    urls.forEach((src, i) => {
      const d = document.createElement('div');
      d.className = 'pw-shot';
      d.style.backgroundImage = `url("${src}")`;
      d.style.setProperty('--pw-ken', opts.kenScale);
      d.style.setProperty('--pw-panx', opts.panX);
      d.style.setProperty('--pw-pany', opts.panY);
      d.style.setProperty('--pw-tilt', opts.tiltDeg + 'deg');
      d.style.animation = `pw-shotLife ${step + 220}ms ${i * step}ms both ease-in-out`;
      els.mont.appendChild(d);
    });

    const montageMs = urls.length * step;
    els.wrap.style.animation = `pw-titleArrive ${Math.max(1200, montageMs * opts.arriveFrac)}ms ease-out forwards`;
    els.wrap.style.animationDelay = `${opts.wordmarkDelayMs}ms`;

    els.mont.style.animation = `pw-montageFadeOut ${montageMs}ms linear forwards`;
    els.lens.style.animation  = `pw-montageFadeOut ${montageMs}ms linear forwards`;

    const showFinalAt = Math.max(0, montageMs - 600);
    const endAt       = montageMs + opts.finalHoldMs;
    timers.push(setTimeout(() => els.final.classList.add('show'), showFinalAt));
    timers.push(setTimeout(() => endSequence(false), endAt));
  }

  function endSequence(fromSkip) {
    clearTimers();
    els.root.classList.add('fade-out');
    setTimeout(() => {
      els.final.classList.remove('show');
      els.root.style.display = 'none';
      els.root.classList.remove('fade-out');
      document.documentElement.style.overflow = '';
      if (doneCb) try { doneCb(); } catch {}
    }, 420);
  }

  function destroy() {
    clearTimers();
    const root  = document.getElementById('pw-splash-root');
    const style = document.getElementById('pw-splash-style');
    if (root) root.remove();
    if (style) style.remove();
  }
})();
