/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 *
 * Halloween Haunt authoritative contest API.
 * All economy changes are server-calculated and committed through the Mac DB CAS transaction.
 */
import { db } from './db.js';

const ROOT = '/halloween_haunt';
const START = Date.parse('2026-10-26T04:00:00.000Z'); // Oct 26, 2026, 12:00 AM EDT
const END = Date.parse('2026-10-30T19:10:00.000Z');   // Oct 30, 2026, 3:10 PM EDT
const ROTATION_MS = 5 * 60 * 1000;
const MAX_CREW = 5;
const MAX_CLICK_RATE = 8;
const CANDY = [
  ['candy-corn','Candy Corn','Common','candy-corn.png',1,30],
  ['smarties','Smarties','Common','smarties.png',1,30],
  ['tootsie-roll','Tootsie Roll','Common','tootsie-roll.png',1,30],
  ['whoppers','Whoppers','Common','whoppers.jpeg.png',1,30],
  ['milk-duds','Milk Duds','Common','milk-duds.png',1,30],
  ['mounds','Mounds','Common','mounds.png',1,30],
  ['3-musketeers','3 Musketeers','Uncommon','3-musketeers.png',2,22],
  ['milky-way','Milky Way','Uncommon','milky-way.png',2,22],
  ['mr-goodbar','Mr. Goodbar','Uncommon','mr-goodbar.png',2,22],
  ['almond-joy','Almond Joy','Uncommon','almond-joy.png',2,22],
  ['baby-ruth','Baby Ruth','Uncommon','baby-ruth.png',2,22],
  ['tootsie-pop','Tootsie Pop','Uncommon','tootsie-pop.png',2,22],
  ['jolly-ranchers','Jolly Ranchers','Uncommon','jolly-ranchers.png',2,22],
  ['twizzlers','Twizzlers','Uncommon','twizzlers.png',2,22],
  ['hersheys',"Hershey's",'Rare','hersheys.png',4,15],
  ['m-ms',"M&M's",'Rare','m-ms.png',4,15],
  ['skittles','Skittles','Rare','skittles.png',4,15],
  ['airheads','Airheads','Rare','airheads.png',4,15],
  ['swedish-fish','Swedish Fish','Rare','swedish-fish.png',4,15],
  ['york','York','Rare','york.png',4,15],
  ['crunch','Crunch','Rare','crunch.png',4,15],
  ['butter-finger','Butterfinger','Rare','butter-finger.png',4,15],
  ['startburst','Starburst','Rare','startburst.png',4,15],
  ['kitkat','KitKat','Epic','kitkat.png',8,7],
  ['snickers','Snickers','Epic','snickers.png',8,7],
  ['sour-patch-kids','Sour Patch Kids','Epic','sour-patch-kids.png',8,7],
  ['100-grand','100 Grand','Epic','100-grand.png',8,7],
  ['twix','Twix','Legendary','twix.png',16,2],
  ['reeses',"Reese's",'Legendary','reeses.png',16,2]
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
  autoSell:{label:'Crew Auto-Sell',baseCost:250,max:1}
};
const rarityWeight = {Common:62,Uncommon:24,Rare:10,Epic:3.3,Legendary:0.7};

function newPlayer(uid, account, now) {
  const inventory = {};
  const lifetimeCollected = {};
  for (const candy of CANDY) { inventory[candy.id]=0; lifetimeCollected[candy.id]=0; }
  return {
    uid, displayName: String(account.displayName || account.username || 'Player').slice(0,40),
    cash:100, inventory, discovered:[], lifetimeCollected,
    basketCapacity:50, currentBasketCount:0,
    upgrades:{capacity:{level:0,nextCost:45},power:{level:0,nextCost:60},luck:{level:0,nextCost:90},autoSell:{level:0,nextCost:250}},
    crew:[], crewUnlocked:false, crewHireCost:180, lastCrewSync:now,
    stats:{highScore:100,lifetimeCash:0,cashSpent:0,totalClicks:0,totalCollected:0,totalSold:0,rareCollected:0,legendaryCollected:0,upgradesBought:0,crewCollected:0,crewSold:0},
    createdAt:now, updatedAt:now
  };
}
function normalizePlayer(p, uid, account, now) {
  if (!p) return newPlayer(uid,account,now);
  p.uid=uid; p.displayName=String(account.displayName || account.username || p.displayName || 'Player').slice(0,40);
  p.inventory ||= {}; p.lifetimeCollected ||= {}; p.discovered ||= [];
  for (const c of CANDY) { p.inventory[c.id]=Number.isFinite(p.inventory[c.id])?p.inventory[c.id]:0; p.lifetimeCollected[c.id]=Number.isFinite(p.lifetimeCollected[c.id])?p.lifetimeCollected[c.id]:0; }
  p.upgrades ||= {};
  for (const [id,cfg] of Object.entries(UPGRADE_CONFIG)) p.upgrades[id] ||= {level:0,nextCost:cfg.baseCost};
  p.crew ||= []; p.stats ||= {};
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
function contestStatus(now) {
  // TEST MODE: keep the contest active regardless of the calendar. Restore date checks before launch.
  return {status:'active',startsAt:START,endsAt:END,serverTime:now,testMode:true};
}
function publicState(p, root, now) {
  const offers=root.meta.offers;
  const bestPrices={};
  for(const c of CANDY) bestPrices[c.id]=Math.max(...SHOPS.map(s=>offers[s.id][c.id]));
  return {
    ...contestStatus(now), accountId:p.uid, displayName:p.displayName, cash:p.cash,
    inventory:{...p.inventory}, discovered:[...p.discovered], lifetimeCollected:{...p.lifetimeCollected},
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
  const luckFactor=1+Math.min(14,luckLevel)*0.10;
  const weighted=CANDY.map(c=>({c,w:c.weight*(c.rarity==='Common'?1:luckFactor)}));
  const total=weighted.reduce((s,x)=>s+x.w,0); let r=Math.random()*total;
  for(const item of weighted){r-=item.w;if(r<=0)return item.c;}
  return CANDY[0];
}
function bestShopFor(candyId, offers) {
  return SHOPS.reduce((best,s)=>offers[s.id][candyId]>offers[best.id][candyId]?s:best,SHOPS[0]);
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

  let auth;
  try {
    auth = await authenticate(req);
  } catch (error) {
    console.error('[Haunt] Auth/database error:', error);
    return res.status(503).json({ error: 'The game API cannot reach the account database. Check the Mac API and Cloudflare Tunnel.' });
  }
  if(!auth) return res.status(401).json({error:'Please sign in to play Halloween Haunt.'});
  if(auth.error) return res.status(auth.status).json({error:auth.error});
  const now=Date.now(), status=contestStatus(now);
  try {
    if(action==='leaderboard') {
      const root=ensureMeta((await db.ref(ROOT).once('value')).val()||{},now);
      const rankings=Object.values(root.players).map(p=>({accountId:p.uid,displayName:String(p.displayName||'Player').slice(0,40),cash:Math.max(0,Math.floor(Number(p.cash)||0))}))
        .sort((a,b)=>b.cash-a.cash || a.displayName.localeCompare(b.displayName)).slice(0,100);
      return res.status(200).json({rankings,...status});
    }
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
      if(action==='state') { player.updatedAt=now; actionResponse=response; return root; }
      if(status.status!=='active') {
        response.error=status.status==='upcoming'?'Halloween Haunt has not started yet.':'Halloween Haunt has ended. Final standings are locked.';
        response.status=status.status==='upcoming'?425:410;
        actionResponse=response; return root;
      }
      const count=()=>{player.currentBasketCount=Object.values(player.inventory).reduce((a,n)=>a+Math.max(0,Number(n)||0),0);return player.currentBasketCount;};
      const credit=(amount)=>{amount=Math.max(0,Math.floor(amount));player.cash+=amount;player.stats.lifetimeCash+=amount;player.stats.highScore=Math.max(player.stats.highScore,player.cash);return amount;};
      if(action==='collect') {
        const requested=Math.min(MAX_CLICK_RATE,1+(player.upgrades.power.level||0));
        const room=Math.max(0,player.basketCapacity-count());
        if(room<=0){response= {error:'Your basket is full. Sell candy to make room.',status:409};actionResponse=response; return root;}
        const drops=[];
        for(let i=0;i<Math.min(requested,room);i++){
          const c=rollCandy(player.upgrades.luck.level||0);
          player.inventory[c.id]=(player.inventory[c.id]||0)+1;
          player.lifetimeCollected[c.id]=(player.lifetimeCollected[c.id]||0)+1;
          player.stats.totalCollected++;
          if(c.rarity==='Rare'||c.rarity==='Epic') player.stats.rareCollected++;
          if(c.rarity==='Legendary') player.stats.legendaryCollected++;
          if(!player.discovered.includes(c.id)) player.discovered.push(c.id);
          drops.push(c.id);
        }
        player.stats.totalClicks++; count(); response={state:publicState(player,root,now),drops};
      } else if(action==='shops') {
        response={state:publicState(player,root,now)};
      } else if(action==='sell') {
        const selected=Array.isArray(req.body?.selected)?req.body.selected.filter(id=>CANDY.some(c=>c.id===id)):null;
        const shopId=typeof req.body?.shopId==='string'?req.body.shopId:null;
        if(shopId && !SHOPS.some(s=>s.id===shopId)){response={error:'Invalid shop.',status:400};actionResponse=response; return root;}
        let earned=0,sold=0,receipts=[];
        for(const candy of CANDY){
          if(selected && !selected.includes(candy.id)) continue;
          const qty=Math.max(0,Math.floor(player.inventory[candy.id]||0));if(!qty)continue;
          const shop=shopId?SHOPS.find(s=>s.id===shopId):bestShopFor(candy.id,root.meta.offers);
          const unit=root.meta.offers[shop.id][candy.id], subtotal=unit*qty;
          earned+=subtotal;sold+=qty;receipts.push({candyId:candy.id,quantity:qty,shopId:shop.id,unitPrice:unit,total:subtotal,source:'basket'});
          player.inventory[candy.id]=0;
        }
        let crewSold=0;
        for(const crew of player.crew){
          crew.inventory ||= {};
          for(const candy of CANDY){
            if(selected && !selected.includes(candy.id)) continue;
            const qty=Math.max(0,Math.floor(crew.inventory[candy.id]||0));if(!qty)continue;
            const shop=shopId?SHOPS.find(s=>s.id===shopId):bestShopFor(candy.id,root.meta.offers);
            const unit=root.meta.offers[shop.id][candy.id], subtotal=unit*qty;
            earned+=subtotal;sold+=qty;crewSold+=qty;receipts.push({candyId:candy.id,quantity:qty,shopId:shop.id,unitPrice:unit,total:subtotal,source:crew.id});
            crew.inventory[candy.id]=0;
          }
          crew.inventoryCount=Object.values(crew.inventory).reduce((a,n)=>a+(Number(n)||0),0);
        }
        if(!sold){response={error:'You have no matching candy to sell.',status:409};actionResponse=response; return root;}
        credit(earned);player.stats.totalSold+=sold;player.stats.crewSold+=crewSold;count();response={state:publicState(player,root,now),earned,sold,receipts};
      } else if(action==='upgrade') {
        const type=String(req.body?.type||'');const cfg=UPGRADE_CONFIG[type],u=player.upgrades[type];
        if(!cfg||!u){response={error:'Unknown upgrade.',status:400};actionResponse=response; return root;}
        if(u.level>=cfg.max){response={error:'This upgrade is already maxed.',status:409};actionResponse=response; return root;}
        const cost=Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(player.cash<cost){response={error:'Not enough cash for this upgrade.',status:409};actionResponse=response; return root;}
        player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;u.level++;
        u.nextCost=u.level>=cfg.max?-1:Math.floor(cfg.baseCost*Math.pow(1.62,u.level));
        if(type==='capacity')player.basketCapacity=Math.min(500,player.basketCapacity+10);
        if(type==='autoSell' && u.level) player.crewUnlocked=player.crew.length>0;
        response={state:publicState(player,root,now),purchased:type,cost};
      } else if(action==='crew-action') {
        const act=String(req.body?.crewAction||req.body?.actionType||req.body?.action||'');const idx=Number.isInteger(req.body?.index)?req.body.index:-1;
        if(act==='hire'){
          if(player.crew.length>=MAX_CREW){response={error:'Your crew is already at maximum size.',status:409};actionResponse=response; return root;}
          if(player.cash<player.crewHireCost){response={error:'Not enough cash to hire a helper.',status:409};actionResponse=response; return root;}
          const cost=player.crewHireCost;player.cash-=cost;player.stats.cashSpent+=cost;player.crewUnlocked=true;
          player.crew.push({id:'helper-'+(player.crew.length+1),speedLevel:0,capacityLevel:0,inventory:{},inventoryCount:0,capacity:10,intervalMs:12000,speedUpgradeCost:75,capUpgradeCost:65,lastActionAt:now});
          player.crewHireCost=Math.floor(player.crewHireCost*1.85);response={state:publicState(player,root,now),hired:true,cost};
        } else {
          const crew=player.crew[idx];if(!crew){response={error:'Invalid crew member.',status:400};actionResponse=response; return root;}
          const isSpeed=act==='upgrade_speed',isCap=act==='upgrade_cap';if(!isSpeed&&!isCap){response={error:'Unknown crew action.',status:400};actionResponse=response; return root;}
          const cost=isSpeed?Math.floor(75*Math.pow(1.7,crew.speedLevel||0)):Math.floor(65*Math.pow(1.65,crew.capacityLevel||0));
          if(player.cash<cost){response={error:'Not enough cash.',status:409};actionResponse=response; return root;}
          player.cash-=cost;player.stats.cashSpent+=cost;player.stats.upgradesBought++;
          if(isSpeed){crew.speedLevel=(crew.speedLevel||0)+1;crew.intervalMs=Math.max(2500,Math.floor(12000*Math.pow(.82,crew.speedLevel)));crew.speedUpgradeCost=crew.speedLevel>=8?-1:Math.floor(75*Math.pow(1.7,crew.speedLevel));}
          else {crew.capacityLevel=(crew.capacityLevel||0)+1;crew.capacity=Math.min(100,10+crew.capacityLevel*10);crew.capUpgradeCost=crew.capacityLevel>=9?-1:Math.floor(65*Math.pow(1.65,crew.capacityLevel));}
          response={state:publicState(player,root,now),cost};
        }
      } else if(action==='crew-sync') {
        const elapsed=Math.min(20000,Math.max(0,now-(player.lastCrewSync||now)));
        player.lastCrewSync=now;
        if(elapsed>0 && player.crew.length){
          for(const crew of player.crew){
            const ticks=Math.min(8,Math.floor(elapsed/Math.max(2500,crew.intervalMs||12000)));
            for(let n=0;n<ticks;n++){
              const crewCount=Object.values(crew.inventory||{}).reduce((a,b)=>a+(Number(b)||0),0);
              if(crewCount>=crew.capacity)break;
              if(count()>=player.basketCapacity)break;
              const c=rollCandy(player.upgrades.luck.level||0);crew.inventory ||= {};crew.inventory[c.id]=(crew.inventory[c.id]||0)+1;crew.inventoryCount=crewCount+1;
              player.stats.crewCollected++;player.stats.totalCollected++;player.lifetimeCollected[c.id]=(player.lifetimeCollected[c.id]||0)+1;
              if(!player.discovered.includes(c.id))player.discovered.push(c.id);
              if(c.rarity==='Rare'||c.rarity==='Epic')player.stats.rareCollected++;if(c.rarity==='Legendary')player.stats.legendaryCollected++;
              count();
            }
            if(player.upgrades.autoSell.level && crew.inventoryCount>=crew.capacity){
              let earned=0,sold=0;
              for(const [id,qty] of Object.entries(crew.inventory)){const q=Math.max(0,Math.floor(qty||0));if(!q)continue;const shop=bestShopFor(id,root.meta.offers);earned+=q*root.meta.offers[shop.id][id];sold+=q;crew.inventory[id]=0;}
              if(earned){credit(earned);player.stats.crewSold+=sold;player.stats.totalSold+=sold;crew.inventoryCount=0;}
            }
          }
        }
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
