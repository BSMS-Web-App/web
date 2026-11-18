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
import crypto from 'node:crypto';
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
function isStaffAccount(account={}){
 const role=String(account.role||account.accountRole||'').trim().toLowerCase();
 return Boolean(account.isDeveloper)||['developer','admin','administrator','owner'].includes(role);
}
function isPrizeIneligibleAccount(account={}){
 return isStaffAccount(account)||Boolean(account.last_harvest&&account.last_harvest.prizeDisqualified);
}

/* ---- event schedule (edit here; deliberately not environment-driven) ---- */
export const EVENT_START = '2026-11-18T12:00:00.000Z'; // Nov 18, 2026, 7:00 AM EST
export const EVENT_END   = '2026-11-24T20:10:00.000Z'; // Nov 24, 2026, 3:10 PM EST (exclusive)
/* A stage can only be completed inside a run the server handed out, and never
   faster than a player can actually play it. A client that posts stages 1..10 in
   a loop has no run to finish, and a client that starts a run and finishes it in
   two seconds is refused. This is the strongest signal available without running
   the battle on the server; the numbers are deliberately generous. */
const STAGE_MIN_MS = 60 * 1000;
const STAGE_MAX_MS = 3 * 60 * 60 * 1000;
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
 const ref=db.ref('/last_harvest/finishers/'+user.uid);
 const disqualifiedRef=db.ref('/accounts/'+user.uid+'/last_harvest/prizeDisqualified');
 if(isStaffAccount(user.account))await disqualifiedRef.set(true);
 const disqualifiedSnap=await disqualifiedRef.once('value');
 if(isPrizeIneligibleAccount(user.account)||disqualifiedSnap.val()===true){await ref.remove();return null;}
 const existingSnap=await ref.once('value'),existing=existingSnap.val();
 if(existing&&Number.isFinite(existing.completedAt)&&Number(existing.finishOrder)>0)return existing;
 const sequence=await db.ref('/last_harvest/finish_sequence').transaction(value=>(Number(value)||0)+1);
 const order=Number(sequence.snapshot.val())||1;
 const record=existing&&Number.isFinite(existing.completedAt)?{...existing,finishOrder:order}:{uid:user.uid,displayName:user.account.display_name||user.account.username||'Player',completedAt:Number(completedAt)||Date.now(),finishOrder:order};
 const result=await ref.transaction(current=>current&&Number.isFinite(current.completedAt)?(Number(current.finishOrder)>0?undefined:{...current,finishOrder:order}):record);
 return result.snapshot.val()||record;
}
async function resolveUser(sessionId){
 if(!sessionId)return null;
 const indexRef=db.ref('/session_index/'+sessionId);
 const indexSnap=await indexRef.once('value');
 const indexed=indexSnap.val();
 if(indexed?.checked===true&&!indexed?.uid)return null;
 const indexedUid=typeof indexed==='string'?indexed:indexed?.uid;
 if(indexedUid){
  const accountSnap=await db.ref('/accounts/'+indexedUid).once('value');
  const account=accountSnap.val();
  if(account&&account.account_status!=='deleted'&&account.sessions?.[sessionId])return{uid:indexedUid,account};
  await indexRef.remove();
 }
 /* One-time migration for sessions created before the direct index existed. */
 const accountsSnap=await db.ref('/accounts').once('value');
 for(const [uid,account] of Object.entries(accountsSnap.val()||{})){
  if(account?.account_status!=='deleted'&&account?.sessions?.[sessionId]){
   await indexRef.set({uid,createdAt:account.sessions[sessionId].createdAt||Date.now()});
   return{uid,account};
  }
 }
 await indexRef.set({checked:true,checkedAt:Date.now()});
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
  coins:100,xp:0,health:40,maxHealth:40,run:null,lastStageMs:null,completedAt:null,updatedAt:Date.now()};
}
const PLAYER_DATA_KEYS=['name','heroClass','gender','pet','sidekick','equipped','towerBest','coins','xp','x','y','level','hp','maxHp','mp','maxMp','potions','battleItems','potionInventoryMigrated','weaponTier','armorTier','skillTier','vitalityTier','focusTier','skills','skipped','inventory','beaten','questStep','clues','cityUnlocked','firstWildDefeated','wildKills','sentinelTrainingStarted','firstArmorUpgrade','sentinelRaidSeen','regionScenes','mainQuests','sideQuests','storyArcs','storyReactions','chests','rowanChoice','rowanTrust','finalChoice','kingChoice','ending','rowanDead','wish','trapSeals','trapEscaped','rowanLore','elderKey','elderTalks','rowanWoodsScene','tutorialDone','cutscene','seenIntro','p2Seen','p2Done','teleUsed','tipFight','savedAt','saveVersion','pendingStages'];
function cleanPlayerData(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 let encoded;try{encoded=JSON.stringify(value);}catch(e){return null;}
 if(!encoded||encoded.length>100000)return null;
 const source=JSON.parse(encoded),out={};
 for(const key of PLAYER_DATA_KEYS)if(Object.prototype.hasOwnProperty.call(source,key))out[key]=source[key];
 if(out.heroClass&&!['Guardian','Scout','Mage'].includes(out.heroClass))out.heroClass='Guardian';
 for(const key of ['level','hp','maxHp','mp','maxMp','potions','weaponTier','armorTier','skillTier'])if(out[key]!==undefined)out[key]=Math.max(0,Math.min(key==='level'?99:key==='hp'||key==='maxHp'||key==='mp'||key==='maxMp'?999:key==='potions'?9:8,Math.floor(Number(out[key])||0)));
 if(out.name!==undefined)out.name=String(out.name).slice(0,16);
 if(out.coins!==undefined)out.coins=Math.max(0,Math.min(1000000,Math.floor(Number(out.coins)||0)));
 if(out.xp!==undefined)out.xp=Math.max(0,Math.min(10000000,Math.floor(Number(out.xp)||0)));
 if(out.towerBest!==undefined)out.towerBest=Math.max(0,Math.min(500,Math.floor(Number(out.towerBest)||0)));
 if(Array.isArray(out.pendingStages))out.pendingStages=[...new Set(out.pendingStages.map(item=>Math.floor(Number(item&&item.stage))).filter(stage=>stage>=1&&stage<=10))].sort((x,y)=>x-y).slice(0,10).map(stage=>({stage,at:Date.now()}));
 return out;
}
function cleanState(value){
 const base=freshState(),v=value&&typeof value==='object'?value:{};
 const inventory=[...new Set((Array.isArray(v.inventory)?v.inventory:base.inventory).filter(id=>EQUIPMENT[id]))];
 const equipped={};
 const equippedSource=v.equipped&&typeof v.equipped==='object'?v.equipped:base.equipped;
 for(const slot of ['weapon','armor','helmet','boots']){
  const id=equippedSource[slot];if(EQUIPMENT[id]?.slot===slot&&inventory.includes(id))equipped[slot]=id;
 }
 return {...base,character:normalizeClass(v.character)||base.character,
  sidekick:SIDES.has(v.sidekick)?v.sidekick:base.sidekick,pet:normalizePet(v.pet)||base.pet,
  stage:Math.max(0,Math.min(10,Math.floor(Number(v.stage)||0))),
  inventory,equipped,coins:Math.max(0,Math.min(1000000,Math.floor(Number(v.coins)||0))),
  xp:Math.max(0,Math.min(1000000,Math.floor(Number(v.xp)||0))),
  health:Math.max(1,Math.min(100,Math.floor(Number(v.health)||base.health))),maxHealth:Math.max(1,Math.min(100,Math.floor(Number(v.maxHealth)||base.maxHealth))),
  lastStageMs:Number.isFinite(v.lastStageMs)?Math.max(0,Math.floor(v.lastStageMs)):null,
  run:(v.run&&Number.isInteger(v.run.stage)&&Number.isFinite(v.run.startedAt)&&typeof v.run.token==='string')
   ?{stage:v.run.stage,startedAt:v.run.startedAt,token:v.run.token}:null,
  completedAt:typeof v.completedAt==='number'?v.completedAt:null,
  playerData:cleanPlayerData(v.playerData),playerDataUpdatedAt:Number(v.playerDataUpdatedAt)||0,prizeDisqualified:Boolean(v.prizeDisqualified),updatedAt:Date.now()};
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
  const [boardSnap,accountsSnap]=await Promise.all([
   db.ref('/last_harvest/finishers').once('value'),db.ref('/accounts').once('value')
  ]);
  const accounts=accountsSnap.val()||{};
  const rows=Object.values(boardSnap.val()||{}).filter(row=>row&&row.uid&&Number.isFinite(row.completedAt)&&!isPrizeIneligibleAccount(accounts[row.uid]));
  rows.sort((x,y)=>x.completedAt-y.completedAt||(Number(x.finishOrder)||Number.MAX_SAFE_INTEGER)-(Number(y.finishOrder)||Number.MAX_SAFE_INTEGER)||String(x.uid||'').localeCompare(String(y.uid||'')));
  return res.status(200).json({success:true,rankings:rows.slice(0,50).map((row,index)=>({rank:index+1,displayName:row.displayName,completedAt:row.completedAt}))});
 }
 const ref=db.ref('/accounts/'+user.uid+'/last_harvest');
 try{
  const snap=await ref.once('value');
  const state=cleanState(snap.val()||freshState());
  const openStage=releasedStage();
  if(req.method==='GET'){
   if(state.stage===STAGES.length&&state.completedAt){if(isStaffAccount(user.account)){state.prizeDisqualified=true;await ref.child('prizeDisqualified').set(true);}await ensureFinisher(user,state.completedAt);}
   const prizeEligible=!isPrizeIneligibleAccount({...user.account,last_harvest:state});
   return res.status(200).json({success:true,state,openStage,stageNames:STAGES,releaseAt:nextReleaseAt(openStage)?new Date(nextReleaseAt(openStage)).toISOString():null,displayName:user.account.display_name||user.account.username||'Player',phase:phase.phase,startsAt:phase.startsAt,endsAt:phase.endsAt,serverTime:phase.serverTime,completionVerification:'time-gated-client-reported',prizeEligible,leaderboardEligible:prizeEligible});
  }
  const body=reqBody,action=body.action;
  if(action==='save-loadout'){
   const tx=await ref.transaction(current=>{
    const patch=cleanState(current||freshState());
    for(const key of ['character','sidekick','pet','equipped'])if(body[key]!==undefined&&body[key]!==null)patch[key]=body[key];
    return cleanState(patch);
   });
   if(!tx.committed)return res.status(409).json({error:'Loadout changed in another session. Refresh and try again.'});
   return res.json({success:true,state:cleanState(tx.snapshot.val())});
  }
  if(action==='save-player'){
   const playerData=cleanPlayerData(body.playerData);
   if(!playerData)return res.status(400).json({error:'Invalid player save.'});
   const savedAt=Number(playerData.savedAt)||Date.now();
   const tx=await ref.transaction(current=>{
    const next=cleanState(current||state);
    if(savedAt<(Number(next.playerDataUpdatedAt)||0))return;
    next.playerData=playerData;if(playerData.coins!==undefined)next.coins=playerData.coins;if(playerData.xp!==undefined)next.xp=playerData.xp;next.playerDataUpdatedAt=Date.now();next.updatedAt=Date.now();return next;
   });
   if(!tx.committed)return res.status(409).json({error:'A newer account save already exists.',code:'stale-player-save'});
   return res.json({success:true,state:cleanState(tx.snapshot.val())});
  }
  if(action==='start-stage'){
   const stage=Math.floor(Number(body.stage));
   if(!Number.isInteger(stage)||stage<1||stage>STAGES.length)return res.status(400).json({error:'Stages must be started in order.'});
   if(stage>openStage)return res.status(423).json({error:'This stage has not unlocked yet.'});
   let failure=null,runResult=null;
   const tx=await ref.transaction(current=>{
    failure=null;runResult=null;
    const currentState=cleanState(current||freshState());
    if(stage!==currentState.stage+1){failure={status:400,error:'Stages must be started in order.'};return;}
    const now=Date.now();
    if(currentState.run&&currentState.run.stage===stage&&now-currentState.run.startedAt<STAGE_MAX_MS){
     runResult=currentState.run;return;
    }
    const run={stage,startedAt:now,token:crypto.randomUUID()};
    runResult=run;return cleanState({...currentState,run});
   });
   if(failure)return res.status(failure.status).json({error:failure.error});
   if(!runResult)return res.status(409).json({error:'Could not start this stage safely. Please retry.'});
   return res.json({success:true,run:{stage,startedAt:runResult.startedAt,token:runResult.token,earliestFinish:runResult.startedAt+STAGE_MIN_MS}});
  }
  if(action==='complete-stage'){
   const stage=Math.floor(Number(body.stage));
   if(!Number.isInteger(stage)||stage<1||stage>STAGES.length)return res.status(400).json({error:'Stages must be completed in order.'});
   if(stage>openStage)return res.status(423).json({error:'This stage has not unlocked yet.'});
   let failure=null,stateResult=null,finished=false,completionTime=null;
   const tx=await ref.transaction(current=>{
    failure=null;stateResult=null;finished=false;completionTime=null;
    const currentState=cleanState(current||freshState());
    if(stage===currentState.stage&&currentState.lastStageMs!==null){
     stateResult=currentState;finished=stage===STAGES.length;completionTime=currentState.completedAt;return;
    }
    if(stage!==currentState.stage+1){failure={status:400,error:'Stages must be completed in order.'};return;}
    const run=currentState.run;
    if(!run||run.stage!==stage){failure={status:409,error:'This stage has not been started. Start it from the chapter before completing it.',code:'stage-not-started'};return;}
    if(String(body.token||'')!==run.token){failure={status:409,error:'That stage run is not the one in progress.',code:'stage-token'};return;}
    const now=Date.now(),elapsed=now-run.startedAt;
    if(elapsed<STAGE_MIN_MS){failure={status:429,error:'That stage cannot be finished that quickly.',code:'stage-too-fast',retryAfterMs:STAGE_MIN_MS-elapsed};return;}
    if(elapsed>STAGE_MAX_MS){failure={status:410,error:'That stage run expired. Start the stage again.',code:'stage-expired'};return;}
    finished=stage===STAGES.length;completionTime=finished?now:null;
    stateResult=cleanState({...currentState,stage,run:null,lastStageMs:elapsed,xp:currentState.xp+stage*100,coins:currentState.coins+stage*25,health:40,completedAt:finished?now:currentState.completedAt,prizeDisqualified:currentState.prizeDisqualified||isStaffAccount(user.account)});
    return stateResult;
   });
   if(failure)return res.status(failure.status).json({...failure});
   if(!stateResult)return res.status(409).json({error:'This stage could not be recorded safely. Please retry.'});
   const savedState=tx.committed?cleanState(tx.snapshot.val()):stateResult;
   if(finished){
    const prizeEligible=!isPrizeIneligibleAccount({...user.account,last_harvest:savedState});
    const finisher=await ensureFinisher(user,completionTime||savedState.completedAt);
    return res.json({success:true,state:savedState,finished:true,serverRecorded:true,verification:'time-gated-client-reported',finisher,prizeEligible,leaderboardEligible:prizeEligible});
   }
   return res.json({success:true,state:savedState,finished:false,serverRecorded:true,verification:'time-gated-client-reported'});
  }
  return res.status(400).json({error:'Unknown action.'});
 }catch(error){console.error('[Last Harvest] API error:',error);return res.status(500).json({error:'Could not save contest progress.'});}
}

/* ---- Goldleaf Tower leaderboard (open to any signed-in account; independent of the private contest) ---- */
async function towerApi(req,res){
 try{
  const window=eventPhase();
  if(req.method==='GET'){
   const [snap,accountsSnap]=await Promise.all([
    db.ref('/last_harvest_tower/best').once('value'),db.ref('/accounts').once('value')
   ]);
   const accounts=accountsSnap.val()||{};
   const rows=Object.values(snap.val()||{}).filter(r=>r&&r.uid&&!isStaffAccount(accounts[r.uid])&&Number.isInteger(r.floor));
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
  if(isStaffAccount(user.account))return res.status(403).json({error:'Staff accounts cannot appear on leaderboards or qualify for prizes.'});
  const body=req.body||{},floor=Math.floor(Number(body.floor));
  if(!Number.isInteger(floor)||floor<1||floor>500)return res.status(400).json({error:'Invalid floor.'});
  const ref=db.ref('/last_harvest_tower/best/'+user.uid),now=Date.now();
  const cls=['Guardian','Scout','Mage'].includes(body.cls)?body.cls:'Guardian',level=Math.max(1,Math.min(99,Math.floor(Number(body.level)||1)));
  let rejection=null;
  const tx=await ref.transaction(prev=>{
   rejection=null;prev=prev||null;
   if(prev&&now-(prev.lastSubmit||0)<8000){rejection='cooldown';return;}
   if(floor>(prev?prev.floor:0)+40){rejection='jump';return;}
   return(!prev||floor>prev.floor)?{uid:user.uid,displayName:String(user.account.display_name||user.account.username||'Player').slice(0,32),floor,cls,level,at:now,lastSubmit:now}:{...prev,lastSubmit:now};
  });
  if(!tx.committed)return rejection==='cooldown'?res.status(429).json({error:'Please wait a moment before posting again.'}):res.status(400).json({error:'Score rejected.'});
  return res.status(200).json({success:true,floor:tx.snapshot.val().floor,verification:'client-reported-casual'});
 }catch(e){return res.status(503).json({error:'Leaderboard unavailable.'});}
}
