/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/* Halloween Haunt UI reliability layer.
   Kept separate from the game engine so the settings entry and redesigned crew cards
   remain available even if a non-critical enhancement in the main script fails. */
(() => {
  'use strict';
  const CREW_ROSTER = ['Jack','Misty','Boo','Candy','Pumpkin','Raven','Cocoa','Hex','Maple','Ember','Cobweb','Midnight','Toffee','Salem','Patches','Wick','Hocus','Mallow','Fable','Trick'];
  const NOTICE_TYPES = [
    ['basketFull','Basket full','When your player basket reaches capacity.'],
    ['candySold','Candy sold','After candy is sold for cash.'],
    ['crewAsleep','Crew member asleep','When a crew member falls asleep and needs waking.'],
    ['newRarity','New rarity unlocked','When you discover a candy rarity for the first time.'],
    ['upgradeBought','Upgrade purchased','When an upgrade is bought.'],
    ['crewHired','Crew member hired','When you recruit a new crew member.'],
    ['crewFed','Crew member fed','When feeding boosts are activated.'],
    ['autoSell','Auto Sell','When Auto Sell begins selling a full basket.']
  ];
  const RARITY_COLORS = {Common:'#ddd',Uncommon:'#45d483',Rare:'#4c9dff',Epic:'#b66aff',Legendary:'#ffc94a',Mythic:'#ff5ca8'};
  const getPrefs = () => { try { return JSON.parse(localStorage.getItem('hh_notification_prefs') || '{}'); } catch { return {}; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => typeof window.formatCash === 'function' ? window.formatCash(Number(value)||0) : '$'+Math.floor(Number(value)||0).toLocaleString();
  const helpButton = (title, body) => '<button type="button" class="hh-help-btn" data-hh-help="'+esc(title)+'" data-hh-info="'+esc(body)+'" aria-label="Help: '+esc(title)+'">?</button>';
  const card = (title, body, badge='INFO') => '<section class="hh-card-ui"><div class="hh-card-heading"><h3>'+title+'</h3><span class="hh-badge">'+badge+'</span></div>'+body+'</section>';
  function showHelp(title, body) {
    const overlay=document.createElement('div'); overlay.className='hh-help-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.innerHTML='<section class="hh-help-card"><span class="hh-badge">HELP</span><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p><button class="buy-btn" type="button">Got it</button></section>';
    overlay.querySelector('button').onclick=()=>overlay.remove(); overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();}); document.body.appendChild(overlay);
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-hh-help]');if(b)showHelp(b.dataset.hhHelp,b.dataset.hhInfo);});
  function openSettings() {
    const overlay=document.getElementById('hauntModalOverlay'), title=document.getElementById('modalTitle'), body=document.getElementById('modalBody');
    if(!overlay||!title||!body)return;
    if(typeof window.closeModal==='function')window.closeModal();
    title.textContent='Settings'; overlay.classList.add('show');
    const prefs=getPrefs();
    body.innerHTML=card('Notifications','<p class="hh-muted">Choose exactly which alerts you want to see. Each switch is independent.</p>'+NOTICE_TYPES.map(([id,label,desc])=>'<label class="hh-setting-row"><span><strong>'+label+'</strong><small>'+desc+'</small></span><input type="checkbox" data-hh-pref="'+id+'" '+(prefs[id]===false?'':'checked')+'></label>').join(''),'PREFERENCES')
      +card('Tutorial','<p class="hh-muted">Replay the short guide to review collecting candy, selling, upgrades, and crew.</p><button type="button" class="buy-btn" id="hhRedoTutorial">Redo tutorial</button>','LEARN');
    body.querySelectorAll('[data-hh-pref]').forEach(input=>input.addEventListener('change',()=>{const next=getPrefs();next[input.dataset.hhPref]=input.checked;localStorage.setItem('hh_notification_prefs',JSON.stringify(next));}));
    body.querySelector('#hhRedoTutorial').addEventListener('click',()=>{try{localStorage.removeItem('halloween_haunt_guide_seen_v1');}catch{}if(typeof window.closeModal==='function')window.closeModal();if(typeof window.renderWelcomeGuide==='function'){try{helpSection=0;}catch{}window.renderWelcomeGuide();}else if(typeof window.maybeShowWelcomeGuide==='function'){window.maybeShowWelcomeGuide();}});
  }
  const baseOpenModal=window.openModal;
  window.openModal=function(type){
    if(type==='settings'){openSettings();return;}
    if(typeof baseOpenModal==='function'){
      const result=baseOpenModal.apply(this,arguments);
      if(type==='crew'){
        const title=document.getElementById('modalTitle');if(title)title.textContent='Trick-or-Treat Crew';
        renderCrewDashboard(document.getElementById('modalBody'));
      }
      return result;
    }
  };
  function timeLeft(ms) { const n=Math.max(0,Math.ceil(ms/1000));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0'); }
  function renderCrewDashboard(container) {
    const state=typeof gameState!=='undefined'?gameState:null;
    if(!container||!state)return;
    const crew=Array.isArray(state.crew)?state.crew:[];
    const crewCollected=Number(state.stats?.crewCollected||0), crewSold=Number(state.stats?.crewSold||0), crewEarnings=(Array.isArray(state.crew)?state.crew:[]).reduce((sum,worker)=>sum+Math.max(0,Number(worker.moneyEarned||0)),0);
    let html=card('What are Crews?','<p>Crew members collect candy automatically while the game is open. When a basket fills, they sell it to the best-paying seller. After five minutes awake, a worker falls asleep and must be woken manually.</p><p class="hh-muted">Feed a worker using candy equal to 10 × your basket capacity. Feeding wakes them and gives percentage-based boosts for 20 minutes. A worker cannot be fed again while the boost is active.</p>'+helpButton('Crew basics','Crew work pauses when the game is closed. Each worker has their own basket, awake timer, and upgrade levels. Full baskets are sold automatically to the best-paying shop.'),'AUTOMATIC WORK');
    html+='<div class="hh-summary-grid"><div class="hh-stat-card"><small>Crew members</small><strong>'+crew.length+' / 20</strong></div><div class="hh-stat-card"><small>Candy collected</small><strong>'+crewCollected.toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Candy sold</small><strong>'+crewSold.toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Crew earnings</small><strong>'+money(crewEarnings)+'</strong></div><div class="hh-stat-card"><small>Candy Reserve</small><strong>'+Number(state.feedCandy||0).toLocaleString()+'</strong><small>Used to feed crew</small></div></div>';
    if(!crew.length){
      html+=card('Hire your first member','<p class="hh-muted">Every recruit starts with the same base stats. Each new recruit costs more than the last.</p><button class="buy-btn" type="button" data-hh-hire '+(Number(state.cash)<Number(state.crewHireCost)?'disabled':'')+'>Hire '+CREW_ROSTER[0]+' · '+money(state.crewHireCost)+'</button>','RECRUIT');
    } else {
      html+='<div class="hh-crew-grid">'+crew.map((worker,index)=>{
        const name=worker.name||CREW_ROSTER[index]||('Worker '+(index+1));
        const asleep=!!worker.asleep, fed=Number(worker.fedUntil||0)>Date.now();
        const held=Number(worker.inventoryCount||0), capacity=Math.max(1,Number(worker.capacity||10));
        const sellReady=Number(worker.sellReadyAt||0), awakeLimit=300000+Number(worker.awakeLevel||0)*60000;
        const elapsedSinceSync=(!asleep&&!fed&&Number(worker.lastActionAt||0)>0)?Math.max(0,Math.min(3000,Date.now()-Number(worker.lastActionAt))):0; const awakeRemaining=Math.max(0,awakeLimit-Number(worker.awakeMs||0)-elapsedSinceSync);
        const status=asleep?'ASLEEP':fed?'FED BOOST':sellReady&&held>=capacity?'SELLING':'COLLECTING';
        const interval=Math.max(500,Number(worker.intervalMs||2000)*(fed?.75:1)), workElapsed=Number(worker.workMs||0)+elapsedSinceSync, collectRemaining=Math.max(0,interval-Math.min(interval,workElapsed)); const activity=asleep?'Wake this member to resume work.':fed?'Boost active · '+timeLeft(Number(worker.fedUntil)-Date.now())+' remaining':sellReady&&held>=capacity?'Selling in '+timeLeft(sellReady-Date.now()):'Awake for '+timeLeft(awakeRemaining)+' more · next candy in '+timeLeft(collectRemaining);
        const upgrades=[['capacity','Basket Capacity','capacityLevel',65,1.65],['power','Click Power','powerLevel',80,1.65],['luck','Candy Luck','luckLevel',95,1.65],['speed','Auto Sell Faster','speedLevel',75,1.7],['awake','Awake Time','awakeLevel',100,1.8]];
        return '<article class="hh-crew-card '+(asleep?'is-asleep':'')+'"><div class="hh-crew-top"><div><span class="hh-badge">'+status+'</span><h3>'+esc(name)+'</h3><p class="hh-muted">'+activity+'</p></div>'+helpButton('Worker status','Collecting means candy is being gathered. Selling means the basket is full and waiting for its sale. Sleeping workers need a manual wake-up.')+'</div><div class="hh-progress-label"><span>Basket</span><strong>'+held+' / '+capacity+'</strong></div><div class="hh-progress"><i style="width:'+Math.min(100,held/capacity*100)+'%"></i></div><div class="hh-summary-grid"><div class="hh-stat-card"><small>Candy collected by this member</small><strong>'+Number(worker.collectedCount||0).toLocaleString()+'</strong></div><div class="hh-stat-card"><small>Money earned by this member</small><strong>'+money(worker.moneyEarned||0)+'</strong></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'+(asleep?'<button class="buy-btn" type="button" data-hh-crew="wake" data-index="'+index+'">Wake up</button>':'<button class="buy-btn" type="button" data-hh-crew="feed" data-index="'+index+'" '+(fed?'disabled':'')+'>Feed · '+(10*Number(state.basketCapacity||50))+' candy</button>')+'</div><div class="hh-upgrade-grid">'+upgrades.map(([key,label,field,base,mult])=>{const level=Number(worker[field]||0),cost=Math.floor(base*Math.pow(mult,level));return '<div class="hh-upgrade-mini"><span>'+label+'<small>Level '+level+'</small></span><button class="buy-btn" type="button" data-hh-crew="upgrade_'+key+'" data-index="'+index+'" '+(Number(state.cash)<cost?'disabled':'')+'>'+money(cost)+'</button></div>';}).join('')+'</div></article>';
      }).join('')+'</div>';
    }
    if(crew.length<20)html+=card('Recruit another member','<p>All recruits start equally. Hiring costs rise each time, up to a maximum of 20 crew members.</p><button class="buy-btn" type="button" data-hh-hire '+(Number(state.cash)<Number(state.crewHireCost)?'disabled':'')+'>Hire '+esc(CREW_ROSTER[crew.length]||'Worker')+' · '+money(state.crewHireCost)+'</button>','NEXT RECRUIT');
    container.innerHTML=html;
    container.querySelectorAll('[data-hh-hire]').forEach(b=>b.addEventListener('click',()=>window.executeCrew?.('hire')));
    container.querySelectorAll('[data-hh-crew]').forEach(b=>b.addEventListener('click',()=>window.executeCrew?.(b.dataset.hhCrew,Number(b.dataset.index))));
  }
  window.renderCrew=renderCrewDashboard;
  // The core action handler now shows immediate optimistic feedback; avoid a second delayed toast.
  const baseUpgrade=window.executeUpgrade;
  window.executeUpgrade=function(type){
    if(typeof baseUpgrade!=='function')return;
    return baseUpgrade.apply(this,arguments);
  };
  function initSettingsEntry(){
    const nav=document.querySelector('.action-nav');if(!nav)return;
    let button=nav.querySelector('[data-hhsettings]');
    if(!button){button=document.createElement('button');button.className='action-btn';button.dataset.hhsettings='1';button.type='button';button.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.8l-.1-.1v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.3l.1-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.8l.1.1z"></path></svg><span>Settings</span>';nav.appendChild(button);}
    button.onclick=e=>{e.preventDefault();openSettings();};
    if(!document.getElementById('hh-ghost-layer')){const layer=document.createElement('div');layer.id='hh-ghost-layer';layer.setAttribute('aria-hidden','true');layer.innerHTML=Array.from({length:7},(_,i)=>'<span style="--i:'+i+'">👻</span>').join('');document.body.appendChild(layer);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSettingsEntry,{once:true});else initSettingsEntry();
  let autoSellTimer=null;
  let autoSellPending=false;
  const baseShowToast=window.showToast;
  window.showToast=function(message){
    const msg=String(message||'');
    const lower=msg.toLowerCase();
    let category=null;
    if(lower.includes('basket is full')||lower.includes('basket full'))category='basketFull';
    else if(lower.includes('auto sell'))category='autoSell';
    else if(lower.includes('sold ')||lower.includes('selling candy'))category='candySold';
    else if(lower.includes('asleep')||lower.includes('needs waking'))category='crewAsleep';
    else if(lower.includes('new rarity')||lower.includes('discovered a '))category='newRarity';
    else if(lower.includes('upgrade purchased')||lower.includes('upgrade unlocked'))category='upgradeBought';
    else if(lower.includes('crew member hired')||lower.includes('hired!'))category='crewHired';
    else if(lower.includes('crew member fed')||lower.includes('fed for 20 minutes'))category='crewFed';
    if(category&&getPrefs()[category]===false)return;
    if(typeof baseShowToast==='function')return baseShowToast.apply(this,arguments);
  };
  const initialDiscovered=new Set();
  const initialRarities=new Set();
  let hasInitialDiscoverySnapshot=false;
  const lastSleepState=new Map();
  const baseUpdateUI=window.updateUI;
  window.updateUI=function(){
    if(typeof baseUpdateUI==='function')baseUpdateUI.apply(this,arguments);
    const state=typeof gameState!=='undefined'?gameState:null;
    if(!state)return;
    const discovered=Array.isArray(state.discovered)?state.discovered:[];
    if(!hasInitialDiscoverySnapshot){
      discovered.forEach(id=>{initialDiscovered.add(id);const candy=(typeof CANDY_CATALOG!=='undefined'?CANDY_CATALOG:[]).find(item=>item.id===id);if(candy)initialRarities.add(candy.rarity);});
      hasInitialDiscoverySnapshot=true;
    } else {
      for(const id of discovered){
        if(initialDiscovered.has(id))continue;
        initialDiscovered.add(id);
        const candy=(typeof CANDY_CATALOG!=='undefined'?CANDY_CATALOG:[]).find(item=>item.id===id);
        if(candy&&!initialRarities.has(candy.rarity)){
          initialRarities.add(candy.rarity);
          if(getPrefs().newRarity!==false&&typeof window.showToast==='function')window.showToast('New rarity unlocked: '+candy.rarity+'!');
        }
      }
    }
    const crew=Array.isArray(state.crew)?state.crew:[];
    const asleep=crew.filter(worker=>worker.asleep);
    const nav=document.querySelector('.action-nav');
    const crewButton=nav?.querySelector('button[onclick="openModal(\'crew\')"]');
    if(crewButton){
      crewButton.classList.toggle('hh-crew-alert',asleep.length>0);
      crewButton.setAttribute('aria-label',asleep.length?'Crew — '+asleep.length+' member'+(asleep.length===1?'':'s')+' asleep and need waking':'Crew');
      let dot=crewButton.querySelector('.hh-alert-dot');
      if(asleep.length&&!dot){dot=document.createElement('span');dot.className='hh-alert-dot';dot.setAttribute('aria-label','Crew members need waking');crewButton.appendChild(dot);}
      if(!asleep.length&&dot)dot.remove();
    }
    for(let i=0;i<crew.length;i++){
      const worker=crew[i],wasAsleep=lastSleepState.get(worker.id||String(i));
      if(worker.asleep&&(wasAsleep===false||wasAsleep===undefined)&&getPrefs().crewAsleep!==false&&typeof window.showToast==='function')window.showToast('Crew member asleep: '+(worker.name||CREW_ROSTER[i]||('Worker '+(i+1)))+' needs waking.');
      lastSleepState.set(worker.id||String(i),!!worker.asleep);
    }
    const cap=Math.max(1,Number(state.basketCapacity||50));
    const count=Object.values(state.inventory||{}).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);
    const enabled=Number(state.upgrades?.autoSell?.level||0)>0;
    if(!enabled||count<cap){
      if(autoSellTimer){clearTimeout(autoSellTimer);autoSellTimer=null;}
      autoSellPending=false;return;
    }
    if(!autoSellTimer&&!autoSellPending){
      autoSellPending=true;
      autoSellTimer=setTimeout(async()=>{
        autoSellTimer=null;
        const latest=typeof gameState!=='undefined'?gameState:null;
        const latestCount=Object.values(latest?.inventory||{}).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);
        if(latest&&Number(latest.upgrades?.autoSell?.level||0)>0&&latestCount>=Math.max(1,Number(latest.basketCapacity||50))){
          if(getPrefs().autoSell!==false&&typeof window.showToast==='function')window.showToast('Auto Sell — your full basket is being sold at the best prices.');
          await window.executeSellAll?.();
        }
        autoSellPending=false;
      },1000);
    }
  };
  setInterval(()=>{if(typeof currentModal!=='undefined'&&currentModal==='crew'&&typeof gameState!=='undefined'&&gameState){const body=document.getElementById('modalBody');if(body)renderCrewDashboard(body);}},1000);
})();