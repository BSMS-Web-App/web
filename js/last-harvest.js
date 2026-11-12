/* THE LAST HARVEST — full-screen top-down pixel adventure */
(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('lh-world'),mainCtx=canvas.getContext('2d'),SAVE='last_harvest_adventure_v4',BACKUP='last_harvest_adventure_v4_backup';
let ctx=mainCtx;
const TILE=32,MAP_W=48,MAP_H=36;
const story=[
['ELDER MAPLE','The harvest bell should have rung by now. Something is wrong in Hearthvale.'],
['ROWAN','Your parents are missing. I saw strange lights near the old fountain. Come on—we have to find them!'],
['ELDER MAPLE','Mara and Thomas are the keepers of the Everfeast. Without them, the ancient promise will fade.'],
['NARRATOR','And so your journey begins. The road beyond the village leads into Autumnwood…']
];
const chapters=[
{place:'Hearthvale Village',title:'The Missing Feast',quest:'Find the missing keepers',enemy:'Pumpkin Sentinel'},
{place:'Autumnwood Forest',title:'The Whispering Woods',quest:'Follow the golden leaves',enemy:'Thornback Stag'},
{place:'Golden Apple Valley',title:'The Forgotten Orchard',quest:'Search the oldest tree',enemy:'Rotten Harvest Golem'},
{place:'The Sunken Pantry',title:'The Sunken Pantry',quest:'Recover the keeper ledger',enemy:'Drowned Chef'},
{place:'Shadowmarket',title:'The Feast of Shadows',quest:'Find Rowan in the market',enemy:'Masked Merchant'},
{place:'Broken Banquet Hall',title:'The Betrayal',quest:'Confront your oldest friend',enemy:'Rowan'},
{place:'Frostfall Mountains',title:'The Frozen Feast',quest:'Reach the old watchtower',enemy:'Turkey King'},
{place:'The Hollow Fortress',title:'The Hollow Fortress',quest:'Uncover the first promise',enemy:'Hollow Knight'},
{place:'Everfeast Sanctuary',title:'The Final Harvest',quest:'Face the Hollow King',enemy:'Hollow King'},
{place:'Heart of Hearthvale',title:'The Last Harvest',quest:'Restore the Everfeast',enemy:'Heart Guardian'}
];
let state={name:'',heroClass:'Guardian',x:MAP_W*TILE/2,y:MAP_H*TILE/2,stage:0,coins:100,hp:40,cutscene:0,seenIntro:false};
try{const old=restoreLocalSave();if(old&&old.name)state={...state,...old};}catch(e){}
let keys={},touch={},joystick={x:0,y:0},scene='outside',interiorId=0,insideTalked=false,questStep=0,dialogue=null,dialogueIndex=0,nearby=null,lastTime=0,moveCooldown=0,playerFrame=0,worldSeed=13,cinematic=null;
questStep=state.questStep!==undefined?state.questStep:((state.cityUnlocked||(state.beaten&&(state.beaten.north||state.beaten.east||state.beaten.south)))?4:0);
function setQ(n){questStep=n;state.questStep=n;try{save();}catch(e){}}
const rand=(x,y)=>{let n=Math.sin(x*127.1+y*311.7+worldSeed)*43758.5453;return n-Math.floor(n)};
let saveWarning=false;function save(){state.saveVersion=2;state.savedAt=Date.now();try{const previous=localStorage.getItem(SAVE);if(previous){try{const valid=JSON.parse(previous);if(valid&&valid.name)localStorage.setItem(BACKUP,previous);}catch(e){}}localStorage.setItem(SAVE,JSON.stringify(state));saveWarning=false;return true;}catch(e){saveWarning=true;return false;}}function restoreLocalSave(){for(const key of [SAVE,BACKUP]){try{const raw=localStorage.getItem(key),data=raw&&JSON.parse(raw);if(data&&data.name)return data;}catch(e){}}return null;}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;}
addEventListener('resize',resize);resize();
function tileAt(x,y){if(x<0||y<0||x>=MAP_W||y>=MAP_H)return 1;return 0;}
const solids=[{x:7,y:5,w:7,h:5},{x:30,y:5,w:8,h:5},{x:18,y:17,w:8,h:5},{x:3,y:25,w:5,h:4},{x:21,y:24,w:5,h:4},{x:18,y:12,w:3,h:2}];
function gateBlocked(tx,ty){return GUARDS.some(g=>{if(state.beaten[g.id])return false;const b=g.block||g.gate;return tx>=b.x&&tx<b.x+b.w&&ty>=b.y&&ty<b.y+b.h;});}
function blocked(x,y){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);if(gateBlocked(tx,ty))return true;if(tileAt(tx,ty))return true;for(const b of solids)if(tx>=b.x&&tx<b.x+b.w&&ty>=b.y&&ty<b.y+b.h)return true;for(const t of trees)if(Math.hypot(x-(t.x*TILE+16),y-(t.y*TILE+18))<20)return true;return false;}
const trees=[];for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){const edge=x<4||y<3||x>MAP_W-5||y>MAP_H-5;const inBuilding=solids.some(b=>x>=b.x-1&&x<b.x+b.w+1&&y>=b.y-1&&y<b.y+b.h+1);const onRoad=(y>=11&&y<15)||(x>=15&&x<19);if(edge&&!inBuilding&&!onRoad&&rand(x,y)>.18)trees.push({x,y});}
const npcs=[{x:16*TILE,y:12*TILE,name:'ELDER MAPLE',color:'#b8c7a1',lines:['The village square feels colder today. Your parents were last seen near the fountain.','The Everfeast is older than Hearthvale. Find the truth, not just the missing keepers.']},{x:22*TILE,y:13*TILE,name:'ROWAN',color:'#bb6542',lines:['I will come with you. We have been friends forever—trust me.','The woods are full of strange creatures. Keep your guard up.']},{x:14*TILE,y:16*TILE,name:'MILLIE',color:'#d9a0a5',lines:['I run the village flower stall. The golden leaves have been falling the wrong way today.','Your mother used to buy marigolds every Harvest Eve.']},{x:25*TILE,y:16*TILE,name:'GUS',color:'#668db4',lines:['I keep the village well clean. Last night, I heard footsteps by the north road.','Someone dropped a torn piece of a royal-looking banner near the fountain.']},{x:29*TILE,y:12*TILE,name:'PIPER',color:'#d1ad53',lines:['I saw Rowan speaking to a cloaked stranger. Maybe it was nothing…','Please be careful out there, okay?']}];
const roomNPCs=[
[{x:.35,y:.57,name:'MARA THE NEIGHBOR',color:'#bd6f68',lines:['I heard a commotion near the fountain before sunrise.','Your parents always helped everyone in Hearthvale. We will find them.']},{x:.68,y:.48,name:'JUNIPER',color:'#658b65',lines:['I brought Elder Maple some fresh bread.','There were muddy footprints on the cottage step this morning.']}],
[{x:.34,y:.56,name:'INNKEEPER BRAM',color:'#b47a45',lines:['Welcome, traveler. The inn is usually full this time of year.','A hooded guest checked out before dawn and left this behind.']},{x:.68,y:.48,name:'NELL THE TRAVELER',color:'#6589a9',lines:['I came from the eastern road. Something is stirring in Autumnwood.','Keep to the stone path if you leave town.']}],
[{x:.34,y:.56,name:'SHOPKEEPER TILLY',color:'#b95c49',lines:['Welcome to Tilly’s General Store! I sell supplies for the road.','Your parents bought a healing tonic here yesterday. They seemed worried.']},{x:.68,y:.48,name:'FINN',color:'#5d8b63',lines:['I help stock the shelves. Someone took all the lantern oil last night.','I found a strange black feather by the back door.']}],
[{x:.34,y:.56,name:'OLD CRAFTSMAN ORIN',color:'#7885a7',lines:['Your parents asked me to keep this old map safe.','The symbol on it matches the seal beneath the village fountain.']},{x:.68,y:.48,name:'WREN THE APPRENTICE',color:'#bd8c53',lines:['I am learning to repair tools. The workshop has been busy lately.','Orin knows more about the Everfeast than he lets on.']}]
];
const GUARDS=[
{id:'north',name:'GATEKEEPER BRAWN',tx:16,ty:5,gate:{x:15,y:5,w:4,h:1},row:6,hp:34,atk:6,reward:60,lines:['Halt! The north road is closed until the harvest bell rings.','If you want to pass, prove you can protect Hearthvale!'],win:['Hmph... you fight like a true keeper. The north road is open.']},
{id:'east',name:'GATEKEEPER WINONA',tx:40,ty:12,gate:{x:40,y:11,w:1,h:4},row:23,hp:40,atk:7,reward:75,lines:['The east road is closed. Too many strangers lately.','Show me your strength and I will let you through!'],win:['Impressive! Go on — the east road is yours.']}
];
/* --- chapter bosses: one per storyline, painted from the Kenney palette (bosses.png, 64x64 each) --- */
const BOSSES=[
{name:'PUMPKIN SENTINEL',hp:90,atk:9,reward:120,xp:150,theme:['#1d1230','#7a3b1a','#ff9a2e'],sig:{n:'HARVEST SMASH',k:'heavy',t:'raises its giant scythe...'},lines:['*The ground shakes. The old Pumpkin Sentinel tears free from the soil and bars the south road.*','Its carved grin glows brighter with every step.'],win:['The Sentinel crumbles into harvest dust. The south road is clear.']},
{name:'THORNBACK STAG',hp:130,atk:11,reward:160,xp:180,theme:['#0f2218','#3c6a3a','#9cff6a'],sig:{n:'THORN BARRAGE',k:'multi',t:'bristles, thorns trembling on its back...'},lines:['*Branches crack. A stag the size of a cottage steps from the mist, thorns bristling along its spine.*','It does not breathe. It only watches.'],win:['*The Stag shudders. Its thorns crumble into golden leaves.*']},
{name:'ROTTEN HARVEST GOLEM',hp:180,atk:13,reward:210,xp:210,theme:['#1c2410','#5a5a1c','#b6e84a'],sig:{n:'ROT SLAM',k:'heavy',t:'drags both rotten fists skyward...'},lines:['*The orchard floor heaves. A mountain of spoiled fruit and corn stands up and groans.*','The smell alone is enough to make you stagger.'],win:['*The Golem collapses into compost. Something glints inside it.*']},
{name:'DROWNED CHEF',hp:220,atk:15,reward:260,xp:240,theme:['#0a1c2a','#1f5a6a','#58d8e8'],sig:{n:'CLEAVER FURY',k:'multi',t:'spins its cleaver, water spraying everywhere...'},lines:['*A bloated figure hauls itself out of the pantry flood, cleaver dripping.*','"DINNER... IS... SERVED."'],win:['*The Chef sinks beneath the water, finally at rest. The keeper ledger floats up beside you.*']},
{name:'MASKED MERCHANT',hp:260,atk:17,reward:320,xp:270,theme:['#170f2a','#4a2a6a','#ffd84a'],sig:{n:'HOSTILE TAKEOVER',k:'steal',t:'counts coins with a hungry grin...'},lines:['*Coins clatter in the dark. A towering merchant bows, its mask grinning wider than any face should.*','"Everything has a price, little keeper. Even your parents."'],win:['*The mask cracks in two. "Worth... every coin..." the Merchant whispers.*']},
{name:'ROWAN',hp:320,atk:19,reward:380,xp:310,theme:['#2a0f14','#6a1f2a','#ff3b50'],sig:{n:'BETRAYER\u2019S EDGE',k:'heavy',t:'lifts the dark blade, eyes full of tears...'},lines:['Rowan...? Your oldest friend stands in a ragged red cloak, eyes glowing.','"I never wanted this. But the Hollow King made me an offer I couldn\u2019t refuse."'],win:['Rowan drops to his knees. "Thank you... for not giving up on me."']},
{name:'TURKEY KING',hp:380,atk:21,reward:440,xp:340,theme:['#12243a','#6a9ac0','#bfe6ff'],sig:{n:'FROST GOBBLE',k:'multi',t:'inflates its feathers, frost swirling...'},lines:['*Ice cracks. A gargantuan turkey in a golden crown screeches across the mountain.*','"ALL BOW BEFORE THE FEAST KING!"'],win:['*The Turkey King flaps off in a snowstorm of feathers, crown rolling at your feet.*']},
{name:'HOLLOW KNIGHT',hp:460,atk:24,reward:520,xp:380,theme:['#10121e','#2a3a4e','#58e8ff'],sig:{n:'HOLLOW CLEAVE',k:'heavy',t:'drags a colossal blade across the stone...'},lines:['*An empty suit of armor, twice your height, turns its blazing cyan gaze on you.*','Nothing lives inside it. Nothing ever did.'],win:['*The armor falls apart, piece by piece, and the cold light inside goes out.*']},
{name:'HOLLOW KING',hp:560,atk:27,reward:640,xp:430,theme:['#120a22','#3a1f5a','#b06aff'],sig:{n:'SOUL DRAIN',k:'drain',t:'opens its jaw, violet light pouring out...'},lines:['"You have come so far, little keeper."','"But hunger is older than harvest. I will devour the Everfeast and all of Hearthvale."'],win:['*The Hollow King dissolves into violet sparks. The sanctuary is silent.*']},
{name:'HEART GUARDIAN',hp:700,atk:30,reward:900,xp:600,theme:['#2a0a14','#8a1f3a','#ff6a8a'],sig:{n:'EVERFEAST PULSE',k:'dread',t:'swells, the whole sanctuary beating with it...'},lines:['*A colossal crimson heart beats in the sanctuary, wrapped in golden thorns. Every beat shakes the ground.*','The Heart of Hearthvale will not give up its secret without a fight.'],win:['*The Heart slows, glows warm, and begins to beat steadily again. The Everfeast is saved.*']}
];
const BOSS_NPC={};BOSSES.forEach((b,i)=>{if(b.name!=='ROWAN')BOSS_NPC[b.name]=i;});


state.beaten=state.beaten||{};
if(state.beaten.north&&!state.beaten.south)GUARDS.push({id:'south',name:BOSSES[0].name,tx:16,ty:30,gate:{x:15,y:30,w:4,h:1},block:{x:15,y:26,w:4,h:5},bi:0,lines:BOSSES[0].lines,win:BOSSES[0].win});
GUARDS.forEach(g=>{if(!state.beaten[g.id])npcs.push({x:g.tx*TILE,y:g.ty*TILE,name:g.name,color:'#000',lines:g.lines,trainer:g});});
function ensureSouthBossGate(){if(!state.beaten.north||state.beaten.south||GUARDS.some(g=>g.id==='south'))return;const g={id:'south',name:BOSSES[0].name,tx:16,ty:30,gate:{x:15,y:30,w:4,h:1},block:{x:15,y:26,w:4,h:5},bi:0,lines:BOSSES[0].lines,win:BOSSES[0].win};GUARDS.push(g);npcs.push({x:g.tx*TILE+16,y:g.ty*TILE+24,name:g.name,color:'#000',lines:g.lines,trainer:g});}
const POS={'ELDER MAPLE':[12,12],'ROWAN':[21,12],'MILLIE':[16,20],'GUS':[17,26],'PIPER':[30,13]};
npcs.push({x:25*TILE+16,y:15*TILE+24,name:'TELEPORTER STATION',act:'teleporter',lines:[]});npcs.forEach(n=>{const p=POS[n.name];if(p){n.x=p[0]*TILE;n.y=p[1]*TILE;}});
npcs.forEach(n=>{n.x=Math.round(n.x/TILE)*TILE+16;n.y=Math.round(n.y/TILE)*TILE+24;});state.x=Math.floor(state.x/TILE)*TILE+16;state.y=Math.floor(state.y/TILE)*TILE+24;
function spawnLair(){if(!state.beaten.south)return;const i=Math.min(state.stage||0,BOSSES.length-1);if(i<1||state.beaten['boss'+i]||GUARDS.some(g=>g.id==='boss'+i))return;const B=BOSSES[i],g={id:'boss'+i,name:B.name,tx:16,ty:33,gate:{x:15,y:33,w:4,h:1},bi:i,lines:B.lines,win:B.win};GUARDS.push(g); }
if(state.beaten.south&&!(state.stage>0))state.stage=1;spawnLair();
/* ================= v10 SYSTEMS: art loading, audio, title, skills, regions, city, tower, leaderboard ================= */
function loadImg(list){const im=new Image();let i=0;im.onerror=()=>{if(++i<list.length)im.src=list[i];};im.src=list[0];return im;}
const VIL=loadImg(['/img/last-harvest/village.png?v=11']);
const VR={cottage:[0,0,112,80],inn:[120,0,128,80],store:[256,0,128,80],workshop:[0,90,80,64],house1:[100,90,80,64],house2:[190,90,80,64],house3:[280,90,96,64],tower:[380,0,96,144],fountain0:[0,180,64,40],fountain1:[70,180,64,40],journal:[150,180,16,16]};
function drawFountainSprite(){if(!VIL.naturalWidth)return;const r=VR['fountain'+(Math.floor(performance.now()/380)%2)];ctx.imageSmoothingEnabled=false;ctx.drawImage(VIL,r[0],r[1],r[2],r[3],18*TILE-16,14*TILE-r[3]*2+4,r[2]*2,r[3]*2);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);}
function ov(html,cls){const el=document.createElement('div');el.className='lh-ov '+(cls||'');el.innerHTML='<div class="pn">'+html+'</div>';document.body.appendChild(el);el.close=()=>el.remove();return el;}
function whenIdle(fn){const iv=setInterval(()=>{if(!dialogue&&!battle&&!cinematic&&!transitioning&&!titleOpen&&$('lh-create').hidden){clearInterval(iv);fn();}},300);}
/* ---------- sound: effects, talking blip (your recording), music ---------- */
var muted=false;try{muted=localStorage.getItem('lh_mute')==='1';}catch(e){}
function setMuted(v){muted=v;try{localStorage.setItem('lh_mute',v?'1':'0');}catch(e){}if(v)stopMusic();}
const TALK={buf:null,tried:0};
function talkBlip(){if(muted)return;const a=audio();if(!a)return;if(!TALK.buf&&!TALK.tried){TALK.tried=1;(async()=>{for(const u of['/audio/last-harvest/talk.mp3?v=11','/img/last-harvest/talk.mp3?v=11']){try{const r=await fetch(u);if(!r.ok)continue;TALK.buf=await a.decodeAudioData(await r.arrayBuffer());return;}catch(e){}}})();}
if(TALK.buf){const s=a.createBufferSource(),g=a.createGain();s.buffer=TALK.buf;s.playbackRate.value=.85+Math.random()*.55;g.gain.value=.55;s.connect(g);g.connect(a.destination);s.start();}else tone(260+rnd(180),.045,'square',.025);}
function initSfx(){Object.assign(SFX,{door(){tone(180,.08,'square',.05,-60);tone(120,.12,'triangle',.05,-40,.06);},menu(){tone(660,.05,'square',.04);},select(){tone(880,.06,'square',.05);tone(1320,.08,'square',.05,0,.06);},coin(){tone(988,.06,'square',.05);tone(1319,.12,'square',.05,0,.07);},levelup(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,.14,'square',.05,0,i*.08));},portal(){tone(200,.6,'sine',.06,800);tone(400,.5,'triangle',.04,600,.1);},unlock(){[392,523,659,784].forEach((f,i)=>tone(f,.18,'triangle',.06,0,i*.12));}});}
const MUS={
title:{bpm:84,l:[72,0,0,0,79,0,0,0,76,0,74,72,74,0,0,0,71,0,0,0,79,0,0,0,77,0,76,74,72,0,0,0],b:[48,0,43,0,45,0,41,0]},
village:{bpm:96,l:[76,0,79,0,81,79,76,0,74,0,77,0,79,77,74,0,72,0,76,0,79,76,72,0,71,0,74,0,77,74,71,0,76,0,79,0,81,79,76,0,79,0,83,0,81,79,76,0,77,0,76,0,74,0,72,0,71,72,74,0,67,0,0,0],b:[48,53,48,53,48,43,41,43,48,53,48,55,53,52,48,43]},
wander:{bpm:78,l:[69,0,72,0,74,0,72,0,69,0,67,0,64,0,0,0,67,0,69,0,72,0,74,0,76,0,74,0,72,0,0,0],b:[45,45,43,43,41,41,43,40]},
battle:{bpm:168,l:[69,0,72,69,76,0,72,69,67,0,71,67,74,0,71,67,65,0,69,65,72,0,69,65,64,67,71,67,76,74,71,0],b:[45,45,43,43,41,41,40,43]},
boss:{bpm:180,l:[62,0,65,62,69,0,65,62,60,0,64,60,67,0,64,60,58,0,62,58,65,0,62,58,57,60,64,60,69,67,64,0],b:[38,38,36,36,34,34,33,36]},tension:{bpm:138,l:[62,0,65,0,66,65,62,0,58,0,62,0,65,0,69,0,62,0,65,66,69,0,72,69,70,0,69,66,65,0,62,0],b:[38,0,38,0,41,0,36,0,34,0,34,0,37,0,33,0]},
story:{bpm:70,l:[64,0,0,67,0,0,71,0,69,0,0,67,0,0,64,0,62,0,0,65,0,0,69,0,67,0,0,64,0,0,0,0],b:[40,0,0,0,38,0,0,0]}};
let musCur=null,musTimer=0,musStep=0;
function stopMusic(){clearInterval(musTimer);musTimer=0;musCur=null;}
function playMusic(n){if(muted||!AC||AC.state!=='running')return;if(musCur===n)return;stopMusic();musCur=n;musStep=0;const T=MUS[n];if(!T)return;const ms=60000/T.bpm/2;musTimer=setInterval(()=>{const s=musStep++,l=T.l[s%T.l.length],bb=T.b[((s/4)|0)%T.b.length];if(l)tone(440*Math.pow(2,(l-69)/12),ms*.0009,'square',.012);if(s%4===0&&bb)tone(440*Math.pow(2,(bb-69)/12),ms*.0036,'triangle',.028);},ms);}
function musicTick(){if(muted)return;const want=titleOpen?'title':battle?(battle.B?'boss':'battle'):cinematic?(cinematic.chapter>=4?'tension':'story'):scene==='area'?'wander':'village';if(want!==musCur)playMusic(want);}
addEventListener('keydown',e=>{if((e.key==='m'||e.key==='M')&&!titleOpen&&$('lh-create').hidden){setMuted(!muted);}});
function initRows(){Object.assign(NPC_ROW,{INSTRUCTOR:10,CHALLENGER:36,ANNOUNCER:46,'HAZEL THE HUNTER':37,'OLD WILLOW':20,PIP:18,'ORCHARD KEEPER DAHLIA':34,'FARMER FLINT':15,'BRIGAND BRUNO':3,'FISHER MARLO':33,'WAITER GHOST':44,'ORACLE SELENE':49,'SMUGGLER VEX':16,'SHADOW BROKER':43,'MERCHANT MARISOL':39,'HALL STEWARD ORLAN':42,'ANCIENT KEEPER':40,'FROST RANGER ILSA':48,'MONK TORV':47,'ICE SPRITE':45,'CAPTAIN ALDRIC':36,'SISTER MIRELLE':25,'TINKER COG':32,MARA:28,THOMAS:17,'GOLDLEAF MAYOR':30,'INNKEEPER ROSA':41,'TOWER KEEPER':46});}
/* ---------- skills: start with one, unlock more as you level, max 4 equipped ---------- */
const SKILL_LV=[1,2,3,5,7,9,11,13];
const SKILL_EXTRA={
Guardian:[{n:'TAUNT ROAR',mp:4,kind:'melee',base:8,per:1.5,weaken:4,d:'A thundering roar that weakens the foe\u2019s attacks for 4 turns.',msg:'You roar and the foe flinches!'},{n:'MOUNTAIN SLAM',mp:12,kind:'melee',base:36,per:3.2,stun:.6,d:'A crushing blow. 60% chance to stun.',msg:'You bring the shield down like a mountain!'},{n:'RALLY CRY',mp:7,ward:1,heal:18,d:'Recover HP and brace for the next hit.',msg:'You rally yourself. Hold the line!'},{n:'UNBREAKABLE',mp:11,ward:3,heal:22,d:'Take 70% less damage for 3 turns and heal.',msg:'Nothing can break you now!'}],
Scout:[{n:'TRIPWIRE',mp:4,kind:'arrow',base:10,per:1.6,stun:.7,d:'A trapped shot. 70% chance to stun.',msg:'You loose a snaring shot!'},{n:'POISON DART',mp:6,kind:'arrow',base:12,per:2,burn:4,d:'Poison that burns for 4 turns.',msg:'A venom-tipped dart flies!'},{n:'WIND DASH',mp:6,ward:1,heal:14,d:'Dodge the next strike and recover a little.',msg:'You slip away on the wind!'},{n:'RAIN OF ARROWS',mp:13,kind:'arrow',base:8,per:1.8,hits:5,crit:.3,d:'Five arrows with a high critical chance.',msg:'Arrows fall like rain!'}],
Mage:[{n:'STORM CALL',mp:9,kind:'magic',base:18,per:2.4,hits:2,d:'Two bolts of lightning.',msg:'Lightning answers your call!'},{n:'MEND LIGHT',mp:7,heal:30,d:'A warm light restores your HP.',msg:'Golden light mends your wounds.'},{n:'SOUL DRAIN',mp:8,kind:'magic',base:18,per:2.2,healSelf:12,d:'Steal life from the foe.',msg:'You drain the foe\u2019s spirit!'},{n:'METEOR',mp:15,kind:'magic',base:46,per:3.5,burn:3,d:'A falling star. Burns for 3 turns.',msg:'A meteor tears the sky open!'}]};
function skillCat(){const c=state.heroClass in SKILLS?state.heroClass:'Guardian';if(!SKILLS._ext){for(const k in SKILL_EXTRA)SKILLS[k].push(...SKILL_EXTRA[k]);SKILLS._ext=1;}return SKILLS[c];}
function knownSkills(){const cat=skillCat();if(!Array.isArray(state.skills)||!state.skills.length)state.skills=[0];return state.skills.filter(i=>cat[i]).map(i=>cat[i]);}
let offering=false;
function offerSkillsWhenReady(){whenIdle(offerSkills);}
function offerSkills(){if(offering)return;const cat=skillCat();state.skills=state.skills&&state.skills.length?state.skills:[0];state.skipped=state.skipped||[];const idx=cat.findIndex((s,i)=>!state.skills.includes(i)&&SKILL_LV[i]<=state.level&&!state.skipped.includes(i));if(idx<0)return;offering=true;sfx('unlock');const s=cat[idx];
 const el=ov('<h3>NEW SKILL UNLOCKED!</h3><p><b>'+esc(s.n)+'</b> \u00b7 '+s.mp+' MP</p><p>'+esc(s.d)+'</p><div class="row"><button class="lh-ob" id="sk-yes">LEARN</button><button class="lh-ob alt" id="sk-no">SKIP</button></div><p class="note">You know '+state.skills.length+'/4 skills.</p>');
 const done=()=>{el.close();offering=false;save();setTimeout(offerSkills,200);};
 el.querySelector('#sk-no').onclick=()=>{sfx('menu');state.skipped.push(idx);done();};
 el.querySelector('#sk-yes').onclick=()=>{sfx('select');if(state.skills.length<4){state.skills.push(idx);done();return;}
  el.querySelector('.pn').innerHTML='<h3>FORGET WHICH SKILL?</h3><p>You can only know 4. Choose one to forget for <b>'+esc(s.n)+'</b>.</p><div class="col">'+state.skills.map((k,i)=>'<button class="lh-ob" data-f="'+i+'"><b>'+esc(cat[k].n)+'</b> \u00b7 '+cat[k].mp+' MP<br><small>'+esc(cat[k].d)+'</small></button>').join('')+'</div><div class="row"><button class="lh-ob alt" id="sk-keep">KEEP MY SKILLS</button></div>';
  el.querySelector('#sk-keep').onclick=()=>{sfx('menu');state.skipped.push(idx);done();};
  el.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{sfx('select');state.skills.splice(+b.dataset.f,1,idx);done();});};}
/* ---------- leaderboard (global when signed in to BSMS, always saved locally) ---------- */
function sessionId(){try{return localStorage.getItem('session_id')||localStorage.getItem('bsms_session')||'';}catch(e){return'';}}
function localBoard(){try{return JSON.parse(localStorage.getItem('lh_tower_scores')||'[]');}catch(e){return[];}}
function addLocalScore(f){const r=localBoard();r.push({name:state.name||'Adventurer',floor:f,cls:state.heroClass,level:state.level||1,t:Date.now()});r.sort((a,b)=>b.floor-a.floor||a.t-b.t);try{localStorage.setItem('lh_tower_scores',JSON.stringify(r.slice(0,20)));}catch(e){}}
async function submitTower(f){addLocalScore(f);const sid=sessionId();if(!sid)return false;try{const r=await fetch('/api/last-harvest',{method:'POST',headers:{'Content-Type':'application/json','X-Session-ID':sid},body:JSON.stringify({action:'tower-score',floor:f,cls:state.heroClass,level:state.level||1})});return r.ok;}catch(e){return false;}}
async function showLeaderboard(){const el=ov('<h3>TOWER LEADERBOARD</h3><div id="lb-body">Loading\u2026</div><div class="row"><button class="lh-ob" id="lb-x">CLOSE</button></div>');el.querySelector('#lb-x').onclick=()=>{sfx('menu');el.close();};
 let rows=null,online=false;try{const sid=sessionId();const r=await fetch('/api/last-harvest?action=tower-leaderboard',{headers:sid?{'X-Session-ID':sid}:{}});if(r.ok){const d=await r.json();rows=d.leaderboard||[];online=true;}}catch(e){}
 if(!rows)rows=localBoard().map(x=>({displayName:x.name,floor:x.floor,cls:x.cls,level:x.level}));
 el.querySelector('#lb-body').innerHTML=(rows.length?'<table><tr><th>#</th><th>NAME</th><th>FLOOR</th><th>CLASS</th></tr>'+rows.slice(0,20).map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.displayName||r.name)+'</td><td>'+r.floor+'</td><td>'+esc(r.cls||'')+' L'+(r.level||1)+'</td></tr>').join('')+'</table>':'<p>No climbers yet. Be the first!</p>')+'<p class="note">'+(online?'Global ranking.':'Local ranking only. Sign in to BSMS to join the global leaderboard.')+'</p>';}
/* ---------- the Goldleaf Tower ---------- */
let tower=null;
function towerEnter(){const best=Math.max(0,...localBoard().map(r=>r.floor),0);const el=ov('<h3>GOLDLEAF TOWER</h3><p>Defeat one foe per floor. Your HP and MP carry over, with a small rest between floors. If you fall, your highest floor is posted on the leaderboard.</p><p>Your best: <b>floor '+best+'</b></p><div class="row"><button class="lh-ob" id="tw-go">CLIMB</button><button class="lh-ob alt" id="tw-no">NOT YET</button></div>');
 el.querySelector('#tw-no').onclick=()=>{sfx('menu');el.close();};el.querySelector('#tw-go').onclick=()=>{sfx('select');el.close();tower={floor:1,best:0};towerFloor();};}
function banner(t,sub,cb){const el=document.createElement('div');el.className='lh-banner';el.innerHTML='<div><h2>'+esc(t)+'</h2><p>'+esc(sub||'')+'</p></div>';document.body.appendChild(el);sfx('alert');setTimeout(()=>{el.remove();cb&&cb();},1500);}
function towerFloor(){const f=tower.floor,g=Math.min(9,Math.floor((f-1)/5)),boss=f%10===0,i=g*10+(boss?9:rnd(9)),m=monInfo(i),sc=1+f*.045;
 const enc={id:'tower',tower:true,wild:true,name:m.name,mi:i,hp:Math.round(m.hp*sc*(boss?1.4:1)),atk:Math.round(m.atk*(1+f*.035)),reward:6*f+(boss?60:0),xp:12+f*3+(boss?40:0),win:[],onEnd:won=>towerResult(won)};
 banner('FLOOR '+f,boss?'GUARDIAN FLOOR':GENS[g].toUpperCase()+' CHAMBER',()=>startBattle(enc));}
function towerResult(won){if(won){tower.best=tower.floor;tower.floor++;state.hp=Math.min(state.maxHp,state.hp+Math.round(state.maxHp*.2));state.mp=Math.min(state.maxMp,state.mp+Math.round(state.maxMp*.3));save();whenIdle(towerMenu);}else{const f=tower.best;tower=null;whenIdle(()=>towerEnd(f));}}
function towerMenu(){updateHud();const el=ov('<h3>FLOOR '+tower.best+' CLEARED!</h3><p>You rest briefly. HP '+state.hp+'/'+state.maxHp+' \u00b7 MP '+state.mp+'/'+state.maxMp+'</p><div class="row"><button class="lh-ob" id="tw-up">CLIMB TO '+tower.floor+'</button><button class="lh-ob alt" id="tw-out">LEAVE</button></div>');
 el.querySelector('#tw-up').onclick=()=>{sfx('select');el.close();towerFloor();};el.querySelector('#tw-out').onclick=()=>{sfx('menu');el.close();const f=tower.best;tower=null;towerEnd(f);};}
async function towerEnd(f){AREA=getCity();scene='area';stepper=null;areaPlayer={x:20*32+16,y:11*32+24};state.hp=Math.max(state.hp,Math.ceil(state.maxHp*.5));updateHud();save();const ok=f>0?await submitTower(f):false;
 const el=ov('<h3>TOWER RESULT</h3><p>You reached floor <b>'+f+'</b>.</p><p class="note">'+(f<1?'Climb at least one floor to post a score.':ok?'Score posted to the global leaderboard!':'Saved locally. Sign in to BSMS to post globally.')+'</p><div class="row"><button class="lh-ob" id="tr-b">LEADERBOARD</button><button class="lh-ob alt" id="tr-x">OK</button></div>');
 el.querySelector('#tr-x').onclick=()=>{sfx('menu');el.close();};el.querySelector('#tr-b').onclick=()=>{el.close();showLeaderboard();};}
/* ---------- title screen ---------- */
let titleOpen=false;
function showTitle(hasSave){titleOpen=true;const old=$b('lh-title');if(old)old.remove();const el=document.createElement('div');el.id='lh-title';el.className='press intro';setTimeout(()=>el.classList.remove('intro'),1700);el.innerHTML='<canvas id="lh-title-cv"></canvas><div class="lh-title-menu" id="lh-title-menu"></div>';document.body.appendChild(el);
 const items=[];if(hasSave)items.push(['CONTINUE','continue']);items.push(['NEW GAME','new']);items.push(['TOWER LEADERBOARD','board']);items.push(['SOUND: '+(muted?'OFF':'ON'),'sound']);
 let sel=0;const menu=$b('lh-title-menu');const render=()=>{menu.innerHTML=items.map((it,i)=>'<button class="lh-tbtn'+(i===sel?' sel':'')+'" data-i="'+i+'">'+it[0]+'</button>').join('');};render();
 function closeTitle(){titleOpen=false;removeEventListener('keydown',kd,true);el.classList.add('out');setTimeout(()=>el.remove(),500);if(state.name)updateHud();}
 const choose=i=>{const k=items[i][1];sfx('select');
  if(k==='continue'){closeTitle();}
  else if(k==='new'){if(hasSave){if(!confirm('Start a new adventure? Your saved progress on this device will be replaced.'))return;localStorage.removeItem(SAVE);localStorage.removeItem(BACKUP);try{sessionStorage.setItem('lh_skip_title','1');}catch(e){}location.reload();return;}closeTitle();startNaming();}
  else if(k==='board'){showLeaderboard();}
  else if(k==='sound'){setMuted(!muted);items[i][0]='SOUND: '+(muted?'OFF':'ON');render();if(!muted)playMusic('title');}};
 menu.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b){sel=+b.dataset.i;choose(sel);}});
 function kd(e){if(!titleOpen)return;if(el.classList.contains('press')){if(e.key==='m'||e.key==='M')return;el.classList.remove('press');sfx('select');e.preventDefault();e.stopPropagation();return;}if(e.key==='ArrowDown'||e.key==='s'){sel=(sel+1)%items.length;sfx('menu');render();e.preventDefault();e.stopPropagation();}else if(e.key==='ArrowUp'||e.key==='w'){sel=(sel+items.length-1)%items.length;sfx('menu');render();e.preventDefault();e.stopPropagation();}else if(e.key==='Enter'||e.key===' '||e.key==='e'){choose(sel);e.preventDefault();e.stopPropagation();}}
 addEventListener('keydown',kd,true);el.addEventListener('click',()=>{if(el.classList.contains('press')){el.classList.remove('press');sfx('select');}});animateTitle(el.querySelector('canvas'));}
function animateTitle(cv){const g=cv.getContext('2d'),t0=performance.now(),el=cv.parentElement,leaves=Array.from({length:26},(_,i)=>({x:Math.random(),y:Math.random(),s:2+Math.random()*2,v:.05+Math.random()*.06,ph:Math.random()*6,c:['#e8863a','#d2552e','#f2b84a','#9a5a2a'][i%4]}));
 function frame(){if(!titleOpen||!cv.isConnected)return;const W=cv.width=innerWidth,H=cv.height=innerHeight,t=(performance.now()-t0)/1000;g.imageSmoothingEnabled=false;
  g.fillStyle='#000';g.fillRect(0,0,W,H);
  const bar=(a,b,c)=>{g.fillStyle=c;g.fillRect(0,Math.round(H*a),W,Math.ceil(H*(b-a)));};
  bar(0,.07,'#ee7a2a');bar(.1,.66,'#35b3a1');bar(.66,.69,'#1c6b61');bar(.93,1,'#a8242e');
  g.save();g.beginPath();g.rect(0,H*.1,W,H*.56);g.clip();g.fillStyle='rgba(255,255,255,.07)';for(let i=-2;i<9;i++){const x=((i*W*.17+t*30)%(W*1.4))-W*.2;g.beginPath();g.moveTo(x,H*.1);g.lineTo(x+W*.09,H*.1);g.lineTo(x-W*.12,H*.66);g.lineTo(x-W*.21,H*.66);g.fill();}g.restore();
  for(let i=0;i<40;i++){g.fillStyle='rgba(255,255,230,'+(.25+.5*Math.abs(Math.sin(t*1.3+i)))+')';g.fillRect((i*131)%W,H*.1+((i*57)%Math.floor(H*.5)),3,3);}
  if(BOS.naturalWidth){const ks=Math.max(2,Math.floor(Math.min(H*.72,W*.42)/64)),bw=64*ks,cx=W*.74,fy=H*.93+Math.sin(t*2)*4-2;
   const gl=g.createRadialGradient(cx,fy-bw*.5,bw*.1,cx,fy-bw*.5,bw*.75);gl.addColorStop(0,'rgba(255,190,70,.6)');gl.addColorStop(1,'rgba(255,190,70,0)');g.fillStyle=gl;g.fillRect(cx-bw,fy-bw*1.3,bw*2,bw*1.6);
   g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.ellipse(cx,H*.93,bw*.4,ks*5,0,0,7);g.fill();
   g.drawImage(BOS,0,(Math.floor(t*2)%2)*64,64,64,Math.round(cx-bw/2),Math.round(fy-bw),bw,bw);
   for(let i=0;i<16;i++){const ph=(t*.5+i*.137)%1,x=cx-bw*.3+((i*53)%60)/60*bw*.6+Math.sin(t*3+i)*ks*2,y=fy-bw*.75-ph*bw*.55;g.fillStyle=['#ffd84a','#ff9a2e','#ff5a2e'][i%3];g.globalAlpha=1-ph;g.fillRect(Math.round(x),Math.round(y),ks,ks);}g.globalAlpha=1;}
  leaves.forEach(l=>{l.y+=l.v*.016;l.x+=Math.sin(t*1.5+l.ph)*.0004;if(l.y>1.05){l.y=-.05;l.x=Math.random();}g.save();g.translate(l.x*W,l.y*H);g.rotate(t*1.2+l.ph);g.fillStyle=l.c;g.fillRect(-l.s*2,-l.s,l.s*4,l.s*2);g.restore();});
  const fs=Math.max(18,Math.min(W*.05,H*.085)),lx=W<600?W*.5:W*.29,by=H*.27+Math.sin(t*2)*3;g.textAlign='center';g.lineJoin='round';
  g.font='bold '+Math.round(fs*.8)+'px "Press Start 2P",monospace';g.lineWidth=fs*.3;g.strokeStyle='#2a2a8a';g.strokeText('THE LAST',lx,by);g.fillStyle='#ffd23c';g.fillText('THE LAST',lx,by);
  g.font='bold '+Math.round(fs*1.15)+'px "Press Start 2P",monospace';g.lineWidth=fs*.34;g.strokeStyle='#15151a';g.strokeText('HARVEST',lx,by+fs*1.45);g.fillStyle='#ffffff';g.fillText('HARVEST',lx,by+fs*1.45);
  const rw=fs*7.4,ry=by+fs*1.95;g.fillStyle='#15151a';g.fillRect(lx-rw/2-3,ry-3,rw+6,fs*.8+6);g.fillStyle='#d8362e';g.fillRect(lx-rw/2,ry,rw,fs*.8);g.fillStyle='#fff';g.font=Math.round(fs*.34)+'px "Press Start 2P",monospace';g.fillText('AUTUMN  ADVENTURE',lx,ry+fs*.54);
  if(el&&el.classList.contains('press')&&Math.floor(t*1.6)%2===0){g.font='bold '+Math.round(Math.max(12,fs*.42))+'px "Press Start 2P",monospace';g.lineWidth=5;g.strokeStyle='#202020';g.strokeText('PRESS START',lx,H*.83);g.fillStyle='#aab0b8';g.fillText('PRESS START',lx,H*.83);}
  g.font=Math.round(Math.max(8,H*.026))+'px "Press Start 2P",monospace';g.fillStyle='#ffe9a0';g.fillText('\u00A9 2026 BSMS WEB',W/2,H*.975);
  requestAnimationFrame(frame);}requestAnimationFrame(frame);}

/* ---------- new game flow: letter-grid name entry, then "boy or girl?" ---------- */
const BLOCKED=['avttre','avttn','snttbg','ergneq','phag','xvxr','puvax','genaal'];
function nameOk(n){const rot=t=>t.replace(/[a-z]/g,c=>String.fromCharCode((c.charCodeAt(0)-97+13)%26+97)),map={'0':'o','1':'i','3':'e','4':'a','5':'s','@':'a','$':'s'},norm=n.toLowerCase().replace(/[01345@$]/g,c=>map[c]).replace(/[^a-z]/g,'');return!BLOCKED.some(b=>norm.includes(rot(b)));}
function frSprite(cv,row){const go=()=>{if(!CHARS.naturalWidth)return false;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,16,16);c.drawImage(CHARS,0,row*16,16,16,0,0,16,16);return true;};if(!go()){let n=0;const iv=setInterval(()=>{if(go()||++n>40)clearInterval(iv);},200);}}
function startNaming(){titleOpen=true;const old=$b('lh-name');if(old)old.remove();
 const el=document.createElement('div');el.id='lh-name';el.className='lh-fr';
 el.innerHTML='<div class="lh-fr-panel"><div class="lh-fr-hero"><canvas width="16" height="16"></canvas></div><div><div class="lh-fr-q">YOUR NAME?</div><div class="lh-fr-slots" id="lh-fr-slots"></div></div></div><div class="lh-fr-main"><div class="lh-fr-kb" id="lh-fr-kb"></div><div class="lh-fr-side"><button class="lh-fr-btn orange" data-k="case"></button><small>CASE</small><button class="lh-fr-btn yellow" data-k="back">BACK</button><small>BACKSPACE</small><button class="lh-fr-btn yellow" data-k="ok">OK</button><small>ENTER</small></div></div><p class="lh-fr-msg" id="lh-fr-msg"></p><p class="lh-fr-hint">TAP THE LETTERS \u00b7 OR USE YOUR KEYBOARD</p>';
 document.body.appendChild(el);frSprite(el.querySelector('canvas'),4);
 const ROWS=['ABCDEF.','GHIJKL,','MNOPQRS','TUVWXYZ','1234567','890-!? '],COLS=[1,2,3,5,6,7,9],MAX=10;let name='',upper=true,cur={r:0,c:0};
 const msg=t=>{$b('lh-fr-msg').textContent=t||'';};
 const render=()=>{$b('lh-fr-slots').innerHTML='\u25B6'+Array.from({length:MAX},(_,i)=>{const ch=name[i];return'<span'+(i===name.length?' class="cur"':'')+'>'+(ch?(ch===' '?'&nbsp;':ch.replace('&','&amp;').replace('<','&lt;')):'_')+'</span>';}).join('');
  $b('lh-fr-kb').innerHTML=ROWS.map((row,r)=>[...row].map((ch,c)=>'<button data-r="'+r+'" data-c="'+c+'" data-ch="'+(ch===' '?'SP':ch)+'" style="grid-column:'+COLS[c]+';grid-row:'+(r+1)+'"'+(r===cur.r&&c===cur.c?' class="cur"':'')+'>'+(ch===' '?'SP':(upper?ch.toUpperCase():ch.toLowerCase()))+'</button>').join('')).join('');
  el.querySelector('[data-k=case]').textContent=upper?'lower':'UPPER';};
 const add=ch=>{if(name.length<MAX){name+=ch;sfx('menu');msg('');}render();};
 const back=()=>{name=name.slice(0,-1);sfx('menu');msg('');render();};
 const done=()=>{const n=name.trim();if(!n){sfx('hit');msg('PLEASE ENTER A NAME!');return;}if(!nameOk(n)){sfx('hit');msg('THAT NAME CAN\'T BE USED.');name='';render();return;}sfx('select');removeEventListener('keydown',kd,true);el.remove();startGender(n);};
 const kd=e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;if(e.key==='Backspace'){back();}else if(e.key==='Enter'){done();}else if(e.key.length===1&&/[A-Za-z0-9 .,\-!?]/.test(e.key)){add(e.key);}else return;e.preventDefault();e.stopPropagation();};
 addEventListener('keydown',kd,true);
 el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.k==='case'){upper=!upper;sfx('menu');render();}else if(b.dataset.k==='back')back();else if(b.dataset.k==='ok')done();else if(b.dataset.ch){cur={r:+b.dataset.r,c:+b.dataset.c};const ch=b.dataset.ch==='SP'?' ':(upper?b.dataset.ch.toUpperCase():b.dataset.ch.toLowerCase());add(ch);}});
 render();}
function startGender(name){titleOpen=true;const old=$b('lh-gender');if(old)old.remove();
 const el=document.createElement('div');el.id='lh-gender';el.className='lh-fr gender';
 el.innerHTML='<div class="lh-gd-stage"><button class="lh-gd-card boy sel" data-g="boy"><canvas width="16" height="16"></canvas><b>BOY</b></button><button class="lh-gd-card girl" data-g="girl"><canvas width="16" height="16"></canvas><b>GIRL</b></button></div><div class="lh-gd-box"><p id="lh-gd-t"></p><div class="lh-gd-yn" id="lh-gd-yn" hidden><button data-y="1">YES</button><button data-y="0">NO</button></div></div>';
 document.body.appendChild(el);const cvs=el.querySelectorAll('canvas');frSprite(cvs[0],4);frSprite(cvs[1],8);
 let g='boy',stage=0,tw=null;
 const say=t=>{clearInterval(tw);const p=$b('lh-gd-t');p.textContent='';let i=0;tw=setInterval(()=>{p.textContent=t.slice(0,++i);if(i>=t.length)clearInterval(tw);},22);};
 const ask=()=>{stage=0;$b('lh-gd-yn').hidden=true;say('Are you a boy or a girl?');};
 const pick=v=>{g=v;el.querySelectorAll('.lh-gd-card').forEach(c=>c.classList.toggle('sel',c.dataset.g===v));sfx('menu');};
 const confirm_=()=>{stage=1;$b('lh-gd-yn').hidden=false;say('So you are '+name+', a '+(g==='boy'?'boy':'girl')+'. Is that right?');};
 const finish=()=>{removeEventListener('keydown',kd,true);clearInterval(tw);el.remove();state.gender=g;applyGender();titleOpen=false;$('lh-name-input').value=name;sfx('select');startIntro();};
 const kd=e=>{if(stage===0){if(e.key==='ArrowLeft'||e.key==='a')pick('boy');else if(e.key==='ArrowRight'||e.key==='d')pick('girl');else if(e.key==='Enter'||e.key===' ')confirm_();else return;}else{if(e.key==='Enter'||e.key==='y'||e.key==='Y')finish();else if(e.key==='Escape'||e.key==='Backspace'||e.key==='n'||e.key==='N')ask();else return;}e.preventDefault();e.stopPropagation();};
 addEventListener('keydown',kd,true);
 el.addEventListener('click',e=>{const y=e.target.closest('[data-y]');if(y){if(y.dataset.y==='1')finish();else ask();return;}const c=e.target.closest('.lh-gd-card');if(c){pick(c.dataset.g);confirm_();}});
 ask();}
/* ---------- chapter regions, Goldleaf City ---------- */
const BIO={
0:{g:[['t',0],['t',1],['t',0],['t',2]],tint:'rgba(255,220,140,.08)',ob:[{a:3,b:15,two:1},{a:4,b:16,two:1},{a:5}]},
1:{g:[['t',0],['t',0],['t',1],['t',2]],tint:'rgba(210,120,30,.16)',ob:[{a:3,b:15,two:1},{a:4,b:16,two:1},{a:27},{a:28},{a:5}]},
2:{g:[['t',0],['t',1],['t',0],['t',2]],tint:'rgba(255,200,70,.14)',ob:[{a:3,b:15,two:1},{a:27},{a:3,b:15,two:1},{a:5}],dec:[['f',96],['f',85],['f',6],['f',20],['f',44]]},
3:{g:[['t',0],['t',1]],tint:'rgba(20,120,110,.38)',ob:[{a:5},{a:28},{sh:'b',a:37},{sh:'b',a:38},{sh:'b',a:36}],dec:[['f',64],['f',65]]},
4:{g:[['d',48],['d',49],['d',50],['d',48]],tint:'rgba(40,10,70,.38)',ob:[{sh:'d',a:89},{sh:'f',a:96},{sh:'f',a:85},{sh:'d',a:28}],dec:[['d',113],['d',115]]},
5:{hall:1,tint:'rgba(70,20,20,.3)',ob:[{i:[0,2,1,1]},{i:[1,2,1,1]},{i:[7,4,1,1]},{sh:'f',a:85},{i:[20,17,1,1]}],dec:[['d',113],['f',74]]},
6:{g:[['t',0],['t',1],['t',2]],tint:'rgba(215,235,255,.6)',ob:[{a:4,b:16,two:1},{a:28},{a:4,b:16,two:1},{sh:'f',a:77}]},
7:{g:[['d',0],['d',1],['d',0],['d',12]],tint:'rgba(20,0,30,.4)',ob:[{sh:'d',a:28},{sh:'d',a:40},{sh:'d',a:64},{sh:'d',a:58}]},
8:{g:[['t',25],['t',39],['t',40],['t',25]],tint:'rgba(140,20,40,.32)',ob:[{sh:'f',a:79},{sh:'f',a:67},{a:28},{sh:'f',a:89}],dec:[['f',79],['f',67]]},
9:{g:[['t',0],['t',2],['t',1]],tint:'rgba(255,220,120,.24)',ob:[{a:3,b:15,two:1},{a:5},{a:4,b:16,two:1}],dec:[['f',83],['f',8],['t',2]]}};
const STORY={
1:{intro:['AUTUMNWOOD FOREST. The golden leaves drift upward here, as if pointing the way.','Your mother\u2019s journal says the Keepers marked this wood with the First Seal.'],
 npcs:[['HAZEL THE HUNTER',25,['Careful, traveler. The Thornback Stag used to be a gentle spirit of these woods.','Hunger drives him mad now. He guards the First Seal at the far end of the forest.']],['OLD WILLOW',26,['I knew your parents. Mara hummed to the trees while Thomas carried the lantern.','They were taken through the Seal door, deeper into the valley. Follow the golden leaves.','Your father left a lantern mark on the oldest trees. Look for a little star scratched into the bark.']],['PIP',27,['Psst! The Stag hates sudden noises. But he loves ripe apples!','If you hear antlers rattle, run in zig-zags.','I found tiny hoofprints circling the old seal. They stop where the golden leaves begin.']]],
 post:['The Stag\u2019s antlers crumble into golden leaves and the First Seal glows.','A thread of light stretches toward the Golden Apple Valley.']},
2:{intro:['GOLDEN APPLE VALLEY. Once the richest orchard in the land, now every tree hangs heavy with rot.'],
 npcs:[['ORCHARD KEEPER DAHLIA',28,['The Golem is made of everything we failed to harvest: rotten apples, broken crates, forgotten work.','Your mother hid a scarf in the oldest tree. It still carries Keeper magic.','She told me once that a family is not held together by blood alone. Remember that when the road gets difficult.']],['FARMER FLINT',24,['Our harvest vanished after a masked merchant bought every crate \u201cfor the Hollow table.\u201d','I should never have sold to him.']],['BRIGAND BRUNO',38,['I used to raid this orchard. Then the Golem ate my cart. Never again!','Keep to the dirt path and avoid the rotten patches.']]],
 post:['The Golem collapses into compost and a single golden apple tree grows from it.','Mara\u2019s scarf glows, pointing toward the Sunken Pantry where the Keepers kept their ledger.']},
3:{intro:['THE SUNKEN PANTRY. The old larder lies flooded, its shelves full of silent jars.'],
 npcs:[['FISHER MARLO',29,['The Chef drowned guarding the Keepers\u2019 ledger. Now he cooks for no one and nothing.','His ladle can freeze you in place. Strike when he lifts it.']],['WAITER GHOST',44,['Table for none. The Chef still sets places for the Keepers who never returned.','He remembers your father. Thomas always praised his soup.']],['ORACLE SELENE',37,['I see a ledger bound in blue ribbon. Page seven lists a delivery: \u201cone Keeper, to the Shadowmarket.\u201d','Your parents are alive, but the road to them runs through shadows.','The ledger has a second message pressed into its back cover: “The door opens only for a shared promise.”']]],
 post:['The Chef smiles one last time and sinks into the water. The blue ledger floats up.','Page seven: \u201cDelivered to the Masked Merchant, Shadowmarket.\u201d Your parents were sold in the dark.']},
4:{intro:['SHADOWMARKET. Lanterns burn without flame, and every stall sells something you will regret buying.'],
 npcs:[['SMUGGLER VEX',30,['Everything has a price here, even the truth. Free tip: the Merchant never works alone.','A boy in a green cloak asked about your parents last night. He looked scared.']],['SHADOW BROKER',31,['Your friend Rowan sold his name for a promise: his lost mother\u2019s necklace, found.','The Merchant keeps promises exactly as written, and not one letter more.']],['MERCHANT MARISOL',42,['Don\u2019t look at me like that. I only sell potions. Honest ones. Mostly.','If you break the Merchant\u2019s mask, the shadows may let go.']]],
 post:['The Merchant\u2019s mask cracks and a hollow wind rushes out. A note falls: \u201cRowan has chosen. Come to the Banquet Hall.\u201d','Your heart sinks. Rowan, your oldest friend, waits at the end of the road.']},
5:{intro:['THE BROKEN BANQUET HALL. A feast frozen in time: plates still full, candles still burning, nobody left to eat.'],
 npcs:[['HALL STEWARD ORLAN',45,['The young man in dark armor sits at the head table. He says he is saving a seat for you.','He keeps whispering: \u201cIf I win, I get to see them again.\u201d']],['NELL THE TRAVELER',18,['I saw Rowan weeping at the table. The Hollow King promised him his parents back.','Do not hate him. Hunger makes liars of kings and promises of ghosts.','I saw Rowan leave a little wooden bird on the table. He carved it for you years ago. He has not forgotten who he was.']],['ANCIENT KEEPER',47,['The Hollow King was never a monster by birth. He was the first guest we turned away.','Break the chain around Rowan\u2019s heart with kindness, not just strength.']]],
 post:['The black armor falls away and Rowan collapses, free. \u201cI\u2019m sorry,\u201d he whispers. \u201cI only wanted my family back.\u201d','Rowan vows to guard the village while you finish the journey. A golden thread leads north to the Frostfall Mountains.']},
6:{intro:['FROSTFALL MOUNTAINS. Snow falls in perfect silence. Somewhere above, a king hoards the last feast of winter.'],
 npcs:[['FROST RANGER ILSA',32,['The Turkey King was a gentle harvest spirit, until the Hollow King taught him to hoard.','He sits atop the watchtower guarding a table that never empties and never feeds anyone.']],['MONK TORV',33,['Hunger and greed wear the same crown. Remind him what a feast is for: sharing.','Take the lantern path. The avalanche slope is a trap.']],['ICE SPRITE',46,['Hee hee! Want to see my snow fort? The King is grumpy because nobody visits him anymore.']]],
 post:['The Turkey King laughs for the first time in a century and tears the golden feast apart: \u201cTake it. Share it.\u201d','The watchtower gate opens, revealing the road to the Hollow Fortress.']},
7:{intro:['THE HOLLOW FORTRESS. Black banners hang from towers built to keep the world out and the hunger in.'],
 npcs:[['CAPTAIN ALDRIC',34,['I served the First Keepers. When the Hollow King rose I swore to hold this gate. I failed.','My brother wears the Hollow Knight\u2019s armor now. Free him, and the fortress will fall silent.']],['SISTER MIRELLE',35,['Beneath the throne lies the First Promise, carved by the Keepers: \u201cNo table shall stand empty.\u201d','The Hollow King broke it, but promises can be repaired.']],['TINKER COG',36,['I built these doors, you know. Clockwork, gears, the whole thing. The knight smashes through them like paper!']]],
 post:['The Hollow Knight kneels, his armor falling to dust. Captain Aldric salutes: \u201cGo. The throne is open.\u201d','Deep within, a golden door hums with the Everfeast\u2019s last light.']},
8:{intro:['EVERFEAST SANCTUARY. The golden table stretches into darkness, set for a feast that never began.'],
 npcs:[['ANCIENT KEEPER',47,['This is where it began, child. The King was our first guest, the one we forgot to invite.','He does not want to destroy the feast. He wants a seat at it.']],['MARA',8,['(a faint echo) We are here, sweetheart\u2026 beyond the King. Be brave.']],['THOMAS',9,['(a faint echo) We left the lantern lit for you.']]],
 post:['The Hollow King\u2019s crown shatters. He looks at the empty table, then at you. \u201cMay I\u2026 sit?\u201d','The golden door of the Heart opens.']},
9:{intro:['HEART OF HEARTHVALE. The Everfeast\u2019s beating heart: a garden of gold under a sky of stars.'],
 npcs:[['MARA',8,['My darling! You came all this way\u2026 The Heart Guardian only tests those who love Hearthvale.']],['THOMAS',9,['We were never lost. The Heart held us safe until someone brave enough could share the feast again.']],['ROWAN',3,['I made it too! Whatever it asks, we face it together.']]],
 post:['The Heart Guardian blooms into a thousand lanterns. The Everfeast burns bright again.','Hearthvale is saved, and the whole village sits at one long golden table. There is a seat for everyone, even the Hollow King.','The lanterns rise above Hearthvale. For the first time in a long while, nobody is left outside the circle of light.']}};
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const AREAS={};let AREA=null,areaPlayer={x:0,y:0};
function getRegion(c){return AREAS['r'+c]||(AREAS['r'+c]=genRegion(c));}
function getCity(){return AREAS.city||(AREAS.city=genCity());}
function genRegion(c){const B=BIO[c],S=STORY[c],w=44,h=26,rng=mulberry(c*7919+13),T=(x,y)=>y*w+x;
 const open=new Uint8Array(w*h),solid=new Uint8Array(w*h),ob=new Uint8Array(w*h),enc=new Uint8Array(w*h),pathY=[];
 let py=13;for(let x=0;x<w;x++){if(x>6&&x<w-10&&rng()<.3)py+=rng()<.5?-1:1;py=Math.max(6,Math.min(h-7,py));pathY[x]=py;}
 const carve=(x,y)=>{if(x>0&&y>0&&x<w-1&&y<h-1)open[T(x,y)]=1;};
 for(let x=0;x<w-1;x++)for(let dy=-1;dy<=1;dy++)carve(x,pathY[x]+dy);
 const npcPos=[];[[10,-4],[22,4],[33,-4]].forEach(([cx,off])=>{const cy=pathY[cx]+off;for(let y=cy-3;y<=cy+3;y++)for(let x=cx-4;x<=cx+4;x++)if(((x-cx)/4.4)**2+((y-cy)/3.4)**2<=1)carve(x,y);for(let y=Math.min(cy,pathY[cx]);y<=Math.max(cy,pathY[cx]);y++)for(let dx=0;dx<2;dx++)carve(cx+dx,y);npcPos.push([cx,cy]);});
 const bx=w-8,by=pathY[bx];for(let y=by-5;y<=by+5;y++)for(let x=bx-4;x<=bx+5;x++)carve(x,y);
 for(let y=pathY[1]-2;y<=pathY[1]+2;y++)for(let x=1;x<=5;x++)carve(x,y);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=T(x,y);if(!open[i]){if(x===0||y===0||x===w-1||y===h-1||rng()<.8){solid[i]=1;ob[i]=1+Math.floor(rng()*B.ob.length);}}else if(x>6&&x<bx-5&&Math.abs(y-pathY[x])>2&&rng()<.5)enc[i]=1;}
 const dec=[];if(B.dec)for(let k=0;k<70;k++){const x=1+Math.floor(rng()*(w-2)),y=1+Math.floor(rng()*(h-2));if(open[T(x,y)]&&!solid[T(x,y)])dec.push({x,y,d:B.dec[Math.floor(rng()*B.dec.length)]});}
 solid[T(0,pathY[1])]=0;ob[T(0,pathY[1])]=0;
 const npcs=S.npcs.map((n,k)=>({x:npcPos[k][0],y:npcPos[k][1],name:n[0],lines:n[2]}));if(c===1)npcs.push({x:8,y:pathY[8],name:'ROWAN',lines:['I caught up with you! I was not going to let you walk into these woods alone.','Look at the leaves. They are drifting toward that old stone arch. I think your parents left us a trail.','I found this little ribbon caught on a branch. It has your mother’s initials. We are getting closer.'],friend:true});
 const rivalSets={
1:[['TAMSIN THE SCOUT','I have been tracking the strange lights too. If you want to reach the seal, show me you can handle yourself.','Quick feet! You might just make it through these woods.'],['CALEB THE WARDEN','The forest is no place for an untested traveler. Let us see what you have learned.','You have earned my respect. The guardian will be a tougher test.']],
2:[['BRUNO THE WAYFARER','The orchard road is dangerous. I challenge every traveler before I let them pass.','You fight with purpose. Keep going; the valley needs you.'],['LYRA THE GATHERER','I protect the last healthy trees. If you want to go farther, prove you can protect yourself.','A fine battle. Take the eastern path; the old pantry is below.']],
3:[['MILO THE DIVER','Nobody enters the flooded halls without proving they can handle the current. Ready?','You held your ground. The ledger must be close.'],['SABLE THE COOK','I guard the pantry stores. The things below have changed, and so have I. Face me!','You are stronger than I expected. Find the lantern passage.']],
4:[['PERRIN THE CARTOGRAPHER','I mapped this pass, and I do not trust strangers crossing it. A friendly battle will settle this.','You have the skill to cross the pass. Watch the cliffs.'],['AVA THE LOOKOUT','I have watched the mountain trail for weeks. Let us see if you are ready for what waits above.','Well fought. The summit is closer than you think.']],
5:[['DAX THE DUELIST','The old arena still has one rule: challengers must prove their skill. Shall we?','You have earned the right to continue.'],['NIA THE SENTINEL','I stand between this road and the danger beyond. Show me your resolve.','The road is yours. Do not let your guard down.']],
6:[['ORREN THE FROST GUIDE','The cold makes every step harder. A quick battle will tell me if you are ready.','You kept your focus. Follow the blue lanterns.'],['ELLA THE HERBALIST','I protect the healing herbs from anyone who might misuse them. Let us test your skill.','You have a steady heart. The next trail is open.']],
7:[['FINCH THE RUIN SEEKER','These ruins are full of traps and secrets. I challenge anyone who comes this way.','You have earned your place among the ruins.'],['MIRA THE ARCHIVIST','Knowledge alone will not save you in the halls ahead. Show me your strength.','You are ready to uncover what lies here.']],
8:[['TOR THE LANTERN KNIGHT','The lantern road is under my protection. Prove your courage in a fair match.','Your light is strong. Keep it close.'],['VESPER THE WANDERER','I have followed the Hollow King for miles. I will not let an unready traveler reach him.','You may pass. Make your journey count.']],
9:[['REN THE LAST SENTINEL','This is the final road. I cannot let you face the guardian without one last test.','You are ready. The final guardian awaits.'],['ELIO THE KEEPER','I once served your family. Let us see whether their courage lives on in you.','The Keepers would be proud. Go finish what they began.']]
 };
 const rivals=(rivalSets[c]||[]).map((r,k)=>{const id='rival'+c+'_'+k;const trainer={id,name:r[0],hp:34+c*15+k*8,atk:5+c*2+k,reward:18+c*8,xp:22+c*12,row:k?7:2,lines:[r[1]],win:[r[2]]};return{x:k?29:15,y:pathY[k?29:15],name:r[0],lines:[r[1]],trainer,rival:true,row:trainer.row};});
 npcs.push(...rivals);
 const g={id:'boss'+c,name:BOSSES[c].name,bi:c,lines:BOSSES[c].lines,win:BOSSES[c].win};
 npcs.push({x:bx+1,y:by,name:BOSSES[c].name,trainer:g,boss:true,bi:c});
 for(let dy=-1;dy<=1;dy++)for(let dx=0;dx<=2;dx++){solid[T(bx+dx,by+dy)]=1;ob[T(bx+dx,by+dy)]=0;}
 for(let dy=-1;dy<=1;dy++){solid[T(0,pathY[1]+dy)]=0;ob[T(0,pathY[1]+dy)]=0;if(c<9){solid[T(w-1,pathY[w-2]+dy)]=0;ob[T(w-1,pathY[w-2]+dy)]=0;}}const exits=[{x:0,y:pathY[1],to:c===1?'village':'route',route:c-1}];if(c<9)exits.push({x:w-1,y:pathY[w-2],to:'route',route:c+1});return{id:'r'+c,chapter:c,name:chapters[c].place,routeName:'ROUTE '+c+' · '+chapters[c].place,w,h,solid,ob,enc,dec,npcs,spawn:{x:2,y:pathY[1]},exits,bio:B,boss:g,pathY,mus:'wander'};}
function genCity(){const w=40,h=26,solid=new Uint8Array(w*h),ground=new Uint8Array(w*h),ob=new Uint8Array(w*h),T=(x,y)=>y*w+x,rng=mulberry(777),B=BIO[0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let r=0;if(y>=12&&y<=14)r=1;if(x>=18&&x<=21&&y>=8)r=1;if(x>=12&&x<=27&&y>=10&&y<=19)r=2;ground[T(x,y)]=r;}
 const bld=[{n:'tower',x:17,y:0,w:6,h:9},{n:'inn',x:3,y:3,w:8,h:5},{n:'store',x:29,y:3,w:8,h:5},{n:'house1',x:4,y:16,w:5,h:4},{n:'house2',x:31,y:16,w:5,h:4},{n:'house3',x:5,y:21,w:6,h:4}];
 bld.forEach(b=>{for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)solid[T(x,y)]=1;});
 for(let y=15;y<=16;y++)for(let x=18;x<=21;x++)solid[T(x,y)]=1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=T(x,y);if(solid[i]||ground[i])continue;if(x===0||y===h-1||x===w-1||(y===0&&(x<17||x>22))||rng()<.07){solid[i]=1;ob[i]=1+Math.floor(rng()*3);}}
 const npcs=[
 {x:20,y:10,name:'TOWER KEEPER',act:'tower',lines:['Welcome to the Goldleaf Tower! Every floor holds a stronger foe.','Climb as high as you dare. The highest climber wins eternal glory.']},
 {x:23,y:10,name:'LEADERBOARD',act:'board',lines:[]},
 {x:13,y:11,name:'GOLDLEAF MAYOR',lines:['Welcome to Goldleaf City! Once a market for the Everfeast, now a refuge for travelers.','They say the Tower grows a floor every time a champion falls. Mind your step.']},
 {x:33,y:8,name:'MERCHANT MARISOL',act:'shop',lines:[]},
 {x:7,y:8,name:'INNKEEPER ROSA',act:'inn',lines:[]},
 {x:26,y:17,name:'WREN THE APPRENTICE',lines:['I\u2019m training to climb the Tower someday. Floor ten is my dream!','Tip: keep a few potions for the guardian floors.']},
 {x:9,y:20,name:'GUS',lines:['Goldleaf\u2019s bread is the best. Don\u2019t tell the village I said that.']}];
 return{id:'city',chapter:0,city:true,name:'Goldleaf City',w,h,solid,ob,ground,enc:null,dec:[],npcs,spawn:{x:1,y:13},exits:[{x:0,y:12,to:'village'},{x:0,y:13,to:'village'},{x:0,y:14,to:'village'}],bio:B,bld,mus:'village'};}
function enterRegion(c){const A=getRegion(c);startArea(A,A.spawn.x,A.spawn.y);playRegionIntro(c);}
 function openTeleporter(){if(scene!=='outside'||dialogue||battle||cinematic)return;const options=[{id:'village',label:'Hearthvale Village',detail:'Return to the village square',open:true},{id:'wilds',label:'The Wildlands',detail:'Training grounds and Ranger Camp',open:!!(state.beaten&&state.beaten.north)},{id:'city',label:'Goldleaf City',detail:'The Tower and city shops',open:!!state.cityUnlocked}];for(let c=1;c<=9;c++)options.push({id:'region'+c,label:chapters[c].place,detail:'Chapter '+(c+1)+' · '+chapters[c].title,open:(Number(state.stage)||0)>=c});const menu=ov('<h3>HEARTHVALE TELEPORTER</h3><p>Choose a destination. Your journey will resume at its arrival point.</p><div class="col">'+options.map(o=>'<button class="lh-ob '+(o.open?'':'alt')+'" data-dest="'+o.id+'" '+(o.open?'':'disabled style="opacity:.42;cursor:not-allowed"')+'>'+o.label+'<br><small>'+o.detail+(o.open?'':' · LOCKED')+'</small></button>').join('')+'</div><div class="row"><button class="lh-ob alt" data-close> CLOSE </button></div>','lh-teleporter-menu');menu.querySelector('[data-close]').addEventListener('click',()=>menu.close());menu.querySelectorAll('[data-dest]:not(:disabled)').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.dest;menu.close();teleportTo(id);}));}
 function teleportTo(id){sfx('portal');if(id==='village'){if(scene==='area')leaveArea('village');else{scene='outside';AREA=null;state.x=25*TILE+16;state.y=15*TILE+56;updateHud();save();}return;}if(id==='wilds'){enterWilds();return;}if(id==='city'){enterArea('city');return;}const m=/^region(\d+)$/.exec(id);if(m){const c=Number(m[1]);if(c>=1&&c<=9&&(Number(state.stage)||0)>=c)enterRegion(c);}}
function startArea(A,tx,ty){AREA=A;A.leaving=false;A.bossTalk=0;scene='area';stepper=null;facing=3;areaPlayer={x:tx*32+16,y:ty*32+24};sfx('portal');updateHud();}
function enterArea(id){if(id==='city'){startArea(getCity(),1,13);setDialogue([['GOLDLEAF MAYOR','Welcome to Goldleaf City, traveler! The Tower stands to the north.']]);}}
function leaveArea(to){sfx('portal');const c=AREA&&AREA.chapter;const city=AREA&&AREA.city;const ret=AREA&&AREA.ret;AREA=null;scene='outside';stepper=null;if(city){state.x=44*TILE+16;state.y=12*TILE+24;}else if(ret){state.x=ret.x;state.y=ret.y;}else{state.x=16*TILE+16;state.y=32*TILE+24;}updateHud();save();}
function areaHit(x,y){const A=AREA,tx=Math.floor(x/32),ty=Math.floor(y/32);if(tx<0||ty<0||tx>=A.w||ty>=A.h)return true;if(A.solid[ty*A.w+tx])return true;return A.npcs.some(n=>n.x===tx&&n.y===ty);}
function areaWild(c){const g=Math.max(0,Math.min(9,c+(Math.random()<.35?0:-1))),i=g*10+rnd(9),m=monInfo(i);return{id:'wild',wild:true,name:m.name,mi:i,hp:Math.round(m.hp*1.1),atk:m.atk,reward:m.reward,xp:15+g*14,win:[]};}
function areaStep(){const A=AREA,tx=Math.floor(areaPlayer.x/32),ty=Math.floor(areaPlayer.y/32);
 if(A.wilds){const z=A.zone[ty*A.w+tx];if(z!==A.curZone){const first=A.curZone===undefined;A.curZone=z;A.name=WZ[z].n;updateHud();if(!first)banner(WZ[z].n,'Monsters Lv '+WZ[z].lv);}}
 const routeExit=A.exits.find(e=>e.x===tx&&e.y===ty);if(routeExit){if(routeExit.to==='village'){leaveArea('village');return;}if(routeExit.to==='route'){const target=routeExit.route,needed='boss'+(target-1);if(target>A.chapter&&!state.beaten[needed]){setDialogue([['JOURNAL','The path ahead is sealed. Defeat this route’s Guardian before traveling onward.']]);return;}const next=getRegion(target),entry=target>A.chapter?1:next.w-2;startArea(next,entry,next.pathY[entry]);next.routeName='ROUTE '+target+' · '+chapters[target].place;setDialogue([['JOURNAL','The restored seal has opened the way. You travel along the connecting trail into '+chapters[target].place+'. New paths, people, and discoveries await.']]);return;}}
 if(A.boss&&!state.beaten[A.boss.id]&&mainQuestReady(A.chapter)){const n=A.npcs.find(q=>q.boss);if(n&&!A.bossTalk&&Math.hypot(areaPlayer.x-(n.x*32+16),areaPlayer.y-(n.y*32+24))<5*32){areaBossIntro(n);return;}}
 if(A.enc&&A.enc[ty*A.w+tx]&&Math.random()<.12&&!battle&&!dialogue)startBattle(areaWild(A.wilds?A.zone[ty*A.w+tx]:A.chapter));else if(A.pathY&&tx>7&&tx<A.w-14&&Math.abs(ty-A.pathY[tx])<=1&&Math.random()<.03&&!battle&&!dialogue)startBattle(areaWild(A.chapter));}
function mainQuestData(c){state.mainQuests=state.mainQuests||{};return state.mainQuests[c]||(state.mainQuests[c]={talked:[],kills:0,complete:false});}
function mainQuestReady(c){if(!c)return true;const q=mainQuestData(c);return !!q.complete||((q.talked||[]).length>=2&&(q.kills||0)>=3);}
function recordMainQuestTalk(n){if(!AREA||!AREA.chapter||!n||n.boss||n.alpha||n.chest||n.act)return;const q=mainQuestData(AREA.chapter);if(!q.talked.includes(n.name)){q.talked.push(n.name);save();updateQuest();}}
function storyArcTalk(n){
 const arcs=[
 {id:'market_truth',start:'SMUGGLER VEX',meet:'SHADOW BROKER',title:'A Name Left Behind',reward:150,potions:1,
  ask:'I know who sold Rowan the promise that trapped him. The Shadow Broker keeps the original contract. Speak with them, then come back. I want that name cleared from the record.',
  clue:'The contract was written in the Hollow King’s ink. Rowan did not sell his family—he traded his own name because he believed it was the only way to save them. Take this torn copy back to Vex.',
  done:'The record is corrected. Rowan deserves to be remembered for more than one desperate choice. Thank you for helping me set the story straight.'},
 {id:'frost_lanterns',start:'FROST RANGER ILSA',meet:'MONK TORV',title:'Lanterns for the Lost',reward:180,potions:1,
  ask:'Three lanterns went dark along the mountain path. Monk Torv knows the old warming song that can relight them. Find him and bring the words back to me.',
  clue:'The song is not a spell. It is a promise to leave a light burning for the next traveler. Tell Ilsa the words: “No one walks the snow alone.”',
  done:'The lanterns are shining again. Travelers can find the pass even in a storm. Please take these supplies for the road.'},
 {id:'fortress_oath',start:'CAPTAIN ALDRIC',meet:'SISTER MIRELLE',title:'The Oath Beneath the Gate',reward:220,potions:2,
  ask:'My brother wore the Hollow Knight’s armor because he thought our old oath had been forgotten. Sister Mirelle guards the original words. Ask her what our family promised.',
  clue:'The oath says a keeper protects people, not walls. Aldric’s brother stayed behind because he believed the fortress mattered more than he did. He deserves to hear the truth.',
  done:'I understand now. My brother was not a failure. He kept the promise in the only way he knew. Thank you. Take these supplies, and carry the oath forward.'}
 ];
 state.storyArcs=state.storyArcs||{};
 for(const a of arcs){
  const q=state.storyArcs[a.id]||{stage:0,done:false};
  if(n.name===a.start){
   if(q.done){setDialogue([[a.start,a.done],['JOURNAL','Story completed: '+a.title+'.']]);return true;}
   if(q.stage===0){setDialogue([[a.start,a.ask],['JOURNAL','New story: '+a.title+'.']],()=>{state.storyArcs[a.id]={stage:1,done:false};save();updateQuest();setDialogue([['STORY STARTED',a.title+' — find '+a.meet+'.']]);});}
   else if(q.stage===2){state.storyArcs[a.id]={stage:3,done:true};state.coins=(state.coins||0)+a.reward;addPotions(a.potions);save();updateHud();setDialogue([[a.start,a.done],['STORY COMPLETE',a.title+' — '+a.reward+' coins and '+a.potions+' potions.']]);}
   else setDialogue([[a.start,'Have you spoken with '+a.meet+' yet? The truth matters as much as the journey.']]);
   return true;
  }
  if(n.name===a.meet&&q.stage===1){state.storyArcs[a.id]={stage:2,done:false};save();updateQuest();setDialogue([[a.meet,a.clue],['JOURNAL','Return to '+a.start+' to finish “'+a.title+'”.']]);return true;}
 }
 return false;
}
function sideQuestTalk(n){if(storyArcTalk(n))return true;const defs={'HAZEL THE HUNTER':{id:'woodland',title:'A Hunter’s Request',ask:'The forest creatures have been restless since the First Seal dimmed. Could you calm three wild creatures along the trail? I will share my best supplies.',thanks:'You helped restore a little peace to the woods. Take these trail supplies.'},'ORCHARD KEEPER DAHLIA':{id:'orchard',title:'The Last Good Apples',ask:'Three corrupted creatures are roaming the orchard. Clear them out and I can save the last healthy apple trees. Will you help?',thanks:'The orchard can breathe again. Please take these coins.'},'FISHER MARLO':{id:'pantry',title:'A Light Below',ask:'The flooded pantry is full of restless things. Defeat three of them and I can relight the lanterns along the lower shelves.',thanks:'The lower pantry is safe enough to search again. Take this tonic.'}};const d=defs[n.name];if(!d)return false;state.sideQuests=state.sideQuests||{};const q=state.sideQuests[d.id];if(q&&q.done){setDialogue([[n.name,d.thanks],['JOURNAL','Side quest complete: '+d.title+'.']]);return true;}if(!q||!q.accepted){setDialogue([[n.name,d.ask],['JOURNAL','I’ll take care of that.']],()=>{state.sideQuests[d.id]={accepted:true,kills:0,done:false};save();updateQuest();setDialogue([['QUEST ACCEPTED',d.title+' — defeat three wild creatures in this region.']]);});return true;}setDialogue([[n.name,'You have cleared '+q.kills+' of 3 creatures. Keep to the trail and watch the tall grass.']]);return true;}
function progressSideQuests(g){if(!g.wild||!AREA||!AREA.chapter)return[];const mq=mainQuestData(AREA.chapter);mq.kills=Math.min(3,(mq.kills||0)+1);const mainLines=mq.kills===3?[['MAIN QUEST UPDATED','The trail is clear. Return to the chapter guardian!']]:[['JOURNAL','Chapter trial: '+mq.kills+' / 3 wild creatures defeated.']];const defs=[{id:'woodland',chapter:1,title:'A Hunter’s Request',reward:70,potion:1},{id:'orchard',chapter:2,title:'The Last Good Apples',reward:95,potion:0},{id:'pantry',chapter:3,title:'A Light Below',reward:120,potion:1}],out=[];state.sideQuests=state.sideQuests||{};for(const d of defs){const q=state.sideQuests[d.id];if(!q||!q.accepted||q.done||AREA.chapter!==d.chapter)continue;q.kills=Math.min(3,(q.kills||0)+1);out.push(['JOURNAL',d.title+': '+q.kills+' / 3 wild creatures cleared.']);if(q.kills>=3){q.done=true;state.coins=(state.coins||0)+d.reward;if(d.potion)addPotions(d.potion);out.push(['QUEST COMPLETE',d.title+'! You earned '+d.reward+' coins'+(d.potion?' and a potion.':'.')]);}}if(out.length){save();updateHud();}save();updateHud();return [...mainLines,...out];}
function playRowanConfrontation(done){cinematic={phase:'region',chapter:5,actors:{HERO:{x:innerWidth*.27,y:innerHeight*.77,face:3,step:0},ROWAN:{x:innerWidth*.73,y:innerHeight*.77,face:2,step:0}}};document.body.classList.add('lh-cinematic');const say=lines=>new Promise(resolve=>setDialogue(lines,resolve));const walk=(name,to,duration=850)=>new Promise(resolve=>{const a=cinematic.actors[name],from={x:a.x,y:a.y},start=performance.now();a.face=Math.abs(to.x-from.x)>Math.abs(to.y-from.y)?(to.x<from.x?2:3):(to.y<from.y?1:0);const step=now=>{if(!cinematic)return resolve();const p=Math.min(1,(now-start)/duration),e=p*p*(3-2*p);a.x=from.x+(to.x-from.x)*e;a.y=from.y+(to.y-from.y)*e;a.step=p<1?1+(Math.floor(now/120)%2):0;if(p<1)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});(async()=>{sfx('warn');await say([['ROWAN','Stop there. I hoped you would turn back before reaching this hall.'],['YOU','You left clues for me. You wanted me to follow you. Why?']]);await walk('ROWAN',{x:innerWidth*.58,y:innerHeight*.77});await say([['ROWAN','The Hollow King promised to bring my mother back. I thought if I helped him find the Everfeast, he would keep his word.'],['YOU','You could have told me. We have been through everything together.']]);await walk('HERO',{x:innerWidth*.43,y:innerHeight*.77});await say([['ROWAN','I was ashamed. Every step made it harder to turn around. I am sorry. But he is listening. He knows you are here.'],['JOURNAL','The candles gutter out one by one. Something enormous stirs beneath the banquet table.']]);cinematic=null;document.body.classList.remove('lh-cinematic');done();})();}
function areaBossIntro(n){const A=AREA,g=n.trainer;if(state.beaten[g.id]||A.bossTalk)return;if(!mainQuestReady(A.chapter)){const q=mainQuestData(A.chapter);setDialogue([['JOURNAL','The guardian will not face you yet. Speak with at least two people in this region ('+(q.talked||[]).length+'/2) and defeat three wild creatures ('+(q.kills||0)+'/3).']]);return;}A.bossTalk=1;if(A.chapter===5&&g.name==='ROWAN'){playRowanConfrontation(()=>{A.bossTalk=0;askStoryChoice('YOU','Rowan looks at you, waiting to hear what happens to your friendship.',[{label:'I forgive you. We will fix this together.',value:'forgive'},{label:'I care about you, but trust must be earned.',value:'cautious'}],value=>{state.rowanChoice=value;state.rowanTrust=value==='forgive'?2:1;save();startBattle(g);});});return;}if(A.chapter===9){sfx('warn');setDialogue(g.lines.map(t=>[g.name,t]),()=>{askStoryChoice('YOU','The Hollow King’s power is fading. What should happen to the Everfeast’s final light?', [{label:'Offer him a chance to belong.',value:'mercy'},{label:'Seal the darkness and protect Hearthvale.',value:'seal'}],value=>{state.finalChoice=value;save();startBattle(g);});});return;}sfx('warn');setDialogue(g.lines.map(t=>[g.name,t]),()=>{A.bossTalk=0;startBattle(g);});}
function areaTick(){if(scene!=='area'||!AREA)return;const A=AREA;if(A.wilds&&A.npcs.some(n=>n.alpha&&state.beaten[n.trainer.id]))A.npcs=A.npcs.filter(n=>!(n.alpha&&state.beaten[n.trainer.id]));if(A.boss&&state.beaten[A.boss.id]&&!battle&&!dialogue&&!A.leaving){A.leaving=true;A.npcs=A.npcs.filter(n=>!n.boss);for(let i=npcs.length-1;i>=0;i--)if(npcs[i].region===A.chapter)npcs.splice(i,1);const q=mainQuestData(A.chapter);q.complete=true;save();const post=(STORY[A.chapter]||{post:[]}).post;setTimeout(()=>{const go=()=>{leaveArea('village');};if(post.length)setDialogue(post.map(t=>['JOURNAL',t]),go);else go();},600);}}
function chapterEpilogue(c,n){
 const lines={1:['The First Seal is glowing again. The forest feels warmer, and villagers are leaving lanterns along the trail.','The road east is open now. Maplebrook has been waiting for someone to bring back the light.'],2:['The orchard trees have begun to bloom again. The fruit is sweet instead of bitter.','A path beneath the old roots has appeared.'],3:['The pantry lanterns are burning again. People have started bringing food to share.','The restored signal has reached the mountain pass.'],4:['The mountain paths are calmer now. Travelers are returning.','The market has opened its eastern gate.'],5:['The empty banquet hall is no longer silent. Music has returned to the village.','The frost lanterns have awakened.'],6:['The watchtower signal is clear. Supplies are moving safely through the snow.','The old fortress gate has opened.'],7:['The fortress banners have been raised again. Its people are returning.','A golden doorway has appeared beyond the ruins.'],8:['The voices beyond the door are no longer distant. The sanctuary is awake.','The final road is open.'],9:['The last light has reached every corner of the valley.','Hearthvale will remember what you did here.']};
 const list=lines[c];if(!list||!state.beaten['boss'+c])return false;
 const key='epilogue_'+c+'_'+n.name;if(state.storyReactions&&state.storyReactions[key]){setDialogue([[n.name,'The road is open, and the lights are still shining.']]);return true;}
 state.storyReactions=state.storyReactions||{};state.storyReactions[key]=true;save();
 const endings={together:'The Everfeast is now a place where nobody is turned away. Rowan is helping the Hollow King learn how to live among the people he once feared.',guardian:'The First Seal shines above the valley. Rowan is helping the Keepers restore the roads, and the people have promised to guard one another.',unfinished:'The valley has welcomed the Hollow King to begin again, but Rowan knows your friendship will need time. The towns are learning that healing can take patience.',steadfast:'The First Seal protects Hearthvale once more. Rowan is working quietly to make amends, and the people respect the boundaries you chose.'};
 const rowanLine=state.rowanChoice==='forgive'?'Rowan has been helping every town rebuild. He says he will never take your friendship for granted.':'Rowan is still earning the trust he lost. The people have noticed that he keeps showing up to help.';
 const extra=state.ending?[['JOURNAL',endings[state.ending]],[n.name,rowanLine]]:[];
 setDialogue([[n.name,list[0]],['JOURNAL',list[1]],...extra]);return true;
}
function drawRestoredRoute(A,t){
 if(!A.chapter||!state.beaten['boss'+A.chapter])return;
 const U=32,points=[10,22,34],pulse=.45+.25*Math.sin(t*3);
 const palettes={together:{glow:'rgba(255,224,130,',core:'#fff0b0',base:'#b86b37'},guardian:{glow:'rgba(140,205,255,',core:'#d9f2ff',base:'#527f9c'},unfinished:{glow:'rgba(210,165,255,',core:'#f0d9ff',base:'#805b9a'},steadfast:{glow:'rgba(135,225,190,',core:'#d5ffed',base:'#477d68'}};
 const palette=palettes[state.ending]||{glow:'rgba(255,224,130,',core:'#ffe6a0',base:'#b86b37'};
 ctx.save();ctx.globalAlpha=.8;
 for(const x of points){const y=(A.pathY&&A.pathY[x]||13)-3,px=x*U+16,py=y*U+16;
  const g=ctx.createRadialGradient(px,py,2,px,py,24);g.addColorStop(0,palette.glow+(.25+pulse*.5)+')');g.addColorStop(1,palette.glow+'0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,24,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=palette.core;ctx.fillRect(px-2,py-7,4,9);ctx.fillStyle=palette.base;ctx.fillRect(px-3,py+2,6,5);
 }
 ctx.restore();
}
function areaInteract(){if(dialogue){advanceDialogue();return;}if(cinematic||titleOpen||!$('lh-game-menu').hidden)return;const A=AREA;let f=null,d0=1e9;for(const n of A.npcs){const d=Math.hypot(areaPlayer.x-(n.x*32+16),areaPlayer.y-(n.y*32+24));if(d<(n.boss?150:64)&&d<d0){f=n;d0=d;}}
 if(!f){setDialogue([['JOURNAL','Nothing here but the wind.']]);return;}
 if(f.boss){areaBossIntro(f);return;}recordMainQuestTalk(f);if(f.rival){if(state.beaten[f.trainer.id]){setDialogue([[f.name,'We already tested our skills. Keep following the trail!']]);return;}setDialogue([[f.name,f.lines[0]],['YOU','I accept your challenge.']],()=>startBattle(f.trainer));return;}if(sideQuestTalk(f))return;if(A.chapter&&chapterEpilogue(A.chapter,f))return;
 if(f.alpha){setDialogue([['JOURNAL',f.lines[0]]],()=>startBattle(f.trainer));return;}
 if(f.chest){openChest(f);return;}
 if(f.act==='tower'){setDialogue(f.lines.map(t=>[f.name,t]),()=>towerEnter());return;}
 if(f.act==='board'){showLeaderboard();return;}
 if(f.act==='shop'){if(state.coins>=30){state.coins-=30;addPotions(1);sfx('coin');updateHud();save();setDialogue([[f.name,'One potion for 30 coins. Pleasure doing business! You carry '+state.potions+' now.']]);}else setDialogue([[f.name,'Potions are 30 coins each. Come back when your purse is heavier!']]);return;}
 if(f.act==='inn'){state.hp=state.maxHp;state.mp=state.maxMp;sfx('heal');updateHud();save();setDialogue([[f.name,'Rest your bones, dear. There! Fully refreshed.']]);return;}
 setDialogue(f.lines.map(t=>[f.name,t]));}
function areaGround(A,x,y){if(A.wilds){wildGround(A,x,y);return;}const U=32,B=A.bio;if(B.hall){ctx.imageSmoothingEnabled=false;ctx.drawImage(INT,((x*7+y*3)%3)*16,16,16,16,x*U,y*U,U,U);return;}
 if(A.ground){const k=A.ground[y*A.w+x];if(k===1){const q=rand(x+5,y+2);kTile('t',q<.15?39:q<.25?40:25,x*U,y*U);return;}if(k===2){kTile('t',43,x*U,y*U);return;}}
 else if(A.pathY&&Math.abs(y-A.pathY[x])<=1){const q=rand(x+5,y+2);kTile('t',q<.15?39:q<.25?40:25,x*U,y*U);return;}
 const g=B.g[Math.floor(rand(x+11,y+7)*B.g.length)%B.g.length];kTile(g[0],g[1],x*U,y*U);}
function areaObstacle(A,x,y,k){const U=32;let o=A.bio.ob[k];if(!o)return;if(o.w){if(WLD.naturalWidth){wSprite(o.w,x*U,y*U);return;}o=o.fb;if(!o)return;}if(o.i){kBlock(o.i[0],o.i[1],o.i[2],o.i[3],x*U,y*U,2);return;}const sh=o.sh||'t';if(o.two){kTile(sh,o.a,x*U,(y-1)*U);kTile(sh,o.b,x*U,y*U);}else kTile(sh,o.a,x*U,y*U);}
function drawArea(W,H){const A=AREA,U=32,t=performance.now()/1000,zoom=W<700?Math.min(1.65,Math.max(1.22,700/W)):1,vw=W/zoom,vh=H/zoom;
const cx=A.w*U<=vw?-(vw-A.w*U)/2:Math.max(0,Math.min(A.w*U-vw,areaPlayer.x-vw/2)),cy=A.h*U<=vh?-(vh-A.h*U)/2:Math.max(0,Math.min(A.h*U-vh,areaPlayer.y-vh/2));
ctx.clearRect(0,0,W,H);px(0,0,W,H,'#0d0a14');ctx.save();ctx.translate(W/2,H/2);ctx.scale(zoom,zoom);ctx.translate(-W/2,-H/2);ctx.translate(-Math.floor(cx),-Math.floor(cy));
 const x0=Math.max(0,Math.floor(cx/U)-1),y0=Math.max(0,Math.floor(cy/U)-1),x1=Math.min(A.w-1,Math.ceil((cx+vw)/U)),y1=Math.min(A.h-1,Math.ceil((cy+vh)/U)+1);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)areaGround(A,x,y);
 for(const d of A.dec){if(d.x>=x0&&d.x<=x1&&d.y>=y0&&d.y<=y1)(d.d[0]==='w'?wSprite(d.d[1],d.x*U,d.y*U):kTile(d.d[0],d.d[1],d.x*U,d.y*U));}
 if(A.wilds){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(A.enc[y*A.w+x]&&!A.solid[y*A.w+x])tallGrass(A,x,y,t);wildCamp(A,t);}
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*A.w+x;if(A.ob[i])areaObstacle(A,x,y,A.ob[i]-1);}
 if(A.bld)for(const b of A.bld){if(!VIL.naturalWidth)continue;const r=VR[b.n];ctx.imageSmoothingEnabled=false;ctx.drawImage(VIL,r[0],r[1],r[2],r[3],b.x*U,(b.y+b.h)*U-r[3]*2,r[2]*2,r[3]*2);}
 if(A.city&&VIL.naturalWidth){const r=VR['fountain'+(Math.floor(t*2.6)%2)];ctx.drawImage(VIL,r[0],r[1],r[2],r[3],18*U,17*U-r[3]*2+4,r[2]*2,r[3]*2);}
 ctx.fillStyle=A.bio.tint||'rgba(0,0,0,0)';ctx.fillRect(Math.floor(cx),Math.floor(cy),W,H);drawRestoredRoute(A,t);
 const ex=A.exits[0];ctx.fillStyle='rgba(255,230,140,'+(.35+.25*Math.sin(t*4))+')';A.exits.forEach(e=>ctx.fillRect(e.x*U,e.y*U,U,U));
 const ents=A.npcs.map(n=>({y:n.y*U+24,f:()=>{const x=n.x*U+16,y=n.y*U+24;if(n.boss){if(!state.beaten[n.trainer.id])drawBossSprite(n.bi,x,y+20,2,Math.floor(t*2)%2,true);return;}if(n.sign){kTile('t',83,x-16,y-24);return;}if(n.chest){kTile('d',state.chests&&state.chests[n.chest]?91:89,x-16,y-24,2);return;}if(n.rival){const dx=areaPlayer.x-x,dy=areaPlayer.y-y,face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);drawSprite(n.row??11,face,0,x,y);return;}if(n.alpha){const tt=performance.now()/1000;ctx.fillStyle='rgba(255,60,60,'+(.18+.08*Math.sin(tt*4))+')';ctx.beginPath();ctx.ellipse(x,y+4,36,13,0,0,7);ctx.fill();drawMon(n.trainer.mi,x,y+6+Math.sin(tt*3)*2,4);return;}if(n.name==='LEADERBOARD'){kTile('t',83,x-16,y-24);ctx.fillStyle='#ffd84a';ctx.fillRect(x-4,y-20,8,6);return;}const row=NPC_ROW[n.name]??11;let face=0;const dx=areaPlayer.x-x,dy=areaPlayer.y-y;if(Math.hypot(dx,dy)<110)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);drawSprite(row,face,0,x,y);}}));
 ents.push({y:areaPlayer.y,f:()=>drawPlayer(areaPlayer.x,areaPlayer.y)});ents.sort((a,b)=>a.y-b.y).forEach(o=>o.f());
 if(A.wilds){const ptx=Math.floor(areaPlayer.x/U),pty=Math.floor(areaPlayer.y/U);if(A.enc[pty*A.w+ptx]){ctx.save();ctx.beginPath();ctx.rect(ptx*U,pty*U+U*.55,U,U*.45);ctx.clip();tallGrass(A,ptx,pty,t);ctx.restore();}}
 if(!dialogue&&!battle){let best=null,bd=1e9;for(const n of A.npcs){const d=Math.hypot(areaPlayer.x-(n.x*U+16),areaPlayer.y-(n.y*U+24));if(d<(n.boss?150:64)&&d<bd){best=n;bd=d;}}if(best&&!(best.boss&&state.beaten[best.trainer.id]))drawWorldPrompt(best.x*U+16,best.y*U-(best.boss?96:22),(best.boss||best.alpha||best.rival)?'E \u00b7 CHALLENGE':best.chest?'E \u00b7 OPEN':'E \u00b7 TALK');}
 ctx.restore();
 const v=ctx.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,Math.max(W,H)*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.35)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 if(A.wilds&&W>=560&&!dialogue&&!battle){const m=wildsMini(A),sc=W<760?1:2,mx=W-A.w*sc-14,my=H-A.h*sc-40;ctx.imageSmoothingEnabled=false;ctx.fillStyle='rgba(38,51,74,.9)';ctx.fillRect(mx-4,my-4,A.w*sc+8,A.h*sc+8);ctx.drawImage(m,mx,my,A.w*sc,A.h*sc);ctx.fillStyle=Math.floor(t*3)%2?'#ffffff':'#e03838';ctx.fillRect(mx+Math.floor(areaPlayer.x/32)*sc-1,my+Math.floor(areaPlayer.y/32)*sc-1,sc+2,sc+2);}
 return{camX:cx,camY:cy};}

/* ================= THE WILDLANDS: a big open map with five monster zones ================= */
const WZ=[
{n:'SUNNY MEADOW',g:0,lv:'1-2',tint:'rgba(255,230,150,.05)',blade:['#2f8f3d','#56b85a']},
{n:'ORCHARD WOODS',g:1,lv:'3-4',tint:'rgba(230,140,40,.14)',blade:['#8a7a2a','#c0a43a']},
{n:'MISTY MARSH',g:2,lv:'5-6',tint:'rgba(60,150,150,.18)',blade:['#2a7a68','#3fa88a']},
{n:'STONE HOLLOW',g:3,lv:'7-8',tint:'rgba(70,80,140,.2)',blade:['#3a5a7a','#5a86a8']},
{n:'FROST RIDGE',g:4,lv:'9-10',tint:'rgba(190,225,255,.22)',blade:['#7aa8c8','#cfe8f8']}];
function getWilds(){return AREAS.wilds||(AREAS.wilds=genWilds());}
function enterWilds(){const A=getWilds();A.ret={x:16*TILE+16,y:3*TILE+24};A.curZone=undefined;A.name='THE WILDLANDS';startArea(A,A.spawn.x,A.spawn.y);
 setDialogue([['JOURNAL','THE WILDLANDS: a vast stretch of untamed country north of Hearthvale. Stone roads are safe. Monsters hide in the tall grass.'],['JOURNAL','Five zones grow more dangerous the farther you roam. Rest at the Ranger Camp, open chests, and beat each zone\u2019s Alpha for big rewards. A minimap shows where you are.']]);}
function ensureWildsGate(){return;}
function openChest(f){state.chests=state.chests||{};if(state.chests[f.chest]){setDialogue([['JOURNAL','The chest is empty.']]);return;}state.chests[f.chest]=1;state.coins=(state.coins||0)+f.coins;if(f.potion)addPotions(1);sfx('coin');updateHud();save();setDialogue([['JOURNAL','You open the chest and find '+f.coins+' coins'+(f.potion?' and a potion!':'!')]]);}
function wildEdge(A,x,y,kind){const U=32,nb=(dx,dy)=>{const xx=x+dx,yy=y+dy;return(xx<0||yy<0||xx>=A.w||yy>=A.h)?kind:A.ground[yy*A.w+xx];};
 ctx.fillStyle=kind===3?'rgba(232,248,255,.85)':'rgba(40,20,20,.32)';
 if(nb(0,-1)!==kind)ctx.fillRect(x*U,y*U,U,4);if(nb(0,1)!==kind)ctx.fillRect(x*U,y*U+U-4,U,4);if(nb(-1,0)!==kind)ctx.fillRect(x*U,y*U,4,U);if(nb(1,0)!==kind)ctx.fillRect(x*U+U-4,y*U,4,U);}
function wildGround(A,x,y){const U=32,i=y*A.w+x,k=A.ground[i],z=A.zone[i];
 if(WLD.naturalWidth){const q=Math.floor(rand(x+11,y+7)*4)%4;
  if(k===3){wSprite('wt'+z+'_'+((Math.floor(performance.now()/550)+x+y)&1),x*U,y*U);wildEdge(A,x,y,3);return;}
  if(k===1){wSprite('r'+z+'_'+(q%3),x*U,y*U);wildEdge(A,x,y,1);return;}
  wSprite('g'+z+'_'+q,x*U,y*U);return;}
 if(k===3){const t=performance.now()/1000,o=Math.floor((Math.sin(t*1.6+x*.9+y*.5)+1)*4);ctx.fillStyle='#4aa8d8';ctx.fillRect(x*U,y*U,U,U);ctx.fillStyle='#8fd4f4';ctx.fillRect(x*U+4+o,y*U+10,10,3);ctx.fillRect(x*U+16-o,y*U+22,10,3);return;}
 if(k===1){const q=rand(x+5,y+2);kTile('t',q<.15?39:q<.25?40:25,x*U,y*U);}
 else{const B=BIO[A.zb[z]],g=B.g[Math.floor(rand(x+11,y+7)*B.g.length)%B.g.length];kTile(g[0],g[1],x*U,y*U);}
 ctx.fillStyle=WZ[z].tint;ctx.fillRect(x*U,y*U,U,U);}
function tallGrass(A,x,y,t){const U=32,z=A.zone[y*A.w+x];if(WLD.naturalWidth){const r=WSP['tg'+z+'_'+((x*3+y*5)&1)],sw=Math.round(Math.sin(t*2+x*.7+y*.3));ctx.imageSmoothingEnabled=false;ctx.drawImage(WLD,r[0],r[1],16,16,x*U+sw,y*U,U,U);return;}const c=WZ[z].blade,h0=(x*7+y*13)%5;for(let k=0;k<4;k++){const bx=x*U+3+k*7+((h0+k)%3),hh=10+((h0+k*2)%5)*2,sw=Math.round(Math.sin(t*2+x*.7+k)*1.5);ctx.fillStyle=c[k%2];ctx.fillRect(bx+sw,y*U+U-4-hh,3,hh);ctx.fillStyle=c[(k+1)%2];ctx.fillRect(bx+sw+3,y*U+U-1-hh,2,hh-3);}}
function wildCamp(A,t){const U=32,x=48*U+16,y=55*U+22,f=Math.floor(t*8)%3;ctx.fillStyle='#5b3a2b';ctx.fillRect(x-12,y+2,24,5);ctx.fillRect(x-8,y-1,16,4);ctx.fillStyle='#e8832e';ctx.fillRect(x-6,y-10-f,12,11+f);ctx.fillStyle='#ffd84a';ctx.fillRect(x-3,y-8-f,6,8+f);ctx.fillStyle='#fff4d8';ctx.fillRect(x-1,y-4,2,4);ctx.fillStyle='rgba(255,180,60,.12)';ctx.beginPath();ctx.arc(x,y-4,70+f*4,0,7);ctx.fill();}
function wildsMini(A){if(!A.mm){const c=document.createElement('canvas');c.width=A.w;c.height=A.h;const g=c.getContext('2d'),zc=['#7bc86c','#d9a04a','#4fa9a0','#8a7f9a','#cfe6f6'];for(let y=0;y<A.h;y++)for(let x=0;x<A.w;x++){const i=y*A.w+x;g.fillStyle=A.ground[i]===3?'#4aa8d8':A.solid[i]?'#2f5a3a':A.ground[i]===1?'#e8c690':zc[A.zone[i]];g.fillRect(x,y,1,1);}A.mm=c;}return A.mm;}
function genWilds(){
 const w=96,h=64,rng=mulberry(7771),T=(x,y)=>y*w+x,N=w*h;
 const solid=new Uint8Array(N),ob=new Uint8Array(N),enc=new Uint8Array(N),zone=new Uint8Array(N),ground=new Uint8Array(N),prot=new Uint8Array(N),dec=[];
 const ZB=[0,1,2,7,6],OBL=[],OFF=[],WOB=[['oak','oak','oak','bush','rockM'],['maple','maple','apple','stump','hay'],['willow','swampT','willow','reeds','mossRock'],['spire','deadT','spire','boulder','crystal'],['pine','pine','pine','iceRock','snowM']];
WOB.forEach((l,z)=>{OFF[z]=OBL.length;l.forEach((n,j)=>OBL.push({w:n,fb:BIO[ZB[z]].ob[j%BIO[ZB[z]].ob.length]}));});
 const G1=[],G2=[];for(let i=0;i<1600;i++){G1.push(rng());G2.push(rng());}
 const s3=t=>t*t*(3-2*t),vn=(G,x,y)=>{const X=Math.floor(x),Y=Math.floor(y),fx=s3(x-X),fy=s3(y-Y),g=(a,b)=>G[(((b%40)+40)%40)*40+(((a%40)+40)%40)],t=g(X,Y)+(g(X+1,Y)-g(X,Y))*fx,b=g(X,Y+1)+(g(X+1,Y+1)-g(X,Y+1))*fx;return t+(b-t)*fy;};
 const zoneAt=(x,y)=>{const xx=x+(vn(G2,x*.07,y*.07)-.5)*10,yy=y+(vn(G2,x*.07+9,y*.07+5)-.5)*8;return yy>=44?0:yy>=24?(xx<48?1:2):(xx<48?3:4);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)zone[T(x,y)]=zoneAt(x,y);
 const carve=(cx,cy,r,rd)=>{for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++){if(x<0||y<0||x>=w||y>=h)continue;if((x-cx)**2+(y-cy)**2>r*r+.5)continue;const i=T(x,y);solid[i]=0;ob[i]=0;prot[i]=1;if(rd)ground[i]=1;}};
 const road=pts=>{for(let k=0;k<pts.length-1;k++){const[x0,y0]=pts[k],[x1,y1]=pts[k+1],n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let q=0;q<=n;q++)carve(x0+(x1-x0)*q/n,y0+(y1-y0)*q/n,1.4,true);}};
 road([[48,63],[48,50],[47,40],[48,30],[50,20],[48,8]]);
 road([[48,52],[36,54],[24,54],[10,56]]);road([[48,52],[60,54],[74,56],[86,56]]);
 road([[48,34],[36,34],[24,32],[14,30],[8,38]]);road([[14,30],[22,22],[20,10]]);
 road([[48,34],[60,34],[72,32],[82,30],[88,40]]);road([[82,30],[74,20],[76,10]]);
 road([[48,14],[34,12],[20,10]]);road([[48,14],[62,12],[76,10]]);
 carve(48,56,4.6,true);carve(48,62,2.5,true);carve(48,8,4,true);
 const alphaPos=[[10,56],[8,38],[88,40],[20,10],[76,10]];alphaPos.forEach(([x,y])=>carve(x,y,3,false));
 const chestPos=[[24,52],[86,54],[14,27],[66,31],[84,28],[22,24],[74,22],[52,20],[34,10],[62,10]];chestPos.forEach(([x,y])=>carve(x,y,1.6,false));
 const signPos=[[45,60],[45,46],[45,26]];signPos.forEach(([x,y])=>carve(x,y,1.2,false));
 const lake=(cx,cy,rx,ry)=>{for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){if(x<3||y<3||x>w-4||y>h-4)continue;if(((x-cx)/rx)**2+((y-cy)/ry)**2>1)continue;const i=T(x,y);if(prot[i])continue;solid[i]=1;ob[i]=0;ground[i]=3;}};
 [[62,28,5,3],[78,38,6,4],[70,42,4,2.5],[84,26,3,2],[20,48,4,2.5],[76,50,5,3],[22,40,3,2],[62,14,4,3]].forEach(a=>lake(...a));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=T(x,y);if(prot[i]||ground[i]===3)continue;const z=zone[i],edge=x<2||y<2||x>w-3||y>h-3;let tree=edge;if(!edge){const d=vn(G1,x*.11,y*.11)*.7+vn(G2,x*.31,y*.31)*.3;tree=d>.64;}if(tree){solid[i]=1;ob[i]=OFF[z]+1+Math.floor(rng()*WOB[z].length);}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=T(x,y);if(solid[i]||ground[i]!==0||prot[i])continue;if(vn(G1,x*.2+30,y*.2+11)>.5)enc[i]=1;}
 const DEC=[[['w','flowerA'],['w','flowerB'],['w','tuft'],['w','flowerA']],[['w','leaves'],['w','mush'],['w','leaves'],['w','tuft']],[['w','puddle'],['w','mush'],['w','tuft']],[['w','pebbles'],['w','bones'],['w','glow'],['w','pebbles']],[['w','flake'],['w','pebbles'],['w','flake']]];
 for(let k=0;k<320;k++){const x=1+Math.floor(rng()*(w-2)),y=1+Math.floor(rng()*(h-2)),i=T(x,y);if(solid[i]||enc[i]||ground[i]!==0)continue;const L=DEC[zone[i]];dec.push({x,y,d:L[Math.floor(rng()*L.length)]});}
 const mk=z=>{const mi=z*10+9,m=monInfo(mi);return{id:'alpha'+z,name:m.name,mi,hp:Math.round(m.hp*1.7),atk:Math.round(m.atk*1.15)+1,reward:m.reward*3,xp:60+z*40,alpha:true,win:['The Alpha collapses and flees. You find a potion in its den.']};};
 const npcs=[
  {x:46,y:54,name:'OLD WILLOW',act:'inn',lines:[]},{x:50,y:54,name:'PIP',act:'shop',lines:[]},
  {x:48,y:58,name:'HAZEL THE HUNTER',lines:['This is the Ranger Camp. Stone roads are safe; monsters hide in the swaying tall grass.','South is the Sunny Meadow. Orchard Woods lie west of the crossroads, Misty Marsh east. Stone Hollow and Frost Ridge are for veterans only.','Every zone has an Alpha at the end of its road. They hit hard, but they drop potions.']},
  {x:47,y:8,name:'ORACLE SELENE',lines:['The Everfeast was a promise between the First Keepers and the harvest spirits: one feast each year, and the land never starves.','The Hollow King feeds on broken promises. Every guardian you defeat weakens him.','Your parents passed through this shrine. They left toward the old roads.']},
  {x:45,y:60,name:'JOURNAL',sign:true,lines:['THE WILDLANDS. Stay on the stone road when hurt. Tall grass hides monsters. The Ranger Camp is just north.']},
  {x:45,y:46,name:'JOURNAL',sign:true,lines:['Crossroads. West: ORCHARD WOODS (Lv 3-4). East: MISTY MARSH (Lv 5-6). Beyond: dangerous country.']},
  {x:45,y:26,name:'JOURNAL',sign:true,lines:['STONE HOLLOW (west, Lv 7-8) and FROST RIDGE (east, Lv 9-10). Turn back if you are weak!']}];
 alphaPos.forEach(([x,y],z)=>{const g=mk(z);npcs.push({x,y,name:g.name,alpha:true,trainer:g,lines:['A massive '+g.name.toLowerCase()+' blocks the den. It growls.']});});
 chestPos.forEach(([x,y],k)=>npcs.push({x,y,name:'CHEST',chest:'wc'+k,coins:30+k*18,potion:k%3===2,lines:[]}));
 npcs.push({x:50,y:7,name:'CHEST',chest:'wshrine',coins:250,potion:true,lines:[]});
 solid[T(48,55)]=1;
 const exits=[];for(let x=46;x<=50;x++)exits.push({x,y:63,to:'village'});
 return{id:'wilds',wilds:true,name:'THE WILDLANDS',w,h,solid,ob,enc,zone,zb:ZB,ground,dec,npcs,spawn:{x:48,y:60},exits,bio:{g:BIO[0].g,ob:OBL,tint:'rgba(0,0,0,0)'},mus:'wander'};}
function exitBuilding(){const id=interiorId;scene='outside';state.x=([10.5,34,22,5.5][id])*TILE;state.y=([10.9,10.9,22.9,29.9][id])*TILE;sfx('door');updateHud();save();}
function ensureCityGate(){if(scene!=='outside'||(questStep||0)<3)return;if(!state.cityUnlocked){state.cityUnlocked=true;save();setTimeout(()=>{sfx('unlock');if(!dialogue&&!battle&&!cinematic)setDialogue([['ELDER MAPLE','A new road has opened to the east: Goldleaf City. The village teleporter can now take you there.']]);},1200);}}
function drawTeleporter(x,y){const t=performance.now()/1000;ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(x-29,y+13,58,8);ctx.fillStyle='#343b55';ctx.fillRect(x-25,y-10,50,26);ctx.fillStyle='#7183a2';ctx.fillRect(x-21,y-14,42,26);ctx.fillStyle='#b8c8d8';ctx.fillRect(x-17,y-11,34,18);ctx.fillStyle='#493f70';ctx.fillRect(x-13,y-8,26,12);ctx.fillStyle='#a98bff';ctx.fillRect(x-8,y-5,16,6);ctx.fillStyle='#ffe6a0';ctx.fillRect(x-3,y-3,6,3);ctx.fillStyle='#8fd8ff';ctx.fillRect(x-31,y+2,5,5);ctx.fillRect(x+26,y+2,5,5);ctx.fillStyle='#fff0b0';ctx.globalAlpha=.55+.35*Math.sin(t*3);ctx.fillRect(x-2,y-18,4,5);ctx.restore();}
 function drawPortal(x,y,col){const t=performance.now()/1000;ctx.fillStyle='#8a88a0';ctx.fillRect(x-34,y-66,14,68);ctx.fillRect(x+20,y-66,14,68);ctx.fillRect(x-34,y-76,68,14);ctx.fillStyle='#b8b6cc';ctx.fillRect(x-34,y-66,4,68);ctx.fillRect(x-34,y-76,68,4);ctx.fillStyle='#5a5870';ctx.fillRect(x+30,y-66,4,68);
 const g=ctx.createRadialGradient(x,y-32,4,x,y-32,30);g.addColorStop(0,'rgba(255,236,150,.95)');g.addColorStop(.55,col||'rgba(170,90,230,.85)');g.addColorStop(1,'rgba(40,10,80,.35)');ctx.fillStyle=g;ctx.fillRect(x-20,y-62,40,64);for(let i=0;i<6;i++){const a=t*2+i*1.05;ctx.fillStyle='rgba(255,255,255,.8)';ctx.fillRect(Math.round(x+Math.cos(a)*12-2),Math.round(y-32+Math.sin(a)*22-2),4,4);}}

function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)}

// Hand-drawn original pixel-art tiles and sprites. The palette, outlines,
// clustered highlights and top-down proportions are consistent throughout.
const C={ink:'#26334a',deep:'#344b45',grass:'#55a66a',grass2:'#63b879',light:'#8bd18a',path:'#c7d0c6',path2:'#e1e4d2',pathShade:'#9daeb0',wood:'#855236',wood2:'#b97845',roof:'#a94f36',roof2:'#d47749',cream:'#f3e6bf',glass:'#75c5d2',blue:'#3d78aa',gold:'#e8bd58',skin:'#f1b58c'};
function px(x,y,w,h,c){rect(Math.round(x),Math.round(y),w,h,c)}
/* Original Hearthvale sprite atlas. Frames are generated locally so the game
   owns its artwork and does not depend on unlicensed franchise graphics. */
const spriteAtlas=(()=>{const a=document.createElement('canvas');a.width=128;a.height=64;const g=a.getContext('2d');g.imageSmoothingEnabled=false;
 const frame=(ox,shirt,hat,skin='#e7ad83',accent='#f1d5a0')=>{
  const p=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(ox+x,y,w,h)};
  p(5,25,14,5,'#352f3b');p(6,29,5,3,'#39415a');p(13,29,5,3,'#39415a');
  p(4,12,16,14,'#26334a');p(6,13,12,11,shirt);p(2,15,4,8,skin);p(18,15,4,8,skin);
  p(7,3,10,12,skin);p(5,1,14,5,hat);p(7,0,10,3,hat);
  p(8,8,2,2,'#26334a');p(15,8,2,2,'#26334a');p(9,12,6,1,'#9b5e54');
  p(7,22,4,2,accent);p(13,22,4,2,accent);
 };
 frame(0,'#b94b38','#c44736');frame(32,'#6658a5','#6554a5');frame(64,'#4c8955','#4a8a54');frame(96,'#bb6542','#634b3a');
 return a;
})();
const tileAtlas=(()=>{const a=document.createElement('canvas');a.width=192;a.height=32;const g=a.getContext('2d');
const fl=c=>()=>{[[6,8],[20,18],[10,25]].forEach(([x,y])=>{g.fillStyle=c;g.fillRect(x,y,4,4);g.fillStyle='#f8e870';g.fillRect(x+1,y+1,2,2);});};
const T=(i,o,fn)=>{g.save();g.translate(i*32,0);g.fillStyle='#68b848';g.fillRect(0,0,32,32);g.fillStyle='#58a038';for(let y=0;y<32;y+=8)for(let x=((y/8+o)%2)*8;x<32;x+=16){g.fillRect(x+2,y+2,4,2);g.fillRect(x+4,y+4,2,2);}if(fn)fn();g.restore();};
T(0,0);T(1,1);T(2,0);T(3,1);T(4,0,fl('#f8f8f8'));T(5,1,fl('#e85048'));return a;})();
function drawFlower(x,y){kTile('t',2,x*TILE,y*TILE);}
function drawBush(x,y){kTile('t',5,x*TILE,y*TILE);}
function drawLamp(x,y){const X=x*TILE,Y=y*TILE;px(X+14,Y+9,4,23,'#574638');px(X+9,Y+6,14,3,'#574638');px(X+10,Y-1,12,12,'#5a4637');px(X+12,Y+1,8,8,'#f3d88b');px(X+13,Y+2,6,6,'#fff1b4');}
function drawBench(x,y){const X=x*TILE,Y=y*TILE;px(X+4,Y+12,24,7,'#68452e');px(X+5,Y+10,22,4,'#b87942');px(X+7,Y+19,3,8,'#4c392b');px(X+22,Y+19,3,8,'#4c392b');}
function drawPumpkin(x,y){const X=x*TILE,Y=y*TILE;px(X+8,Y+13,17,13,'#b95f32');px(X+5,Y+16,23,8,'#d77b37');px(X+12,Y+9,9,5,'#e69a43');px(X+15,Y+6,4,5,'#477447');px(X+11,Y+17,2,4,'#713e2c');px(X+20,Y+17,2,4,'#713e2c');}
function drawRock(x,y){const X=x*TILE,Y=y*TILE;px(X+7,Y+13,18,12,'#64747a');px(X+11,Y+8,11,8,'#87969a');px(X+12,Y+10,5,3,'#bac2b6');px(X+8,Y+22,16,3,'#4b5b60');}
function drawSign(x,y,label){const X=x*TILE,Y=y*TILE;px(X+14,Y+12,4,18,'#68452e');px(X+3,Y+4,26,12,'#68452e');px(X+5,Y+6,22,8,'#e1c17c');ctx.fillStyle='#62452e';ctx.font='bold 6px ui-monospace';ctx.textAlign='center';ctx.fillText(label,X+16,Y+12);}
function drawFence(x,y,len=3){for(let i=0;i<len;i++)kTile('t',i===0?80:i===len-1?82:81,(x+i)*TILE,y*TILE);}
function drawHouse(b,roof='#a85c32'){
const x=b.x*TILE,y=b.y*TILE,w=b.w*TILE,h=b.h*TILE;
px(x-5,y+12,w+10,h-12,'#35485a');px(x,y+12,w,h-14,'#d7d9c8');px(x+5,y+18,w-10,h-25,'#9aaeb0');
px(x-8,y+2,w+16,13,'#5a4a3d');px(x-5,y,w+10,11,roof);px(x,y-5,w,8,roof);
for(let r=0;r<2;r++)for(let c=0;c<Math.floor(w/24);c++){px(x+4+c*24+(r%2)*9,y+2+r*5,17,2,r?'#843f32':'#d98753');}
px(x+8,y+15,w-16,5,'#f0d7a1');px(x+12,y+24,26,23,'#344c63');px(x+14,y+26,22,18,C.glass);px(x+14,y+34,22,3,'#e7d9aa');px(x+24,y+26,3,18,'#d8e7d8');
px(x+w-38,y+24,26,23,'#344c63');px(x+w-36,y+26,22,18,C.glass);px(x+w-36,y+34,22,3,'#e7d9aa');px(x+w-26,y+26,3,18,'#d8e7d8');
px(x+w/2-17,y+h-42,34,42,'#344457');px(x+w/2-13,y+h-38,26,38,'#815236');px(x+w/2-9,y+h-34,18,30,'#a86b43');px(x+w/2+7,y+h-22,3,3,C.gold);
px(x+w/2-22,y+17,44,9,'#f1e6c6');px(x+w/2-17,y+19,34,5,'#d0b66d');
}
function drawWorld(){const W=innerWidth,H=innerHeight;if(battle&&battle.phase!=='alert'&&battle.phase!=='swirl'){drawBattleScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='dream'){drawDreamScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='wake'){drawWakeScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='school'){drawSchoolScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='home'){drawHomeScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='lore'){drawLoreScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='region'){drawRegionScene(W,H);return{camX:0,camY:0};}if(scene==='area'&&AREA){return drawArea(W,H);}if(scene==='inside'){drawInterior(W,H);return{camX:0,camY:0};}
const focus=cinematic?cinematic.camera:{x:state.x,y:state.y};const zoom=W<700?Math.min(1.65,Math.max(1.22,700/W)):1,vw=W/zoom,vh=H/zoom;const camX=Math.max(0,Math.min(MAP_W*TILE-vw,focus.x-vw/2)),camY=Math.max(0,Math.min(MAP_H*TILE-vh,focus.y-vh/2));
ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(W/2,H/2);ctx.scale(zoom,zoom);ctx.translate(-W/2,-H/2);ctx.translate(-Math.floor(camX),-Math.floor(camY));
for(let y=Math.max(0,Math.floor(camY/TILE));y<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);y++)for(let x=Math.max(0,Math.floor(camX/TILE));x<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);x++){
const tileRoll=rand(x+41,y+17);const tileIndex=tileRoll<.43?0:tileRoll<.62?1:tileRoll<.77?2:tileRoll<.88?3:tileRoll<.96?4:5;kTile('t',[0,0,0,1,1,2][tileIndex],x*TILE,y*TILE);}
/* Broad stone paths with alternating diamond-like paving and dark grout */
drawPaths(camX,camY,W,H);
// Background trees render before buildings so trunks/canopies cannot cover roofs or doors.
for(const t of trees)drawTree(t.x,t.y);
HOUSES.forEach((n,i)=>drawBuilding(solids[i],n));
// Props are placed only in clear grass pockets: never on roads, building footprints, or the fountain.
function clearPropTile(tx,ty){const onRoad=(ty>=11&&ty<15)||(tx>=15&&tx<19)||(tx>=19&&tx<29&&ty>=14&&ty<16);const inHouse=solids.some(b=>tx>=b.x-1&&tx<b.x+b.w+1&&ty>=b.y-1&&ty<b.y+b.h+1);const nearFountain=tx>=17&&tx<=22&&ty>=11&&ty<=14;return !onRoad&&!inHouse&&!nearFountain&&tx>2&&tx<MAP_W-3&&ty>2&&ty<MAP_H-3;}
const props=[
['bush',11,8],['flower',15,8],['bush',27,8],['flower',39,8],['lamp',5,17],['bush',11,18],['flower',28,18],['lamp',33,18],['pumpkin',13,20],['rock',37,20],['bench',9,16],['bench',39,16],['bush',12,23],['flower',15,23],['bush',29,23],['flower',34,24],['lamp',10,27],['lamp',37,27],['rock',14,29],['pumpkin',32,29]
];
for(const [kind,x,y] of props){if(!clearPropTile(x,y))continue;({bush:drawBush,flower:drawFlower,lamp:drawLamp,bench:drawBench,pumpkin:drawPumpkin,rock:drawRock})[kind](x,y);}
drawFence(3,22,3);drawFence(41,22,3);drawFarm();
/* fountain, sign and village details */
drawFountainSprite();
kTile('t',83,27*TILE-16,10*TILE);
drawGates();
const ents=npcs.map(n=>{const a=cinematic&&cinematic.actors[n.name],x=a?a.x:n.x,y=a?a.y:n.y;return{y,f:()=>drawPerson(x,y,n.color,n.name==='ROWAN'?'#9b4a36':'#637b55',n.name)};});
if(cinematic&&cinematic.actors.CHAMPION){const a=cinematic.actors.CHAMPION;ents.push({y:a.y,f:()=>drawPerson(a.x,a.y,'#d5b64e','#e8bd58')});}
ents.push({y:state.y,f:()=>drawPlayer(state.x,state.y)});ents.sort((p,q)=>p.y-q.y).forEach(o=>o.f());
let promptTarget=null,promptDist=Infinity,promptLabel='TAP / E · TALK';
for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<((n.trainer&&n.trainer.bi!==undefined)?190:104)&&d<promptDist){promptTarget=n;promptDist=d;promptLabel='TAP / E · TALK';}}
const doors=[{x:10.5,y:10.5},{x:34,y:10.5},{x:22,y:22.5},{x:5.5,y:29.5}];
for(const d of doors){const wx=d.x*TILE,wy=d.y*TILE,dd=Math.hypot(state.x-wx,state.y-wy);if(dd<112&&dd<promptDist){promptTarget={x:wx,y:wy};promptDist=dd;promptLabel='E · ENTER';}}
const signDist=Math.hypot(state.x-27*TILE,state.y-10*TILE);if(signDist<100&&signDist<promptDist){promptTarget={x:27*TILE,y:10*TILE};promptLabel='E · READ';}
if(promptTarget)drawWorldPrompt(promptTarget.x,promptTarget.y-((promptTarget.trainer&&promptTarget.trainer.bi!==undefined)?126:30),promptLabel);
ctx.restore();return{camX,camY};}
const CS_ROW={'#b86c78':14,'#577f9b':8,'#bb6542':2,'#7d526f':20,'#6b9c70':5,'#d5b64e':10};
function drawCutscenePerson(x,y,shirt,hat,scale=1.75){drawSpriteK(CS_ROW[shirt]??7,0,0,x,y+10*scale,scale*2);}
function drawCutscenePlayer(x,y,scale=1.75){drawSpriteK(state.heroClass==='Mage'?20:state.heroClass==='Scout'?1:0,0,0,x,y+10*scale,scale*2);}
function drawGear(x,fy,k,face,cls){const T={Guardian:[['d',104],['d',101]],Scout:[['t',118]],Mage:[['d',130]],Foe:[['d',107]]}[cls];if(!T)return;const side=face>1,m=face===2?-1:1;
const put=(w,ox,oy)=>{ctx.save();ctx.translate(Math.round(x+m*ox*k),0);ctx.scale(m,1);kTile(w[0],w[1],-8*k,fy-oy*k,k);ctx.restore();};put(T[0],side?6:9,14);if(T[1]&&!side)put(T[1],-9,11);}
const heroRow=()=>(state.gender==='girl'?{Guardian:5,Scout:38,Mage:18}:{Guardian:5,Scout:7,Mage:0})[state.heroClass]??5;
function actor(x,fy,row,face,k,g,step){drawSpriteK(row,face,step||0,x,fy,k);if(g)drawGear(x,fy,k,face,g);}
function bars(W,H){px(0,0,W,H*.07,'#000');px(0,H*.93,W,H*.07,'#000');if(cinematic&&cinematic.flash>0){ctx.fillStyle='rgba(255,255,255,'+cinematic.flash+')';ctx.fillRect(0,0,W,H);cinematic.flash=Math.max(0,cinematic.flash-.035);}}
function drawHomeScene(W,H){const{g,list}=drawRoom(0,W,H,false),a=cinematic.actors,k=2*g.Z;
for(const n of ['ROWAN','HERO']){const p=a[n];if(p)list.push({y:p.y,f:()=>{drawSpriteK(n==='HERO'?heroRow():1,p.face||0,p.step||0,p.x,p.y,k);if(n==='HERO')drawGear(p.x,p.y,k,p.face||0,state.heroClass);}});}
list.sort((p,q)=>p.y-q.y).forEach(o=>o.f());const t=performance.now()/1000;
if(VIL.naturalWidth){ctx.imageSmoothingEnabled=false;ctx.drawImage(VIL,150,180,16,16,Math.round(g.ox+3*g.U),Math.round(g.oy+3*g.U-g.U*.2),g.U,g.U);}
if(cinematic.sparkle){const tx=g.ox+3.5*g.U,ty=g.oy+3.4*g.U;ctx.fillStyle='rgba(255,220,120,'+(.45+.3*Math.sin(t*4))+')';ctx.beginPath();ctx.arc(tx,ty,g.U*.45,0,7);ctx.fill();}
const dk=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,Math.max(W,H)*.6);dk.addColorStop(0,'rgba(10,5,20,.12)');dk.addColorStop(1,'rgba(10,5,20,.62)');ctx.fillStyle=dk;ctx.fillRect(0,0,W,H);sceneTitle('MAPLE COTTAGE',W,H*.115);bars(W,H);}
function drawLoreScene(W,H){const act=cinematic.act||0,tt=(performance.now()-(cinematic.t0||0))/1000,s=Math.max(3,Math.round(H/150)),u=16*s,k=Math.max(3,Math.round(H/150));
ctx.save();const z=1+Math.min(.1,tt*.01);ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-W/2,-H/2+Math.sin(tt*.5)*5);
const sky=(a,b)=>{const q=ctx.createLinearGradient(0,-40,0,H*.62);q.addColorStop(0,a);q.addColorStop(1,b);ctx.fillStyle=q;ctx.fillRect(-60,-60,W+120,H+120);};
const ground=(y,f)=>{for(let yy=y;yy<H+u;yy+=u)for(let xx=-u;xx<W+u;xx+=u)kTile('t',f(Math.floor(xx/u),Math.floor(yy/u)),xx,yy,s);};
const stars=n=>{for(let i=0;i<n;i++){ctx.fillStyle='rgba(255,246,200,'+(.4+.6*Math.abs(Math.sin(tt*1.4+i)))+')';ctx.fillRect(Math.round(rand(i,5)*W),Math.round(rand(i,9)*H*.5),3,3);}};
const folk=(x,y,row,face,step)=>drawSpriteK(row,face,step,x,y,k);
const motes=(c,n)=>{for(let i=0;i<n;i++){const x=rand(i,2)*W+Math.sin(tt+i)*14,y=((rand(i,8)*H-tt*(20+rand(i,4)*30))%H+H)%H;ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),3,3);}};
if(act===0){sky('#4a4a54','#b0a090');ground(H*.58,(c,r)=>rand(c,r)<.2?39:rand(c,r)<.4?40:25);for(let i=0;i<7;i++)for(let r=0;r<2;r++)kTile('f',[79,67,31][(i+r)%3],W*(.08+i*.14),H*.62+r*u*1.4,s);for(let i=0;i<3;i++)folk(((tt*26+i*W*.36)%(W+200))-100,H*.9,[11,15,22][i],3,Math.floor(tt*3)%2+1);ctx.fillStyle='rgba(120,100,70,.22)';ctx.fillRect(0,0,W,H);}
else if(act===1){sky('#0a0a24','#3a2a60');stars(40);ground(H*.58,(c,r)=>rand(c,r)<.3?1:0);const n=4,tw=3*u,x0=W/2-n*tw/2;for(let i=0;i<n;i++)kBlock(0,0,3,2,x0+i*tw,H*.62,s);for(let i=0;i<n*2;i++){const x=x0+i*tw/2+tw/4;folk(x,H*.6,[11,12,13,14,15,16,17,18][i%8],0,0);folk(x,H*.92,[21,22,23,24,25,26,27,28][i%8],1,0);}for(let i=0;i<=n;i++)kBlock(19,0,1,2,x0+i*tw-u/2,H*.54,s);const gr=Math.min(1,tt/5);for(let i=0;i<12;i++)kTile('f',gr<.3?4:gr<.7?6:8,W*(.04+i*.085),H*.46,s);const gl=ctx.createRadialGradient(W/2,H*.7,10,W/2,H*.7,W*.55);gl.addColorStop(0,'rgba(255,210,110,.45)');gl.addColorStop(1,'rgba(255,210,110,0)');ctx.fillStyle=gl;ctx.fillRect(0,0,W,H);motes('rgba(255,225,140,.9)',40);}
else if(act===2){sky('#1a0612','#6a1830');ground(H*.64,()=>25);ctx.fillStyle='rgba(30,0,20,.6)';ctx.fillRect(0,H*.64,W,H);if(Math.sin(tt*2.3)>.92){ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(0,0,W,H);}drawBossSprite(8,W/2,H*.8,Math.max(5,Math.floor(H*.78/64)),Math.floor(tt*2)%2,true);for(let i=0;i<5;i++)folk(W*(.14+i*.18),H*.96,[11,15,22,27,32][i],1,0);}
else if(act===3){sky('#1a1840','#c89a50');ground(H*.64,()=>0);const cx=W/2,cy=H*.62,r=Math.min(W,H)*.26;for(let i=0;i<16;i++){const a=tt*.6+i*Math.PI/8;ctx.strokeStyle='rgba(255,230,150,'+(.35+.3*Math.sin(tt*3+i))+')';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*.6,cy+Math.sin(a)*r*.3);ctx.lineTo(cx+Math.cos(a)*r*1.5,cy+Math.sin(a)*r*.75);ctx.stroke();}ctx.strokeStyle='#ffe9a0';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(cx,cy,r,r*.5,0,0,7);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy,r*.6,r*.3,0,0,7);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;folk(cx+Math.cos(a)*r,cy+Math.sin(a)*r*.5+u*.4,[11,12,13,14,15,16,17,18][i],Math.sin(a)>.3?1:0,0);}const pl=ctx.createLinearGradient(0,0,0,H);pl.addColorStop(0,'rgba(255,240,180,.6)');pl.addColorStop(1,'rgba(255,240,180,0)');ctx.fillStyle=pl;ctx.fillRect(cx-r*.25,0,r*.5,cy);motes('rgba(255,240,170,.9)',50);}
else{sky('#05050f','#1a1a38');stars(30);ground(H*.64,()=>0);ctx.fillStyle='rgba(0,0,10,.45)';ctx.fillRect(0,H*.64,W,H);const cx=W/2,cy=H*.66,r=Math.min(W,H)*.26,fl=.5+.3*Math.sin(tt*9);ctx.strokeStyle='rgba(255,230,150,'+fl+')';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(cx,cy,r,r*.5,0,0,7);ctx.stroke();ctx.strokeStyle='#1a0820';ctx.lineWidth=7;[[-.5,-.2,-.2,.15],[-.2,.15,.1,.05],[.1,.05,.3,.3],[.3,.3,.5,.1]].forEach(a=>{ctx.beginPath();ctx.moveTo(cx+a[0]*r,cy+a[1]*r*.5);ctx.lineTo(cx+a[2]*r,cy+a[3]*r*.5);ctx.stroke();});for(let i=0;i<5;i++){const x=W*(.12+i*.19),on=Math.sin(tt*2+i*2)>-.6?.9:.1;ctx.fillStyle='rgba(255,200,100,'+on*.8+')';ctx.fillRect(Math.round(x),Math.round(H*.8),6,10);}drawBossSprite(8,W/2,H*.5,Math.max(2,Math.floor(H*.2/64)),0,false);}
ctx.restore();const v=ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,Math.max(W,H)*.7);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.55)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
sceneTitle(['THE HUNGRY WINTERS','THE FIRST FEAST','THE HOLLOW KING','THE FIRST PROMISE','THE SEAL CRACKS'][act],W,H*.115);bars(W,H);}
function sceneTitle(t,W,y){ctx.font='13px "Press Start 2P",monospace';ctx.textAlign='center';ctx.fillStyle='#000';ctx.fillText(t,W/2+2,y+2);ctx.fillStyle='#f8f8f8';ctx.fillText(t,W/2,y);}
function kPlank(x,y,u,i){if(KN.naturalWidth)ctx.drawImage(KN,200+(23+i%3)*17,0,16,16,Math.round(x),Math.round(y),u,u);}
function winFrame(x,y,w,h){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);const o='#3f2631';px(x-5,y-5,w+10,h+10,o);px(x-3,y-3,w+6,h+6,'#a9683f');px(x-1,y-1,w+2,h+2,o);px(x,y,w,h,'#9fd8f0');px(x,y,w,Math.round(h*.4),'#c8ecf8');px(x+3,y+3,Math.max(3,Math.round(w*.14)),4,'#ffffff');px(x+w/2-2,y,4,h,'#8f5a37');px(x,y+h/2-2,w,4,'#8f5a37');px(x-7,y+h+3,w+14,7,o);px(x-6,y+h+4,w+12,4,'#d9a066');}
function drawRegionScene(W,H){const c=cinematic.chapter||1,t=performance.now()/1000,pal=[['#172e25','#526b3b'],['#4b3b20','#a17a36'],['#102f38','#34727a'],['#21182e','#59416b'],['#2b171d','#70404a'],['#1e3042','#8ab6d1'],['#171b2c','#46536d'],['#21142d','#59336b'],['#351522','#9a3b50']],p=pal[Math.max(0,Math.min(c-1,8))];const gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,p[0]);gr.addColorStop(1,p[1]);ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);for(let i=0;i<18;i++){const x=((i*173+t*12)%(W+120))-60,y=H*(.18+(i%5)*.13);ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,y,28+(i%3)*8,52,0,0,Math.PI*2);ctx.fill();}ctx.fillStyle='rgba(12,12,18,.38)';ctx.fillRect(0,H*.76,W,H*.24);const a=cinematic.actors,scale=Math.max(3,Math.min(6,Math.floor(H/150)));if(a.ROWAN)drawSpriteK(2,a.ROWAN.face||0,a.ROWAN.step||0,a.ROWAN.x,a.ROWAN.y,scale);if(a.HERO)drawSpriteK(heroRow(),a.HERO.face||0,a.HERO.step||0,a.HERO.x,a.HERO.y,scale);ctx.textAlign='center';ctx.font='bold '+Math.max(12,Math.min(22,W/28))+'px "Press Start 2P",monospace';ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillText(chapters[c].place.toUpperCase(),W/2+2,H*.14+2);ctx.fillStyle='#fff0c8';ctx.fillText(chapters[c].place.toUpperCase(),W/2,H*.14);}
const REGION_CUTSCENES = {
2: {title:'THE ORCHARD REMEMBERS', lines:[['ROWAN','This place used to smell like cinnamon and apples. Your mother brought us here every autumn.'],['YOU','I remember. She said every tree had a story.'],['ROWAN','Then look. That tree has the same golden mark as her journal.']], after:[['JOURNAL','A warm light gathers beneath the oldest tree.'],['MARA','If you are seeing this, do not mistake a broken harvest for a broken home.'],['THOMAS','The people who care for one another are the roots.'],['YOU','They left this for me.'],['ROWAN','Then we keep following. Together.']]},
3: {title:'THE PANTRY OF MEMORIES', lines:[['ROWAN','These jars are labeled with dates. One has the day we first met.'],['YOU','We hid here during the thunderstorm.'],['ROWAN','You said we should leave a lantern for anyone who was scared.']], after:[['JOURNAL','A jar glows blue. Inside is a tiny lantern and a note.'],['THOMAS','A promise is not a chain. It is a light we choose to carry.'],['ROWAN','I wish I could ask my mother what she would have done.'],['YOU','We will find the answers.']]},
4: {title:'SHADOWMARKET AFTER DARK', lines:[['ROWAN','Stay close. People here trade secrets as easily as apples.'],['YOU','You sound like you have been here before.'],['ROWAN','I… heard rumors.']], after:[['JOURNAL','A masked figure watches from a balcony. A coin rolls to your feet.'],['SHADOW BROKER','The market remembers every bargain.'],['YOU','Why do you recognize that coin, Rowan?'],['ROWAN','Because I do.']]},
5: {title:'THE EMPTY BANQUET', lines:[['ROWAN','I can hear the old festival music.'],['YOU','The tables are set for a hundred people. Why is every chair empty?'],['ROWAN','Maybe everyone is waiting for someone to invite them.']], after:[['JOURNAL','A little wooden bird rests beside one untouched plate.'],['YOU','Rowan made this for me when we were kids.'],['ROWAN','That part of him is still here.']]},
6: {title:'THE FROSTBOUND SIGNAL', lines:[['ROWAN','The snow is swallowing our footprints.'],['YOU','You always hated the cold.'],['ROWAN','I hate the silence more.']], after:[['JOURNAL','A lantern flashes from the watchtower. Three short lights, then one long.'],['FROST RANGER ILSA','That is the call for shelter.'],['YOU','Then we answer.']]},
7: {title:'THE FORTRESS OATH', lines:[['ROWAN','The banners show the old Keepers.'],['YOU','They never told me they were part of something this big.'],['ROWAN','Maybe they wanted you to have an ordinary childhood.']], after:[['JOURNAL','A stone panel opens beneath the banner.'],['SISTER MIRELLE','No table shall stand empty. The words were meant for one another.'],['YOU','The Hollow King was left outside.'],['ROWAN','We have to end this.']]},
8: {title:'THE VOICES BEYOND THE DOOR', lines:[['YOU','That golden door… I can hear them. Mom? Dad?'],['ROWAN','Whatever is behind it, we face it together.']], after:[['MARA','We are here, sweetheart. We have been keeping the light alive.'],['THOMAS','You do not have to carry everything alone.'],['YOU','I am coming to bring you home.'],['ROWAN','And I am coming with you. No more secrets.']]},
9: {title:'THE LAST LIGHT', lines:[['ROWAN','Beyond this path is the Heart of Hearthvale.'],['YOU','Then let us give it a reason to breathe again.']], after:[['JOURNAL','Ten tiny lights glow—one for every promise kept.'],['MARA','Remember the people who helped you reach this place.'],['THOMAS','A harvest belongs to everyone who shares it.'],['YOU','Then we finish this together.']]}
};
function playRegionIntro(c){
 const data=STORY[c]||{intro:[],npcs:[]};
 state.regionScenes=state.regionScenes||{};
 if(state.regionScenes[c])return;
 const first=c===1&&!state.rowanWoodsScene,sceneData=REGION_CUTSCENES[c],guide=data.npcs.length?data.npcs[0][0]:'JOURNAL';
 cinematic={phase:'region',chapter:c,actors:{HERO:{x:innerWidth*.28,y:innerHeight*.78,face:3,step:0},ROWAN:{x:innerWidth*.72,y:innerHeight*.78,face:2,step:0}}};
 document.body.classList.add('lh-cinematic');
 const say=items=>new Promise(resolve=>setDialogue(items,resolve));
 const walk=(name,to,duration=720)=>new Promise(resolve=>{
  const a=cinematic.actors[name],from={x:a.x,y:a.y},target={x:innerWidth*to.x,y:innerHeight*to.y},start=performance.now();
  a.face=Math.abs(target.x-from.x)>Math.abs(target.y-from.y)?(target.x<from.x?2:3):(target.y<from.y?1:0);
  const step=now=>{if(!cinematic)return resolve();const q=Math.min(1,(now-start)/duration),e=q*q*(3-2*q);a.x=from.x+(target.x-from.x)*e;a.y=from.y+(target.y-from.y)*e;a.step=q<1?1+(Math.floor(now/130)%2):0;if(q<1)requestAnimationFrame(step);else{a.step=0;resolve();}};
  requestAnimationFrame(step);
 });
 (async()=>{
  if(first){
   await say([['ROWAN','Wait up! I knew you would take the trail into Autumnwood. I was not going to let you go alone.']]);
   await walk('ROWAN',{x:.58,y:.78});
   await say([['YOU','Rowan? How did you get here so quickly?'],['ROWAN','Shortcut. I found something caught on a branch. It has your mother’s initials.']]);
   await walk('HERO',{x:.43,y:.78});
   await say([['ROWAN','The leaves are moving toward that arch. It has to be the First Seal. Stay close.']]);
   state.rowanWoodsScene=true;
  } else if(sceneData) {
   await say([['JOURNAL',sceneData.title],...sceneData.lines]);
   await Promise.all([walk('HERO',{x:.43,y:.73},850),walk('ROWAN',{x:.57,y:.73},850)]);
   await say(sceneData.after);
  } else {
   await say(data.intro.map(t=>['JOURNAL',t]));
   await walk('ROWAN',{x:.59,y:.74},620);
   await say([[guide,'I have been waiting for someone who could follow the Keepers’ trail. The path ahead will not be easy.'],['YOU','We did not come this far to turn back. Tell us what happened here.']]);
  }
  state.regionScenes[c]=true;save();cinematic=null;document.body.classList.remove('lh-cinematic');
 })();
}
function drawDreamScene(W,H){const a=cinematic.actors,s=Math.max(3,Math.round(H/160)),u=16*s,k=Math.max(3,Math.round(H/170));
const sky=ctx.createLinearGradient(0,0,0,H*.4);sky.addColorStop(0,'#2a1f3d');sky.addColorStop(1,'#7a5a88');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
for(let i=0;i<W/u+1;i++)kTile('b',[34,52,70,88][i%4],i*u,H*.09,s);
for(let r=0;r<3;r++){const y=H*.2+r*u*.8;for(let x=0;x<W;x+=u)kPlank(x,y,u,Math.floor(x/u)+r);px(0,y+u*.8,W,4,'#4a2e1e');for(let x=u/2;x<W;x+=u*1.1){const row=10+((Math.floor(x/u)*7+r*13)%40);drawSpriteK(row,0,0,x,y+u*.8,Math.max(2,s-1));}}
px(0,H*.5,W,H*.5,'#d9b57a');for(let y=H*.5;y<H;y+=u)for(let x=0;x<W;x+=u){const q=rand(x/u+3,y/u+1);kTile('t',q<.2?39:q<.3?40:q<.4?41:25,x,y,s);}
for(let x=0;x<W;x+=u)kTile('t',x===0?80:81,x,H*.5-u*.4,s);
ctx.strokeStyle='rgba(120,80,40,.55)';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(W/2,H*.76,W*.3,H*.13,0,0,6.3);ctx.stroke();
[[a.MARA,28,0,null],[a.THOMAS,17,0,null],[a.ROWAN,1,0,null],[a.HERO,CIV,3,null],[a.FOE,36,2,'Foe']].sort((p,q)=>p[0].y-q[0].y).forEach(([p,row,face,g])=>actor(p.x,p.y,row,face,g==='Foe'?k+1:k,g,p.step||0));
const v=ctx.createRadialGradient(W/2,H*.6,H*.2,W/2,H*.6,Math.max(W,H)*.7);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(10,0,30,.5)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
sceneTitle('HARVEST FESTIVAL CHAMPIONSHIP',W,H*.115);bars(W,H);}
function drawBed(bx,by,s,pose,row){const P=s,R=(x,y,w,h,c)=>px(bx+x*P,by+y*P,w*P,h*P,c),o='#3f2631';
R(-1,-1,34,59,o);R(0,0,32,57,'#8f5a37');R(0,0,32,9,'#a9683f');R(0,8,32,1,'#6a3f28');R(1,1,30,1,'#c98b56');
R(2,9,28,46,o);R(3,10,26,44,'#f4ecd0');R(3,10,26,2,'#fffbe8');
R(7,11,18,9,o);R(8,12,16,7,'#ffffff');R(8,12,16,1,'#e8f4ff');R(8,18,16,1,'#c9d2de');
ctx.imageSmoothingEnabled=false;
if(pose==='lying'&&CHARS.naturalWidth)ctx.drawImage(CHARS,0,row*16,16,10,Math.round(bx+8*P),Math.round(by+10*P),16*P,10*P);
else if(pose==='sitting'&&CHARS.naturalWidth)ctx.drawImage(CHARS,0,row*16,16,16,Math.round(bx+8*P),Math.round(by+8*P),16*P,16*P);
const top=pose==='lying'?24:pose==='sitting'?26:42;
R(2,top-1,28,54-top+1,o);R(3,top,26,52-top+1,'#c25a3a');R(3,top,26,3,'#e8e0c8');
for(let y=top+7;y<52;y+=6)R(3,y,26,1,'#d9704a');
R(3,52,26,1,'#8a3a28');R(-1,53,34,5,o);R(0,54,32,3,'#a9683f');}
function drawWakeScene(W,H){const a=cinematic.actors,pose=cinematic.wakePose||'lying',s=Math.max(2,Math.round(H/216)),u=16*s,k=s,y0=Math.round(H*.07),cx=Math.round(W/2);
roomShell(W,H,{},0,.07,1,.86,0,s,2);
winFrame(cx-5.4*u,y0+.4*u,2*u,1.2*u);winFrame(cx+3.4*u,y0+.4*u,2*u,1.2*u);
const bedTop=y0+1.2*u;
kBlock(16,8,3,2,cx-1.5*u,bedTop+3.6*u,s);
kBlock(16,0,1,1,cx-6.5*u,y0+2.2*u,s);kBlock(16,0,1,1,cx+5.5*u,y0+2.2*u,s);
drawBed(cx-u,bedTop,s,pose,CIV);
if(pose==='standing')drawSpriteK(CIV,0,0,cx+2.1*u,bedTop+3*u,k);
[[a.MARA,28],[a.THOMAS,17]].forEach(([p,r])=>p&&actor(p.x,p.y,r,p.x<W/2?3:2,k,null,p.step||0));
const g=ctx.createLinearGradient(W*.1,0,W*.5,H);g.addColorStop(0,'rgba(255,236,170,.2)');g.addColorStop(1,'rgba(255,236,170,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
sceneTitle('HEARTHVALE \u2014 MORNING',W,H*.05);bars(W,H);}
function drawBoard(x,y,w,h,s){const o='#3f2631';px(x-6,y-6,w+12,h+12,o);px(x-4,y-4,w+8,h+8,'#a9683f');px(x-2,y-2,w+4,h+4,'#6a3f28');px(x,y,w,h,'#2e5a4a');px(x,y,w,3,'#3d7260');px(x+8,y+h+2,w-16,6,o);px(x+9,y+h+3,w-18,4,'#c98b56');px(x+w*.12,y+h+-1,10,3,'#f4ecd0');
ctx.fillStyle='#e8f0e0';ctx.font=Math.max(7,Math.round(s*3.4))+'px "Press Start 2P",monospace';ctx.textAlign='center';ctx.fillText('WELCOME TO HEARTHVALE',x+w/2,y+h*.58);ctx.fillStyle='#c9d8c0';ctx.fillRect(x+w*.2,y+h*.75,w*.3,2);ctx.fillRect(x+w*.55,y+h*.75,w*.2,2);}
function drawSchoolScene(W,H){const a=cinematic.actors,s=Math.max(2,Math.min(Math.round(H/216),Math.floor(W/240))),u=16*s,k=s,y0=Math.round(H*.07),cx=Math.round(W/2);
roomShell(W,H,{},0,.07,1,.86,4,s,3);
const wb=y0+3*u;
const bw=Math.round(7*u),bh=Math.round(1.4*u);drawBoard(cx-Math.round(bw/2),y0+Math.round(.35*u),bw,bh,s);
if(W>=15*u){winFrame(cx-6.6*u,y0+.4*u,2*u,1.2*u);winFrame(cx+4.6*u,y0+.4*u,2*u,1.2*u);kBlock(16,0,1,1,cx-7.4*u,wb+.3*u,s);kBlock(16,0,1,1,cx+6.4*u,wb+.3*u,s);}
const dY=wb+.15*u;actor(cx,dY+.15*u,10,0,k);kBlock(0,0,3,2,cx-1.5*u,dY,s);
const KIDS=[14,21,24,37,44,47,30,34],seat=(col,row,who,face)=>{const x=cx+(col-1.5)*3*u,dy=wb+(2.6+row*2.3)*u,fy=dy+1.95*u;kBlock(4,2,1,1,x-u,dy,s);kBlock(5,2,1,1,x,dy,s);kBlock(1,3,1,1,x-u/2,fy-1.15*u,s);
if(who==='HERO')actor(x,fy,CIV,0,k);else if(who==='ROWAN')actor(x,fy,1,0,k);else actor(x,fy,KIDS[(col+row*4)%KIDS.length],1,k);};
for(let r=0;r<2;r++)for(let c=0;c<4;c++)seat(c,r,r===1&&c===1?'HERO':r===1&&c===2?'ROWAN':'',0);
sceneTitle('HEARTHVALE SCHOOL',W,H*.05);bars(W,H);}
let lastArea='',stepper=null,alt=0,stepCount=0,turnWait=0,facing=0,walking=false,typing=false,typer=null,fullText='';
const BOS=loadImg(['/img/last-harvest/bosses.png?v=11','/img/bosses.png?v=11']);
const INT=loadImg(['/img/interior.png?v=11','/img/last-harvest/interior.png?v=11']);
let CIV=4;function applyGender(){CIV=state.gender==='girl'?8:4;}
const BLD=new Image();BLD.src='/img/last-harvest/buildings.png';
const BR={cottage:[0,0,97,92],inn:[101,0,96,106],store:[201,0,88,106],workshop:[293,0,66,81],tree:[530,0,58,76],pine:[592,0,54,72]},HOUSES=['cottage','inn','store','workshop'];
const CHARS=new Image();CHARS.src='/img/last-harvest/people.png?v=11';
const KN=new Image();KN.src='/img/last-harvest/kenney.png?v=11';
const NPC_MON={'PUMPKIN SENTINEL':9};
const MON=new Image();MON.src='/img/last-harvest/monsters.png?v=11';
const GENS=['Meadow','Orchard','Marsh','Cavern','Frostfall','Emberwood','Tempest','Crypt','Clockwork','Eclipse'],ARCH=['Slime','Bat','Beetle','Hound','Sprout','Wisp','Golem','Serpent','Crow'],BOSS=['Pumpkin Sentinel','Orchard Tyrant','Marsh Matriarch','Cavern Colossus','Frostfall Wyrm','Emberwood Behemoth','Tempest Roc','Crypt Lich King','Clockwork Titan','Eclipse Devourer'];
/* monsters.png: 10 generations (rows) x 10 (9 monsters + 1 boss). index = gen*10+slot. Higher generations are stronger. */
function monInfo(i){const g=(i/10)|0,a=i%10,boss=a===9;return{name:(boss?BOSS[g]:GENS[g]+' '+ARCH[a]).toUpperCase(),hp:Math.round((16+g*10+(boss?0:a))*(boss?2.4:1)),atk:Math.round((4+g*2)*(boss?1.5:1)),reward:Math.round((10+g*12)*(boss?4:1)),boss};}
function wildEncounter(){const g=Math.min(9,Math.floor(((state.level||1)-1)/2)),gg=Math.max(0,g-(Math.random()<.3?1:0)),i=gg*10+Math.floor(Math.random()*9),m=monInfo(i);return{id:'wild',wild:true,name:m.name,mi:i,hp:m.hp,atk:m.atk,reward:m.reward,win:[]};}
function drawMon(i,x,fy,k){if(!MON.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(Math.round(x-6*k),Math.round(fy-k),12*k,2*k);ctx.imageSmoothingEnabled=false;ctx.drawImage(MON,(i%10)*16,((i/10)|0)*16,16,16,Math.round(x-8*k),Math.round(fy-16*k),16*k,16*k);}
const WLD=loadImg(['/img/last-harvest/wilds.png?v=30','/img/wilds.png?v=30']);
const WSP={"g0_0":[0,0,16,16],"g0_1":[16,0,16,16],"g0_2":[32,0,16,16],"g0_3":[48,0,16,16],"r0_0":[64,0,16,16],"r0_1":[80,0,16,16],"r0_2":[96,0,16,16],"wt0_0":[112,0,16,16],"wt0_1":[128,0,16,16],"tg0_0":[144,0,16,16],"tg0_1":[160,0,16,16],"g1_0":[176,0,16,16],"g1_1":[192,0,16,16],"g1_2":[208,0,16,16],"g1_3":[224,0,16,16],"r1_0":[240,0,16,16],"r1_1":[0,16,16,16],"r1_2":[16,16,16,16],"wt1_0":[32,16,16,16],"wt1_1":[48,16,16,16],"tg1_0":[64,16,16,16],"tg1_1":[80,16,16,16],"g2_0":[96,16,16,16],"g2_1":[112,16,16,16],"g2_2":[128,16,16,16],"g2_3":[144,16,16,16],"r2_0":[160,16,16,16],"r2_1":[176,16,16,16],"r2_2":[192,16,16,16],"wt2_0":[208,16,16,16],"wt2_1":[224,16,16,16],"tg2_0":[240,16,16,16],"tg2_1":[0,32,16,16],"g3_0":[16,32,16,16],"g3_1":[32,32,16,16],"g3_2":[48,32,16,16],"g3_3":[64,32,16,16],"r3_0":[80,32,16,16],"r3_1":[96,32,16,16],"r3_2":[112,32,16,16],"wt3_0":[128,32,16,16],"wt3_1":[144,32,16,16],"tg3_0":[160,32,16,16],"tg3_1":[176,32,16,16],"g4_0":[192,32,16,16],"g4_1":[208,32,16,16],"g4_2":[224,32,16,16],"g4_3":[240,32,16,16],"r4_0":[0,48,16,16],"r4_1":[16,48,16,16],"r4_2":[32,48,16,16],"wt4_0":[48,48,16,16],"wt4_1":[64,48,16,16],"tg4_0":[80,48,16,16],"tg4_1":[96,48,16,16],"bush":[0,64,16,16],"bushF":[16,64,16,16],"rockM":[32,64,16,16],"mossRock":[48,64,16,16],"boulder":[64,64,16,16],"iceRock":[80,64,16,16],"stump":[96,64,16,16],"hay":[112,64,16,16],"reeds":[128,64,16,16],"crystal":[144,64,16,16],"iceCr":[160,64,16,16],"snowM":[176,64,16,16],"flowerA":[192,64,16,16],"flowerB":[208,64,16,16],"tuft":[224,64,16,16],"mush":[240,64,16,16],"leaves":[0,80,16,16],"puddle":[16,80,16,16],"pebbles":[32,80,16,16],"bones":[48,80,16,16],"glow":[64,80,16,16],"flake":[80,80,16,16],"oak":[0,96,16,32],"maple":[16,96,16,32],"apple":[32,96,16,32],"willow":[48,96,16,32],"swampT":[64,96,16,32],"deadT":[80,96,16,32],"pine":[96,96,16,32],"spire":[112,96,16,32]};
function wSprite(n,x,y){const r=WSP[n];if(!r||!WLD.naturalWidth)return false;ctx.imageSmoothingEnabled=false;ctx.drawImage(WLD,r[0],r[1],r[2],r[3],Math.round(x+(32-r[2]*2)/2),Math.round(y+32-r[3]*2),r[2]*2,r[3]*2);return true;}
const KS={t:[0,0,12],f:[0,176,12],d:[0,352,12],b:[200,310,18]};
function kTile(sh,i,x,y,s=2){if(!KN.naturalWidth)return;const [ox,oy,n]=KS[sh];ctx.imageSmoothingEnabled=false;ctx.drawImage(KN,ox+(i%n)*16,oy+((i/n)|0)*16,16,16,Math.round(x),Math.round(y),16*s,16*s);}
const inGrass=P=>{const x=Math.floor(P.x/TILE),y=Math.floor(P.y/TILE);return x>=4&&x<9&&y>=19&&y<22;};
function kBlock(c,r,w,h,x,y,s){if(!KN.naturalWidth)return;ctx.imageSmoothingEnabled=false;for(let j=0;j<h;j++)for(let i=0;i<w;i++)ctx.drawImage(KN,200+(c+i)*17,(r+j)*17,16,16,Math.round(x+i*16*s),Math.round(y+j*16*s),16*s,16*s);}
const pathSet=new Set();[[0,11,48,4],[15,0,4,36],[19,14,10,2]].forEach(([x,y,w,h])=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)pathSet.add(i+','+j);});
function drawPaths(camX,camY,W,H){const P=(i,j)=>i<0||j<0||i>=MAP_W||j>=MAP_H||pathSet.has(i+','+j);for(let j=Math.max(0,Math.floor(camY/TILE));j<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);j++)for(let i=Math.max(0,Math.floor(camX/TILE));i<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);i++){if(!P(i,j))continue;const t=!P(i,j-1),b=!P(i,j+1),l=!P(i-1,j),r=!P(i+1,j);let n=25;if(t&&l)n=12;else if(t&&r)n=14;else if(b&&l)n=36;else if(b&&r)n=38;else if(t)n=13;else if(b)n=37;else if(l)n=24;else if(r)n=26;else{const q=rand(i+5,j+2);n=q<.18?39:q<.3?40:q<.4?41:25;}kTile('t',n,i*TILE,j*TILE);}}
function drawTree(x,y){const o=rand(x+3,y+9);if(o<.3){kTile('t',o<.15?27:28,x*TILE,y*TILE);return;}const a=o<.65?[3,15]:[4,16];kTile('t',a[0],x*TILE,(y-1)*TILE);kTile('t',a[1],x*TILE,y*TILE);}
const HSTY={cottage:{rt:[52,53,54],rm:[64,65,66],w:[72,73,75],win:84,door:85},inn:{rt:[52,53,54],rm:[64,65,66],w:[76,77,79],win:88,door:89},store:{rt:[48,49,50],rm:[60,61,62],w:[72,73,75],win:84,door:86},workshop:{rt:[48,49,50],rm:[60,61,62],w:[76,77,79],win:88,door:90}};
function drawBuilding(b,n){const r=VR[n];if(!VIL.naturalWidth)return;ctx.imageSmoothingEnabled=false;ctx.drawImage(VIL,r[0],r[1],r[2],r[3],Math.round(b.x*TILE),Math.round((b.y+b.h)*TILE-r[3]*2),r[2]*2,r[3]*2);}
function drawFarm(){for(let r=0;r<3;r++)for(let c=0;c<5;c++){const x=(28+c)*TILE,y=(25+r)*TILE;kTile('f',[48,49,49,49,51][c],x,y);kTile('f',[6,20,32,44,54][(c+r)%5],x,y);}for(let c=0;c<5;c++){const f=c===0?80:c===4?82:81;kTile('t',f,(28+c)*TILE,24*TILE);kTile('t',f,(28+c)*TILE,28*TILE);}kTile('f',120,36*TILE,26*TILE);kTile('f',122,31*TILE,30*TILE);kTile('f',96,34*TILE,24*TILE);kTile('f',85,35*TILE,25*TILE);for(let j=19;j<22;j++)for(let i=4;i<9;i++)kTile('f',65,i*TILE,j*TILE);[[18,19,19,19,20],[36,37,37,37,38],[36,37,37,37,38],[54,55,55,55,56]].forEach((row,j)=>row.forEach((t,i)=>kTile('b',t,(21+i)*TILE,(24+j)*TILE)));}
function drawGates(){for(const g of GUARDS){if(state.beaten[g.id])continue;const h=g.gate.w>=g.gate.h;for(let j=0;j<g.gate.h;j++)for(let i=0;i<g.gate.w;i++)kTile('t',h?81:59,(g.gate.x+i)*TILE,(g.gate.y+j)*TILE);(h?[[g.gate.x-1,g.gate.y],[g.gate.x+g.gate.w,g.gate.y]]:[[g.gate.x,g.gate.y-1],[g.gate.x,g.gate.y+g.gate.h]]).forEach(([a,c])=>kTile('b',88,a*TILE,c*TILE));}}
/* ===== Battles: alert -> screen wipe -> entrance -> animated turn-based fight ===== */
let battle=null,lastCam={camX:0,camY:0},FXC=null;
const $b=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp01=v=>Math.max(0,Math.min(1,v)),ease=p=>p*p*(3-2*p),rnd=n=>Math.floor(Math.random()*n);
/* --- tiny synth sound effects (WebAudio, no files needed) --- */
let AC=null;
function audio(){try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();}catch(e){}return AC;}
function tone(f,d,type,v,slide,delay){if(muted)return;const a=audio();if(!a)return;try{const t=a.currentTime+(delay||0),o=a.createOscillator(),g=a.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);g.gain.setValueAtTime(v||.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03);}catch(e){}}
const SFX={
alert(){tone(988,.09);tone(1480,.14,'square',.05,0,.1);},
warn(){for(let i=0;i<4;i++)tone(300,.22,'sawtooth',.05,260,i*.28);},
swirl(){tone(200,.55,'triangle',.06,900);},
hit(){tone(180,.16,'sawtooth',.07,-110);tone(90,.2,'square',.06,-40,.02);},
crit(){tone(240,.1,'square',.07,200);tone(480,.2,'sawtooth',.07,-300,.08);},
magic(){tone(500,.3,'sine',.06,700);tone(750,.25,'triangle',.04,500,.05);},
arrow(){tone(900,.12,'triangle',.05,-500);},
heal(){[523,659,784,1047].forEach((f,i)=>tone(f,.14,'triangle',.05,0,i*.09));},
guard(){tone(320,.14,'square',.05,-120);},
foe(){tone(130,.2,'sawtooth',.07,-60);},
charge(){tone(120,.9,'sawtooth',.05,500);},
boom(){tone(70,.6,'sawtooth',.09,-35);tone(140,.4,'square',.06,-90);},
win(){[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,.16,'square',.05,0,i*.11));},
lose(){[392,330,262,196].forEach((f,i)=>tone(f,.3,'triangle',.06,0,i*.2));}};
const sfx=n=>{try{if(SFX[n])SFX[n]();}catch(e){}};
addEventListener('pointerdown',audio,{once:true});addEventListener('keydown',audio,{once:true});

/* --- class skills: pick one in the SKILL menu (tap once to read it, tap again to cast) --- */
const SKILLS={
Guardian:[
{n:'SHIELD BASH',mp:3,kind:'melee',base:12,per:2,stun:.4,d:'A heavy shield slam. 40% chance to stun the foe for a turn.',msg:'You slam your shield forward!'},
{n:'SHIELDBREAKER',mp:6,kind:'melee',base:22,per:2.6,weaken:3,d:'A crushing strike that weakens the foe\u2019s attacks for 3 turns.',msg:'Shieldbreaker smashes down!'},
{n:'IRON WALL',mp:4,ward:2,heal:8,d:'Raise your shield: take 70% less damage for 2 turns and recover a little HP.',msg:'You plant your shield. Iron Wall!'},
{n:'HARVEST AEGIS',mp:10,kind:'melee',base:30,per:3,healSelf:14,d:'A golden counter-strike that hits hard and heals you.',msg:'Harvest Aegis blazes with golden light!'}],
Scout:[
{n:'QUICKSTEP',mp:3,kind:'melee',hits:2,base:8,per:1.2,d:'Dash in and land two fast strikes.',msg:'Quickstep! You blur forward!'},
{n:'PIERCING ARROW',mp:5,kind:'arrow',base:22,per:2.4,d:'One powerful arrow that never misses.',msg:'You line up a Piercing Arrow...'},
{n:'SMOKE BOMB',mp:4,evade:true,d:'Vanish in smoke and dodge the foe\u2019s next attack.',msg:'You throw down a Smoke Bomb!'},
{n:'ARROW VOLLEY',mp:9,kind:'arrow',hits:3,base:11,per:1.4,crit:.35,d:'Three arrows in a row. Each can land a critical hit.',msg:'Arrow Volley! You loose three shots!'}],
Mage:[
{n:'EMBER BOLT',mp:3,kind:'magic',base:14,per:2.2,burn:3,color:'#ff7a2e',d:'A bolt of fire that burns the foe for 3 turns.',msg:'Ember Bolt streaks out!'},
{n:'FROST NOVA',mp:5,kind:'magic',base:17,per:2,weaken:3,color:'#8fd8ff',d:'Chilling blast that slows the foe\u2019s attacks for 3 turns.',msg:'Frost Nova bursts open!'},
{n:'HARVEST BLOOM',mp:6,heal:24,color:'#7bf08a',d:'Call a warm harvest wind and restore your HP.',msg:'Harvest Bloom flowers around you!'},
{n:'ARCANA BURST',mp:10,kind:'magic',base:36,per:3.2,color:'#d29bff',d:'Your strongest spell. A massive blast of Harvest Arcana.',msg:'Harvest Arcana erupts!'}]};

/* --- UI (menu, skill picker, status boxes) --- */
function pkUI(){let el=$b('pk-ui');if(el)return el;el=document.createElement('div');el.id='pk-ui';el.hidden=true;
el.innerHTML='<div class="pk-box pk-foe" id="pk-foe"><b id="pk-fn"></b><small id="pk-fl"></small><i><u id="pk-fh"></u></i></div><div class="pk-box pk-me"><b id="pk-mn"></b><small id="pk-mh"></small><i><u id="pk-mhb"></u></i><i class="mp"><u id="pk-mmb"></u></i></div><div class="pk-bottom" id="pk-bottom"><p id="pk-t"></p><div class="pk-menu" id="pk-menu"></div></div>';
document.body.appendChild(el);
el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.a)pkAct(b.dataset.a);else if(b.dataset.s!==undefined)pkSkillPick(+b.dataset.s);else if(b.dataset.i)useBattleItem(b.dataset.i);else if(b.dataset.m)pkMenu(b.dataset.m);});
return el;}
const BATTLE_ITEMS=[
{id:'potion',name:'Harvest Potion',desc:'Restore 35 HP.',count:3},
{id:'ether',name:'Moonmint Tea',desc:'Restore 8 MP.',count:2},
{id:'cider',name:'Golden Cider',desc:'Restore 20% of your maximum HP.',count:1},
{id:'charm',name:'Oakguard Charm',desc:'Reduce the next 2 turns of damage.',count:1},
{id:'ember',name:'Ember Seed',desc:'Deal 28 damage to the opponent.',count:1}
];
function ensureBattleItems(){state.battleItems=state.battleItems||{};BATTLE_ITEMS.forEach(it=>{if(!Number.isFinite(state.battleItems[it.id]))state.battleItems[it.id]=it.id==='potion'&&Number.isFinite(state.potions)?Math.max(0,state.potions):it.count;});if(!state.potionInventoryMigrated){state.battleItems.potion=Math.max(Number(state.battleItems.potion)||0,Number(state.potions)||0);state.potionInventoryMigrated=true;}state.potions=Math.max(0,Number(state.battleItems.potion)||0);}
 function addPotions(n){ensureBattleItems();state.battleItems.potion=Math.max(0,Number(state.battleItems.potion)||0)+Math.max(0,Number(n)||0);state.potions=state.battleItems.potion;return state.potions;}
function battleItemCount(id){ensureBattleItems();return Math.max(0,Number(state.battleItems[id])||0);}
function useBattleItem(id){const b=battle;if(!b||b.busy)return;ensureBattleItems();const it=BATTLE_ITEMS.find(x=>x.id===id);if(!it||!battleItemCount(id))return;
if(id==='potion'&&state.hp>=state.maxHp){pkSay('Your health is already full.',650);b.busy=false;pkMenu('items');return;}
if(id==='ether'&&state.mp>=state.maxMp){pkSay('Your MP is already full.',650);b.busy=false;pkMenu('items');return;}
if(id==='cider'&&state.hp>=state.maxHp){pkSay('Your health is already full.',650);b.busy=false;pkMenu('items');return;}
state.battleItems[id]--;if(id==='potion')state.potions=state.battleItems.potion;
if(id==='potion'){const n=Math.min(35,state.maxHp-state.hp);state.hp+=n;healFx(n);pkSay('Harvest Potion restores '+n+' HP!',750);}
else if(id==='ether'){const n=Math.min(8,state.maxMp-state.mp);state.mp+=n;rise(geo().hx,geo().hy,18,['#8fd8ff','#ffffff','#b06aff'],50);pkSay('Moonmint Tea restores '+n+' MP!',750);}
else if(id==='cider'){const n=Math.min(Math.ceil(state.maxHp*.2),state.maxHp-state.hp);state.hp+=n;healFx(n,'#ffd66b');pkSay('Golden Cider restores '+n+' HP!',750);}
else if(id==='charm'){b.ward=Math.max(b.ward,2);shieldFx();pkSay('Oakguard Charm protects you for 2 turns!',750);}
else if(id==='ember'){const n=28;hitFoe(n,'magic',false);pkSay('The Ember Seed bursts for '+n+' damage!',750);}
pkPanel();save();updateHud();if(!b.e.hp){pkWin();return;}endRound();
}
function pkMenu(kind){const m=$b('pk-menu');if(!m||!battle)return;battle.sel=-1;
if(kind==='skills'){const list=knownSkills();m.className='pk-menu sk';m.innerHTML=list.map((s,i)=>'<button data-s="'+i+'"'+(state.mp<s.mp?' disabled':'')+'><b>'+s.n+'</b><em>'+s.mp+' MP</em></button>').join('')+'<button data-m="main" class="back">\u25C0 BACK</button>';$b('pk-t').textContent='Choose a skill. You have '+state.mp+' / '+state.maxMp+' MP.';}
else if(kind==='items'){ensureBattleItems();m.className='pk-menu sk';m.innerHTML=BATTLE_ITEMS.map(it=>'<button data-i="'+it.id+'"'+(!battleItemCount(it.id)?' disabled':'')+'><b>'+it.name+'</b><em>×'+battleItemCount(it.id)+'</em></button>').join('')+'<button data-m="main" class="back">\u25C0 BACK</button>';$b('pk-t').textContent='Choose an item. Using one takes your turn.';}
else{m.className='pk-menu';m.innerHTML='<button data-a="attack">FIGHT</button><button data-a="skill">SKILL</button><button data-a="guard">GUARD</button><button data-a="items">ITEMS</button><button data-a="run">RUN</button>';$b('pk-t').textContent='What will you do?';}}
function pkSkillPick(i){if(!battle||battle.busy)return;const sk=knownSkills()[i];if(!sk)return;
if(battle.sel===i){pkSkill(i);return;}
battle.sel=i;[...document.querySelectorAll('#pk-menu [data-s]')].forEach(b=>b.classList.toggle('sel',+b.dataset.s===i));
$b('pk-t').textContent=sk.n+' \u2014 '+sk.d+' (Tap again to cast)';}
function pkPanel(){const b=battle;if(!b)return;const e=b.e,pc=e.hp/e.max;$b('pk-fn').textContent=(e.boss?'\u2620 ':'')+e.name;$b('pk-fl').textContent=e.boss?'BOSS \u00B7 CHAPTER '+(e.bi+1)+(e.enraged?' \u00B7 ENRAGED':''):'';
const fh=$b('pk-fh');fh.style.width=(pc*100)+'%';fh.className=pc<.25?'low':pc<.5?'mid':'';$b('pk-foe').classList.toggle('boss',!!e.boss);
$b('pk-mn').textContent=(state.name||'HERO').toUpperCase()+'  Lv'+state.level;$b('pk-mh').textContent=state.hp+' / '+state.maxHp+'  MP '+state.mp;
const mh=$b('pk-mhb'),hp=state.hp/state.maxHp;mh.style.width=(hp*100)+'%';mh.className=hp<.25?'low':hp<.5?'mid':'';$b('pk-mmb').style.width=(state.mp/state.maxMp*100)+'%';}
async function pkSay(t,ms){$b('pk-t').textContent=t;await sleep(ms||800);}

/* --- scene geometry shared by drawing and attack animations --- */
function geo(){const W=innerWidth,H=innerHeight,PH=H-Math.max(H*.3,150),b=battle,e=b&&b.e,boss=!!(e&&e.boss),hk=Math.max(4,Math.floor(PH*.3/16));
let fk,fh;if(boss){fk=Math.max(2,Math.min(Math.floor(PH*.62/64),Math.floor(W*.44/64)));fh=64*fk;}else if(e&&e.mi!==undefined){fk=Math.max(4,Math.floor(PH*.3/16));fh=16*fk;}else{fk=Math.max(5,Math.floor(PH*.3/16));fh=16*fk;}
return{W,H,PH,hk,fk,fh,hx:W*.24,hy:PH*.96,fx:W*.7,fy:boss?PH*.72:PH*.56};}
function tween(ms,fn){return new Promise(res=>{const t0=performance.now();(function f(now){const p=clamp01((now-t0)/ms);fn(p);if(p<1&&battle)requestAnimationFrame(f);else res();})(t0);});}
function burst(x,y,n,cols,spd){const b=battle;if(!b)return;for(let i=0;i<n;i++){const a=Math.random()*6.283,v=(spd||160)*(.3+Math.random());b.parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-40,g:260,life:.5+Math.random()*.4,max:.9,c:cols[rnd(cols.length)],s:3+rnd(4)});}}
function rise(x,y,n,cols,w){const b=battle;if(!b)return;for(let i=0;i<n;i++)b.parts.push({x:x+(Math.random()-.5)*(w||60),y:y+Math.random()*10,vx:(Math.random()-.5)*20,vy:-50-Math.random()*70,g:-10,life:.8+Math.random()*.6,max:1.4,c:cols[rnd(cols.length)],s:3+rnd(3)});}
function pop(txt,x,y,c,size){battle.pops.push({t:txt,x,y,c:c||'#fff',s:size||18,age:0});}

/* --- starting a battle: ! alert -> stripe wipe -> entrance -> fight --- */
function startBattle(g){ensureBattleItems();state.level=state.level||1;state.maxHp=Math.max(state.maxHp||0,state.hp,40);state.maxMp=state.maxMp||20;state.mp=state.mp??state.maxMp;state.potions=state.potions??3;state.xp=state.xp||0;state.hp=Math.max(state.hp,1);
const B=g.bi!==undefined?BOSSES[g.bi]:null,hp=B?B.hp:g.hp,atk=B?B.atk:g.atk;
battle={g,B,e:{name:g.name,hp,max:hp,atk,row:g.row,mi:g.mi,bi:g.bi,boss:!!B,status:{},turn:0,charging:false,enraged:false},ward:0,evade:false,guard:false,busy:true,sel:-1,phase:'alert',t0:performance.now(),last:performance.now(),
hox:0,hoy:0,fox:0,foy:0,shake:0,flashF:0,flashH:0,flashR:0,flashW:0,shield:0,dead:0,hdead:0,parts:[],pops:[],proj:null};
runIntro();}
async function runIntro(){const b=battle,B=b.B;sfx(B?'warn':'alert');b.phase='alert';b.t0=performance.now();await sleep(B?1700:900);if(battle!==b)return;
b.phase='swirl';b.t0=performance.now();sfx('swirl');await sleep(650);if(battle!==b)return;
b.phase='enter';b.t0=performance.now();document.body.classList.add('lh-battling');pkUI().hidden=false;$b('pk-ui').classList.add('intro');pkMenu('main');pkPanel();if(B)sfx('boom');
$b('pk-t').textContent=b.g.wild?'A wild '+b.g.name+' appeared!':B?b.g.name+' awakens!':b.g.name+' wants to battle!';
await sleep(B?2600:1150);if(battle!==b)return;$b('pk-ui').classList.remove('intro');b.phase='fight';pkMenu('main');b.busy=false;}
function pkEnd(lost){const gg=battle&&battle.g,fr=gg&&gg.friendly,won=!!(battle&&battle.e&&battle.e.hp<=0),cbk=gg&&gg.onEnd;battle=null;document.body.classList.remove('lh-battling');const u=pkUI();u.hidden=true;u.classList.remove('intro');if(fr){state.hp=Math.max(1,Math.ceil(state.maxHp*.6));}else if(lost){state.hp=Math.ceil(state.maxHp*.6);scene='outside';state.x=20*TILE+16;state.y=15*TILE+24;}save();updateHud();if(cbk)cbk(won);}

/* --- animated actions --- */
function hitFoe(dmg,kind,crit){const b=battle,e=b.e,G=geo();e.hp=Math.max(0,e.hp-dmg);b.flashF=1;b.shake=Math.max(b.shake,crit?16:e.boss?10:8);b.kf=16;const cx=G.fx,cy=G.fy-G.fh*.5;
const cols=kind==='magic'?['#ffffff','#d29bff','#8fd8ff']:kind==='arrow'?['#ffffff','#e8d890','#c9a032']:['#ffffff','#ffd84a','#ff9a2e'];burst(cx,cy,crit?22:14,cols,crit?260:190);
b.slash={x:cx,y:cy,t:0,k:kind};pop(String(dmg)+(crit?'!':''),cx,cy-G.fh*.25,crit?'#ffd84a':'#ffffff',crit?26:20);sfx(crit?'crit':'hit');pkPanel();}
function hitHero(dmg,heavy){const b=battle,G=geo();state.hp=Math.max(0,state.hp-dmg);b.flashH=1;b.shake=Math.max(b.shake,heavy?18:10);b.flashR=heavy?.9:.35;b.kh=-14;const cx=G.hx,cy=G.hy-G.hk*8;burst(cx,cy,heavy?20:12,['#ffffff','#ff6a5a','#ffd84a'],200);pop(String(dmg),cx,cy-G.hk*5,'#ff6a5a',heavy?26:20);sfx('foe');pkPanel();}
async function heroStrike(kind,dmg,crit,color){const b=battle,G=geo();let dx=0;
if(kind==='melee'){dx=(G.fx-G.hx)*.68;await tween(210,p=>{b.hox=dx*ease(p);b.hoy=-10*Math.sin(p*Math.PI);});}
else{sfx(kind==='arrow'?'arrow':'magic');const sy=G.hy-G.hk*9,ty=G.fy-G.fh*.5;await tween(kind==='arrow'?250:360,p=>{const q=ease(p);b.proj={k:kind,c:color||'#d29bff',p,x:G.hx+G.hk*8+(G.fx-G.hx-G.hk*8)*q,y:sy+(ty-sy)*q-Math.sin(p*Math.PI)*28};if(kind==='magic'&&Math.random()<.8)b.parts.push({x:b.proj.x,y:b.proj.y,vx:(Math.random()-.5)*50,vy:(Math.random()-.5)*50,g:0,life:.3,max:.3,c:color||'#d29bff',s:4+rnd(3)});});b.proj=null;}
hitFoe(dmg,kind,crit);
if(kind==='melee'){await sleep(130);await tween(190,p=>{b.hox=dx*(1-ease(p));b.hoy=0;});b.hox=0;}else await sleep(200);}
function healFx(n,color){const b=battle,G=geo(),cx=G.hx,cy=G.hy-G.hk*8;sfx('heal');rise(cx,cy+G.hk*6,24,[color||'#7bf08a','#ffffff','#d8ffd8'],G.hk*10);pop('+'+n,cx,cy-G.hk*4,color||'#7bf08a',22);}
function shieldFx(){battle.shield=1;sfx('guard');}
function rageFx(){const b=battle;b.shake=18;b.flashR=1;sfx('boom');const G=geo();rise(G.fx,G.fy,30,['#ff3b30','#ffd84a','#ff9a2e'],G.fh*.7);}
async function pkAct(a){const b=battle;if(!b||b.busy)return;

if(a==='skill'){pkMenu('skills');return;}
if(a==='items'){pkMenu('items');return;}
b.busy=true;const e=b.e;
if(a==='run'){if(b.g.wild&&!b.g.tower){await pkSay('You got away safely!');pkEnd();return;}await pkSay(e.boss?'There is no escape from a boss!':'You can\u2019t run from a trainer battle!',900);pkMenu('main');b.busy=false;return;}
if(a==='guard'){b.guard=true;shieldFx();state.mp=Math.min(state.maxMp,state.mp+2);pkPanel();await pkSay('You brace yourself. (+2 MP)',700);await endRound();return;}
if(a==='item'){b.busy=false;pkMenu('items');return;}
await heroAttack(null);}
async function pkSkill(i){const b=battle;if(!b||b.busy)return;const sk=knownSkills()[i];if(!sk||state.mp<sk.mp)return;b.busy=true;state.mp-=sk.mp;pkPanel();$b('pk-menu').innerHTML='';await heroAttack(sk);}
async function heroAttack(sk){const b=battle,e=b.e,cls=state.heroClass,lv=state.level;
if(!sk){const kind=cls==='Scout'?'arrow':cls==='Mage'?'magic':'melee';const crit=Math.random()<.1;let d=8+lv*2+(cls==='Guardian'?3:0)+rnd(4);if(crit)d=Math.round(d*1.6);
await pkSay(crit?'A critical strike!':'You attack!',420);await heroStrike(kind,d,crit,cls==='Mage'?'#d29bff':'#e8d890');await pkSay('It deals '+d+' damage!',650);}
else{await pkSay(sk.msg,650);
if(sk.heal&&!sk.kind){const h=sk.heal+(sk.per||0)*lv+Math.round(lv*2);state.hp=Math.min(state.maxHp,state.hp+h);healFx(h,sk.color);pkPanel();await pkSay('You recover '+h+' HP!',800);}
if(sk.ward){b.ward=sk.ward;shieldFx();if(sk.heal){state.hp=Math.min(state.maxHp,state.hp+sk.heal);healFx(sk.heal,'#8fd8ff');pkPanel();}await pkSay('Damage taken is reduced for '+sk.ward+' turns!',800);}
if(sk.evade){b.evade=true;const G=geo();rise(G.hx,G.hy,26,['#d8d8e0','#a8a8b8','#ffffff'],G.hk*12);sfx('swirl');await pkSay('You will dodge the next attack!',800);}
if(sk.kind){let total=0;const hits=sk.hits||1;for(let h=0;h<hits&&e.hp>0;h++){const crit=sk.crit?Math.random()<sk.crit:Math.random()<.08;let d=Math.round(sk.base+sk.per*lv+rnd(4));if(crit)d=Math.round(d*1.6);total+=d;await heroStrike(sk.kind,d,crit,sk.color);}
if(e.hp>0){await pkSay('It deals '+total+' damage!',650);
if(sk.stun&&Math.random()<(e.boss?sk.stun*.4:sk.stun)){e.status.stun=1;await pkSay(e.name+' is stunned!',750);}
if(sk.weaken){e.status.weaken=sk.weaken;await pkSay(e.name+'\u2019s attacks are weakened!',750);}
if(sk.burn){e.status.burn=sk.burn;await pkSay(e.name+' is burning!',750);}
if(sk.healSelf){state.hp=Math.min(state.maxHp,state.hp+sk.healSelf);healFx(sk.healSelf,'#ffe45c');pkPanel();await pkSay('You recover '+sk.healSelf+' HP!',750);}}}}
if(!e.hp){await pkWin();return;}
await endRound();}
async function endRound(){const b=battle,e=b.e;
if(e.status.burn>0){e.status.burn--;const d=3+Math.floor(state.level/2);const G=geo();burst(G.fx,G.fy-G.fh*.5,10,['#ff7a2e','#ffd84a','#ff3b30'],120);e.hp=Math.max(0,e.hp-d);b.flashF=.7;pop(String(d),G.fx,G.fy-G.fh*.7,'#ff9a2e',18);sfx('hit');pkPanel();await pkSay(e.name+' takes '+d+' burn damage!',800);if(!e.hp){await pkWin();return;}}
const alive=await foeTurn();if(!alive)return;
if(b.ward>0)b.ward--;if(e.status.weaken>0)e.status.weaken--;b.guard=false;b.evade=false;
save();updateHud();pkMenu('main');b.busy=false;}
async function foeTurn(){const b=battle,e=b.e,lv=state.level,G=geo();e.turn++;
if(e.boss&&!e.enraged&&e.hp<=e.max*.5){e.enraged=true;e.atk=Math.round(e.atk*1.25);rageFx();pkPanel();await pkSay(e.name+' is ENRAGED!',1100);}
if(e.status.stun){e.status.stun=0;await pkSay(e.name+' is stunned and can\u2019t move!',850);return true;}
let mv={n:'attacks!',m:1,k:'norm',hits:1};
if(e.boss){const sig=b.B.sig;
if(e.charging){e.charging=false;mv={n:'uses '+sig.n+'!',m:sig.k==='heavy'?2.3:sig.k==='multi'?.85:sig.k==='drain'?1.6:1.7,k:sig.k,hits:sig.k==='multi'?3:1};}
else if(e.turn%3===0){e.charging=true;sfx('charge');b.flashR=.5;b.shake=10;rise(G.fx,G.fy,26,[BOSSES[e.bi].theme[2],'#ffffff'],G.fh*.6);await pkSay(e.name+' '+sig.t,1400);$b('pk-t').textContent='DANGER! GUARD, Iron Wall or Smoke Bomb will help!';await sleep(900);return true;}}
await pkSay(e.name+' '+mv.n,650);
const dx=-(G.fx-G.hx)*(e.boss?.5:.6);await tween(e.boss?300:240,p=>{b.fox=dx*ease(p);b.foy=8*Math.sin(p*Math.PI);});
let total=0;
for(let h=0;h<mv.hits&&state.hp>0;h++){
if(b.evade){pop('MISS',G.hx,G.hy-G.hk*12,'#d8d8e0',20);sfx('swirl');b.evade=h===mv.hits-1?b.evade:true;await sleep(260);continue;}
let d=Math.max(2,Math.round(e.atk*(e.status.weaken>0?.7:1)*mv.m-Math.floor(lv/2)+rnd(3)));
if(b.ward>0)d=Math.ceil(d*.3);else if(b.guard)d=Math.ceil(d*.35);
// Rowan's duel is a skill check, not a surprise one-shot: cap each hit and his total turn damage.
if(e.name==='ROWAN'){const perHitCap=Math.max(4,Math.ceil((state.maxHp||state.hp)*(b.g.friendly ? 0.12 : 0.22)));const turnCap=Math.max(8,Math.ceil((state.maxHp||state.hp)*(b.g.friendly ? 0.20 : 0.35)));d=Math.min(d,perHitCap,Math.max(0,turnCap-total));if(d<=0)break;}
if(b.ward>0||b.guard){b.shield=1;}
total+=d;hitHero(d,mv.m>=1.6);await sleep(mv.hits>1?260:120);}
await tween(240,p=>{b.fox=dx*(1-ease(p));b.foy=0;});b.fox=0;
if(b.evade&&total===0)await pkSay('You dodged it completely!',850);else if(total)await pkSay('You take '+total+' damage.',700);
if(total&&e.boss){if(mv.k==='drain'){const hh=Math.round(total*.6);e.hp=Math.min(e.max,e.hp+hh);rise(G.fx,G.fy-G.fh*.4,16,['#b06aff','#ffffff'],G.fh*.5);pkPanel();await pkSay(e.name+' drains '+hh+' HP!',850);}
else if(mv.k==='dread'){const lost=Math.min(state.mp,6);state.mp-=lost;pkPanel();if(lost)await pkSay('Its pulse drains '+lost+' MP!',850);}
else if(mv.k==='steal'){const c=Math.min(state.coins,Math.max(10,Math.round(state.coins*.15)));state.coins-=c;pkPanel();if(c)await pkSay('It snatches '+c+' coins!',850);}}
if(!state.hp){b.hdead=0;sfx('lose');await tween(900,p=>{b.hdead=p;});await pkSay('You blacked out...',1000);pkEnd(true);return false;}
return true;}
async function pkWin(){const b=battle,g=b.g,B=b.B;if(g.friendly){b.phase='dying';b.busy=true;await pkSay(g.name+' yields!',900);pkEnd(false);return;}b.phase='dying';b.busy=true;sfx(B?'boom':'hit');const G=geo();
await tween(B?1300:650,p=>{b.dead=p;if(B){if(Math.random()<.45)burst(G.fx+(Math.random()-.5)*G.fh*.8,G.fy-Math.random()*G.fh,9,['#ffffff','#ffd84a','#ff6a2e',BOSSES[b.e.bi].theme[2]],230);if(p<.85)b.shake=Math.max(b.shake,8);}else if(p<.3)burst(G.fx,G.fy-G.fh*.5,3,['#ffffff','#ffd84a'],140);});
b.dead=1;b.flashW=B?1:0;sfx('win');await pkSay(g.name+' was defeated!',1000);
const reward=B?B.reward:g.reward,xp=B?B.xp:(g.xp||40);state.coins+=reward;state.xp+=xp;let up=0;
while(state.xp>=state.level*100){state.xp-=state.level*100;state.level++;state.maxHp+=6;state.maxMp+=2;state.hp=state.maxHp;up++;}
state.mp=Math.min(state.maxMp,state.mp+(B?state.maxMp:5));if(B){state.hp=Math.min(state.maxHp,state.hp+Math.round(state.maxHp*.5));addPotions(2);}
if(!g.wild)state.beaten[g.id]=true;if(B&&AREA&&AREA.chapter){mainQuestData(AREA.chapter).complete=true;save();}if(g.alpha){addPotions(1);}const i=npcs.findIndex(n=>n.trainer&&n.trainer.id===g.id);if(i>=0)npcs.splice(i,1);
const extra=[];
if(B){state.stage=Math.max(state.stage||0,g.bi+1);if(g.bi<BOSSES.length-1){const nx=chapters[g.bi+1];extra.push(['CHAPTER '+(g.bi+1)+' COMPLETE',chapters[g.bi].title+' \u2014 cleared!'],['NEXT CHAPTER',nx.title+' \u00B7 '+nx.place+'. '+nx.quest+'.']);}else {
 const redeemed=state.rowanChoice==='forgive'||state.rowanTrust>=2;
 const mercy=state.finalChoice==='mercy';
 state.ending=redeemed?(mercy?'together':'guardian'):(mercy?'unfinished':'steadfast');
 const endings={
 together:[['THE LAST HARVEST','You offer the Hollow King a place at the table. Rowan steps forward and offers his hand. The King’s shadow loosens, and the first warm sunrise in years reaches Hearthvale.'],['ROWAN','I cannot undo what I did. But I can help rebuild. If you will let me.'],['JOURNAL','The Everfeast becomes a festival of second chances. Rowan stays by your side, and the valley welcomes those who once stood outside its gates.']],
 guardian:[['THE LAST HARVEST','The Hollow King is sealed away, but Rowan chooses to stay and help repair the old roads. Your friendship survives, changed by honesty and hard-earned trust.'],['ROWAN','I will spend as long as it takes proving I can be trusted again.'],['JOURNAL','Hearthvale names you a Keeper of the First Light. The valley is safe, and Rowan helps lead its restoration.']],
 unfinished:[['THE LAST HARVEST','You spare the Hollow King, but Rowan cannot yet decide whether he is ready to stand beside you. The Everfeast returns, though some old wounds will take time to heal.'],['ROWAN','I hope one day we can talk like we used to. I will be here when you are ready.'],['JOURNAL','Hearthvale rebuilds with a cautious hope. Your choice leaves the door open for a future reunion.']],
 steadfast:[['THE LAST HARVEST','You seal the darkness away. Rowan accepts that trust cannot be demanded, and promises to help Hearthvale from a distance until he has earned his place back.'],['ROWAN','I understand. I will make things right, even if it takes years.'],['JOURNAL','The Everfeast shines brighter than ever. Hearthvale is safe, and its people remember that kindness and boundaries can stand together.']]
 };
 extra.push(...endings[state.ending]);
}spawnLair();}
pkEnd();if(up){sfx('levelup');offerSkillsWhenReady();}
const lines=(g.win||[]).map(t=>[g.name,t]);lines.push(...progressSideQuests(g));lines.push(['REWARD','You earned '+reward+' coins'+(B?' and 2 potions':'')+(up?' and reached level '+state.level+'!':'.')]);
setDialogue([...lines,...extra]);}

/* --- drawing --- */
function withFlash(amt,color,fn){if(amt<=.02){fn();return;}const W=innerWidth,H=innerHeight;if(!FXC)FXC=document.createElement('canvas');if(FXC.width!==W||FXC.height!==H){FXC.width=W;FXC.height=H;}
const oc=FXC.getContext('2d');oc.setTransform(1,0,0,1,0,0);oc.clearRect(0,0,W,H);oc.imageSmoothingEnabled=false;const saved=ctx;ctx=oc;try{fn();}finally{ctx=saved;}
oc.globalCompositeOperation='source-atop';oc.globalAlpha=clamp01(amt);oc.fillStyle=color;oc.fillRect(0,0,W,H);oc.globalCompositeOperation='source-over';oc.globalAlpha=1;ctx.drawImage(FXC,0,0);}
function drawBossSprite(bi,x,fy,k,frame,glow){if(!BOS.naturalWidth)return;ctx.imageSmoothingEnabled=false;const w=64*k;
ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(Math.round(x),Math.round(fy),w*.4,k*5,0,0,7);ctx.fill();
if(glow){const t=performance.now()/1000,g=ctx.createRadialGradient(x,fy-w*.45,w*.1,x,fy-w*.45,w*.75);g.addColorStop(0,BOSSES[bi].theme[2]+'55');g.addColorStop(1,BOSSES[bi].theme[2]+'00');ctx.globalAlpha=.55+.25*Math.sin(t*3);ctx.fillStyle=g;ctx.fillRect(x-w,fy-w*1.3,w*2,w*1.5);ctx.globalAlpha=1;}
ctx.drawImage(BOS,bi*64,frame*64,64,64,Math.round(x-w/2),Math.round(fy-w),w,w);}
function bubbleText(t,x,y,c,size){ctx.font=size+'px "Press Start 2P",monospace';ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=Math.max(4,size/3);ctx.strokeStyle='#26334a';ctx.strokeText(t,x,y);ctx.fillStyle=c;ctx.fillText(t,x,y);}
function drawBattleScene(W,H){const b=battle,e=b.e,G=geo(),now=performance.now(),t=now/1000,dt=Math.min(.05,(now-(b.last||now))/1000);b.last=now;
const PH=G.PH,boss=e.boss,th=boss?BOSSES[e.bi].theme:null;
ctx.imageSmoothingEnabled=false;ctx.save();
if(b.shake>0){ctx.translate((Math.random()-.5)*b.shake,(Math.random()-.5)*b.shake);b.shake=Math.max(0,b.shake-dt*45);}
const sky=ctx.createLinearGradient(0,0,0,PH*.5);if(boss){sky.addColorStop(0,th[0]);sky.addColorStop(1,th[1]);}else{sky.addColorStop(0,'#78b8f8');sky.addColorStop(1,'#d8f0f8');}
ctx.fillStyle=sky;ctx.fillRect(-30,-30,W+60,H+60);
if(!boss){for(let i=0;i<4;i++){const cx=((t*(8+i*3)+i*W*.3)%(W+240))-120,cy=PH*(.08+i*.07),s=3+i%2;ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(cx,cy,s*14,s*4);ctx.fillRect(cx+s*3,cy-s*3,s*8,s*3);ctx.fillRect(cx-s*2,cy+s*2,s*4,s*3);}}
else{for(let i=0;i<30;i++){const x=(rand(i,3)*W+Math.sin(t*.6+i)*12),y=((rand(i,7)*PH*.5-t*(10+rand(i,1)*22))%(PH*.5)+PH*.5)%(PH*.5);ctx.fillStyle=th[2]+'66';ctx.fillRect(Math.round(x),Math.round(y),3,3);}}
const ts=Math.max(3,Math.round(H/200)),tu=16*ts,gy=Math.floor(PH*.36/tu)*tu;
for(let y=gy,r=0;y<H;y+=tu,r++)for(let x=0,c=0;x<W;x+=tu,c++)kTile('t',[0,1,0,2][Math.floor(rand(c+9,r+4)*4)%4],x,y,ts);
if(boss){ctx.fillStyle='rgba(12,0,24,.55)';ctx.fillRect(-30,gy,W+60,H-gy+30);}
/* platforms / rune circle */
const plat=(x,y,rx,ry,rune)=>{ctx.fillStyle=rune?'rgba(10,0,20,.55)':'#8a6a3a';ctx.beginPath();ctx.ellipse(x,y+6,rx,ry,0,0,7);ctx.fill();ctx.fillStyle=rune?'rgba(40,10,50,.7)':'#d8b878';ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,7);ctx.fill();if(rune){ctx.strokeStyle=th[2];ctx.globalAlpha=.5+.3*Math.sin(t*4);ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y,rx*.82,ry*.8,0,0,7);ctx.stroke();ctx.beginPath();ctx.ellipse(x,y,rx*.5,ry*.5,t,0,7);ctx.stroke();ctx.globalAlpha=1;}};
plat(G.fx,G.fy+4,boss?G.fh*.55:G.fk*10,boss?G.fh*.12:G.fk*2.8,boss);plat(G.hx,G.hy+4,G.hk*11,G.hk*3);
/* entrance progress */
const enterP=b.phase==='enter'?clamp01((now-b.t0)/(boss?1500:700)):(b.phase==='alert'||b.phase==='swirl'?0:1),ep=ease(enterP);
/* foe */
b.flashF=Math.max(0,b.flashF-dt*4);b.flashH=Math.max(0,b.flashH-dt*4);b.kf=(b.kf||0)*Math.pow(.002,dt);b.kh=(b.kh||0)*Math.pow(.002,dt);
const bob=Math.sin(t*3)*3,fxp=G.fx+b.fox+(b.kf||0)+(boss?0:(1-ep)*W*.55),fyp=G.fy+b.foy+(boss?(1-ep)*G.fh*.4:0);
const alpha=1-b.dead;
if(boss&&(b.phase==='enter'||b.phase==='fight')){const a=th[2],pulse=(e.charging?.5:e.enraged?.38:.22)+.1*Math.sin(t*(e.charging?10:3));const gr=ctx.createRadialGradient(fxp,fyp-G.fh*.5,G.fh*.1,fxp,fyp-G.fh*.5,G.fh*.9);gr.addColorStop(0,a+'88');gr.addColorStop(1,a+'00');ctx.globalAlpha=Math.min(1,pulse*alpha*(.5+ep*.5));ctx.fillStyle=gr;ctx.fillRect(fxp-G.fh,fyp-G.fh*1.5,G.fh*2,G.fh*2);ctx.globalAlpha=1;}
if(b.phase!=='alert'&&b.phase!=='swirl'||b.phase==='enter'){
withFlash(b.flashF+(e.charging?.18+.18*Math.sin(t*14):0),e.charging?'#ff5040':'#ffffff',()=>{ctx.globalAlpha=alpha;
if(boss){ctx.save();ctx.beginPath();const rv=ease(clamp01(enterP*1.1));ctx.rect(0,fyp-G.fh*rv-10,W,G.fh*rv+30);ctx.clip();drawBossSprite(e.bi,fxp,fyp+bob*.6,G.fk,Math.floor(t*2)%2,false);ctx.restore();}
else if(e.mi!==undefined)drawMon(e.mi,fxp,fyp+bob,G.fk);else drawSpriteK(e.row,0,0,fxp,fyp+bob,G.fk);
ctx.globalAlpha=1;});}
if(boss&&b.phase==='enter'&&enterP<.9&&Math.random()<.5)rise(G.fx,G.fy,2,['#c9a070','#8a6a3a'],G.fh*.7);
if(e.charging&&b.phase==='fight'){const by=fyp-G.fh-10-Math.abs(Math.sin(t*8))*8;bubbleText('!',fxp,by,'#ff3b30',Math.max(28,G.fk*8));}
/* hero */
const hxp=G.hx+b.hox+(b.kh||0)+(1-ep)*-W*.5,hyp=G.hy+b.hoy,hbob=Math.sin(t*3+1)*2;
withFlash(b.flashH,'#ff4040',()=>{ctx.globalAlpha=1-b.hdead*.8;drawSpriteK(heroRow(),1,0,hxp,hyp+hbob+b.hdead*G.hk*3,G.hk);drawGear(hxp,hyp+hbob+b.hdead*G.hk*3,G.hk,1,state.heroClass);ctx.globalAlpha=1;});
/* guard / ward bubble */
if(b.shield>0||b.ward>0){const a=b.shield>0?b.shield:.45+.15*Math.sin(t*5);ctx.strokeStyle='rgba(130,220,255,'+a+')';ctx.fillStyle='rgba(130,220,255,'+a*.18+')';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(hxp,hyp-G.hk*8,G.hk*10,G.hk*11,0,0,7);ctx.fill();ctx.stroke();b.shield=Math.max(0,b.shield-dt*1.6);}
if(b.evade){ctx.fillStyle='rgba(220,220,235,.25)';ctx.beginPath();ctx.ellipse(hxp,hyp-G.hk*8,G.hk*11,G.hk*12,0,0,7);ctx.fill();}
/* slash flash on hit */
if(b.slash){const s=b.slash;s.t+=dt;const p=s.t/.28;if(p>=1)b.slash=null;else{ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=1-p;const r=G.fh*.45;
if(s.k==='melee'){ctx.strokeStyle='#ffffff';ctx.lineWidth=7;ctx.lineCap='round';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-r*.6+i*r*.18,-r*.6*p*2);ctx.lineTo(r*.6+i*r*.18,r*.6*p*2);ctx.stroke();}}
else if(s.k==='arrow'){ctx.strokeStyle='#ffe9a0';ctx.lineWidth=5;for(let i=0;i<6;i++){const a=i*1.047;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.2,Math.sin(a)*r*.2);ctx.lineTo(Math.cos(a)*r*(.3+p*.5),Math.sin(a)*r*(.3+p*.5));ctx.stroke();}}
else{ctx.strokeStyle='#e8d0ff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,r*(.2+p*.8),0,7);ctx.stroke();}
ctx.restore();}}
/* projectile */
if(b.proj){const p=b.proj;if(p.k==='arrow'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.12+p.p*.25);ctx.fillStyle='#e8d890';ctx.fillRect(-26,-2,40,4);ctx.fillStyle='#c9d2de';ctx.beginPath();ctx.moveTo(14,-7);ctx.lineTo(28,0);ctx.lineTo(14,7);ctx.fill();ctx.fillStyle='#c25a3a';ctx.fillRect(-26,-5,8,10);ctx.restore();}
else{const g=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,G.hk*5);g.addColorStop(0,'#ffffff');g.addColorStop(.35,p.c);g.addColorStop(1,p.c+'00');ctx.fillStyle=g;ctx.fillRect(p.x-G.hk*5,p.y-G.hk*5,G.hk*10,G.hk*10);}}
/* particles */
for(let i=b.parts.length-1;i>=0;i--){const q=b.parts[i];q.life-=dt;if(q.life<=0){b.parts.splice(i,1);continue;}q.vy+=q.g*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;ctx.globalAlpha=clamp01(q.life/q.max*1.4);ctx.fillStyle=q.c;ctx.fillRect(Math.round(q.x),Math.round(q.y),q.s,q.s);}
ctx.globalAlpha=1;
/* damage / heal numbers */
for(let i=b.pops.length-1;i>=0;i--){const q=b.pops[i];q.age+=dt;if(q.age>1.1){b.pops.splice(i,1);continue;}const up=Math.min(1,q.age*3.5),sc=q.age<.12?1+q.age*5:1;ctx.globalAlpha=q.age>.8?1-(q.age-.8)/.3:1;bubbleText(q.t,q.x,q.y-up*34-q.age*22,q.c,Math.round(q.s*sc));}
ctx.globalAlpha=1;
/* red vignette when low HP / boss enraged */
if(state.hp<state.maxHp*.25||e.enraged){const v=ctx.createRadialGradient(W/2,PH/2,PH*.35,W/2,PH/2,Math.max(W,PH)*.75);v.addColorStop(0,'rgba(200,0,20,0)');v.addColorStop(1,'rgba(200,0,20,'+(.25+.1*Math.sin(t*6))+')');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);}
ctx.restore();}

/* --- full-screen battle effects: alert "!", warning banner, stripe wipe, boss title card --- */
function drawBang(x,y,k){const s=Math.round(4*k),w=7*s,h=9*s;ctx.fillStyle='#3f2631';ctx.fillRect(x-w/2-s,y-h-s,w+2*s,h+2*s);ctx.fillStyle='#fff4d8';ctx.fillRect(x-w/2,y-h,w,h);ctx.fillStyle='#d03030';ctx.fillRect(x-s,y-h+Math.round(1.5*s),2*s,4*s);ctx.fillRect(x-s,y-h+Math.round(6.5*s),2*s,2*s);ctx.fillStyle='#3f2631';ctx.fillRect(x-s,y+s,2*s,s);ctx.fillRect(x-s/2,y+2*s,s,s);}
function stripes(W,H,p){const n=Math.ceil(H/40),bh=Math.ceil(H/n);ctx.fillStyle='#000';for(let i=0;i<n;i++){const d=clamp01(p*1.6-(i/n)*.6),w=W*d;if(w<=0)continue;if(i%2)ctx.fillRect(0,i*bh,w,bh+1);else ctx.fillRect(W-w,i*bh,w,bh+1);}}
function drawBattleFx(W,H){const b=battle;if(!b)return;const now=performance.now(),el=(now-b.t0)/1000;ctx.save();ctx.imageSmoothingEnabled=false;
if(b.phase==='alert'){const boss=!!b.B;
if(boss){ctx.fillStyle='rgba(200,20,30,'+(.15+Math.abs(Math.sin(el*5))*.35)+')';ctx.fillRect(0,0,W,H);}
const f=boss?0:(el<.5&&Math.floor(el*10)%2?.5:0);if(f>0){ctx.fillStyle='rgba(255,255,255,'+f+')';ctx.fillRect(0,0,W,H);}
let px0=W/2,py0=H/2;if(scene==='inside'){px0=insidePlayer.x;py0=insidePlayer.y-40;}else{px0=state.x-lastCam.camX;py0=state.y-lastCam.camY-24;}
const hop=Math.abs(Math.sin(Math.min(el,.7)*9))*(el<.7?14:0);drawBang(Math.round(px0),Math.round(py0-8-hop),boss?1.5:1);
if(boss){const bh=H*.13,y=H*.4;ctx.fillStyle='rgba(20,0,4,.88)';ctx.fillRect(0,y,W,bh);ctx.save();ctx.beginPath();ctx.rect(0,y,W,10);ctx.rect(0,y+bh-10,W,10);ctx.clip();ctx.fillStyle='#ffd84a';ctx.fillRect(0,y-1,W,bh+2);ctx.fillStyle='#26334a';for(let x=-60+((el*140)%60);x<W;x+=60){ctx.beginPath();ctx.moveTo(x,y-1);ctx.lineTo(x+30,y-1);ctx.lineTo(x+6,y+bh+1);ctx.lineTo(x-24,y+bh+1);ctx.fill();}ctx.restore();
if(Math.floor(el*4)%2===0)bubbleText('WARNING!  BOSS APPROACHING',W/2,y+bh*.62,'#ff4a3a',Math.max(14,Math.min(26,W/34)));}}
else if(b.phase==='swirl'){stripes(W,H,clamp01(el/.62));}
else if(b.phase==='enter'){stripes(W,H,1-clamp01(el/.45));
if(b.B&&el>.5&&el<2.5){const a=Math.min(1,(el-.5)*3,(2.5-el)*3),y=H*.2,h=H*.2;ctx.globalAlpha=a;const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.25,'rgba(0,0,0,.78)');g.addColorStop(.75,'rgba(0,0,0,.78)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,y,W,h);
const nm=b.g.name,shown=Math.min(nm.length,Math.floor((el-.5)*22));bubbleText(nm.slice(0,shown),W/2,y+h*.5,BOSSES[b.e.bi].theme[2],Math.max(16,Math.min(34,W/(nm.length*1.1))));
bubbleText('CHAPTER '+(b.e.bi+1)+' \u2014 '+chapters[b.e.bi].title.toUpperCase(),W/2,y+h*.78,'#fff4d8',Math.max(9,Math.min(14,W/60)));ctx.globalAlpha=1;}}
if(b.flashR>0){ctx.fillStyle='rgba(255,40,40,'+b.flashR*.45+')';ctx.fillRect(0,0,W,H);b.flashR=Math.max(0,b.flashR-.035);}
if(b.flashW>0){ctx.fillStyle='rgba(255,255,255,'+b.flashW+')';ctx.fillRect(0,0,W,H);b.flashW=Math.max(0,b.flashW-.03);}
ctx.restore();}

const NPC_ROW={'ELDER MAPLE':19,'ROWAN':1,'MILLIE':8,'GUS':12,'PIPER':4,'MARA THE NEIGHBOR':28,'JUNIPER':14,'INNKEEPER BRAM':13,'NELL THE TRAVELER':38,'SHOPKEEPER TILLY':24,'FINN':21,'OLD CRAFTSMAN ORIN':29,'WREN THE APPRENTICE':31,'GATEKEEPER BRAWN':6,'GATEKEEPER WINONA':23};
/* characters.png: one row per character, 12 frames: down, up, left, right x (idle, step, step) */
function drawSpriteK(row,face,step,x,fy,k){if(!CHARS.complete||!CHARS.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(Math.round(x-6*k),Math.round(fy-k),12*k,2*k);ctx.imageSmoothingEnabled=false;const full=CHARS.naturalWidth>=192,col=full?face*3+(step||0):(face===1?1:0),m=(!full&&face===2)?-1:1;ctx.save();ctx.translate(Math.round(x),0);ctx.scale(m,1);ctx.drawImage(CHARS,col*16,row*16,16,16,-8*k,Math.round(fy-16*k),16*k,16*k);ctx.restore();}
function drawSprite(row,face,step,x,y){drawSpriteK(row,face,step,x,y+8,2);}
function drawPerson(x,y,shirt,hat,name=''){if(name==='TELEPORTER STATION'){drawTeleporter(x,y+8);return;}if(name.startsWith('ROAD')){drawPortal(x,y+8,name.includes('GOLDLEAF')?'rgba(255,200,80,.85)':null);return;}if(BOSS_NPC[name]!==undefined){drawBossSprite(BOSS_NPC[name],x,y+8,2,Math.floor(performance.now()/500)%2,true);return;}const row=NPC_ROW[name]??[11,15,22,27,32][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];const t=scene==='inside'?insidePlayer:state,dx=t.x-x,dy=t.y-y;let face=0;if(Math.hypot(dx,dy)<120)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);drawSprite(row,face,0,x,y);}
const roomFurniture=[
[[.11,.38,.12,.12],[.42,.23,.16,.18],[.77,.4,.14,.23]],
[[.10,.29,.16,.07],[.31,.29,.16,.07],[.52,.29,.16,.07],[.73,.29,.16,.07],[.08,.48,.25,.09],[.68,.48,.24,.09]],
[[.13,.37,.08,.15],[.29,.37,.08,.15],[.63,.37,.08,.15],[.79,.37,.08,.15],[.38,.59,.24,.08]],
[[.22,.51,.56,.11],[.43,.39,.14,.09],[.10,.26,.12,.07],[.24,.26,.12,.07],[.38,.26,.12,.07],[.52,.26,.12,.07],[.66,.26,.12,.07],[.80,.26,.12,.07]]
];
const roomNPCSpots=[
[{x:.31,y:.68},{x:.69,y:.68}],
[{x:.31,y:.70},{x:.69,y:.70}],
[{x:.39,y:.69},{x:.62,y:.69}],
[{x:.32,y:.70},{x:.68,y:.70}]
];
function roomBlocked(x,y){
const nx=x/innerWidth,ny=y/innerHeight;
if(nx<.09||nx>.91||ny<.28||ny>.89)return true;
return roomFurniture[interiorId].some(([rx,ry,rw,rh])=>nx>rx-.012&&nx<rx+rw+.012&&ny>ry-.02&&ny<ry+rh+.025);
}
function roomShell(W,H,pal,fx,fy,fw,fh,style,ss,wallRows){const s=ss||Math.max(2,Math.round(H/300)),u=16*s,x=W*fx,y=H*fy,w=W*fw,h=H*fh,st=style||0,wr=wallRows||2;
if(!INT.naturalWidth){px(x,y,w,h,'#c98b56');return;}
ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.imageSmoothingEnabled=false;
const T=(col,xx,yy)=>ctx.drawImage(INT,col*16,st*16,16,16,Math.round(xx),Math.round(yy),u,u);
for(let r=0;r<wr;r++)for(let xx=x,c=0;xx<x+w;xx+=u,c++)T(r===wr-1?5:3+((c+r)%2),xx,y+r*u);
for(let r=0,yy=y+wr*u;yy<y+h;r++,yy+=u)for(let xx=x,c=0;xx<x+w;xx+=u,c++)T(Math.floor(rand(c+st*5,r+2)*3)%3,xx,yy);
const g=ctx.createLinearGradient(0,y+wr*u,0,y+wr*u+u*.9);g.addColorStop(0,'rgba(40,20,30,.35)');g.addColorStop(1,'rgba(40,20,30,0)');ctx.fillStyle=g;ctx.fillRect(x,y+wr*u,w,u*.9);
ctx.restore();}
/* ===== themed interiors: tile-grid rooms (each building has its own size, theme and layout) =====
   item = [sheet,a,b,w,h,col,row,solid]  sheet 'i' = Kenney Roguelike Indoors (a,b = sheet col,row), 't'/'d'/'f' = Kenney town/dungeon/farm tile index a, 'w' = window */
const RM=[
{t:'MAPLE COTTAGE',st:4,c:11,r:8,d:5,it:[
 ['w',0,0,2,1,6,0,0],['i',19,13,1,1,9,0,0],['i',20,6,1,1,3,1,0],
 ['i',0,12,1,2,0,0,1],['i',1,12,1,2,1,0,1],['i',8,12,1,2,2,0,1],['i',14,14,1,2,4,0,1],
 ['i',20,17,1,1,0,2,1],['i',19,17,1,1,0,3,1],
 ['p','rug',1,3,2,4,5,0],['i',0,0,3,1,2,3,1],['i',1,2,1,1,3,2,1],['i',0,2,1,1,3,4,1],
 ['p','bed',0,2,2,9,2,1],['i',16,0,1,1,10,6,1]],npc:[[7,4],[3,6]]},
{t:'HEARTHVALE INN',st:1,c:16,r:9,d:8,it:[
 ['w',0,0,2,1,1,0,0],['w',0,0,2,1,12,0,0],['i',5,12,1,2,3,0,1],['i',6,12,1,2,11,0,1],['i',19,0,1,2,10,0,1],['i',14,14,1,2,13,0,1],['i',21,8,1,3,15,0,1],
 ['i',0,12,1,2,5,2,1],['i',1,12,1,2,6,2,1],['i',2,12,1,2,7,2,1],['i',0,12,1,2,8,2,1],['i',1,12,1,2,9,2,1],
 ['i',23,8,2,2,1,3,1],['p','rug',2,4,2,6,6,0],['i',4,7,4,1,6,5,1],
 ['i',0,0,3,1,2,6,1],['i',1,2,1,1,3,5,1],['i',0,2,1,1,3,7,1],['i',0,0,3,1,11,6,1],['i',1,2,1,1,12,5,1],['i',0,2,1,1,12,7,1],
 ['i',16,0,1,1,0,7,1],['i',17,0,1,1,15,7,1]],npc:[[7,1],[13,4]]},
{t:'TILLY’S GENERAL STORE',st:0,c:14,r:9,d:7,it:[
 ['w',0,0,2,1,1,0,0],['i',5,12,1,2,3,0,1],['i',6,12,1,2,4,0,1],['i',20,17,1,1,6,1,1],['i',19,17,1,1,7,1,1],['i',20,17,1,1,9,1,1],['i',21,17,1,1,10,1,1],
 ['i',0,12,1,2,1,3,1],['i',1,12,1,2,2,3,1],['i',2,12,1,2,3,3,1],
 ['i',5,12,1,2,6,4,1],['i',6,12,1,2,7,4,1],['i',5,12,1,2,9,4,1],['i',6,12,1,2,10,4,1],
 ['f',85,0,1,1,12,2,1],['f',85,0,1,1,13,2,1],['f',96,0,1,1,12,3,1],['f',74,0,1,1,1,6,1],['p','rug',0,3,2,5,6,0],['i',16,0,1,1,0,7,1]],npc:[[2,2],[10,7]]},
{t:'ORIN’S WORKSHOP',st:3,c:9,r:7,d:4,it:[
 ['w',0,0,2,1,6,0,0],['i',14,14,1,2,1,0,1],['i',14,14,1,2,2,0,1],['i',20,6,1,1,4,1,0],['t',115,0,1,1,3,1,0],['t',116,0,1,1,5,1,0],
 ['d',74,0,1,1,3,3,1],['i',0,0,3,1,5,3,1],['d',89,0,1,1,0,5,1],['t',107,0,1,1,8,4,1],['t',107,0,1,1,8,5,1]],npc:[[2,3],[6,5]]}
];
/* procedural furniture: beds and rugs in the Kenney palette, any size in tiles */
function procItem(i,x,y,s){const P=(a,b,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x+a*s),Math.round(y+b*s),Math.round(w*s),Math.round(h*s));},W=i[3]*16,H=i[4]*16,O='#3f2631';
if(i[1]==='bed'){const bc=['#c8503c','#4f8f98','#8a5ab8'][i[2]%3];P(0,0,W,H,O);P(1,1,W-2,H-2,'#8a5a3a');P(1,1,W-2,5,'#6a4028');P(3,6,W-6,H-9,'#f2e8d0');P(5,8,(W-12)/2,6,'#fffaf0');P(W/2+1,8,(W-12)/2,6,'#fffaf0');P(3,17,W-6,H-20,bc);P(3,17,W-6,2,'rgba(255,255,255,.3)');P(3,24,W-6,2,'rgba(0,0,0,.2)');P(0,H-3,3,3,O);P(W-3,H-3,3,3,O);}
else{const q=[['#a8483c','#c8685a'],['#3a7a4e','#4fa86a'],['#4a5a9a','#6a7ac0']][i[2]%3];P(0,0,W,H,O);P(1,1,W-2,H-2,q[0]);P(3,3,W-6,H-6,q[1]);P(5,5,W-10,H-10,q[0]);P(7,7,W-14,H-14,'#f2e8d0');P(8,8,W-16,H-16,q[1]);for(let a=2;a<W-2;a+=3){P(a,0,1,2,'#f2e8d0');P(a,H-2,1,2,'#f2e8d0');}}}
function roomGeom(id){const R=RM[id],W=innerWidth,H=innerHeight,Z=Math.max(1,Math.min(3,Math.floor(Math.min(W*.94/(R.c*32),(H-150)/(R.r*32))))),U=32*Z,ox=Math.round((W-R.c*U)/2),oy=Math.round(120+(H-120-R.r*U)/2);return{R,Z,U,ox,oy,exitY:oy+(R.r-1)*U};}
const rcx=(g,c)=>g.ox+(c+.5)*g.U,rcy=(g,r)=>g.oy+(r+.9)*g.U;
function roomStart(id){const g=roomGeom(id);return{x:rcx(g,g.R.d),y:rcy(g,g.R.r-2)};}
function roomHit(x,y){const g=roomGeom(interiorId),R=g.R,c=Math.floor((x-g.ox)/g.U),r=Math.floor((y-g.oy)/g.U);if(c<0||c>=R.c||r<0||r>=R.r)return true;if(r===R.r-1)return c!==R.d;if(r<2)return true;if(R.it.some(i=>i[7]&&c>=i[5]&&c<i[5]+i[3]&&r>=i[6]&&r<i[6]+i[4]))return true;return R.npc.some(n=>n[0]===c&&n[1]===r);}
function personK(x,fy,name,k){const row=NPC_ROW[name]??[11,15,22,27,32][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];let face=0;if(scene==='inside'){const dx=insidePlayer.x-x,dy=insidePlayer.y-fy;if(Math.hypot(dx,dy)<k*40)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);}drawSpriteK(row,face,0,x,fy,k);}
function drawRoom(id,W,H,withNpc){const g=roomGeom(id),R=g.R,U=g.U,s=2*g.Z;px(0,0,W,H,'#1d1220');
roomShell(W,H,{wall:'#d5b88a',trim:'#49352d'},g.ox/W,g.oy/H,R.c*U/W,R.r*U/H,R.st,s,2);
px(g.ox,g.oy+(R.r-1)*U,R.c*U,U,'#2b1a24');if(INT.naturalWidth){ctx.imageSmoothingEnabled=false;ctx.drawImage(INT,0,R.st*16,16,16,g.ox+R.d*U,g.oy+(R.r-1)*U,U,U);ctx.drawImage(INT,96,R.st*16,16,16,g.ox+R.d*U,g.oy+(R.r-1)*U,U,U);}
ctx.strokeStyle='#3a2418';ctx.lineWidth=4;ctx.strokeRect(g.ox-2,g.oy-2,R.c*U+4,R.r*U+4);
const dr=i=>{const x=g.ox+i[5]*U,y=g.oy+i[6]*U;if(i[0]==='i')kBlock(i[1],i[2],i[3],i[4],x,y,s);else if(i[0]==='w')winFrame(x+U*.12,y+U*.2,i[3]*U*.76,U*.9);else if(i[0]==='p')procItem(i,x,y,s);else kTile(i[0],i[1],x,y,s);};
R.it.filter(i=>i[0]==='w'||(!i[7]&&i[6]<2)).forEach(dr);R.it.filter(i=>!i[7]&&i[0]!=='w'&&i[6]>=2).forEach(dr);
const list=R.it.filter(i=>i[7]).map(i=>({y:g.oy+(i[6]+i[4])*U,f:()=>dr(i)}));
if(withNpc!==false)R.npc.forEach((n,k)=>{const nm=roomNPCs[id][k].name;list.push({y:rcy(g,n[1]),f:()=>personK(rcx(g,n[0]),rcy(g,n[1]),nm,s)});});
return{g,list};}
function drawInterior(W,H){ctx.clearRect(0,0,W,H);const{g,list}=drawRoom(interiorId,W,H),R=g.R,U=g.U,k=2*g.Z;
R.npc.forEach((n,i)=>{roomNPCSpots[interiorId][i]={x:rcx(g,n[0])/W,y:rcy(g,n[1])/H};});
list.push({y:insidePlayer.y,f:()=>{drawSpriteK(heroRow(),facing,walking?1+alt:0,insidePlayer.x,insidePlayer.y,k);drawGear(insidePlayer.x,insidePlayer.y,k,facing,state.heroClass);}});
list.sort((a,b)=>a.y-b.y).forEach(o=>o.f());
const vg=ctx.createRadialGradient(W/2,H*.55,H*.25,W/2,H*.55,Math.max(W,H)*.7);vg.addColorStop(0,'rgba(255,220,150,0)');vg.addColorStop(1,'rgba(30,12,10,.4)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
if(window.LH_GRID||/[?&]grid\b/.test(location.search)){ctx.font='10px monospace';ctx.textAlign='left';R.it.filter(i=>i[7]).forEach(i=>{ctx.fillStyle='rgba(255,0,0,.25)';ctx.fillRect(g.ox+i[5]*U,g.oy+i[6]*U,i[3]*U,i[4]*U);});R.npc.forEach(n=>{ctx.fillStyle='rgba(0,120,255,.35)';ctx.fillRect(g.ox+n[0]*U,g.oy+n[1]*U,U,U);});ctx.strokeStyle='rgba(255,255,255,.35)';ctx.fillStyle='#ffe066';for(let c=0;c<R.c;c++)for(let r=0;r<R.r;r++){const x=g.ox+c*U,y=g.oy+r*U;ctx.strokeRect(x,y,U,U);ctx.fillText(c+','+r,x+3,y+11);}}
ctx.fillStyle=C.cream;ctx.font='bold 15px ui-monospace';ctx.textAlign='center';ctx.fillText(R.t,W/2,g.oy-16);
let tg=-1,dist=Infinity;R.npc.forEach((n,i)=>{const d=Math.hypot(insidePlayer.x-rcx(g,n[0]),insidePlayer.y-rcy(g,n[1]));if(d<U*3.3&&d<dist){tg=i;dist=d;}});
if(tg>=0)drawWorldPrompt(rcx(g,R.npc[tg][0]),rcy(g,R.npc[tg][1])-U*1.05,'TAP / E · TALK');else if(insidePlayer.y>g.exitY)drawWorldPrompt(rcx(g,R.d),g.oy+(R.r-1)*U-6,'E · EXIT');}
function drawWorldPrompt(x,y,label){const w=Math.max(66,label.length*7+22),h=22;ctx.fillStyle='#26334a';ctx.fillRect(Math.round(x-w/2-2),Math.round(y-h-2),w+4,h+4);ctx.fillStyle='#f3e6bf';ctx.fillRect(Math.round(x-w/2),Math.round(y-h),w,h);ctx.fillStyle='#26334a';ctx.font='bold 10px ui-monospace';ctx.textAlign='center';ctx.fillText(label,x,y-7);}
function drawPlayer(x,y){drawSprite(heroRow(),facing,walking?1+alt:0,x,y);drawGear(x,y+8,2,facing,state.heroClass);}
function askStoryChoice(speaker,prompt,options,onPick){
 setDialogue([[speaker,prompt]]);
 const box=$('lh-dialogue'),next=$('lh-next'),row=document.createElement('div');
 row.className='lh-story-choices';row.setAttribute('role','group');row.setAttribute('aria-label','Story choice');
 next.hidden=true;
 options.forEach((option,index)=>{const button=document.createElement('button');button.type='button';button.className='lh-gold-button';button.textContent=option.label;button.addEventListener('click',()=>{row.remove();next.hidden=false;onPick(option.value);closeDialogue();});row.appendChild(button);});
 box.appendChild(row);
}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];const speaker=line[0]==='NARRATOR'?'ROWAN':line[0];$('lh-speaker').textContent=speaker;typeText(line[1]);drawDialoguePortrait(speaker);$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
function portraitRow(name){if(name==='YOU')return(cinematic&&cinematic.phase!=='outside')?CIV:heroRow();if(NPC_ROW[name]!==undefined)return NPC_ROW[name];return[11,15,22,27,32][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];}
function drawDialoguePortrait(name){
const c=$('lh-portrait'),p=c.getContext('2d');p.clearRect(0,0,64,64);p.fillStyle='#26334a';p.fillRect(0,0,64,64);
if(name==='JOURNAL'&&VIL.naturalWidth){p.imageSmoothingEnabled=false;p.drawImage(VIL,150,180,16,16,8,8,48,48);return;}if(BOSS_NPC[name]!==undefined&&BOS.naturalWidth){p.imageSmoothingEnabled=false;p.drawImage(BOS,BOSS_NPC[name]*64,0,64,64,0,0,64,64);return;}if(CHARS.naturalWidth){const pr=portraitRow(name);p.imageSmoothingEnabled=false;p.fillStyle='#2f4a5a';p.fillRect(0,0,64,64);p.fillStyle='rgba(0,0,0,.25)';p.fillRect(10,54,44,6);p.drawImage(CHARS,0,pr*16,16,16,0,-2,64,64);return;}
let shirt='#b94b38',hair='#634b3a';
const all=[...npcs,...roomNPCs.flat()];
const npc=all.find(n=>n.name===name);
if(npc)shirt=npc.color;
if(name==='ROWAN')shirt='#bb6542';
if(name==='ELDER MAPLE')shirt='#b8c7a1';
if(name==='MARA')shirt='#b86c78';
if(name==='THOMAS')shirt='#577f9b';
p.fillStyle='#172a3a';p.fillRect(17,45,30,8);p.fillStyle=shirt;p.fillRect(15,26,34,23);p.fillStyle='#f1b58c';p.fillRect(21,11,22,20);p.fillStyle=hair;p.fillRect(19,8,26,9);p.fillRect(17,13,5,8);p.fillRect(42,13,5,8);p.fillStyle='#26334a';p.fillRect(25,21,4,4);p.fillRect(36,21,4,4);p.fillStyle='#f3e6bf';p.fillRect(23,29,18,3);
}
function positionSpeechBubble(){const box=$('lh-dialogue');if(!box)return;box.classList.add('lh-dialogue-top');$('lh-game').classList.add('lh-dialogue-open');}
function closeDialogue(){const choices=$('lh-dialogue').querySelector('.lh-story-choices');if(choices)choices.remove();$('lh-next').hidden=false;$('lh-dialogue').hidden=true;$('lh-dialogue').classList.remove('lh-dialogue-top');$('lh-game').classList.remove('lh-dialogue-open');dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function typeText(t){clearInterval(typer);fullText=t;typing=true;const el=$('lh-dialogue-text');let i=0;el.textContent='';typer=setInterval(()=>{el.textContent=t.slice(0,++i);if(i%2===0&&t[i-1]!==' ')talkBlip();if(i>=t.length)finishType();},24);}
function finishType(){clearInterval(typer);typing=false;$('lh-dialogue-text').textContent=fullText;}
function advanceDialogue(){if(!dialogue)return;if(typing){finishType();return;}dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function enterBuilding(id){if(transitioning||scene!=='outside')return;transitioning=true;const doors=[{x:10.5*TILE,y:10.55*TILE},{x:34*TILE,y:10.55*TILE},{x:22*TILE,y:22.55*TILE},{x:5.5*TILE,y:29.55*TILE}],door=doors[id],from={x:state.x,y:state.y},start=performance.now(),duration=620;function walk(now){const p=Math.min(1,(now-start)/duration),ease=p*p*(3-2*p);state.x=from.x+(door.x-from.x)*ease;state.y=from.y+(door.y-from.y)*ease;playerFrame+=.45;if(p<1)requestAnimationFrame(walk);else{interiorId=id;scene='inside';insideTalked=false;insidePlayer=roomStart(id);facing=1;updateHud();save();setTimeout(()=>{transitioning=false;},180);}}requestAnimationFrame(walk);}
let transitioning=false,insidePlayer={x:innerWidth/2,y:innerHeight*.76};
function turnInClues(){setQ(4);state.coins=(state.coins||0)+50;addPotions(2);sfx('unlock');updateHud();updateQuest();
setDialogue([['YOU','Elder Maple... I searched the village. Orin kept an old map safe for my parents.'],
['ELDER MAPLE','*She unfolds the map slowly, her hands trembling.* This seal in the corner... it is the same one carved beneath the fountain.'],
['YOU','There was a strange black feather at the store, and a torn royal banner near the fountain. Something is very wrong.'],
['ELDER MAPLE','Then it is true. The Hollow King stirs, and the Everfeast is failing. Your parents went to find the First Keepers\u2019 road.'],
['ELDER MAPLE','Take 50 coins and two potions. The north road leads to the Wildlands, where monsters roam. Train there before you face the guardians of the old roads.'],
['QUEST UPDATED','Follow the golden leaves. Train in the Wildlands (north road) once Gatekeeper Brawn lets you pass.']]);}
function elderChat(){const n=state.elderTalks=(state.elderTalks||0)+1,nm='ELDER MAPLE',b=state.beaten||{};
const hint=questStep<2?'Rowan is waiting for you in the village square. Speak with him, then search the homes.':questStep<3?'Have you searched every building? Old Orin in the workshop keeps many secrets.':!b.north?'Gatekeeper Brawn guards the north road. Beat him and the Wildlands will open to you.':!b.south?'The Pumpkin Sentinel blocks the south road. Train in the Wildlands first, then face it.':(state.stage>=BOSSES.length?'You saved Hearthvale. I could not be prouder.':'Your next trial: '+chapters[Math.min(state.stage,9)].place+'. '+BOSSES[Math.min(state.stage,9)].name+' waits there.');
const flavor=['Autumn always smelled of cinnamon here. Lately it smells of ash.','Keep your potions close and your guard closer.','Grass that sways against the wind hides monsters. The stone roads are safe if you need to rest.','Rest at the Ranger Camp in the Wildlands. Old Willow keeps the fire burning there.','Your mother used to hum the harvest song on that bench by the fountain.','Every zone has an Alpha. Defeat one and the wild folk will whisper your name.'];
const key=questStep+'|'+(b.north?1:0)+(b.south?1:0)+'|'+(state.stage||0);if(state.elderKey!==key){state.elderKey=key;save();setDialogue([[nm,hint],[nm,flavor[n%flavor.length]]]);}else setDialogue([[nm,flavor[n%flavor.length]],[nm,flavor[(n+1)%flavor.length]]]);}
function interact(){if(titleOpen)return;if(transitioning||battle)return;if(scene==='area'&&AREA){areaInteract();return;}if(scene==='inside'){if(dialogue){advanceDialogue();return;}if(insidePlayer.y>roomGeom(interiorId).exitY){exitBuilding();return;}const W=innerWidth,H=innerHeight,pxp=insidePlayer.x,pyp=insidePlayer.y;let target=null,dist=Infinity;for(let i=0;i<roomNPCs[interiorId].length;i++){const n=roomNPCs[interiorId][i],spot=roomNPCSpots[interiorId][i];const d=Math.hypot(pxp-W*spot.x,pyp-H*spot.y);if(d<roomGeom(interiorId).U*3.3&&d<dist){target=n;dist=d;}}if(target){if(target.name==='INNKEEPER BRAM'){state.hp=Math.max(state.maxHp||state.hp,state.hp);state.mp=state.maxMp||state.mp;updateHud();save();target={...target,lines:[...target.lines,'You look worn out. Rest a moment... there, good as new!']};}setDialogue(target.lines.map(t=>[target.name,t]));if(interiorId===3&&target.name==='OLD CRAFTSMAN ORIN'&&questStep<3){setQ(3);updateQuest();}return;}if(pyp>roomGeom(interiorId).exitY){scene='outside';state.x=([10.5,34,22,5.5][interiorId])*TILE;state.y=([10.9,10.9,22.9,29.9][interiorId])*TILE;updateHud();save();return;}setDialogue([['ROWAN','There is no one close enough to talk to. Walk closer and tap the game world to interact.']]);return;}if(dialogue){advanceDialogue();return;}if(cinematic)return;if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y),rc=(n.trainer&&n.trainer.bi!==undefined)?190:64;if(d<rc&&d<dist){found=n;dist=d;}}
if(found){
if(found.act==='teleporter'){openTeleporter();return;}
 if(found.region!==undefined){enterRegion(found.region);return;}
if(found.wilds){sfx('portal');enterWilds();return;}
if(found.city){enterArea('city');return;}
if(found.trainer&&!state.beaten[found.trainer.id]){setDialogue(found.lines.map(t=>[found.name,t]),()=>startBattle(found.trainer));return;}
if(found.name==='ELDER MAPLE'&&questStep===0){setQ(1);setDialogue([[found.name,'First, visit the village homes. Your parents may have left a clue.'],['QUEST UPDATED','Visit the homes around the village.']]);}
else if(found.name==='ROWAN'&&questStep===1){setQ(2);setDialogue([[found.name,'I will check the fountain. You should search the buildings.'],['QUEST UPDATED','Enter a building and look for clues.']]);}
else if(found.name==='ELDER MAPLE'&&questStep===3){turnInClues();}
else if(found.name==='ELDER MAPLE'){elderChat();}
else setDialogue(found.lines.map(t=>[found.name,t]));
save();updateQuest();return;}
const doors=[{x:10.5,y:10.5,id:0},{x:34,y:10.5,id:1},{x:22,y:22.5,id:2},{x:5.5,y:29.5,id:3}];for(const d of doors){if(Math.hypot(state.x-d.x*TILE,state.y-d.y*TILE)<82){enterBuilding(d.id);return;}}
const sx=27*TILE,sy=10*TILE;if(Math.hypot(state.x-sx,state.y-sy)<75){setDialogue([['OLD SIGN','AUTUMNWOOD — follow the golden leaves beyond the village.'],['QUEST','Explore Hearthvale and speak with the villagers. The road north-east leads to your first chapter.']]);return;}
setDialogue([['ROWAN','The wind smells like cinnamon and fallen leaves. Maybe there is something nearby.']]);}
function showBeginnerTutorial(){
 if(state.tutorialDone)return;
 const steps=[
  ['WELCOME TO HEARTHVALE','Your adventure is just beginning. This quick guide shows you the basics.'],
  ['MOVE AROUND','Keyboard: use W A S D or the arrow keys. On phones and tablets, use the joystick in the lower-left corner.'],
  ['TAP TO INTERACT','Walk close to a character, then click or tap anywhere on the game world. Keyboard players can press E or SPACE. Tap MENU to open your Field Journal.'],
  ['QUESTS & BATTLES','Follow CURRENT QUEST near the top-left. Explore tall grass to meet wild creatures, then choose FIGHT, SKILL, GUARD, or ITEMS.'],
  ['USE YOUR ITEMS','ITEMS can restore HP or MP, protect you, or damage an opponent. Using an item takes your turn. Check BAG in the Field Journal to see what you carry.'],
  ['YOU ARE READY!','Talk to Elder Maple first. Take your time, explore every building, and keep an eye out for side quests and secrets.']
 ];
 let index=0;
 const el=document.createElement('div');el.className='lh-tutorial';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Beginner tutorial');
 el.innerHTML='<section class="lh-tutorial-card"><div class="lh-tutorial-kicker">THE LAST HARVEST · FIELD GUIDE</div><div class="lh-tutorial-count"></div><h2 class="lh-tutorial-title"></h2><p class="lh-tutorial-copy"></p><div class="lh-tutorial-progress"></div><div class="lh-tutorial-actions"><button type="button" class="lh-tutorial-skip">SKIP GUIDE</button><button type="button" class="lh-tutorial-next">NEXT →</button></div></section>';
 document.getElementById('lh-game').appendChild(el);
 const title=el.querySelector('.lh-tutorial-title'),copy=el.querySelector('.lh-tutorial-copy'),count=el.querySelector('.lh-tutorial-count'),progress=el.querySelector('.lh-tutorial-progress'),next=el.querySelector('.lh-tutorial-next');
 function finish(){state.tutorialDone=true;save();el.remove();}
 function render(){const step=steps[index];count.textContent='LESSON '+(index+1)+' / '+steps.length;title.textContent=step[0];copy.textContent=step[1];progress.innerHTML=steps.map((_,i)=>'<i class="'+(i<=index?'done':'')+'"></i>').join('');next.textContent=index===steps.length-1?'START ADVENTURE ✓':'NEXT →';}
 next.addEventListener('click',()=>{if(index<steps.length-1){index++;render();}else finish();});
 el.querySelector('.lh-tutorial-skip').addEventListener('click',finish);
 render();
}
function startIntro(){
document.body.classList.add('lh-cinematic');
state.name=$('lh-name-input').value.trim().slice(0,16)||'Adventurer';
state.x=20*TILE;state.y=15*TILE;state.coins=100;state.stage=0;state.seenIntro=false;
$('lh-create').hidden=true;updateHud();
const W=innerWidth,H=innerHeight;
cinematic={phase:'dream',camera:{x:0,y:0},flash:0,actors:{HERO:{x:W*.2,y:H*.78},FOE:{x:W*.86,y:H*.74},MARA:{x:W*.1,y:H*.58},THOMAS:{x:W*.9,y:H*.58},ROWAN:{x:W*.32,y:H*.58}}};
const say=lines=>new Promise(resolve=>setDialogue(lines,resolve));
const moveActor=(name,to,duration=900)=>new Promise(resolve=>{const a=cinematic.actors[name],from={x:a.x,y:a.y},start=performance.now();a.face=Math.abs(to.x-from.x)>Math.abs(to.y-from.y)?(to.x<from.x?2:3):(to.y<from.y?1:0);function step(now){if(!cinematic)return resolve();const p=Math.min(1,(now-start)/duration),e=p*p*(3-2*p);a.x=from.x+(to.x-from.x)*e;a.y=from.y+(to.y-from.y)*e;a.step=1+(Math.floor(now/140)%2);if(cinematic.phase==='outside'&&name==='HERO')cinematic.camera={x:a.x,y:a.y};if(p<1)requestAnimationFrame(step);else{a.step=0;resolve();}}requestAnimationFrame(step);});
(async()=>{
await say([['DREAM','The Harvest Festival arena roars to life. Banners snap in the wind, and the whole crowd is on its feet!']]);
await say([['CROWD',state.name+'! '+state.name+'! '+state.name+'!'],['ROWAN','Go on! Show them what the future champion of Hearthvale can do!']]);
await moveActor('HERO',{x:W*.42,y:H*.78},1000);
await moveActor('FOE',{x:W*.68,y:H*.76},900);
await say([['ANNOUNCER','The final match of the Harvest Festival begins now!'],['CHALLENGER','You really think you can beat me?']]);
await moveActor('HERO',{x:W*.6,y:H*.77},420);cinematic.flash=1;
await moveActor('FOE',{x:W*.86,y:H*.74},500);
await say([['ANNOUNCER','A STRIKE LIKE LIGHTNING! THE CHAMPION WINS!'],['MARA','That is our child! We are so proud of you!'],['THOMAS','The greatest champion Hearthvale has ever seen!']]);
cinematic.flash=1;cinematic.phase='wake';cinematic.wakePose='lying';cinematic.actors={MARA:{x:-W*.1,y:H*.84},THOMAS:{x:W*1.1,y:H*.84}};
await moveActor('MARA',{x:W*.3,y:H*.84},900);
await say([['MARA','Wake up, sleepyhead… You were dreaming about the championship again.']]);
cinematic.wakePose='sitting';moveActor('THOMAS',{x:W*.7,y:H*.84},900);
await say([['MARA','Good morning! Rowan is waiting outside. You are both old enough to attend Hearthvale School today.'],['THOMAS','The instructor will help you choose the path that suits you. We will see you after lessons.']]);
cinematic.wakePose='standing';
await say([['ROWAN','(from outside) Ready? Let’s walk to school together!']]);
cinematic.flash=1;cinematic.phase='school';cinematic.actors={HERO:{x:W*.4,y:H*.72},ROWAN:{x:W*.6,y:H*.72}};
await say([['ROWAN','I saved you a seat! I wonder which path you will choose.'],['INSTRUCTOR','Welcome to Hearthvale School. Every adventurer chooses one path: Guardian, Scout, or Mage. Your choice will shape how you face the world.']]);
$('lh-school-class').hidden=false;
await new Promise(resolve=>{window.__lhClassChosen=resolve;});
await say([['ROWAN','Hey! Let’s test your new path with a friendly duel. Loser buys lunch!'],['INSTRUCTOR','A friendly duel? Very well. No injuries, and no cheating.']]);
const won=await new Promise(res=>startBattle({id:'friendly',name:'ROWAN',row:1,friendly:true,hp:42,atk:5,reward:0,win:[],onEnd:res}));
await say(won?[['ROWAN','Whoa! You are good! Fine, lunch is on me.'],['INSTRUCTOR','Well fought, both of you. School is dismissed!']]:[['ROWAN','Ha! I win! Do not worry, you will catch up. Lunch is on you!'],['INSTRUCTOR','Well fought, both of you. School is dismissed!']]);
cinematic.flash=1;cinematic.phase='outside';cinematic.camera={x:20*TILE+16,y:15*TILE+24};cinematic.actors={HERO:{x:20*TILE+16,y:15*TILE+24},ROWAN:{x:21*TILE+16,y:15*TILE+24}};
await say([['ROWAN','Come on, let’s walk home. Your parents promised a feast for tonight.']]);
await Promise.all([moveActor('HERO',{x:10*TILE+16,y:11*TILE+24},3200),moveActor('ROWAN',{x:11*TILE+16,y:11*TILE+24},3200)]);
await say([['ROWAN','Huh? The front door is wide open…'],['ROWAN','Mara? Thomas? Hello?']]);
cinematic.flash=1;cinematic.phase='home';{const g0=roomGeom(0);cinematic.actors={HERO:{x:rcx(g0,5),y:rcy(g0,6),face:1},ROWAN:{x:rcx(g0,6),y:rcy(g0,6),face:1}};
await say([['ROWAN','Dinner is still on the table… and nobody touched it.'],['YOU','The fire is out and the lanterns are dark. They would never leave like this.']]);
await moveActor('HERO',{x:rcx(g0,4),y:rcy(g0,5)},900);cinematic.sparkle=true;
await say([['YOU','A golden leaf… and Mom’s journal is open on the table.'],['ROWAN','That symbol… the Everfeast sigil! Read it out loud.']]);}
cinematic.sparkle=false;cinematic.flash=1;cinematic.phase='lore';cinematic.t0=performance.now();cinematic.act=0;
const lore=[[['JOURNAL','THE LEGEND OF THE EVERFEAST, written by the First Keepers of Hearthvale.'],['JOURNAL','Long ago this valley was ash and hunger. Three winters passed without a single harvest.'],['JOURNAL','The villagers shared the last of their grain, but it was never enough.']],
[['JOURNAL','Then, on the coldest night, the First Keepers set one golden table in the square and fed every neighbor and stranger.'],['JOURNAL','That was the first Everfeast: wherever a meal is shared in kindness, the harvest returns. By morning the fields were green.']],
[['JOURNAL','But hunger has a master: the Hollow King, who feeds on forgotten promises and empty tables.'],['JOURNAL','He rose from the frozen north and swallowed orchards, rivers, and whole villages.']],
[['JOURNAL','The Keepers made the First Promise: never let a table in Hearthvale stand empty. Their light sealed the Hollow King beneath the village.'],['JOURNAL','Every autumn, new Keepers renew the promise at the Everfeast. As long as the table is full, the seal holds.']],
[['JOURNAL','But this year the Keepers are gone, the sigil is cracking, and tonight the table stands empty…']]];
for(let a=0;a<lore.length;a++){if(a>0){cinematic.flash=1;cinematic.act=a;cinematic.t0=performance.now();}await say(lore[a]);}
cinematic.flash=1;cinematic.phase='home';cinematic.sparkle=false;
await say([['ROWAN','Your parents are Keepers… and the Hollow King’s seal is breaking!'],['YOU','Then we have to find them before the Everfeast fails.'],['ROWAN','Elder Maple knows the old stories. Let’s ask him first.']]);
cinematic=null;document.body.classList.remove('lh-cinematic');scene='outside';state.x=10*TILE+16;state.y=12*TILE+24;state.seenIntro=true;setQ(0);updateQuest();showBeginnerTutorial();
})();
}

function areaName(){if(scene==='area'&&AREA)return AREA.routeName||AREA.name;return(state.stage>0&&state.y>=31*TILE)?chapters[Math.min(state.stage,9)].place:chapters[0].place;}
function updateQuest(){state.sideQuests=state.sideQuests||{};const active=Object.entries(state.sideQuests).find(([id,q])=>q&&q.accepted&&!q.done);if(state.beaten&&state.beaten.south){const i=Math.min(state.stage||0,BOSSES.length-1);$('lh-quest-text').textContent=(state.beaten['boss'+i]||(state.stage||0)>=BOSSES.length)?'Hearthvale is saved!':'Defeat the '+BOSSES[i].name+(i>0?' in '+chapters[i].place:' on the south road');return;}if(scene==='area'&&AREA&&AREA.chapter&&!mainQuestReady(AREA.chapter)){const q=mainQuestData(AREA.chapter);$('lh-quest-text').textContent='Chapter '+(AREA.chapter+1)+' trial · Talk to '+(q.talked||[]).length+'/2 locals · Defeat '+(q.kills||0)+'/3 creatures';return;}const storyActive=Object.entries(state.storyArcs||{}).find(([id,q])=>q&&!q.done);if(storyActive){const names={market_truth:'A Name Left Behind',frost_lanterns:'Lanterns for the Lost',fortress_oath:'The Oath Beneath the Gate'};$('lh-quest-text').textContent=names[storyActive[0]]+(storyActive[1].stage===2?' · Return to the quest giver':' · Find the next character');return;}if(active){const labels={woodland:'Hunter’s Request',orchard:'Last Good Apples',pantry:'A Light Below'};$('lh-quest-text').textContent=labels[active[0]]+' · '+(active[1].kills||0)+'/3 wild creatures';return;}if((questStep||0)>=4&&!(state.beaten&&state.beaten.south)){$('lh-quest-text').textContent=state.beaten&&state.beaten.north?'Hunt monsters in the Wildlands (north road), then face the south road':'Defeat Gatekeeper Brawn to open the Wildlands (north road)';return;}
const q=['Speak with Elder Maple','Visit Rowan in the village square','Enter a building and search for clues','Return to Elder Maple with what you found','Follow the golden leaves beyond the village'];$('lh-quest-text').textContent=q[Math.min(questStep,q.length-1)];}
function drawAvatarTo(cv){if(!cv||!CHARS.naturalWidth)return;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,16,16);c.drawImage(CHARS,0,((cinematic&&cinematic.phase!=='outside')?CIV:heroRow())*16,16,16,0,0,16,16);}
CHARS.addEventListener('load',()=>drawAvatarTo($('lh-hud-avatar')));
function updateHud(){const mh=state.maxHp||40,mm=state.maxMp||20,mp=state.mp??mm,hp=Math.max(0,state.hp);
 $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-level-hud').textContent=state.level||1;
 $('lh-health').textContent=hp+'/'+mh;$('lh-mp-hud').textContent=mp+'/'+mm;$('lh-coins').textContent=state.coins;
 const hf=$('lh-hp-fill'),mf=$('lh-mp-fill');hf.style.width=Math.min(100,hp/mh*100)+'%';hf.className='lh-bar-fill'+(hp/mh<.25?' low':hp/mh<.5?' mid':'');mf.style.width=Math.min(100,mp/mm*100)+'%';
 drawAvatarTo($('lh-hud-avatar'));
 $('lh-location').textContent=scene==='inside'?['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]:areaName().toUpperCase();updateQuest();}
function move(dt){walking=false;const ins=scene==='inside',ar=scene==='area',P=ins?insidePlayer:ar?areaPlayer:state;
if(stepper){stepper.t+=dt/.19;const e=Math.min(1,stepper.t);P.x=stepper.fx+(stepper.tx-stepper.fx)*e;P.y=stepper.fy+(stepper.ty-stepper.fy)*e;walking=true;if(stepper.t<1)return;P.x=stepper.tx;P.y=stepper.ty;stepper=null;alt^=1;if(ar)areaStep();if(!ins&&!ar){const an=areaName();if(an!==lastArea){lastArea=an;updateHud();}}if(!ins&&!ar&&++stepCount%4===0)save();if(!ins&&!ar&&!battle&&!dialogue&&inGrass(P)&&Math.random()<.14){startBattle(wildEncounter());}}
if(titleOpen||battle||dialogue||cinematic||transitioning||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;
if(!ins&&!ar){P.x=Math.floor(P.x/TILE)*TILE+16;P.y=Math.floor(P.y/TILE)*TILE+24;}
let dx=joystick.x,dy=joystick.y;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;
if(Math.abs(dx)<.35&&Math.abs(dy)<.35){turnWait=0;return;}
const f=Math.abs(dx)>=Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
if(f!==facing){facing=f;turnWait=.09;return;}
if(turnWait>0){turnWait-=dt;return;}
const SS=ins?roomGeom(interiorId).U:TILE,nx=P.x+[0,0,-1,1][f]*SS,ny=P.y+[1,-1,0,0][f]*SS;
const hit=ins?roomHit(nx,ny):ar?areaHit(nx,ny):(blocked(nx,ny)||npcs.some(n=>Math.floor(n.x/TILE)===Math.floor(nx/TILE)&&Math.floor(n.y/TILE)===Math.floor(ny/TILE)));
if(hit){if(ins&&f===0&&P.y>roomGeom(interiorId).exitY)exitBuilding();return;}stepper={fx:P.x,fy:P.y,tx:nx,ty:ny,t:0};walking=true;}
function loop(t){const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;move(dt);areaTick();ensureSouthBossGate();ensureCityGate();ensureWildsGate();musicTick();lastCam=drawWorld();drawBattleFx(innerWidth,innerHeight);if(dialogue)positionSpeechBubble(dialogue[dialogueIndex][0]);requestAnimationFrame(loop);}
requestAnimationFrame(loop);
addEventListener('keydown',e=>{if(dialogue&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!e.repeat)advanceDialogue();return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='e'||e.key==='E'||e.key===' '){if(!e.repeat)interact();return;}keys[e.key]=true;});
addEventListener('keyup',e=>{keys[e.key]=false;});
const joy=$('lh-joystick'),stick=$('lh-stick');let joyPointer=null;
const worldCanvas=$('lh-world');worldCanvas.addEventListener('click',e=>{if(e.button!==0||dialogue||battle||cinematic||titleOpen||!$('lh-game-menu').hidden)return;if(e.target!==worldCanvas)return;e.preventDefault();interact();});
function setJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy),scale=len>max?max/len:1;joystick.x=(dx*scale)/max;joystick.y=(dy*scale)/max;stick.style.transform='translate('+joystick.x*34+'px,'+joystick.y*34+'px)';}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)setJoy(e);});
function releaseJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;joystick.x=joystick.y=0;stick.style.transform='translate(0,0)';}
joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
// Tap the game world to interact; keyboard E/Space remains available.
$('lh-dialogue').addEventListener('pointerup',e=>{if(e.target.closest('button'))return;e.preventDefault();advanceDialogue();});
$('lh-next').addEventListener('click',advanceDialogue);
document.querySelectorAll('#lh-school-class .lh-class').forEach(b=>b.addEventListener('click',()=>{$('lh-school-class').querySelectorAll('.lh-class').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');}));
$('lh-school-confirm').addEventListener('click',()=>{const selected=$('lh-school-class').querySelector('.lh-class.selected');state.heroClass=selected.dataset.class;state.hp=state.heroClass==='Guardian'?50:state.heroClass==='Mage'?36:40;$('lh-school-class').hidden=true;updateHud();save();if(window.__lhClassChosen){const done=window.__lhClassChosen;window.__lhClassChosen=null;done();}});
$('lh-begin').addEventListener('click',startIntro);
$('lh-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')startIntro();});
function jBar(cls,label,v,max,txt){return'<div class="lh-j-bar '+cls+'"><label>'+label+'</label><div class="t"><i style="width:'+Math.max(0,Math.min(100,v/max*100))+'%"></i></div><b>'+txt+'</b></div>';}
function jChip(label,val,wide){return'<div class="lh-j-chip'+(wide?' wide':'')+'"><small>'+label+'</small><b>'+escapeMenuText(val)+'</b></div>';}
const J_ZONES=[['SUNNY MEADOW','#7bc86c','1-2'],['ORCHARD WOODS','#d9a04a','3-4'],['MISTY MARSH','#4fa9a0','5-6'],['STONE HOLLOW','#8a7f9a','7-8'],['FROST RIDGE','#cfe6f6','9-10']];
function drawJournalMap(){const cv=$('lh-j-map');if(!cv)return;const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
 if(scene==='area'&&AREA&&AREA.wilds){const A=AREA,sc=4;cv.width=A.w*sc;cv.height=A.h*sc;g.drawImage(wildsMini(A),0,0,cv.width,cv.height);const px=Math.floor(areaPlayer.x/32)*sc,py=Math.floor(areaPlayer.y/32)*sc;g.fillStyle='#ffffff';g.fillRect(px-4,py-4,sc+8,sc+8);g.fillStyle='#e03838';g.fillRect(px-2,py-2,sc+4,sc+4);return;}
 const rows=['FFFFFFFFFFFF','FHH...F...HF','FHH...F...HF','pppppppppppp','...ppp......','...ppp......','HHH.ppp.....','HHH.ppp.....','FFFFFFFFFFFF'],cs=26,col={F:'#315f48',H:'#b87849',p:'#e2d6b0','.':'#79b66c'};cv.width=12*cs;cv.height=9*cs;
 rows.forEach((r,y)=>[...r].forEach((c,x)=>{g.fillStyle=col[c];g.fillRect(x*cs,y*cs,cs,cs);g.fillStyle='rgba(0,0,0,.12)';g.fillRect(x*cs,y*cs+cs-2,cs,2);}));
 const mx=Math.max(0,Math.min(11,Math.floor(state.x/TILE/4))),my=Math.max(0,Math.min(8,Math.floor(state.y/TILE/4)));g.fillStyle='#fff';g.fillRect(mx*cs+2,my*cs+2,cs-4,cs-4);g.fillStyle='#e03838';g.fillRect(mx*cs+6,my*cs+6,cs-12,cs-12);}
function renderRpgMenu(tab='status'){
  document.querySelectorAll('[data-rpg-tab]').forEach(b=>b.classList.toggle('active',b.dataset.rpgTab===tab));
  const panel=$('lh-rpg-content'),stage=Math.min(Number(state.stage)||0,9),chapter=chapters[stage],esc=escapeMenuText;
  const lv=state.level||1,mh=state.maxHp||40,mm=state.maxMp||20,mp=state.mp??mm,xp=state.xp||0,xn=lv*100;ensureBattleItems();
  if(tab==='status'){
    const loc=scene==='inside'?['Maple Cottage','Village Inn','General Store','Old Workshop'][interiorId]:areaName(),items=BATTLE_ITEMS.reduce((a,it)=>a+battleItemCount(it.id),0),sk=Array.isArray(state.skills)?state.skills.length:Object.keys(state.skills||{}).length;
    panel.innerHTML='<div class="lh-j-hero"><div class="lh-j-portrait"><canvas id="lh-j-avatar" width="16" height="16"></canvas></div><div class="lh-j-info"><b class="lh-j-name">'+esc(state.name||'Adventurer')+'</b><span class="lh-j-sub">LV '+lv+' \u00B7 '+esc((state.heroClass||'Guardian').toUpperCase())+'</span>'+jBar('hp','HP',state.hp,mh,state.hp+'/'+mh)+jBar('mp','MP',mp,mm,mp+'/'+mm)+jBar('xp','XP',xp,xn,xp+'/'+xn)+'</div></div><div class="lh-j-chips">'+jChip('COINS',state.coins||0)+jChip('ITEMS',items)+jChip('CHAPTER',(stage+1)+' / 10')+jChip('SKILLS',sk)+jChip('LOCATION',loc,true)+'</div>';
    drawAvatarTo($('lh-j-avatar'));
  }else if(tab==='bag'){
    const kit={Guardian:['Harvest Longsword \u2014 weapon','Oak Kite Shield \u2014 offhand','Steel Plate Armor \u2014 armor'],Scout:['Hunter\u2019s Longbow \u2014 weapon','Leaf-Stitched Quiver \u2014 offhand','Ranger Leather Armor \u2014 armor'],Mage:['Amber Orb Staff \u2014 weapon','Spellbound Mantle \u2014 armor']}[state.heroClass]||[];
    const items=[...kit,...(Array.isArray(state.inventory)?state.inventory:[])],pal=['#d9534a','#4a9ad9','#4fa04a','#d9a94e','#9a6ad9'];
    panel.innerHTML='<h3 class="lh-j-h">BATTLE ITEMS</h3><div class="lh-j-slots">'+BATTLE_ITEMS.map((it,i)=>'<div class="lh-j-slot"><span class="ic" style="background:'+pal[i%pal.length]+'">'+esc(it.name[0])+'</span><div><b>'+esc(it.name)+'</b><small>'+esc(it.desc)+'</small></div><em>\u00D7'+battleItemCount(it.id)+'</em></div>').join('')+'</div>'+(items.length?'<h3 class="lh-j-h">GEAR</h3><div class="lh-j-slots">'+items.map(item=>{const t=String(typeof item==='string'?item:(item.name||'Unknown item')).split(' \u2014 ');return'<div class="lh-j-slot gear"><span class="ic" style="background:#8a6a50">\u2726</span><div><b>'+esc(t[0])+'</b>'+(t[1]?'<small>'+esc(t[1].toUpperCase())+'</small>':'')+'</div></div>';}).join('')+'</div>':'');
  }else if(tab==='map'){
    const wild=scene==='area'&&AREA&&AREA.wilds,other=scene==='area'&&AREA&&!AREA.wilds;
    if(other){panel.innerHTML='<h3 class="lh-j-h">'+esc(areaName().toUpperCase())+'</h3><p class="lh-j-p">You have not surveyed this area yet. Explore it to learn the roads.</p>';return;}
    panel.innerHTML='<h3 class="lh-j-h">'+(wild?'THE WILDLANDS':'HEARTHVALE VILLAGE')+'</h3><div class="lh-j-mapwrap"><canvas id="lh-j-map"></canvas></div>'+(wild?'<div class="lh-j-legend">'+J_ZONES.map(z=>'<span><i style="background:'+z[1]+'"></i>'+z[0]+' <em>Lv '+z[2]+'</em></span>').join('')+'<span><i style="background:#e8c690"></i>Roads</span><span><i style="background:#4aa8d8"></i>Water</span><span><i class="you"></i>You</span></div>':'<div class="lh-j-legend"><span><i style="background:#315f48"></i>Woods</span><span><i style="background:#b87849"></i>Buildings</span><span><i style="background:#e2d6b0"></i>Roads</span><span><i class="you"></i>You</span></div><p class="lh-j-p">A field sketch of the village. The village teleporter can take you to every destination you have unlocked.</p>');
    drawJournalMap();
  }else{
    const obj=$('lh-quest-text').textContent,pips=Array.from({length:10},(_,i)=>'<i class="'+(i<stage?'done':i===stage?'now':'')+'"></i>').join(''),sq=Object.entries(state.sideQuests||{}),names={woodland:'A Hunter\u2019s Request',orchard:'The Last Good Apples',pantry:'A Light Below'};
    const alphas=Object.keys(state.beaten||{}).filter(k=>k.indexOf('alpha')===0).length,chests=Object.keys(state.chests||{}).length;
    panel.innerHTML='<div class="lh-j-obj"><small>CURRENT OBJECTIVE</small><b>'+esc(obj)+'</b></div><h3 class="lh-j-h">CHAPTER '+(stage+1)+' \u00B7 '+esc(chapter.title.toUpperCase())+'</h3><div class="lh-j-pips">'+pips+'</div><p class="lh-j-p"><b>Region:</b> '+esc(chapter.place)+'</p><h3 class="lh-j-h">SIDE QUESTS</h3>'+(sq.length?'<div class="lh-j-slots">'+sq.map(([id,q])=>'<div class="lh-j-slot"><span class="ic" style="background:'+(q.done?'#4fa04a':q.accepted?'#d9a94e':'#8a8a8a')+'">'+(q.done?'\u2713':'!')+'</span><div><b>'+esc(names[id]||id)+'</b><small>'+(q.done?'COMPLETE':q.accepted?((q.kills||0)+'/3 CREATURES'):'NOT STARTED')+'</small></div></div>').join('')+'</div>':'<p class="lh-j-p">No side quests yet. Talk to the villagers.</p>')+'<h3 class="lh-j-h">WILDLANDS</h3><div class="lh-j-chips">'+jChip('ALPHAS',alphas+' / 5')+jChip('CHESTS',chests+' / 11')+'</div><p class="lh-j-save">LOCAL SAVE \u00B7 '+(state.savedAt?new Date(state.savedAt).toLocaleString():'Autosaving')+'</p>';
  }
}
function escapeMenuText(value){return String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
$('lh-menu').addEventListener('click',()=>{$('lh-game-menu').hidden=false;renderRpgMenu('status');});
document.querySelectorAll('[data-rpg-tab]').forEach(b=>b.addEventListener('click',()=>renderRpgMenu(b.dataset.rpgTab)));
$('lh-resume').addEventListener('click',()=>{$('lh-game-menu').hidden=true;});
{const r2=$('lh-resume2');if(r2)r2.addEventListener('click',()=>{$('lh-game-menu').hidden=true;});}
$('lh-reset').addEventListener('click',()=>{if(confirm('Start a new adventure? Your saved progress on this device will be replaced.')){localStorage.removeItem(SAVE);localStorage.removeItem(BACKUP);location.reload();}});
initSfx();initRows();addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});setInterval(()=>{if(state.name&&state.seenIntro&&!battle&&!dialogue&&!cinematic)save();},15000);
if(state.seenIntro)offerSkillsWhenReady();
if(/[?&]debug\b/.test(location.search))window.__lh={setDialogue,advanceDialogue,get state(){return state;},enterRegion,enterArea,towerEnter,showLeaderboard,offerSkills,startBattle,wildEncounter,setScene(s){scene=s;},get scene(){return scene;}};
{const hasSave=!!(state.name&&state.seenIntro);$('lh-create').hidden=true;if(state.name)updateHud();let skip=false;try{skip=sessionStorage.getItem('lh_skip_title')==='1';sessionStorage.removeItem('lh_skip_title');}catch(e){}applyGender();if(skip)startNaming();else showTitle(hasSave);}
})();
