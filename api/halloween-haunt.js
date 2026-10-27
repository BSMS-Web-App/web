/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 *
 * Halloween Haunt authoritative event API.
 * All economy changes are server-calculated and committed through the Mac DB CAS transaction.
 */
import { db } from './db.js';

const ROOT = '/halloween_haunt';
const START = Date.parse('2026-10-26T04:00:00.000Z'); // Oct 26, 2026, 12:00 AM EDT
const END = Date.parse('2026-10-30T19:10:00.000Z');   // Oct 30, 2026, 3:10 PM EDT
const ROTATION_MS = 5 * 60 * 1000;
const MAX_CREW = 20;
const CREW_NAMES=['Jack','Misty','Boo','Candy','Pumpkin','Raven','Cocoa','Hex','Maple','Ember','Cobweb','Midnight','Toffee','Salem','Patches','Wick','Hocus','Mallow','Fable','Trick'];
const MAX_CLICK_RATE = 8;
const CANDY = [
  ['candy-corn','Candy Corn','Common','candy-corn.png',1,30],
  ['smarties','Smarties','Common','smarties.png',1,30],
  ['tootsie-roll','Tootsie Roll','Common','tootsie-roll.png',1,30],
  ['whoppers','Whoppers','Common','whoppers.jpeg.png',1,30],
  ['milk-duds','Milk Duds','Common','milk-duds.png',1,30],
  ['mounds','Mounds','Common','mounds.png',1,30],
  ['3-musketeers','3 Musketeers','Uncommon','3-musketeers.png',2,10],
  ['milky-way','Milky Way','Uncommon','milky-way.png',2,10],
  ['mr-goodbar','Mr. Goodbar','Uncommon','mr-goodbar.png',2,10],
  ['almond-joy','Almond Joy','Uncommon','almond-joy.png',2,10],
  ['baby-ruth','Baby Ruth','Uncommon','baby-ruth.png',2,10],
  ['tootsie-pop','Tootsie Pop','Uncommon','tootsie-pop.png',2,10],
  ['jolly-ranchers','Jolly Ranchers','Uncommon','jolly-ranchers.png',2,10],
  ['twizzlers','Twizzlers','Uncommon','twizzlers.png',2,10],
  ['hersheys',"Hershey's",'Rare','hersheys.png',4,2.5],
  ['m-ms',"M&M's",'Rare','m-ms.png',4,2.5],
  ['skittles','Skittles','Rare','skittles.png',4,2.5],
  ['airheads','Airheads','Rare','airheads.png',4,2.5],
  ['swedish-fish','Swedish Fish','Rare','swedish-fish.png',4,2.5],
  ['york','York','Rare','york.png',4,2.5],
  ['crunch','Crunch','Rare','crunch.png',4,2.5],
  ['butter-finger','Butterfinger','Rare','butter-finger.png',4,2.5],
  ['startburst','Starburst','Rare','startburst.png',4,2.5],
  ['kitkat','KitKat','Epic','kitkat.png',8,0.35],
  ['snickers','Snickers','Epic','snickers.png',8,0.35],
  ['sour-patch-kids','Sour Patch Kids','Epic','sour-patch-kids.png',8,0.35],
  ['100-grand','100 Grand','Epic','100-grand.png',8,0.35],
  ['twix','Twix','Legendary','twix.png',16,0.025],
  ['reeses',"Reese's",'Legendary','reeses.png',16,0.025]
].map(([id,name,rarity,file,baseValue,weight])=>({id,name,rarity,file,baseValue,weight}));

const SHOPS = [
  {id:'corner',name:'Corner Store',multiplier:1.00},
  {id:'market',name:'Harvest Market',multiplier:1.12},
  {id:'arcade',name:'Midnight Arcade',multiplier:0.94},
  {id:'pharmacy',name:'Moonlight Pharmacy',multiplier:1.05}
];
const UPGRADE_CONFIG = {
  capacity:{label:'Basket Capacity',baseCost:45,max:30},
  power:{label:'Click Power',baseCost:60,max:20},
  luck:{label:'Candy Luck',baseCost:90,max:15},
  autoSell:{label:'Auto Sell',baseCost:5000,max:1}
};
const rarityWeight = {Common:62,Uncommon:24,Rare:10,Epic:3.3,Legendary:0.7};

function newPlayer(uid, account, now) {
  const inventory = {};
  const lifetimeCollected = {};
  for (const candy of CANDY) { inventory[candy.id]=0; lifetimeCollected[candy.id]=0; }
  return {
    uid, displayName: String(account.displayName || account.username || 'Player').slice(0,40),
    cash:100, inventory, discovered:[], lifetimeCollected, feedCandy:0,
    basketCapacity:50, currentBasketCount:0,
    upgrades:{capacity:{level:0,nextCost:45},power:{level:0,nextCost:60},luck:{level:0,nextCost:90},autoSell:{level:0,nextCost:5000}},
    crew:[], crewUnlocked:false, crewHireCost:180, lastCrewSync:now,
    stats:{highScore:100,lifetimeCash:0,cashSpent:0,totalClicks:0,totalCollected:0,totalSold:0,rareCollected:0,legendaryCollected:0,upgradesBought:0,crewCollected:0,crewSold:0},
    createdAt:now, updatedAt:now
  };
}
function normalizePlayer(p, uid, account, now) {
  if (!p) return newPlayer(uid,account,now);
  p.uid=uid; p.displayName=String(account.displayName || account.username || p.displayName || 'Player').slice(0,40);
  p.inventory ||= {}; p.lifetimeCollected ||= {}; p.discovered ||= []; p.feedCandy=Math.max(0,Math.floor(Number(p.feedCandy)||0));
  for (const c of CANDY) { p.inventory[c.id]=Number.isFinite(p.inventory[c.id])?p.inventory[c.id]:0; p.lifetimeCollected[c.id]=Number.isFinite(p.lifetimeCollected[c.id])?p.lifetimeCollected[c.id]:0; }
  p.upgrades ||= {};
  for (const [id,cfg] of Object.entries(UPGRADE_CONFIG)) p.upgrades[id] ||= {level:0,nextCost:cfg.baseCost};
  p.crew ||= []; for(let i=0;i<p.crew.length;i++){const w=p.crew[i];w.name=w.name||CREW_NAMES[i]||('Worker '+(i+1));w.capacityLevel=Number(w.capacityLevel||0);w.powerLevel=Number(w.powerLevel||0);w.luckLevel=Number(w.luckLevel||0);w.awakeLevel=Number(w.awakeLevel||0);w.speedLevel=Number(w.speedLevel||0);w.capacity=Number(w.capacity||50);if(w.capacityLevel===0&&w.capacity<=10)w.capacity=50;w.intervalMs=2000;w.workMs=Number(w.workMs||0);w.inventory||={};w.inventoryCount=Object.values(w.inventory).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);w.fedUntil=Number(w.fedUntil||0);w.awakeMs=Number(w.awakeMs||0);w.collectedCount=Number(w.collectedCount||0);w.moneyEarned=Number(w.moneyEarned||0);} p.stats ||= {};
  for (const [k,v] of Object.entries({highScore:p.cash||0,lifetimeCash:0,cashSpent:0,totalClicks:0,totalCollected:0,totalSold:0,rareCollected:0,legendaryCollected:0,upgradesBought:0,crewCollected:0,crewSold:0})) if (!Number.isFinite(p.stats[k])) p.stats[k]=v;
  p.cash=Math.max(0,Math.floor(Number(p.cash)||0)); p.basketCapacity=Math.max(1,Math.floor(Number(p.basketCapacity)||50));
  p.currentBasketCount=Object.values(p.inventory).reduce((a,n)=>a+n,0);
  p.crewHireCost=Number(p.crewHireCost)||180; p.lastCrewSync=Number(p.lastCrewSync)||now;
  return p;
}
function offersForWindow(windowStart) {
  // Offers are deterministic for a five-minute global window; deployments don't reset them.
  let seed = Math.abs(Math.floor(windowStart / ROTATION_MS) * 2654435761) >>> 0;
  const rand=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const offers={};
  for (const shop of SHOPS) {
    offers[shop.id]={};
    for (const candy of CANDY) {
      const variation=0.82+rand()*0.38;
      offers[shop.id][candy.id]=Math.max(1,Math.round(candy.baseValue*shop.multiplier*variation));
    }
  }
  return offers;
}
function ensureMeta(root, now) {
  root.meta ||= {};
  const windowStart=Math.floor(now/ROTATION_MS)*ROTATION_MS;
  if (root.meta.offerWindow !== windowStart || !root.meta.offers) {
    root.meta.offerWindow=windowStart;
    root.meta.offers=offersForWindow(windowStart);
  }
  root.players ||= {};
  return root;
}
function eventStatus(now) {
  // TEST MODE: keep the event active regardless of the calendar. Restore date checks before launch.
  const status=now<START?'upcoming':now<END?'active':'ended';
  return {status,startsAt:START,endsAt:END,serverTime:now,testMode:false};
}
function publicState(p, root, now) {
  const offers=root.meta.offers;
  const bestPrices={};
  for(const c of CANDY) bestPrices[c.id]=Math.max(...SHOPS.map(s=>offers[s.id][c.id]));
  return {
    ...eventStatus(now), accountId:p.uid, displayName:p.displayName, cash:p.cash,
    inventory:{...p.inventory}, discovered:[...p.discovered], lifetimeCollected:{...p.lifetimeCollected}, feedCandy:Math.max(0,Math.floor(Number(p.feedCandy)||0)),
    currentBasketCount:p.currentBasketCount,basketCapacity:p.basketCapacity,
    upgrades:JSON.parse(JSON.stringify(p.upgrades)),crew:JSON.parse(JSON.stringify(p.crew)),
    crewUnlocked:p.crewUnlocked,crewHireCost:p.crewHireCost,stats:{...p.stats},
    candyCatalog:CANDY.map(c=>({...c,bestPrice:bestPrices[c.id]})),
    shops:SHOPS.map(s=>({id:s.id,name:s.name,prices:{...offers[s.id]}})),
    offerWindow:root.meta.offerWindow,offerRefreshAt:root.meta.offerWindow+ROTATION_MS,
    crewAutoSell:!!p.upgrades.autoSell.level
  };
}
async function authenticate(req) {
  const sessionId=req.headers['x-session-id'];
  if(typeof sessionId!=='string' || !sessionId || sessionId.length>300) return null;
  const snap=await db.ref('/accounts').once('value');
  const accounts=snap.val()||{};
  for(const [uid,account] of Object.entries(accounts)) {
    if(account?.account_status==='banned' || account?.account_status==='deleted') continue;
    if(account?.sessions?.[sessionId] || account?.creator_session_id===sessionId) {
      const deviceId=req.headers['x-device-id'];
      if(deviceId) {
        const ban=(await db.ref('/banned_devices/'+String(deviceId).replace(/[.#$\[\]/]/g,'_')).once('value')).val();
        if(ban && (!ban.ban_expires || Number(ban.ban_expires)>Date.now())) return {error:'This device is banned.',status:403};
      }
      return {uid,account};
    }
  }
  return null;
}
function rollCandy(luckLevel) {
  const luckFactor=1+Math.min(14,luckLevel)*0.055;
  const weighted=CANDY.map(c=>({c,w:c.weight*(c.rarity==='Common'?1:luckFactor)}));
  const total=weighted.reduce((s,x)=>s+x.w,0); let r=Math.random()*total;
  for(const item of weighted){r-=item.w;if(r<=0)return item.c;}
  return CANDY[0];
}
function bestShopFor(candyId, offers) {
  return SHOPS.reduce((best,s)=>offers[s.id][candyId]>offers[best.id][candyId]?s:best,SHOPS[0]);
}

function offlineSyncProjection(state) {
  const stats=state?.stats||{}, upgrades=state?.upgrades||{};
  return {
    accountId:state?.accountId||state?.uid||null,
    cash:Number(state?.cash)||0,
    feedCandy:Math.max(0,Math.floor(Number(state?.feedCandy)||0)),
    inventory:Object.fromEntries(CANDY.map(c=>[c.id,Math.max(0,Math.floor(Number(state?.inventory?.[c.id])||0))])),
    discovered:[...new Set(Array.isArray(state?.discovered)?state.discovered.filter(id=>CANDY.some(c=>c.id===id)):[])].sort(),
    lifetimeCollected:Object.fromEntries(CANDY.map(c=>[c.id,Math.max(0,Math.floor(Number(state?.lifetimeCollected?.[c.id])||0))])),
    basketCapacity:Number(state?.basketCapacity)||50,
    upgrades:Object.fromEntries(Object.keys(UPGRADE_CONFIG).map(id=>[id,{level:Math.max(0,Math.floor(Number(upgrades[id]?.level)||0)),nextCost:Number(upgrades[id]?.nextCost)}])),
    crew:Array.isArray(state?.crew)?state.crew:[],
    crewUnlocked:Boolean(state?.crewUnlocked),
    crewHireCost:Number(state?.crewHireCost)||180,
    stats:Object.fromEntries(['highScore','lifetimeCash','cashSpent','totalClicks','totalCollected','totalSold','rareCollected','legendaryCollected','upgradesBought','crewCollected','crewSold'].map(k=>[k,Math.max(0,Math.floor(Number(stats[k])||0))]))
  };
}
function validateOfflineSnapshot(state,uid) {
  if(!state||typeof state!=='object'||state.accountId!==uid)return 'Offline progress does not match the signed-in account.';
  const cash=Number(state.cash),capacity=Number(state.basketCapacity),feedCandy=Number(state.feedCandy||0);
  if(!Number.isSafeInteger(cash)||cash<0||cash>1000000000||!Number.isSafeInteger(capacity)||capacity<1||capacity>500||!Number.isSafeInteger(feedCandy)||feedCandy<0||feedCandy>1000000000)return 'Offline cash, basket capacity, or Candy Reserve is invalid.';
  let basketCount=0;
  for(const candy of CANDY){
    const qty=Number(state.inventory?.[candy.id]||0),lifetime=Number(state.lifetimeCollected?.[candy.id]||0);
    if(!Number.isSafeInteger(qty)||qty<0||qty>500||!Number.isSafeInteger(lifetime)||lifetime<0||lifetime>1000000000)return 'Offline candy inventory is invalid.';
    basketCount+=qty;
  }
  if(basketCount>capacity)return 'Offline basket exceeds its capacity.';
  if(!Array.isArray(state.discovered)||state.discovered.some(id=>!CANDY.some(c=>c.id===id)))return 'Offline Candy Index data is invalid.';
  if(!Array.isArray(state.crew)||state.crew.length>MAX_CREW)return 'Offline crew data is invalid.';
  for(const id of Object.keys(UPGRADE_CONFIG)){const level=Number(state.upgrades?.[id]?.level);if(!Number.isSafeInteger(level)||level<0||level>UPGRADE_CONFIG[id].max)return 'Offline upgrade data is invalid.';}
  for(const key of ['highScore','lifetimeCash','cashSpent','totalClicks','totalCollected','totalSold','rareCollected','legendaryCollected','upgradesBought','crewCollected','crewSold']){
    const value=Number(state.stats?.[key]||0);if(!Number.isSafeInteger(value)||value<0||value>1000000000)return 'Offline statistics are invalid.';
  }
  for(const crew of state.crew){
    if(!crew||typeof crew!=='object'||!crew.id||!Number.isSafeInteger(Number(crew.capacity))||Number(crew.capacity)<1||Number(crew.capacity)>500||!crew.inventory||typeof crew.inventory!=='object')return 'Offline crew data is invalid.';
    for(const candy of CANDY){const qty=Number(crew.inventory[candy.id]||0);if(!Number.isSafeInteger(qty)||qty<0||qty>500)return 'Offline crew inventory is invalid.';}
  }
  return null;
}
function validateOfflineDelta(baseline,local) {
  const before=baseline.stats||{},after=local.stats||{};
  const collectedDelta=Number(after.totalCollected||0)-Number(before.totalCollected||0);
  const lifetimeDelta=CANDY.reduce((sum,c)=>sum+(Number(local.lifetimeCollected?.[c.id]||0)-Number(baseline.lifetimeCollected?.[c.id]||0)),0);
  const soldDelta=Number(after.totalSold||0)-Number(before.totalSold||0);
  const spentDelta=Number(after.cashSpent||0)-Number(before.cashSpent||0);
  const earnedDelta=Number(after.lifetimeCash||0)-Number(before.lifetimeCash||0);
  const held=(state)=>CANDY.reduce((sum,c)=>sum+Number(state.inventory?.[c.id]||0),0)+(state.crew||[]).reduce((sum,crew)=>sum+CANDY.reduce((n,c)=>n+Number(crew.inventory?.[c.id]||0),0),0);
  const expectedSold=held(baseline)+collectedDelta-held(local);
  if(collectedDelta<0||lifetimeDelta!==collectedDelta||soldDelta<0||soldDelta!==expectedSold||spentDelta<0||earnedDelta<0)return 'Offline progress totals do not reconcile. Your saved progress has been kept on this device.';
  if(earnedDelta>soldDelta*24)return 'Offline sale totals exceed the allowed candy values. Your saved progress has been kept on this device.';
  if(Number(local.cash)!==Number(baseline.cash)+earnedDelta-spentDelta)return 'Offline cash does not match recorded sales and purchases. Your saved progress has been kept on this device.';
  if(Number(after.crewSold||0)<Number(before.crewSold||0)||Number(after.crewSold||0)-Number(before.crewSold||0)>soldDelta)return 'Offline crew sale totals are invalid.';
  return null;
}

function fail(status,error){return {status,error};}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'});
  const action=String(req.query?.action || (typeof req.body==='object'&&req.body?.action) || 'state');

  // Lightweight diagnostic endpoint. Never returns account data or secrets.
  if (action === 'health') {
    try {
      await db.ref('/accounts').once('value');
      return res.status(200).json({ ok: true, database: 'reachable', api: 'halloween-haunt' });
    } catch (error) {
      console.error('[Haunt] Health check failed:', error);
      return res.status(503).json({ ok: false, database: 'unavailable', error: 'The game API cannot reach the Mac database. Check Vercel environment variables and the Cloudflare Tunnel.' });
    }
  }

  const now=Date.now(), status=eventStatus(now);
  if(action==='leaderboard') {
    try {
      const root=ensureMeta((await db.ref(ROOT).once('value')).val()||{},now);
      const rankings=Object.values(root.players).map(p=>({accountId:p.uid,displayName:String(p.displayName||'Player').slice(0,40),cash:Math.max(0,Math.floor(Number(p.cash)||0))})).sort((a,b)=>b.cash-a.cash || a.displayName.localeCompare(b.displayName)).slice(0,100);
      return res.status(200).json({rankings,...status});
    } catch(error) { console.error('[Haunt] Public event leaderboard failed:',error); return res.status(503).json({error:'The event leaderboard is temporarily unavailable.'}); }
  }
  let auth;
  try { auth=await authenticate(req); } catch(error) { console.error('[Haunt] Auth/database error:',error); return res.status(503).json({error:'The game API cannot reach the account database. Check the Mac API and Cloudflare Tunnel.'}); }
  if(!auth)return res.status(401).json({error:'Please sign in to play Halloween Haunt.'});
  if(auth.error)return res.status(auth.status).json({error:auth.error});
  try {
    let actionResponse = null;
    const transaction=await db.ref(ROOT).transaction(current=>{
      const root=ensureMeta(current||{},now);
      const account=auth.account;
      const player=normalizePlayer(root.players[auth.uid],auth.uid,account,now);
      root.players[auth.uid]=player;
      let response={state:publicState(player,root,now)};
      const requestId=typeof req.body?.requestId==='string' && /^[a-zA-Z0-9_-]{8,100}$/.test(req.body.requestId) ? req.body.requestId : null;
      player.recentRequests ||= {};
      for (const [id,at] of Object.entries(player.recentRequests)) if (Number(at)<now-2*60*60*1000) delete player.recentRequests[id];
      if(requestId && player.recentRequests[requestId]) { response={state:publicState(player,root,now),replayed:true}; actionResponse=response; return root; }
      const credit=(amount)=>{amount=Math.max(0,Math.floor(amount));player.cash+=amount;player.stats.lifetimeCash+=amount;player.stats.highScore=Math.max(player.stats.highScore,player.cash);return amount;};
      if(action==='offline-sync' || action==='offline-sync-resolve') {
        const resolvingConflict=action==='offline-sync-resolve';
        const baseline=req.body?.baselineState, local=req.body?.localState;
        const invalid=validateOfflineSnapshot(local,auth.uid);
        if(invalid){response={error:invalid,status:400};actionResponse=response;return root;}
        if(!baseline||baseline.accountId!==auth.uid){response={error:'The saved online baseline does not match this account.',status:409};actionResponse=response;return root;}
        if(!resolvingConflict && JSON.stringify(offlineSyncProjection(publicState(player,root,now)))!==JSON.stringify(offlineSyncProjection(baseline))){
          response={error:'Your online game changed since this offline session began. Offline progress remains saved locally to avoid overwriting newer online progress.',status:409};actionResponse=response;return root;
        }
        const deltaError=validateOfflineDelta(baseline,local);
        if(deltaError){response={error:deltaError,status:409};actionResponse=response;return root;}
        player.cash=local.cash;
        player.feedCandy=Math.max(0,Math.floor(Number(local.feedCandy)||0));
        player.inventory=Object.fromEntries(CANDY.map(c=>[c.id,local.inventory[c.id]||0]));
        player.discovered=[...new Set(local.discovered)];
        player.lifetimeCollected=Object.fromEntries(CANDY.map(c=>[c.id,local.lifetimeCollected[c.id]||0]));
        player.basketCapacity=local.basketCapacity;
        player.currentBasketCount=Object.values(player.inventory).reduce((sum,n)=>sum+n,0);
        player.upgrades={};
        for(const [id,cfg] of Object.entries(UPGRADE_CONFIG)){const level=local.upgrades[id].level;player.upgrades[id]={level,nextCost:level>=cfg.max?-1:Math.floor(cfg.baseCost*Math.pow(1.62,level))};}
        player.crew=JSON.parse(JSON.stringify(local.crew));
        player.crewUnlocked=Boolean(local.crewUnlocked);
        player.crewHireCost=Math.max(180,Math.floor(Number(local.crewHireCost)||180));
        player.stats={};
        for(const key of ['highScore','lifetimeCash','cashSpent','totalClicks','totalCollected','totalSold','rareCollected','legendaryCollected','upgradesBought','crewCollected','crewSold'])player.stats[key]=Math.floor(Number(local.stats?.[key])||0);
        player.stats.highScore=Math.max(player.stats.highScore,player.cash);
        player.lastCrewSync=now;
        response={state:publicState(player,root,now),syncedOfflineProgress:true,resolvedConflict:resolvingConflict};
        if(requestId) player.recentRequests[requestId]=now;
        player.updatedAt=now;actionResponse=response;return root;
      } else if(action==='state') { player.updatedAt=now; actionResponse=response; return root; }
      if(action==='crew-pause') {
        player.lastCrewSync=now;
        for(const crew of player.crew||[])crew.lastActionAt=now;
        actionResponse={state:publicState(player,root,now),crewPaused:true};player.updatedAt=now;return root;
      }
      if(status.status!=='active') {
        response.error=status.status==='upcoming'?'Halloween Haunt has not started yet.':'Halloween Haunt has ended. Final standings are locked.';
        response.status=status.status==='upcoming'?425:410;
        actionResponse=response; return root;
      }
      const count=()=>{player.currentBasketCount=Object.values(player.inventory).reduce((a,n)=>a+Math.max(0,Number(n)||0),0);return player.currentBasketCount;};
      if(action==='collect') {
        const clickCount = Math.min(50, Math.max(1, Math.floor(Number(req.body?.clickCount) || 1)));
        const requested = Math.min(MAX_CLICK_RATE, 1 + (player.upgrades.power.level || 0));
        const room = Math.max(0, player.basketCapacity - count());
        if (room <= 0) { response = { state: publicState(player,root,now), collected: 0, basketFull: true }; actionResponse = response; return root; }
        const drops = [];
        for (let i = 0; i < Math.min(requested * clickCount, room); i++) {
          const c=rollCandy(player.upgrades.luck.level||0);
          player.inventory[c.id]=(player.inventory[c.id]||0)+1;
          player.lifetimeCollected[c.id]=(player.lifetimeCollected[c.id]||0)+1;player.feedCandy=Number(player.feedCandy||0)+1;
          player.stats.totalCollected++;
          if(c.rarity==='Rare'||c.rarity==='Epic') player.stats.rareCollected++;
          if(c.rarity==='Legendary') player.stats.legendaryCollected++;
          if(!player.discovered.includes(c.id)) player.discovered.push(c.id);
          drops.push(c.id);
        }
        player.stats.totalClicks += clickCount; count(); response={state:publicState(player,root,now),drops};
      } else if(action==='shops') {
        response={state:publicState(player,root,now)};
      } else if(action==='sell') {
        let earned=0,sold=0,receipts=[];
        for(const candy of CANDY){
          const qty=Math.max(0,Math.floor(player.inventory[candy.id]||0));if(!qty)continue;
          const shop=bestShopFor(candy.id,root.meta.offers);
          const unit=root.meta.offers[shop.id][candy.id],subtotal=unit*qty;
          earned+=subtotal;sold+=qty;receipts.push({candyId:candy.id,quantity:qty,shopId:shop.id,unitPrice:unit,total:subtotal,source:'basket'});
          player.inventory[candy.id]=0;
        }
        if(!sold){response={state:publicState(player,root,now),earned:0,sold:0,receipts:[],nothingToSell:true};actionResponse=response;return root;}
        credit(earned);player.stats.totalSold+=sold;count();response={state:publicState(player,root,now),earned,sold,receipts};
      } else if(action==='upgrade') {
        const type=String(req.body?.type||'');const cfg=UPGRADE_CONFIG[type],u=player.upgrades[type];
        if(!cfg||!u){response={error:'Unknown upgrade.',status:400};actionResponse=response; return root;}
        if(u.level>=cfg.max){response={error:'This upgrade is already maxed.',status:409};actionResponse=response; return root;}
        const cost=Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(player.cash<cost){response={error:'Not enough cash for this upgrade.',status:409};actionResponse=response; return root;}
        player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;u.level++;
        u.nextCost=u.level>=cfg.max?-1:Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(type==='capacity')player.basketCapacity=Math.min(500,player.basketCapacity+10);
        response={state:publicState(player,root,now),purchased:type,cost};
      } else if(action==='crew-action') {
        const act=String(req.body?.crewAction||req.body?.actionType||req.body?.action||'');const idx=Number.isInteger(req.body?.index)?req.body.index:-1;
        if(act==='hire'){
          if(player.crew.length>=MAX_CREW){response={error:'Your crew is already at maximum size.',status:409};actionResponse=response; return root;}
          if(player.cash<player.crewHireCost){response={error:'Not enough cash to hire a helper.',status:409};actionResponse=response; return root;}
          const cost=player.crewHireCost;player.cash-=cost;player.stats.cashSpent+=cost;player.crewUnlocked=true;
          player.crew.push({id:'helper-'+(player.crew.length+1),name:CREW_NAMES[player.crew.length]||('Worker '+(player.crew.length+1)),speedLevel:0,capacityLevel:0,powerLevel:0,luckLevel:0,awakeLevel:0,inventory:{},inventoryCount:0,capacity:50,intervalMs:2000,asleep:false,awakeMs:0,fedUntil:0,lastActionAt:now,workMs:0,collectedCount:0,moneyEarned:0});
          player.crewHireCost=Math.floor(player.crewHireCost*1.85);response={state:publicState(player,root,now),hired:true,cost};
        } else {
          const crew=player.crew[idx];if(!crew){response={error:'Invalid crew member.',status:400};actionResponse=response; return root;}
          if(act==='wake'){crew.asleep=false;crew.awakeMs=0;crew.lastActionAt=now;response={state:publicState(player,root,now),woke:true};}else if(act==='feed'){const need=Math.max(1,Number(player.basketCapacity||50)*10),held=Number(player.feedCandy||0);if(Number(crew.fedUntil||0)>now){response={error:'This crew member is already fed.',status:409};actionResponse=response;return root;}if(held<need){response={error:'Not enough candy in your Candy Reserve. Collect more candy first.',status:409};actionResponse=response;return root;}player.feedCandy=Math.max(0,held-need);crew.fedUntil=now+1200000;crew.asleep=false;crew.awakeMs=0;response={state:publicState(player,root,now),fed:true};}else{const cfgs={upgrade_capacity:['capacityLevel',65,1.65],upgrade_power:['powerLevel',80,1.65],upgrade_luck:['luckLevel',95,1.65],upgrade_speed:['speedLevel',75,1.7],upgrade_awake:['awakeLevel',100,1.8],upgrade_cap:['capacityLevel',65,1.65]},cfg=cfgs[act];if(!cfg){response={error:'Unknown crew action.',status:400};actionResponse=response;return root;}const [key,base,mult]=cfg,cost=Math.floor(base*Math.pow(mult,Number(crew[key]||0)));if(player.cash<cost){response={error:'Not enough cash.',status:409};actionResponse=response;return root;}player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;crew[key]=Number(crew[key]||0)+1;if(key==='capacityLevel')crew.capacity=Math.min(500,50+crew.capacityLevel*10);response={state:publicState(player,root,now),cost};}
        }
      } else if(action==='crew-sync') {
        const elapsed=Math.min(20000,Math.max(0,now-(player.lastCrewSync||now)));player.lastCrewSync=now;if(elapsed>0&&player.crew.length){for(const crew of player.crew){crew.asleep=!!crew.asleep;crew.awakeMs=Number(crew.awakeMs||0);crew.fedUntil=Number(crew.fedUntil||0);if(crew.asleep)continue;const fed=crew.fedUntil>now;if(!fed)crew.awakeMs+=elapsed;crew.lastActionAt=now;if(!fed&&crew.awakeMs>=300000+Number(crew.awakeLevel||0)*60000){crew.asleep=true;continue;}const effectiveCapacity=Math.max(1,Math.floor(Number(crew.capacity||10)*(fed?1.25:1)));const workInterval=Math.max(500,Number(crew.intervalMs||2000)*(fed?.75:1));crew.workMs=Number(crew.workMs||0)+elapsed;const ticks=Math.min(10,Math.floor(crew.workMs/workInterval));crew.workMs-=ticks*workInterval;for(let n=0;n<ticks;n++){const held=Object.values(crew.inventory||{}).reduce((x,y)=>x+(Number(y)||0),0);if(held>=effectiveCapacity)break;const c=rollCandy(Math.floor((Number(player.upgrades.luck.level||0)+Number(crew.luckLevel||0))*(fed?1.25:1)));crew.inventory||={};const basePower=Math.min(8,1+Number(crew.powerLevel||0));const power=Math.min(effectiveCapacity-held,basePower+(fed?Math.max(1,Math.ceil(basePower*.25)):0));for(let k=0;k<power;k++)crew.inventory[c.id]=(crew.inventory[c.id]||0)+1;crew.inventoryCount=held+power;player.stats.crewCollected+=power;crew.collectedCount=Number(crew.collectedCount||0)+power;player.feedCandy=Number(player.feedCandy||0)+power;player.stats.totalCollected+=power;player.lifetimeCollected[c.id]=(player.lifetimeCollected[c.id]||0)+power;if(!player.discovered.includes(c.id))player.discovered.push(c.id);if(c.rarity==='Rare'||c.rarity==='Epic')player.stats.rareCollected+=power;if(c.rarity==='Legendary')player.stats.legendaryCollected+=power;count();}if(crew.inventoryCount>=effectiveCapacity&&!crew.sellReadyAt)crew.sellReadyAt=now+Math.max(4000,20000-2000*Number(crew.speedLevel||0))*(fed?.75:1);if(crew.sellReadyAt&&now>=crew.sellReadyAt&&crew.inventoryCount>0){let earned=0,sold=0;for(const [id,qty] of Object.entries(crew.inventory)){const q=Math.max(0,Math.floor(qty||0));if(!q)continue;const shop=bestShopFor(id,root.meta.offers);earned+=q*root.meta.offers[shop.id][id];sold+=q;crew.inventory[id]=0;}if(earned){credit(earned);crew.moneyEarned=Number(crew.moneyEarned||0)+earned;player.stats.crewSold+=sold;player.stats.totalSold+=sold;crew.inventoryCount=0;crew.sellReadyAt=0;}}}}
        response={state:publicState(player,root,now),crewCollected:player.stats.crewCollected};
      } else {
        response={error:'Unknown Halloween Haunt action.',status:404};
      }
      if(requestId && !response.error) player.recentRequests[requestId]=now;
      player.updatedAt=now;actionResponse=response; return root;
    });
    const result=transaction.snapshot?.val();
    if (!transaction.committed) return res.status(503).json({error:'Could not commit your progress. Please retry.'});
    if (!actionResponse) {
      const root=ensureMeta(result||{},Date.now());
      const player=normalizePlayer(root.players[auth.uid],auth.uid,auth.account,Date.now());
      actionResponse={state:publicState(player,root,Date.now())};
    }
    if (actionResponse.error) return res.status(actionResponse.status || 400).json({error:actionResponse.error});
    return res.status(200).json(actionResponse);
  } catch(error) {
    console.error('[Haunt] Request failed:',error);
    return res.status(500).json({error:'Halloween Haunt could not save your progress. Please try again.'});
  }
}
