/* ========= PowerUp Full Splash =========
   Use with:
     <script src="scripts/splash.full.js"></script>
     Splash.play({
       title: "PLAYWORLD",
       tag: "PowerUp",
       onDone: () => console.log("Splash finished")
     });
========================================= */

(function () {
  const DEFAULTS = {
    manifestUrl: './gallery-manifest.json',
    images: null,
    shots: 10,
    holdMs: 300, xfadeMs: 150,
    tiltDeg: 8,
    kenScale: 1.1, panX: '10px', panY: '8px',
    wordmarkDelayMs: 80,
    arriveFrac: 0.8,
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

  function ensureDom() {
    if (document.getElementById('pw-splash-root')) return;

    const css = `
#pw-splash-root{position:fixed;inset:0;z-index:99999;background:#000;display:none;opacity:1;transition:opacity .42s ease-in;overflow:hidden}
#pw-splash-root.fade-out{opacity:0;pointer-events:none}
.pw-shot{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transform:scale(1);will-change:opacity,transform}
@keyframes pw-shotLife{
  0%{opacity:0;transform:scale(1)}
  15%{opacity:1}
  85%{opacity:1;transform:scale(1.1)}
  100%{opacity:0;transform:scale(1.1)}
}
.pw-wrap{position:absolute;inset:0;display:grid;place-items:center;z-index:3;opacity:0}
@keyframes pw-titleArrive{
  0%{transform:scale(1.5);opacity:0}
  100%{transform:scale(1);opacity:1}
}
.pw-title{font-family:Impact,Haettenschweiler,Arial Narrow Bold,sans-serif;font-size:clamp(50px,10vw,160px);font-weight:900;text-transform:uppercase;color:#fff;text-shadow:0 4px 12px rgba(0,0,0,.35)}
.pw-tag{margin-top:.7rem;font-family:"Segoe UI",Arial,sans-serif;letter-spacing:.25em;font-weight:700;font-size:clamp(12px,1.5vw,16px);color:#fff;opacity:.9;text-transform:uppercase}
.pw-status{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:4;color:#cfe7e4;font:600 13px/1.4 Inter,system-ui,Segoe UI,Arial,sans-serif;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.18);padding:8px 12px;border-radius:10px;min-width:220px;text-align:center}
.pw-skip{position:absolute;right:16px;bottom:16px;z-index:4;background:rgba(0,0,0,.45);color:#fff;padding:.55rem .8rem;border-radius:999px;border:1px solid rgba(255,255,255,.25);font:500 .9rem/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer;display:none}
.pw-skip:hover{background:rgba(0,0,0,.65)}
`;
    const style = document.createElement('style');
    style.id = 'pw-splash-style';
    style.textContent = css;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'pw-splash-root';
    root.innerHTML = `
      <div id="pw-shots"></div>
      <div class="pw-wrap">
        <div class="pw-title" id="pw-title"></div>
        <div class="pw-tag" id="pw-tag"></div>
      </div>
      <div class="pw-status" id="pw-status"></div>
      <button class="pw-skip" id="pw-skip">Skip Intro</button>
    `;
    document.body.appendChild(root);

    els.root = root;
    els.shots = root.querySelector('#pw-shots');
    els.wrap = root.querySelector('.pw-wrap');
    els.title = root.querySelector('#pw-title');
    els.tag = root.querySelector('#pw-tag');
    els.status = root.querySelector('#pw-status');
    els.skip = root.querySelector('#pw-skip');
    els.skip.addEventListener('click', () => endSequence(true), { passive: true });
  }

  function setStatus(text) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.style.display = text ? 'block' : 'none';
  }
  function setSkip(on) {
    if (!els.skip) return;
    els.skip.style.display = on ? 'inline-block' : 'none';
  }

  async function start(opts) {
    ensureDom();
    doneCb = typeof opts.onDone === 'function' ? opts.onDone : null;
    let urls = Array.isArray(opts.images) && opts.images.length ? opts.images.slice() : [];

    // fallback to placeholder images if none given
    if (!urls.length) {
      urls = Array.from({ length: opts.shots }).map((_, i) =>
        `https://picsum.photos/seed/powerup${i}/1600/900`
      );
    }

    els.root.style.display = 'block';
    document.documentElement.style.overflow = 'hidden';

    els.title.textContent = opts.title;
    els.tag.textContent = opts.tag;
    setStatus('Starting…');
    setSkip(false);

    els.shots.innerHTML = '';
    const step = opts.holdMs + opts.xfadeMs;
    urls.forEach((src, i) => {
      const d = document.createElement('div');
      d.className = 'pw-shot';
      d.style.backgroundImage = `url("${src}")`;
      d.style.animation = `pw-shotLife ${step + 200}ms ${i * step}ms both ease-in-out`;
      els.shots.appendChild(d);
    });

    els.wrap.style.animation = `pw-titleArrive ${urls.length * step * 0.7}ms ease-out forwards`;
    timers.push(setTimeout(() => endSequence(false), urls.length * step + opts.finalHoldMs));
  }

  function endSequence(fromSkip) {
    clearTimers();
    els.root.classList.add('fade-out');
    setTimeout(() => {
      els.root.style.display = 'none';
      document.documentElement.style.overflow = '';
      if (doneCb) try { doneCb(); } catch {}
    }, 420);
  }

  function destroy() {
    clearTimers();
    const root = document.getElementById('pw-splash-root');
    const style = document.getElementById('pw-splash-style');
    if (root) root.remove();
    if (style) style.remove();
  }
})();
