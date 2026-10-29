/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Halloween Haunt authoritative event API.
 * All economy changes are server-calculated and committed through the Mac DB CAS transaction.
 */
import { db, requestMacApi } from './db.js';
import { legalAcceptanceRequired } from './legal-policy.js';

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
  {id:'pharmacy',name:'Moonlight Pharmacy',multiplier:1.05},
  {id:'diner',name:'Witchlight Diner',multiplier:1.18},
  {id:'bazaar',name:'Graveyard Bazaar',multiplier:1.25}
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
    crew:[], crewUnlocked:false, crewHireCost:180, lastCrewSync:now, soulShards:0, phase2:{shopLevels:{corner:0,market:0,arcade:0,pharmacy:0},managerLevel:0,shardUpgrades:{luck:0,fortune:0},gambleUnlocked:false},
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
  p.soulShards=Math.max(0,Math.min(1000000000,Math.floor(Number(p.soulShards)||0)));p.phase2 ||= {};p.phase2.shopLevels ||= {};p.phase2.shardUpgrades ||= {};p.phase2.gambleUnlocked=!!p.phase2.gambleUnlocked;p.phase2.managerLevel=Math.max(0,Math.min(1,Math.floor(Number(p.phase2.managerLevel)||0)));for(const shop of SHOPS)p.phase2.shopLevels[shop.id]=Math.max(0,Math.min(5,Math.floor(Number(p.phase2.shopLevels[shop.id])||0)));for(const key of ['luck','fortune'])p.phase2.shardUpgrades[key]=Math.max(0,Math.min(10,Math.floor(Number(p.phase2.shardUpgrades[key])||0))); p.crew ||= []; for(let i=0;i<p.crew.length;i++){const w=p.crew[i];w.name=w.name||CREW_NAMES[i]||('Worker '+(i+1));w.capacityLevel=Number(w.capacityLevel||0);w.powerLevel=Number(w.powerLevel||0);w.luckLevel=Number(w.luckLevel||0);w.awakeLevel=Number(w.awakeLevel||0);w.speedLevel=Number(w.speedLevel||0);w.capacity=Number(w.capacity||50);if(w.capacityLevel===0&&w.capacity<=10)w.capacity=50;w.intervalMs=2000;w.workMs=Number(w.workMs||0);w.inventory||={};w.inventoryCount=Object.values(w.inventory).reduce((n,q)=>n+Math.max(0,Number(q)||0),0);w.fedUntil=Number(w.fedUntil||0);w.awakeMs=Number(w.awakeMs||0);w.collectedCount=Number(w.collectedCount||0);w.moneyEarned=Number(w.moneyEarned||0);} p.stats ||= {};
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
  for(const c of CANDY) bestPrices[c.id]=Math.max(...SHOPS.map(s=>shopPrice(s,c.id,offers,p)));
  return {
    ...eventStatus(now), accountId:p.uid, displayName:p.displayName, cash:p.cash,
    inventory:{...p.inventory}, discovered:[...p.discovered], lifetimeCollected:{...p.lifetimeCollected}, feedCandy:Math.max(0,Math.floor(Number(p.feedCandy)||0)),
    currentBasketCount:p.currentBasketCount,basketCapacity:p.basketCapacity,
    upgrades:JSON.parse(JSON.stringify(p.upgrades)),crew:JSON.parse(JSON.stringify(p.crew)),
    crewUnlocked:p.crewUnlocked,crewHireCost:p.crewHireCost, soulShards:Number(p.soulShards||0),phase2:JSON.parse(JSON.stringify(p.phase2||{shopLevels:{},managerLevel:0,shardUpgrades:{},gambleUnlocked:false})),stats:{...p.stats},
    candyCatalog:CANDY.map(c=>({...c,bestPrice:bestPrices[c.id]})),
    shops:SHOPS.map(shop=>({id:shop.id,name:shop.name,prices:Object.fromEntries(CANDY.map(c=>[c.id,shopPrice(shop,c.id,offers,p)]))})),
    offerWindow:root.meta.offerWindow,offerRefreshAt:root.meta.offerWindow+ROTATION_MS,
    crewAutoSell:!!p.upgrades.autoSell.level
  };
}
async function authenticate(req) {
  const sessionId = req.headers['x-session-id'];
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 300) return null;

  // Ask the Mac API's in-memory session index for one session decision.
  // Never download or scan the full /accounts collection for a game request.
  const result = await requestMacApi(
    'GET',
    '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId)
  );
  if (!result?.authenticated || !result.uid || !result.account) return null;

  const deviceId = req.headers['x-device-id'];
  if (typeof deviceId === 'string' && deviceId) {
    const safeDeviceId = deviceId.replace(/[.#$\[\]/]/g, '_');
    const ban = (await db.ref('/banned_devices/' + safeDeviceId).once('value')).val();
    if (ban && (!ban.ban_expires || Number(ban.ban_expires) > Date.now())) {
      return { error: 'This device is banned.', status: 403 };
    }
  }

  return { uid: result.uid, account: result.account };
}

function sanitizeImportedPlayer(input, uid, account, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid save state.');
  const player = newPlayer(uid, account, now);
  const cap = (value, max=1000000000) => Math.max(0, Math.min(max, Math.floor(Number(value)||0)));
  player.cash = cap(input.cash);
  player.displayName = String(account.displayName || account.username || input.displayName || 'Player').slice(0,40);
  for (const candy of CANDY) {
    player.inventory[candy.id] = cap(input.inventory?.[candy.id], 1000000);
    player.lifetimeCollected[candy.id] = cap(input.lifetimeCollected?.[candy.id], 1000000000);
  }
  player.discovered = [...new Set(Array.isArray(input.discovered) ? input.discovered.filter(id => CANDY.some(c => c.id === id)) : [])];
  player.feedCandy = cap(input.feedCandy, 1000000000); player.soulShards=cap(input.soulShards,1000000000); player.phase2={shopLevels:{},managerLevel:Math.min(1,cap(input.phase2?.managerLevel,1)),gambleUnlocked:Boolean(input.phase2?.gambleUnlocked),shardUpgrades:{luck:Math.min(10,cap(input.phase2?.shardUpgrades?.luck,10)),fortune:Math.min(10,cap(input.phase2?.shardUpgrades?.fortune,10))}}; for(const shop of SHOPS)player.phase2.shopLevels[shop.id]=Math.min(5,cap(input.phase2?.shopLevels?.[shop.id],5));
  player.basketCapacity = Math.max(1, Math.min(500, cap(input.basketCapacity, 500) || 50));
  for (const [key,cfg] of Object.entries(UPGRADE_CONFIG)) {
    const level = Math.min(cfg.max, cap(input.upgrades?.[key]?.level, cfg.max));
    player.upgrades[key] = {level,nextCost:level>=cfg.max?-1:Math.floor(cfg.baseCost*Math.pow(1.62,level))};
  }
  const statDefaults = player.stats;
  for (const key of Object.keys(statDefaults)) player.stats[key] = cap(input.stats?.[key], 1000000000000);
  player.stats.highScore = Math.max(player.stats.highScore, player.cash);
  player.crewUnlocked = Boolean(input.crewUnlocked);
  player.crewHireCost = Math.max(180, Math.min(1000000000, cap(input.crewHireCost,1000000000)||180));
  player.crew = Array.isArray(input.crew) ? input.crew.slice(0,MAX_CREW).map((worker,index) => {
    const inventory={};
    for(const candy of CANDY) inventory[candy.id]=cap(worker?.inventory?.[candy.id],1000000);
    return {
      id:'helper-'+(index+1),name:String(worker?.name||CREW_NAMES[index]||('Worker '+(index+1))).slice(0,40),
      speedLevel:Math.min(20,cap(worker?.speedLevel,20)),capacityLevel:Math.min(30,cap(worker?.capacityLevel,30)),
      powerLevel:Math.min(20,cap(worker?.powerLevel,20)),luckLevel:Math.min(15,cap(worker?.luckLevel,15)),
      awakeLevel:Math.min(20,cap(worker?.awakeLevel,20)),capacity:Math.min(500,Math.max(10,cap(worker?.capacity,500)||50)),
      intervalMs:2000,asleep:Boolean(worker?.asleep),awakeMs:cap(worker?.awakeMs),fedUntil:0,lastActionAt:now,workMs:cap(worker?.workMs),
      inventory,inventoryCount:Object.values(inventory).reduce((sum,q)=>sum+q,0),collectedCount:cap(worker?.collectedCount),moneyEarned:cap(worker?.moneyEarned)
    };
  }) : [];
  player.crewUnlocked = player.crewUnlocked || player.crew.length>0;
  player.stats.lifetimeCash = cap(input.stats?.lifetimeCash,1000000000000);
  player.updatedAt=now;
  player.currentBasketCount=Object.values(player.inventory).reduce((sum,q)=>sum+q,0);
  return player;
}
function rollCandy(luckLevel) {
  const luckFactor=1+Math.min(14,luckLevel)*0.055;
  const weighted=CANDY.map(c=>({c,w:c.weight*(c.rarity==='Common'?1:luckFactor)}));
  const total=weighted.reduce((s,x)=>s+x.w,0); let r=Math.random()*total;
  for(const item of weighted){r-=item.w;if(r<=0)return item.c;}
  return CANDY[0];
}
function shopPrice(shop,candyId,offers,player){const level=Math.max(0,Math.min(5,Number(player?.phase2?.shopLevels?.[shop.id]||0)));const shardLuck=Number(player?.phase2?.shardUpgrades?.fortune||0);return Math.max(1,Math.round(Number(offers[shop.id][candyId]||1)*(1+level*.12+shardLuck*.015)));}
function bestShopFor(candyId, offers, player) {
  return SHOPS.reduce((best,s)=>shopPrice(s,candyId,offers,player)>shopPrice(best,candyId,offers,player)?s:best,SHOPS[0]);
}

function fail(status,error){return {status,error};}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'});
  const action=String(req.query?.action || (typeof req.body==='object'&&req.body?.action) || 'state');

  // One browser request can flush a queue of locally processed actions.
  // Each command still passes through the normal server-side validation and
  // idempotency checks; the client never submits a trusted cash/inventory save.
  if (action === 'sync') {
    const queued = req.body?.actions;
    if (!Array.isArray(queued) || queued.length < 1 || queued.length > 20) {
      return res.status(400).json({ error: 'Invalid sync batch.' });
    }
    const allowed = new Set(['collect', 'sell', 'upgrade', 'phase2', 'crew-action', 'crew-sync', 'crew-pause']);
    let batchAuth;
    try {
      batchAuth = await authenticate(req);
    } catch (error) {
      console.error('[Haunt] Batch authentication failed:', error);
      return res.status(503).json({ error: 'The game server could not verify your session. Your queued actions have not been discarded.' });
    }
    if (!batchAuth) return res.status(401).json({ error: 'Please sign in to play Halloween Haunt.' });
    if (batchAuth.error) return res.status(batchAuth.status).json({ error: batchAuth.error });

    const results = [];
    let latestState = null;

    for (const item of queued) {
      const queuedAction = String(item?.action || '');
      if (!allowed.has(queuedAction) || !item?.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)) {
        return res.status(400).json({ error: 'The sync batch contains an invalid action.' });
      }

      const innerResponse = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader() { return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
      };
      await handler({
        method: 'POST',
        headers: req.headers,
        query: { action: queuedAction },
        body: item.payload,
        _batchAuth: batchAuth
      }, innerResponse);

      results.push({ action: queuedAction, requestId: item.payload.requestId || null, status: innerResponse.statusCode, result: innerResponse.body });
      if (innerResponse.body?.state) latestState = innerResponse.body.state;

      // Authentication or infrastructure failures may mean the rest of the
      // batch was not safely processed. Keep the batch retryable via request IDs.
      if (innerResponse.statusCode === 401 || innerResponse.statusCode === 403 || innerResponse.statusCode >= 500) {
        return res.status(innerResponse.statusCode).json({
          error: innerResponse.body?.error || 'The sync batch could not be completed.',
          results,
          state: latestState
        });
      }
    }

    return res.status(200).json({ ok: true, results, state: latestState });
  }

  // Lightweight diagnostic endpoint. Never returns account data or secrets.
  if (action === 'health') {
    try {
      // Touch a small event metadata path instead of downloading all account data.
      await requestMacApi('GET', '/v1/db?path=' + encodeURIComponent(ROOT + '/meta/offerWindow'));
      return res.status(200).json({ ok: true, database: 'reachable', api: 'halloween-haunt' });
    } catch (error) {
      console.error('[Haunt] Health check failed:', error);
      return res.status(503).json({ ok: false, database: 'unavailable', error: 'The game API cannot reach the Mac database API. Check its configuration and network connection.' });
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
  const authStartedAt = Date.now();
  let auth;
  try {
    auth = req._batchAuth || await authenticate(req);
  } catch (error) {
    res.setHeader('Server-Timing', 'auth;dur=' + (Date.now() - authStartedAt));
    console.error('[Haunt] Auth/database error:', error);
    return res.status(503).json({ error: 'The game API cannot reach the Mac database API. Check its configuration and network connection.' });
  }
  const authDurationMs = Date.now() - authStartedAt;
  if (!auth) {
    res.setHeader('Server-Timing', 'auth;dur=' + authDurationMs);
    return res.status(401).json({ error: 'Please sign in to play Halloween Haunt.' });
  }
  if (auth.error) {
    res.setHeader('Server-Timing', 'auth;dur=' + authDurationMs);
    return res.status(auth.status).json({ error: auth.error });
  }
  try {
    let actionResponse = null;
    const transactionStartedAt = Date.now();
    const playerPath = ROOT + '/players/' + auth.uid;
    const transaction=await db.ref(playerPath).transaction(currentPlayer=>{
      // Offers are deterministic for the current five-minute window, so player actions
      // do not need to read or compare-and-set the entire event and every other player.
      const root=ensureMeta({meta:{},players:{[auth.uid]:currentPlayer}},now);
      const account=auth.account;
      const player=normalizePlayer(root.players[auth.uid],auth.uid,account,now);
      root.players[auth.uid]=player;
      let response={state:publicState(player,root,now)};
      const requestId=typeof req.body?.requestId==='string' && /^[a-zA-Z0-9_-]{8,100}$/.test(req.body.requestId) ? req.body.requestId : null;
      player.recentRequests ||= {};
      for (const [id,at] of Object.entries(player.recentRequests)) if (Number(at)<now-2*60*60*1000) delete player.recentRequests[id];
      if(requestId && player.recentRequests[requestId]) { response={state:publicState(player,root,now),replayed:true}; actionResponse=response; return root.players[auth.uid]; }
      const credit=(amount)=>{amount=Math.max(0,Math.floor(amount));player.cash+=amount;player.stats.lifetimeCash+=amount;player.stats.highScore=Math.max(player.stats.highScore,player.cash);return amount;};
      if(action==='state') { player.updatedAt=now; actionResponse=response; return root.players[auth.uid]; }
      if(action==='import-save') {
        try {
          root.players[auth.uid]=sanitizeImportedPlayer(req.body?.saveState,auth.uid,account,now);
          actionResponse={state:publicState(root.players[auth.uid],root,now),imported:true};
          return root.players[auth.uid];
        } catch(error) {
          actionResponse={error:'Save file data is invalid or unsupported.',status:400};
          return root.players[auth.uid];
        }
      }
      if(action==='crew-pause') {
        player.lastCrewSync=now;
        for(const crew of player.crew||[])crew.lastActionAt=now;
        actionResponse={state:publicState(player,root,now),crewPaused:true};player.updatedAt=now;return root.players[auth.uid];
      }
      if(status.status!=='active') {
        response.error=status.status==='upcoming'?'Halloween Haunt has not started yet.':'Halloween Haunt has ended. Final standings are locked.';
        response.status=status.status==='upcoming'?425:410;
        actionResponse=response; return root.players[auth.uid];
      }
      const count=()=>{player.currentBasketCount=Object.values(player.inventory).reduce((a,n)=>a+Math.max(0,Number(n)||0),0);return player.currentBasketCount;};
      if(action==='collect') {
        const clickCount = Math.min(50, Math.max(1, Math.floor(Number(req.body?.clickCount) || 1)));
        const requested = Math.min(MAX_CLICK_RATE, 1 + (player.upgrades.power.level || 0));
        const room = Math.max(0, player.basketCapacity - count());
        if (room <= 0) { response = { state: publicState(player,root,now), collected: 0, basketFull: true }; actionResponse = response; return root.players[auth.uid]; }
        const drops = [];
        for (let i = 0; i < Math.min(requested * clickCount, room); i++) {
          const c=rollCandy((player.upgrades.luck.level||0)+Number(player.phase2?.shardUpgrades?.luck||0)*2);
          if(Math.random() < Math.min(.08,.003+Number(player.phase2?.shardUpgrades?.fortune||0)*.002+(c.rarity==='Legendary'?.012:c.rarity==='Epic'?.004:0))) player.soulShards=Number(player.soulShards||0)+1;
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
        const requestedShopId=String(req.body?.shopId||'');
        const selectedShop=requestedShopId?SHOPS.find(shop=>shop.id===requestedShopId):null;
        if(requestedShopId&&!selectedShop){response={error:'Choose a valid shop before selling.',status:400};actionResponse=response;return root.players[auth.uid];}
        for(const candy of CANDY){
          const qty=Math.max(0,Math.floor(player.inventory[candy.id]||0));if(!qty)continue;
          const shop=selectedShop||bestShopFor(candy.id,root.meta.offers,player);
          const unit=shopPrice(shop,candy.id,root.meta.offers,player),subtotal=unit*qty;
          earned+=subtotal;sold+=qty;receipts.push({candyId:candy.id,quantity:qty,shopId:shop.id,unitPrice:unit,total:subtotal,source:'basket'});
          player.inventory[candy.id]=0;
        }
        if(!sold){response={state:publicState(player,root,now),earned:0,sold:0,receipts:[],nothingToSell:true};actionResponse=response;return root.players[auth.uid];}
        credit(earned);player.stats.totalSold+=sold;count();response={state:publicState(player,root,now),earned,sold,receipts};
      } else if(action==='upgrade') {
        const type=String(req.body?.type||'');const cfg=UPGRADE_CONFIG[type],u=player.upgrades[type];
        if(!cfg||!u){response={error:'Unknown upgrade.',status:400};actionResponse=response; return root.players[auth.uid];}
        if(u.level>=cfg.max){response={error:'This upgrade is already maxed.',status:409};actionResponse=response; return root.players[auth.uid];}
        const cost=Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(player.cash<cost){response={error:'Not enough cash for this upgrade.',status:409};actionResponse=response; return root.players[auth.uid];}
        player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;u.level++;
        u.nextCost=u.level>=cfg.max?-1:Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(type==='capacity')player.basketCapacity=Math.min(500,player.basketCapacity+10);
        response={state:publicState(player,root,now),purchased:type,cost};
      } else if(action==='crew-action') {
        const act=String(req.body?.crewAction||req.body?.actionType||req.body?.action||'');const idx=Number.isInteger(req.body?.index)?req.body.index:-1;
        if(act==='hire'){
          if(player.crew.length>=MAX_CREW){response={error:'Your crew is already at maximum size.',status:409};actionResponse=response; return root.players[auth.uid];}
          if(player.cash<player.crewHireCost){response={error:'Not enough cash to hire a helper.',status:409};actionResponse=response; return root.players[auth.uid];}
          const cost=player.crewHireCost;player.cash-=cost;player.stats.cashSpent+=cost;player.crewUnlocked=true;
          player.crew.push({id:'helper-'+(player.crew.length+1),name:CREW_NAMES[player.crew.length]||('Worker '+(player.crew.length+1)),speedLevel:0,capacityLevel:0,powerLevel:0,luckLevel:0,awakeLevel:0,inventory:{},inventoryCount:0,capacity:50,intervalMs:2000,asleep:false,awakeMs:0,fedUntil:0,lastActionAt:now,workMs:0,collectedCount:0,moneyEarned:0});
          player.crewHireCost=Math.floor(player.crewHireCost*1.85);response={state:publicState(player,root,now),hired:true,cost};
        } else {
          const crew=player.crew[idx];if(!crew){response={error:'Invalid crew member.',status:400};actionResponse=response; return root.players[auth.uid];}
          if(act==='wake'){crew.asleep=false;crew.awakeMs=0;crew.lastActionAt=now;response={state:publicState(player,root,now),woke:true};}else if(act==='feed'){const need=Math.max(1,Number(player.basketCapacity||50)*10),held=Number(player.feedCandy||0);if(Number(crew.fedUntil||0)>now){response={error:'This crew member is already fed.',status:409};actionResponse=response;return root.players[auth.uid];}if(held<need){response={error:'Not enough candy in your Candy Reserve. Collect more candy first.',status:409};actionResponse=response;return root.players[auth.uid];}player.feedCandy=Math.max(0,held-need);crew.fedUntil=now+1200000;crew.asleep=false;crew.awakeMs=0;response={state:publicState(player,root,now),fed:true};}else{const cfgs={upgrade_capacity:['capacityLevel',65,1.65],upgrade_power:['powerLevel',80,1.65],upgrade_luck:['luckLevel',95,1.65],upgrade_speed:['speedLevel',75,1.7],upgrade_awake:['awakeLevel',100,1.8],upgrade_cap:['capacityLevel',65,1.65]},cfg=cfgs[act];if(!cfg){response={error:'Unknown crew action.',status:400};actionResponse=response;return root.players[auth.uid];}const [key,base,mult]=cfg,cost=Math.floor(base*Math.pow(mult,Number(crew[key]||0)));if(player.cash<cost){response={error:'Not enough cash.',status:409};actionResponse=response;return root.players[auth.uid];}player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;crew[key]=Number(crew[key]||0)+1;if(key==='capacityLevel')crew.capacity=Math.min(500,50+crew.capacityLevel*10);response={state:publicState(player,root,now),cost};}
        }
      } else if(action==='phase2') {
        const type=String(req.body?.type||'');
        player.phase2 ||= {shopLevels:{},managerLevel:0,shardUpgrades:{luck:0,fortune:0}};
        player.phase2.shopLevels ||= {};player.phase2.shardUpgrades ||= {};
        let cost=0;
        if(type==='shop-upgrade'){
          const id=String(req.body?.shopId||'');const shop=SHOPS.find(x=>x.id===id);
          if(!shop){response={error:'Unknown shop.',status:400};actionResponse=response;return root.players[auth.uid];}
          const level=Math.min(5,Math.max(0,Number(player.phase2.shopLevels[id]||0)));
          if(level>=5){response={error:'This shop is fully upgraded.',status:409};actionResponse=response;return root.players[auth.uid];}
          cost=[50000,75000,110000,160000,230000][level];
          if(player.cash<cost){response={error:'Not enough cash for this shop upgrade.',status:409};actionResponse=response;return root.players[auth.uid];}
          player.cash-=cost;player.stats.cashSpent+=cost;player.phase2.shopLevels[id]=level+1;
        } else if(type==='gamble-unlock'){
          if(player.phase2.gambleUnlocked){response={error:'Gambling is already unlocked.',status:409};actionResponse=response;return root.players[auth.uid];}
          cost=10000;if(player.cash<cost){response={error:'You need $10,000 to unlock gambling.',status:409};actionResponse=response;return root.players[auth.uid];}
          player.cash-=cost;player.stats.cashSpent+=cost;player.phase2.gambleUnlocked=true;
        } else if(type==='shard-upgrade'){
          const id=String(req.body?.upgradeId||'');const config={luck:{base:3,label:'Shard Luck'},fortune:{base:5,label:'Shard Fortune'}}[id];
          if(!config){response={error:'Unknown Soul Shard upgrade.',status:400};actionResponse=response;return root.players[auth.uid];}
          const level=Math.min(10,Math.max(0,Number(player.phase2.shardUpgrades[id]||0)));
          if(level>=10){response={error:'This Soul Shard upgrade is maxed.',status:409};actionResponse=response;return root.players[auth.uid];}
          cost=config.base+level*2;if(player.soulShards<cost){response={error:'Not enough Soul Shards.',status:409};actionResponse=response;return root.players[auth.uid];}
          player.soulShards-=cost;player.phase2.shardUpgrades[id]=level+1;
        } else if(type==='comeback-wheel'){
          if(Number(player.cash)>=100000){response={error:'The Comeback Wheel is only for players under $100,000.',status:409};actionResponse=response;return root.players[auth.uid];}
          if(player.phase2.comebackWheelClaimed){response={error:'You already claimed your Comeback Wheel spin.',status:409};actionResponse=response;return root.players[auth.uid];}
          const payout=(1+Math.floor(Math.random()*8))*10000;player.phase2.comebackWheelClaimed=true;player.cash+=payout;player.stats.lifetimeCash+=payout;response={state:publicState(player,root,now),comebackWheel:{payout}};
        } else if(type==='gamble'){
          const wager=Math.floor(Number(req.body?.wager)||0);
          if(!player.phase2.gambleUnlocked){response={error:'Unlock gambling for $10,000 first.',status:409};actionResponse=response;return root.players[auth.uid];}
          const minimumWager=Math.max(10000,Math.ceil(Number(player.cash||0)*0.15));
          if(wager<minimumWager||wager>player.cash){response={error:'Wager is below the required minimum or exceeds your available cash.',status:409};actionResponse=response;return root.players[auth.uid];}
          player.cash-=wager;player.stats.cashSpent+=wager;
          const roll=Math.random();
          const won=roll<0.22;const jackpot=roll<0.025;
          const payout=won?(jackpot?wager*8:wager*2):0;
          if(payout)credit(payout);
          response={state:publicState(player,root,now),gamble:{won,jackpot,payout,wager}};
        } else {response={error:'Unknown Phase 2 action.',status:400};actionResponse=response;return root.players[auth.uid];}
        if(cost){player.stats.upgradesBought++;response={state:publicState(player,root,now),purchased:type,cost};}
      } else if(action==='crew-sync') {
        const elapsed=Math.min(20000,Math.max(0,now-(player.lastCrewSync||now)));player.lastCrewSync=now;if(elapsed>0&&player.crew.length){for(const crew of player.crew){crew.asleep=!!crew.asleep;crew.awakeMs=Number(crew.awakeMs||0);crew.fedUntil=Number(crew.fedUntil||0);if(crew.asleep)continue;const fed=crew.fedUntil>now;if(!fed)crew.awakeMs+=elapsed;crew.lastActionAt=now;if(!fed&&crew.awakeMs>=300000+Number(crew.awakeLevel||0)*60000){crew.asleep=true;continue;}const effectiveCapacity=Math.max(1,Math.floor(Number(crew.capacity||10)*(fed?1.25:1)));const workInterval=Math.max(500,Number(crew.intervalMs||2000)*(fed?.75:1));crew.workMs=Number(crew.workMs||0)+elapsed;const ticks=Math.min(10,Math.floor(crew.workMs/workInterval));crew.workMs-=ticks*workInterval;for(let n=0;n<ticks;n++){const held=Object.values(crew.inventory||{}).reduce((x,y)=>x+(Number(y)||0),0);if(held>=effectiveCapacity)break;const c=rollCandy(Math.floor((Number(player.upgrades.luck.level||0)+Number(crew.luckLevel||0)+Number(player.phase2?.shardUpgrades?.luck||0)*2)*(fed?1.25:1)));if(Math.random()<Math.min(.08,.003+Number(player.phase2?.shardUpgrades?.fortune||0)*.002+(c.rarity==='Legendary'?.012:c.rarity==='Epic'?.004:0)))player.soulShards=Number(player.soulShards||0)+1;crew.inventory||={};const basePower=Math.min(8,1+Number(crew.powerLevel||0));const power=Math.min(effectiveCapacity-held,basePower+(fed?Math.max(1,Math.ceil(basePower*.25)):0));for(let k=0;k<power;k++)crew.inventory[c.id]=(crew.inventory[c.id]||0)+1;crew.inventoryCount=held+power;player.stats.crewCollected+=power;crew.collectedCount=Number(crew.collectedCount||0)+power;player.feedCandy=Number(player.feedCandy||0)+power;player.stats.totalCollected+=power;player.lifetimeCollected[c.id]=(player.lifetimeCollected[c.id]||0)+power;if(!player.discovered.includes(c.id))player.discovered.push(c.id);if(c.rarity==='Rare'||c.rarity==='Epic')player.stats.rareCollected+=power;if(c.rarity==='Legendary')player.stats.legendaryCollected+=power;count();}if(crew.inventoryCount>=effectiveCapacity&&!crew.sellReadyAt)crew.sellReadyAt=now+Math.max(4000,20000-2000*Number(crew.speedLevel||0))*(fed?.75:1);if(crew.sellReadyAt&&now>=crew.sellReadyAt&&crew.inventoryCount>0){let earned=0,sold=0;for(const [id,qty] of Object.entries(crew.inventory)){const q=Math.max(0,Math.floor(qty||0));if(!q)continue;const shop=bestShopFor(id,root.meta.offers,player);earned+=q*shopPrice(shop,id,root.meta.offers,player);sold+=q;crew.inventory[id]=0;}if(earned){credit(earned);crew.moneyEarned=Number(crew.moneyEarned||0)+earned;player.stats.crewSold+=sold;player.stats.totalSold+=sold;crew.inventoryCount=0;crew.sellReadyAt=0;}}}}
        response={state:publicState(player,root,now),crewCollected:player.stats.crewCollected};
      } else {
        response={error:'Unknown Halloween Haunt action.',status:404};
      }
      if(requestId && !response.error) player.recentRequests[requestId]=now;
      player.updatedAt=now;actionResponse=response; return root.players[auth.uid];
    });
    const transactionDurationMs = Date.now() - transactionStartedAt;
    res.setHeader('Server-Timing', 'auth;dur=' + authDurationMs + ', db_transaction;dur=' + transactionDurationMs);
    const result=transaction.snapshot?.val();
    if (!transaction.committed) return res.status(503).json({error:'Could not commit your progress. Please retry.'});
    if (!actionResponse) {
      const root=ensureMeta({meta:{},players:{[auth.uid]:result}},Date.now());
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
