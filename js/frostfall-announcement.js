/* The Frostfall site-wide event announcement. */
(() => {
  'use strict';
  const START = Date.parse('2026-11-19T05:00:00.000Z');
  const END = Date.parse('2027-01-05T04:59:00.000Z');
  const KEY = 'frostfall_event_announcement_dismissed_v1';
  const EVENT_URL = '/frostfall';
  if (Date.now() < START || Date.now() >= END) return;
  if (window.top !== window.self) return;
  if (location.pathname.replace(/\/+$/, '') === EVENT_URL) return;
  try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    #ff-event-announcement{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(8,5,18,.88);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"Press Start 2P",ui-monospace,monospace;color:#fff3d5}
    #ff-event-announcement[hidden]{display:none!important}
    #ff-event-announcement .ff-ann-card{display:block;position:relative;isolation:isolate;overflow:hidden;width:min(600px,100%);padding:clamp(22px,5vw,38px);background:#2a1a4c;border:5px solid #0d0718;box-shadow:inset 0 0 0 4px #cdbff0,7px 7px 0 #0d0718;text-align:center}
    #ff-event-announcement .ff-ann-art{height:clamp(130px,26vw,200px);margin:-8px -8px 26px;border:3px solid #0d0718;box-shadow:inset 0 0 0 2px #cdbff0;position:relative;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 18%,#5b4a96 0,#2a1d4a 58%,#140c26 100%)}
    #ff-event-announcement .ff-ann-art:before{content:"";position:absolute;inset:9px;border:2px dashed rgba(205,191,240,.28);pointer-events:none}
    #ff-event-announcement .ff-ann-logo{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;line-height:1.2;text-align:center}
    #ff-event-announcement .ff-ann-logo small{color:#9fe6ff;font-size:9px;letter-spacing:.24em;text-shadow:2px 2px #0d0718}
    #ff-event-announcement .ff-ann-logo b{color:#fff3d5;font-size:clamp(24px,4.4vw,34px);letter-spacing:.02em;text-shadow:4px 4px #b0521f,-2px -2px #0d0718,2px -2px #0d0718,-2px 2px #0d0718,0 -2px #0d0718}
    #ff-event-announcement .ff-ann-logo i{display:block;width:84px;max-width:60%;height:5px;background:repeating-linear-gradient(90deg,#7ce7ff 0 9px,transparent 9px 18px)}
    #ff-event-announcement .ff-ann-logo em{font-style:normal;color:#ffbd3e;font-size:7px;letter-spacing:.16em}
    #ff-event-announcement .ff-ann-eyebrow{margin:0 0 16px;color:#9fe6ff;font-size:8px;line-height:1.8;letter-spacing:.12em}
    #ff-event-announcement h2{margin:0 0 18px;color:#fff3d5;font-size:clamp(13px,3.2vw,20px);line-height:1.8;text-shadow:3px 3px #0d0718}
    #ff-event-announcement h2 span{color:#ffbd3e}
    #ff-event-announcement .ff-ann-copy{max-width:450px;margin:0 auto;color:#e9dcff;font-size:9px;line-height:2.1}
    #ff-event-announcement .ff-ann-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}
    #ff-event-announcement button{min-height:48px;padding:13px 18px;border:3px solid #0d0718;border-radius:0;box-shadow:inset 0 0 0 2px #fff,3px 3px 0 #0d0718;font:inherit;font-size:9px;cursor:pointer}
    #ff-event-announcement .ff-ann-play{background:linear-gradient(180deg,#ffd05c,#ff9f2e);color:#2a1a08}
    #ff-event-announcement .ff-ann-dismiss{background:#cdd8ef;color:#1c1030}
    #ff-event-announcement button:focus-visible{outline:3px solid #fff;outline-offset:4px}
    @media(max-width:420px){#ff-event-announcement .ff-ann-actions{flex-direction:column}#ff-event-announcement button{width:100%}}
    @media(prefers-reduced-motion:no-preference){#ff-event-announcement .ff-ann-card{animation:ff-ann-enter .28s steps(5,end) both}@keyframes ff-ann-enter{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}}
  `;
  function mount() {
    if (!document.body || document.getElementById('ff-event-announcement')) return;
    const style = document.createElement('style');
    style.id = 'ff-event-announcement-style';
    style.textContent = css;
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'ff-event-announcement';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','ff-ann-title');
    overlay.innerHTML = `
      <section class="ff-ann-card">
        <div class="ff-ann-art" role="img" aria-label="Frostfall: The Star That Went Out"><span class="ff-ann-logo"><small>FROST</small><b>FALL</b><i></i><em>THE STAR THAT WENT OUT</em></span></div>
        <p class="ff-ann-eyebrow">BSMS WEB · LIMITED-TIME 3D EVENT</p>
        <h2 id="ff-ann-title">FROSTFALL IS NOW ON</h2>
        <p class="ff-ann-copy">Five chapters, a low-poly Roadtown, and a star that went out. Play the new 3D adventure and bring the light back before January 4.</p>
        <div class="ff-ann-actions">
          <button type="button" class="ff-ann-play" data-action="play">PLAY THE EVENT</button>
          <button type="button" class="ff-ann-dismiss" data-action="dismiss">GOT IT</button>
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
