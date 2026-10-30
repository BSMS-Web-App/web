/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Private, server-authoritative Last Harvest contest API.
 * Enable only after configuring LAST_HARVEST_ENABLED, LAST_HARVEST_START_DATE,
 * and LAST_HARVEST_ALLOWED_UIDS in the deployment environment.
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
const PETS = new Set(['Pumpkin Pup','Autumn Fox','Turkey Chick','Golden Squirrel','Little Owl','Cranberry Slime']);

function allowedUids(){return new Set(String(process.env.LAST_HARVEST_ALLOWED_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean));}
function isEnabled(){return process.env.LAST_HARVEST_ENABLED === 'true' && /^\d{4}-\d{2}-\d{2}$/.test(process.env.LAST_HARVEST_START_DATE||'') && allowedUids().size>0;}
async function resolveUser(sessionId){
  if(!sessionId)return null;
  const snap=await db.ref('/accounts').once('value');
  for(const [uid,account] of Object.entries(snap.val()||{})){
    if(account?.account_status!=='deleted' && account?.sessions?.[sessionId]) return {uid,account};
  }
  return null;
}
function easternParts(date){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function easternRelease(stage){
  const start=process.env.LAST_HARVEST_START_DATE;
  const d=new Date(start+'T12:00:00Z');
  let count=0;
  while(count<stage-1){d.setUTCDate(d.getUTCDate()+1);const day=d.getUTCDay();if(day!==0&&day!==6)count++;}
  const date=d.toISOString().slice(0,10);
  // 08:00 America/New_York, with DST resolved by Intl offset for that date.
  const noon=new Date(date+'T12:00:00Z');
  const p=easternParts(noon);
  const offsetMinutes=((Number(p.hour)*60+Number(p.minute))-(12*60));
  const easternOffset=offsetMinutes===-240?'-04:00':'-05:00';
  return new Date(date+'T08:00:00'+easternOffset).getTime();
}
function releasedStage(now=Date.now()){
  let result=0;
  for(let i=1;i<=10;i++){if(now>=easternRelease(i))result=i;else break;}
  return result;
}
function freshState(){
 return {version:1,character:'Harvest Guardian',sidekick:'Rowan',pet:'Pumpkin Pup',stage:0,
  inventory:['wooden_sword','pumpkin_armor','acorn_helmet','autumn_boots'],
  equipped:{weapon:'wooden_sword',armor:'pumpkin_armor',helmet:'acorn_helmet',boots:'autumn_boots'},
  coins:50,xp:0,health:30,maxHealth:30,completedAt:null,updatedAt:Date.now()};
}
function cleanState(value){
 const base=freshState(),v=value&&typeof value==='object'?value:{};
 const equipped={};
 for(const slot of ['weapon','armor','helmet','boots']){
  const id=v.equipped?.[slot];if(EQUIPMENT[id]?.slot===slot)equipped[slot]=id;
 }
 return {...base,character:['Harvest Guardian','Forest Scout','Harvest Mage'].includes(v.character)?v.character:base.character,
  sidekick:SIDES.has(v.sidekick)?v.sidekick:base.sidekick,pet:PETS.has(v.pet)?v.pet:base.pet,
  stage:Math.max(0,Math.min(10,Math.floor(Number(v.stage)||0))),
  inventory:[...new Set((Array.isArray(v.inventory)?v.inventory:base.inventory).filter(id=>EQUIPMENT[id]))],
  equipped,coins:Math.max(0,Math.min(1000000,Math.floor(Number(v.coins)||0))),
  xp:Math.max(0,Math.min(1000000,Math.floor(Number(v.xp)||0))),
  health:Math.max(1,Math.min(100,Math.floor(Number(v.health)||30))),maxHealth:30,
  completedAt:typeof v.completedAt==='number'?v.completedAt:null,updatedAt:Date.now()};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','same-origin');return res.status(204).end();}
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
 if(!isEnabled())return res.status(404).json({error:'The Last Harvest contest is not open.'});
 const sessionId=req.headers['x-session-id'];
 let user;
 try{user=await resolveUser(sessionId);}catch(e){return res.status(503).json({error:'Account service unavailable.'});}
 if(!user)return res.status(401).json({error:'Please sign in to continue.'});
 if(!allowedUids().has(user.uid))return res.status(403).json({error:'This account is not on the private event access list.'});
 if(user.account.account_status==='banned'||legalAcceptanceRequired(user.account))return res.status(403).json({error:'Your account cannot access this event.'});
 if(req.method==='GET' && req.query.action==='leaderboard'){
  const boardSnap=await db.ref('/last_harvest/finishers').once('value');
  const rows=Object.values(boardSnap.val()||{}).filter(row=>row&&allowedUids().has(row.uid)&&typeof row.completedAt==='number');
  rows.sort((x,y)=>x.completedAt-y.completedAt);
  return res.status(200).json({success:true,rankings:rows.slice(0,50).map((row,index)=>({rank:index+1,displayName:row.displayName,completedAt:row.completedAt}))});
 }
 const ref=db.ref('/accounts/'+user.uid+'/last_harvest');
 try{
  const snap=await ref.once('value');
  const state=cleanState(snap.val()||freshState());
  const openStage=releasedStage();
  if(req.method==='GET')return res.status(200).json({success:true,state,openStage,stageNames:STAGES,releaseAt:openStage<10?new Date(easternRelease(openStage+1)).toISOString():null,displayName:user.account.display_name||user.account.username||'Player'});
  const body=req.body||{},action=body.action;
  if(action==='save-loadout'){
   const next=cleanState({...state,character:body.character,sidekick:body.sidekick,pet:body.pet,equipped:body.equipped});
   await ref.set(next);return res.json({success:true,state:next});
  }
  if(action==='complete-stage'){
   const stage=Math.floor(Number(body.stage));
   if(!Number.isInteger(stage)||stage<1||stage>10||stage!==state.stage+1)return res.status(400).json({error:'Stages must be completed in order.'});
   if(stage>openStage)return res.status(423).json({error:'This stage has not unlocked yet.'});
   const now=Date.now(),next=cleanState({...state,stage,xp:state.xp+stage*100,coins:state.coins+stage*25,health:30,completedAt:stage===10?now:state.completedAt});
   await ref.set(next);
   if(stage===10){
    await db.ref('/last_harvest/finishers/'+user.uid).set({uid:user.uid,displayName:user.account.display_name||user.account.username||'Player',completedAt:now});
   }
   return res.json({success:true,state:next,finished:stage===10});
  }
  return res.status(400).json({error:'Unknown action.'});
 }catch(error){console.error('[Last Harvest] API error:',error);return res.status(500).json({error:'Could not save contest progress.'});}
}
