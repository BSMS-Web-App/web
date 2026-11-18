/* The Last Harvest site-wide event announcement. */
(() => {
  'use strict';
  const KEY = 'lh_event_announcement_dismissed_v1';
  const EVENT_URL = '/last-harvest';
  if (window.top !== window.self) return;
  if (location.pathname.replace(/\/+$/, '') === EVENT_URL) return;
  try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    #lh-event-announcement{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(8,15,12,.86);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"Press Start 2P",ui-monospace,monospace;color:#fff4d8}
    #lh-event-announcement[hidden]{display:none!important}
    #lh-event-announcement .lh-ann-card{display:block;position:relative;isolation:isolate;overflow:hidden;width:min(590px,100%);padding:clamp(22px,5vw,38px);background:#314b5d;border:5px solid #26334a;box-shadow:inset 0 0 0 4px #f3e6bf,7px 7px 0 #172a3a;text-align:center}
    #lh-event-announcement .lh-ann-art{height:clamp(120px,24vw,190px);margin:-8px -8px 26px;border:3px solid #26334a;box-shadow:inset 0 0 0 2px #f3e6bf;image-rendering:pixelated;position:relative;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 16%,#3f6249 0,#1d3226 58%,#13211a 100%)}
    #lh-event-announcement .lh-ann-art:after{content:"";position:absolute;inset:9px;border:2px dashed rgba(243,230,191,.22);pointer-events:none}
    #lh-event-announcement .lh-ann-logo{position:relative;display:flex;flex-direction:column;align-items:center;gap:9px;font-family:"Press Start 2P",ui-monospace,monospace;line-height:1.25;text-align:center}
    #lh-event-announcement .lh-ann-logo small{color:#ffe18a;font-size:8px;letter-spacing:.18em;text-shadow:2px 2px #26334a}
    #lh-event-announcement .lh-ann-logo b{color:#fff4d8;font-size:clamp(16px,3.1vw,24px);letter-spacing:.02em;text-shadow:4px 4px #7c2318,-2px -2px #26334a,2px -2px #26334a,-2px 2px #26334a}
    #lh-event-announcement .lh-ann-logo i{display:block;width:78px;max-width:60%;height:5px;background:repeating-linear-gradient(90deg,#e9bd59 0 9px,transparent 9px 18px)}
    #lh-event-announcement .lh-ann-eyebrow{margin:0 0 17px;color:#8fd9ae;font-size:8px;line-height:1.8;letter-spacing:.12em}
    #lh-event-announcement h2{margin:0 0 18px;color:#fff4d8;font-size:clamp(13px,3.3vw,20px);line-height:1.8;text-shadow:3px 3px #26334a}
    #lh-event-announcement h2 span{color:#ffe18a}
    #lh-event-announcement .lh-ann-copy{max-width:440px;margin:0 auto;color:#e8dfc8;font-size:9px;line-height:2.1}
    #lh-event-announcement .lh-ann-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}
    #lh-event-announcement button{min-height:48px;padding:13px 18px;border:3px solid #26334a;border-radius:0;box-shadow:inset 0 0 0 2px #f3e6bf,3px 3px 0 #172a3a;font:inherit;font-size:9px;cursor:pointer}
    #lh-event-announcement .lh-ann-play{background:#e9bd59;color:#26334a}
    #lh-event-announcement .lh-ann-dismiss{background:#789caa;color:#172b3d}
    #lh-event-announcement button:focus-visible{outline:3px solid #fff;outline-offset:4px}
    @media(max-width:420px){#lh-event-announcement .lh-ann-actions{flex-direction:column}#lh-event-announcement button{width:100%}}
    @media(prefers-reduced-motion:no-preference){#lh-event-announcement .lh-ann-card{animation:lh-ann-enter .28s steps(5,end) both}@keyframes lh-ann-enter{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}}
  `;
  function mount() {
    if (!document.body || document.getElementById('lh-event-announcement')) return;
    const style = document.createElement('style');
    style.id = 'lh-event-announcement-style';
    style.textContent = css;
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'lh-event-announcement';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','lh-ann-title');
    overlay.innerHTML = `
      <section class="lh-ann-card">
        <div class="lh-ann-art" role="img" aria-label="The Last Harvest"><span class="lh-ann-logo"><small>THE LAST</small><b>HARVEST</b><i></i></span></div>
        <p class="lh-ann-eyebrow">BSMS WEB · LIMITED-TIME EVENT</p>
        <h2 id="lh-ann-title">THE LAST <span>HARVEST</span> IS NOW ON</h2>
        <p class="lh-ann-copy">A new adventure has arrived. Visit Hearthvale, help its residents, and experience The Last Harvest event.</p>
        <div class="lh-ann-actions">
          <button type="button" class="lh-ann-play" data-action="play">PLAY THE EVENT</button>
          <button type="button" class="lh-ann-dismiss" data-action="dismiss">GOT IT</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    function dismiss() {
      try { localStorage.setItem(KEY,'1'); } catch (_) {}
      overlay.remove();
      style.remove();
    }
    overlay.querySelector('[data-action="play"]').addEventListener('click', () => {
      try { localStorage.setItem(KEY,'1'); } catch (_) {}
      location.href = EVENT_URL;
    });
    overlay.querySelector('[data-action="dismiss"]').addEventListener('click', dismiss);
    overlay.querySelector('[data-action="play"]').focus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
