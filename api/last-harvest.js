/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Server-authoritative Last Harvest contest API.
 *
 * The contest window is defined in this file, not in the deployment
 * environment: a missing or mistyped variable used to close the whole event,
 * and an environment cannot describe an end date the server can enforce.
 * Every write is rejected before EVENT_START and at/after EVENT_END.
 */
import { db } from './db.js';
import { legalAcceptanceRequired } from './legal-policy.js';

const STAGES = [
  'The Missing Feast','The Whispering Woods','The Forgotten Orchard','The Sunken Pantry',
  'The Feast of Shadows','The Betrayal','The Frozen Feast','The Hollow Fortress',
  'The Final Harvest','The Last Harvest'
];
const EQUIPMENT = {
  wooden_sword:{slot:'weapon',name:'Wooden Harvest Sword',attack:2,defense:0},
  pumpkin_armor:{slot:'armor',name:'Pumpkin Plate Armor',attack:0,defense:3},
  acorn_helmet:{slot:'helmet',name:'Acorn Helmet',attack:0,defense:1},
  autumn_boots:{slot:'boots',name:'Autumn Boots',attack:0,defense:1}
};
const SIDES = new Set(['Rowan','Hazel','Flint','Pip','Maple']);
const PETS = new Set(['Pumpkin Pup','Autumn Fox','Turkey Chick','Golden Squirrel','Little Owl','Cranberry Slime','CROW','TOAD','FOX']);
/* The browser sends its own ids; the contest stores one canonical label per
   class and pet so the two sides cannot drift apart. */
const CLASS_ALIASES = {
  guardian:'Harvest Guardian','harvest guardian':'Harvest Guardian',
  scout:'Forest Scout','forest scout':'Forest Scout',
  mage:'Harvest Mage','harvest mage':'Harvest Mage'
};
const PET_ALIASES = {
  crow:'CROW',toad:'TOAD',fox:'FOX',
  'pumpkin pup':'Pumpkin Pup','autumn fox':'Autumn Fox','turkey chick':'Turkey Chick',
  'golden squirrel':'Golden Squirrel','little owl':'Little Owl','cranberry slime':'Cranberry Slime'
};
function normalizeClass(value){return CLASS_ALIASES[String(value||'').trim().toLowerCase()]||null;}
function normalizePet(value){return PET_ALIASES[String(value||'').trim().toLowerCase()]||null;}

/* ---- event schedule (edit here; deliberately not environment-driven) ---- */
export const EVENT_START = '2026-11-16T12:00:00.000Z'; // Nov 16, 2026, 7:00 AM EST
export const EVENT_END   = '2026-12-20T05:00:00.000Z'; // Dec 20, 2026, 12:00 AM EST
const START_MS = Date.parse(EVENT_START);
const END_MS = Date.parse(EVENT_END);
if(!Number.isFinite(START_MS)||!Number.isFinite(END_MS)||END_MS<=START_MS)throw new Error('[Last Harvest] EVENT_START/EVENT_END are invalid.');

function eventPhase(now=Date.now()){
 if(now<START_MS)return{phase:'upcoming',startsAt:START_MS,endsAt:END_MS,serverTime:now};
 if(now>=END_MS)return{phase:'ended',startsAt:START_MS,endsAt:END_MS,serverTime:now};
 return{phase:'active',startsAt:START_MS,endsAt:END_MS,serverTime:now};
}
/* Writes are only accepted while the window is open. */
function windowRejection(now=Date.now()){
 const {phase}=eventPhase(now);
 if(phase==='active')return null;
 return phase==='upcoming'
  ?{status:425,error:'The Last Harvest contest has not started yet.'}
  :{status:410,error:'The Last Harvest contest has ended. Progress and scores are locked.'};
}
/* Timestamps supplied by a client must fall inside the window too. */
function foreignTimestamp(body){
 if(!body||typeof body!=='object')return null;
 for(const key of ['at','completedAt','timestamp','startedAt','submittedAt','endedAt']){
  if(body[key]===undefined)continue;
  const t=Number(body[key]);
  if(!Number.isFinite(t)||t<START_MS||t>=END_MS)return key;
 }
 return null;
}
async function ensureFinisher(user,completedAt){
 const ref=db.ref('/last_harvest/finishers/'+user.uid),snap=await ref.once('value'),existing=snap.val();
 if(existing&&Number.isFinite(existing.completedAt))return existing;
 const record={uid:user.uid,displayName:user.account.display_name||user.account.username||'Player',completedAt:Number(completedAt)||Date.now()};
 await ref.set(record);return record;
}
async function resolveUser(sessionId){
  if(!sessionId)return null;
  const snap=await db.ref('/accounts').once('value');
  for(const [uid,account] of Object.entries(snap.val()||{})){
    if(account?.account_status!=='deleted' && account?.sessions?.[sessionId]) return {uid,account};
  }
  return null;
}
/* Every stage opens together when the event does: the contest is a sprint, not
   a daily drip, so nobody is gated on a weekday cadence. */
function releasedStage(now=Date.now()){
 return now<START_MS?0:STAGES.length;
}
function nextReleaseAt(openStage){
 return openStage<STAGES.length?START_MS:null;
}
function freshState(){
 return {version:1,character:'Harvest Guardian',sidekick:'Rowan',pet:'Pumpkin Pup',stage:0,
  inventory:['wooden_sword','pumpkin_armor','acorn_helmet','autumn_boots'],
  equipped:{weapon:'wooden_sword',armor:'pumpkin_armor',helmet:'acorn_helmet',boots:'autumn_boots'},
  coins:100,xp:0,health:40,maxHealth:40,completedAt:null,updatedAt:Date.now()};
}
function cleanState(value){
 const base=freshState(),v=value&&typeof value==='object'?value:{};
 const equipped={};
 for(const slot of ['weapon','armor','helmet','boots']){
  const id=v.equipped?.[slot];if(EQUIPMENT[id]?.slot===slot)equipped[slot]=id;
 }
 return {...base,character:normalizeClass(v.character)||base.character,
  sidekick:SIDES.has(v.sidekick)?v.sidekick:base.sidekick,pet:normalizePet(v.pet)||base.pet,
  stage:Math.max(0,Math.min(10,Math.floor(Number(v.stage)||0))),
  inventory:[...new Set((Array.isArray(v.inventory)?v.inventory:base.inventory).filter(id=>EQUIPMENT[id]))],
  equipped,coins:Math.max(0,Math.min(1000000,Math.floor(Number(v.coins)||0))),
  xp:Math.max(0,Math.min(1000000,Math.floor(Number(v.xp)||0))),
  health:Math.max(1,Math.min(100,Math.floor(Number(v.health)||base.health))),maxHealth:Math.max(1,Math.min(100,Math.floor(Number(v.maxHealth)||base.maxHealth))),
  completedAt:typeof v.completedAt==='number'?v.completedAt:null,updatedAt:Date.now()};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){
  const origin=req.headers.origin,host=req.headers.host;
  if(origin&&(origin==='https://'+host||origin==='http://'+host)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Session-ID');
  return res.status(204).end();
 }
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
 if((req.method==='GET'&&req.query&&req.query.action==='tower-leaderboard')||(req.method==='POST'&&(req.body||{}).action==='tower-score'))return towerApi(req,res);
 const phase=eventPhase();
 const reqBody=req.body||{};
 if(req.method==='POST'){
  const blocked=windowRejection(phase.serverTime);
  if(blocked)return res.status(blocked.status).json({...blocked,phase:phase.phase,startsAt:phase.startsAt,endsAt:phase.endsAt});
  const badStamp=foreignTimestamp(reqBody);
  if(badStamp)return res.status(400).json({error:'The '+badStamp+' value falls outside the contest window.'});
 }
 const sessionId=req.headers['x-session-id'];
 let user;
 try{user=await resolveUser(sessionId);}catch(e){return res.status(503).json({error:'Account service unavailable.'});}
 if(!user)return res.status(401).json({error:'Please sign in to continue.'});
 if(user.account.account_status==='banned'||legalAcceptanceRequired(user.account))return res.status(403).json({error:'Your account cannot access this event.'});
 if(req.method==='GET' && req.query.action==='leaderboard'){
  const boardSnap=await db.ref('/last_harvest/finishers').once('value');
  const rows=Object.values(boardSnap.val()||{}).filter(row=>row&&Number.isFinite(row.completedAt));
  rows.sort((x,y)=>x.completedAt-y.completedAt);
  return res.status(200).json({success:true,rankings:rows.slice(0,50).map((row,index)=>({rank:index+1,displayName:row.displayName,completedAt:row.completedAt}))});
 }
 const ref=db.ref('/accounts/'+user.uid+'/last_harvest');
 try{
  const snap=await ref.once('value');
  const state=cleanState(snap.val()||freshState());
  const openStage=releasedStage();
  if(req.method==='GET')return res.status(200).json({success:true,state,openStage,stageNames:STAGES,releaseAt:nextReleaseAt(openStage)?new Date(nextReleaseAt(openStage)).toISOString():null,displayName:user.account.display_name||user.account.username||'Player',phase:phase.phase,startsAt:phase.startsAt,endsAt:phase.endsAt});
  const body=reqBody,action=body.action;
  if(action==='save-loadout'){
   const patch={...state};
   for(const key of ['character','sidekick','pet','equipped'])if(body[key]!==undefined&&body[key]!==null)patch[key]=body[key];
   const next=cleanState(patch);
   await ref.set(next);return res.json({success:true,state:next});
  }
  if(action==='complete-stage'){
   const stage=Math.floor(Number(body.stage));
   if(!Number.isInteger(stage)||stage<1||stage>STAGES.length)return res.status(400).json({error:'Stages must be completed in order.'});
   if(stage>openStage)return res.status(423).json({error:'This stage has not unlocked yet.'});
   /* A retried final submission repairs a finisher row that the earlier
      attempt failed to write, instead of being rejected as out of order. */
   if(stage===state.stage&&stage===STAGES.length&&state.completedAt){
    const repaired=await ensureFinisher(user,state.completedAt);
    return res.json({success:true,state,finished:true,finisher:repaired});
   }
   if(stage!==state.stage+1)return res.status(400).json({error:'Stages must be completed in order.'});
   const now=Date.now(),finished=stage===STAGES.length;
   const next=cleanState({...state,stage,xp:state.xp+stage*100,coins:state.coins+stage*25,health:40,completedAt:finished?now:state.completedAt});
   await ref.set(next);
   if(finished)await ensureFinisher(user,now);
   return res.json({success:true,state:next,finished});
  }
  return res.status(400).json({error:'Unknown action.'});
 }catch(error){console.error('[Last Harvest] API error:',error);return res.status(500).json({error:'Could not save contest progress.'});}
}

/* ---- Goldleaf Tower leaderboard (open to any signed-in account; independent of the private contest) ---- */
async function towerApi(req,res){
 try{
  const window=eventPhase();
  if(req.method==='GET'){
   const snap=await db.ref('/last_harvest_tower/best').once('value');
   const rows=Object.values(snap.val()||{}).filter(r=>r&&Number.isInteger(r.floor));
   rows.sort((a,b)=>b.floor-a.floor||a.at-b.at);
   return res.status(200).json({success:true,leaderboard:rows.slice(0,50).map((r,i)=>({rank:i+1,displayName:r.displayName,floor:r.floor,cls:r.cls,level:r.level})),phase:window.phase,startsAt:window.startsAt,endsAt:window.endsAt,submissionsOpen:window.phase==='active'});
  }
  const blocked=windowRejection();
  if(blocked)return res.status(blocked.status).json({error:blocked.error});
  const badStamp=foreignTimestamp(req.body||{});
  if(badStamp)return res.status(400).json({error:'The '+badStamp+' value falls outside the contest window.'});
  const user=await resolveUser(req.headers['x-session-id']);
  if(!user)return res.status(401).json({error:'Please sign in to post a score.'});
  if(user.account.account_status==='banned'||legalAcceptanceRequired(user.account))return res.status(403).json({error:'Your account cannot post scores.'});
  const body=req.body||{},floor=Math.floor(Number(body.floor));
  if(!Number.isInteger(floor)||floor<1||floor>500)return res.status(400).json({error:'Invalid floor.'});
  const ref=db.ref('/last_harvest_tower/best/'+user.uid),snap=await ref.once('value'),prev=snap.val()||null,now=Date.now();
  if(prev&&now-(prev.lastSubmit||0)<8000)return res.status(429).json({error:'Please wait a moment before posting again.'});
  if(floor>(prev?prev.floor:0)+40)return res.status(400).json({error:'Score rejected.'});
  const cls=['Guardian','Scout','Mage'].includes(body.cls)?body.cls:'Guardian',level=Math.max(1,Math.min(99,Math.floor(Number(body.level)||1)));
  const best=(!prev||floor>prev.floor)?{uid:user.uid,displayName:String(user.account.display_name||user.account.username||'Player').slice(0,32),floor,cls,level,at:now,lastSubmit:now}:{...prev,lastSubmit:now};
  await ref.set(best);
  return res.status(200).json({success:true,floor:best.floor});
 }catch(e){return res.status(503).json({error:'Leaderboard unavailable.'});}
}
