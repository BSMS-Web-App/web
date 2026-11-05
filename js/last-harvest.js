/* THE LAST HARVEST — full-screen top-down pixel adventure */
(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('lh-world'),mainCtx=canvas.getContext('2d'),SAVE='last_harvest_adventure_v4';
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
try{const old=JSON.parse(localStorage.getItem(SAVE));if(old&&old.name)state={...state,...old};}catch(e){}
let keys={},touch={},joystick={x:0,y:0},scene='outside',interiorId=0,insideTalked=false,questStep=0,dialogue=null,dialogueIndex=0,nearby=null,lastTime=0,moveCooldown=0,playerFrame=0,worldSeed=13,cinematic=null;
const rand=(x,y)=>{let n=Math.sin(x*127.1+y*311.7+worldSeed)*43758.5453;return n-Math.floor(n)};
const save=()=>localStorage.setItem(SAVE,JSON.stringify(state));
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;}
addEventListener('resize',resize);resize();
function tileAt(x,y){if(x<0||y<0||x>=MAP_W||y>=MAP_H)return 1;return 0;}
const solids=[{x:7,y:5,w:7,h:5},{x:30,y:5,w:8,h:5},{x:18,y:17,w:8,h:5},{x:3,y:25,w:5,h:4},{x:21,y:24,w:5,h:4}];
function gateBlocked(tx,ty){return GUARDS.some(g=>!state.beaten[g.id]&&tx>=g.gate.x&&tx<g.gate.x+g.gate.w&&ty>=g.gate.y&&ty<g.gate.y+g.gate.h);}
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
{id:'north',name:'GATEKEEPER BRAWN',tx:16,ty:5,gate:{x:15,y:5,w:4,h:1},an:5,hp:34,atk:6,reward:60,lines:['Halt! The north road is closed until the harvest bell rings.','If you want to pass, prove you can protect Hearthvale!'],win:['Hmph... you fight like a true keeper. The north road is open.']},
{id:'east',name:'GATEKEEPER WINONA',tx:40,ty:12,gate:{x:40,y:11,w:1,h:4},an:6,hp:40,atk:7,reward:75,lines:['The east road is closed. Too many strangers lately.','Show me your strength and I will let you through!'],win:['Impressive! Go on — the east road is yours.']}
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
const BOSS_NPC={};BOSSES.forEach((b,i)=>{BOSS_NPC[b.name]=i;});


state.beaten=state.beaten||{};
GUARDS.push({id:'south',name:BOSSES[0].name,tx:16,ty:30,gate:{x:15,y:30,w:4,h:1},bi:0,lines:BOSSES[0].lines,win:BOSSES[0].win});
GUARDS.forEach(g=>{if(!state.beaten[g.id])npcs.push({x:g.tx*TILE,y:g.ty*TILE,name:g.name,color:'#000',lines:g.lines,trainer:g});});
const POS={'ELDER MAPLE':[12,12],'ROWAN':[21,12],'MILLIE':[16,20],'GUS':[17,26],'PIPER':[30,13]};npcs.forEach(n=>{const p=POS[n.name];if(p){n.x=p[0]*TILE;n.y=p[1]*TILE;}});
npcs.forEach(n=>{n.x=Math.round(n.x/TILE)*TILE+16;n.y=Math.round(n.y/TILE)*TILE+24;});state.x=Math.floor(state.x/TILE)*TILE+16;state.y=Math.floor(state.y/TILE)*TILE+24;
function spawnLair(){if(!state.beaten.south)return;const i=Math.min(state.stage||0,BOSSES.length-1);if(i<1||state.beaten['boss'+i]||GUARDS.some(g=>g.id==='boss'+i))return;const B=BOSSES[i],g={id:'boss'+i,name:B.name,tx:16,ty:33,gate:{x:15,y:33,w:4,h:1},bi:i,lines:B.lines,win:B.win};GUARDS.push(g);npcs.push({x:g.tx*TILE+16,y:g.ty*TILE+24,name:g.name,color:'#000',lines:g.lines,trainer:g});}
if(state.beaten.south&&!(state.stage>0))state.stage=1;spawnLair();
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
function drawWorld(){const W=innerWidth,H=innerHeight;if(battle&&battle.phase!=='alert'&&battle.phase!=='swirl'){drawBattleScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='dream'){drawDreamScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='wake'){drawWakeScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='school'){drawSchoolScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='home'){drawHomeScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='lore'){drawLoreScene(W,H);return{camX:0,camY:0};}if(scene==='inside'){drawInterior(W,H);return{camX:0,camY:0};}
const focus=cinematic?cinematic.camera:{x:state.x,y:state.y};const camX=Math.max(0,Math.min(MAP_W*TILE-W,focus.x-W/2)),camY=Math.max(0,Math.min(MAP_H*TILE-H,focus.y-H/2));
ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.floor(camX),-Math.floor(camY));
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
px(18*TILE,12*TILE,3*TILE,2*TILE,'#536a78');px(18*TILE+5,12*TILE+4,3*TILE-10,34,'#b5d1c9');px(18*TILE+12,12*TILE+8,42,25,'#5cabb4');px(18*TILE+20,12*TILE-7,26,10,'#e8e6cf');px(18*TILE+29,12*TILE-3,8,5,'#7dc9cf');
kTile('t',83,27*TILE-16,10*TILE);
drawGates();
for(const n of npcs){const a=cinematic&&cinematic.actors[n.name];drawPerson(a?a.x:n.x,a?a.y:n.y,n.color,n.name==='ROWAN'?'#9b4a36':'#637b55',n.name);}
if(cinematic&&cinematic.actors.CHAMPION){const a=cinematic.actors.CHAMPION;drawPerson(a.x,a.y,'#d5b64e','#e8bd58');}
drawPlayer(state.x,state.y);
let promptTarget=null,promptDist=Infinity,promptLabel='E · TALK';
for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<104&&d<promptDist){promptTarget=n;promptDist=d;promptLabel='E · TALK';}}
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
const heroRow=()=>({Guardian:5,Scout:7,Mage:0})[state.heroClass]??5;
function actor(x,fy,row,face,k,g,step){drawSpriteK(row,face,step||0,x,fy,k);if(g)drawGear(x,fy,k,face,g);}
function bars(W,H){px(0,0,W,H*.07,'#000');px(0,H*.93,W,H*.07,'#000');if(cinematic&&cinematic.flash>0){ctx.fillStyle='rgba(255,255,255,'+cinematic.flash+')';ctx.fillRect(0,0,W,H);cinematic.flash=Math.max(0,cinematic.flash-.035);}}
function drawHomeScene(W,H){const{g,list}=drawRoom(0,W,H,false),a=cinematic.actors,k=2*g.Z;
for(const n of ['ROWAN','HERO']){const p=a[n];if(p)list.push({y:p.y,f:()=>{drawSpriteK(n==='HERO'?heroRow():1,p.face||0,p.step||0,p.x,p.y,k);if(n==='HERO')drawGear(p.x,p.y,k,p.face||0,state.heroClass);}});}
list.sort((p,q)=>p.y-q.y).forEach(o=>o.f());const t=performance.now()/1000;
if(cinematic.sparkle){const tx=g.ox+3*g.U,ty=g.oy+4*g.U;ctx.fillStyle='rgba(255,220,120,'+(.45+.3*Math.sin(t*4))+')';ctx.beginPath();ctx.arc(tx,ty,g.U*.45,0,7);ctx.fill();}
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
const BOS=new Image();BOS.src='/img/last-harvest/bosses.png?v=8';
const INT=new Image();INT.src='/img/last-harvest/interior.png?v=8';
const CIV=4;
const BLD=new Image();BLD.src='/img/last-harvest/buildings.png';
const BR={cottage:[0,0,97,92],inn:[101,0,96,106],store:[201,0,88,106],workshop:[293,0,66,81],tree:[530,0,58,76],pine:[592,0,54,72]},HOUSES=['cottage','inn','store','workshop'];
const CHARS=new Image();CHARS.src='/img/last-harvest/people.png?v=8';
const KN=new Image();KN.src='/img/last-harvest/kenney.png?v=8';
const NPC_MON={'PUMPKIN SENTINEL':9};
const MON=new Image();MON.src='/img/last-harvest/monsters.png?v=8';
const GENS=['Meadow','Orchard','Marsh','Cavern','Frostfall','Emberwood','Tempest','Crypt','Clockwork','Eclipse'],ARCH=['Slime','Bat','Beetle','Hound','Sprout','Wisp','Golem','Serpent','Crow'],BOSS=['Pumpkin Sentinel','Orchard Tyrant','Marsh Matriarch','Cavern Colossus','Frostfall Wyrm','Emberwood Behemoth','Tempest Roc','Crypt Lich King','Clockwork Titan','Eclipse Devourer'];
/* monsters.png: 10 generations (rows) x 10 (9 monsters + 1 boss). index = gen*10+slot. Higher generations are stronger. */
function monInfo(i){const g=(i/10)|0,a=i%10,boss=a===9;return{name:(boss?BOSS[g]:GENS[g]+' '+ARCH[a]).toUpperCase(),hp:Math.round((16+g*10+(boss?0:a))*(boss?2.4:1)),atk:Math.round((4+g*2)*(boss?1.5:1)),reward:Math.round((10+g*12)*(boss?4:1)),boss};}
function wildEncounter(){const g=Math.min(9,Math.floor(((state.level||1)-1)/2)),gg=Math.max(0,g-(Math.random()<.3?1:0)),i=gg*10+Math.floor(Math.random()*9),m=monInfo(i);return{id:'wild',wild:true,name:m.name,mi:i,hp:m.hp,atk:m.atk,reward:m.reward,win:[]};}
function drawMon(i,x,fy,k){if(!MON.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(Math.round(x-6*k),Math.round(fy-k),12*k,2*k);ctx.imageSmoothingEnabled=false;ctx.drawImage(MON,(i%10)*16,((i/10)|0)*16,16,16,Math.round(x-8*k),Math.round(fy-16*k),16*k,16*k);}
const KS={t:[0,0,12],f:[0,176,12],d:[0,352,12],b:[200,310,18]};
function kTile(sh,i,x,y,s=2){if(!KN.naturalWidth)return;const [ox,oy,n]=KS[sh];ctx.imageSmoothingEnabled=false;ctx.drawImage(KN,ox+(i%n)*16,oy+((i/n)|0)*16,16,16,Math.round(x),Math.round(y),16*s,16*s);}
const inGrass=P=>{const x=Math.floor(P.x/TILE),y=Math.floor(P.y/TILE);return x>=4&&x<9&&y>=19&&y<22;};
function kBlock(c,r,w,h,x,y,s){if(!KN.naturalWidth)return;ctx.imageSmoothingEnabled=false;for(let j=0;j<h;j++)for(let i=0;i<w;i++)ctx.drawImage(KN,200+(c+i)*17,(r+j)*17,16,16,Math.round(x+i*16*s),Math.round(y+j*16*s),16*s,16*s);}
const pathSet=new Set();[[0,11,48,4],[15,0,4,36],[19,14,10,2]].forEach(([x,y,w,h])=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)pathSet.add(i+','+j);});
function drawPaths(camX,camY,W,H){const P=(i,j)=>i<0||j<0||i>=MAP_W||j>=MAP_H||pathSet.has(i+','+j);for(let j=Math.max(0,Math.floor(camY/TILE));j<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);j++)for(let i=Math.max(0,Math.floor(camX/TILE));i<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);i++){if(!P(i,j))continue;const t=!P(i,j-1),b=!P(i,j+1),l=!P(i-1,j),r=!P(i+1,j);let n=25;if(t&&l)n=12;else if(t&&r)n=14;else if(b&&l)n=36;else if(b&&r)n=38;else if(t)n=13;else if(b)n=37;else if(l)n=24;else if(r)n=26;else{const q=rand(i+5,j+2);n=q<.18?39:q<.3?40:q<.4?41:25;}kTile('t',n,i*TILE,j*TILE);}}
function drawTree(x,y){const o=rand(x+3,y+9);if(o<.3){kTile('t',o<.15?27:28,x*TILE,y*TILE);return;}const a=o<.65?[3,15]:[4,16];kTile('t',a[0],x*TILE,(y-1)*TILE);kTile('t',a[1],x*TILE,y*TILE);}
const HSTY={cottage:{rt:[52,53,54],rm:[64,65,66],w:[72,73,75],win:84,door:85},inn:{rt:[52,53,54],rm:[64,65,66],w:[76,77,79],win:88,door:89},store:{rt:[48,49,50],rm:[60,61,62],w:[72,73,75],win:84,door:86},workshop:{rt:[48,49,50],rm:[60,61,62],w:[76,77,79],win:88,door:90}};
function drawBuilding(b,n){const S=HSTY[n];for(let r=0;r<b.h;r++)for(let c=0;c<b.w;c++){const e=c===0?0:c===b.w-1?2:1;let t;if(r<b.h-2)t=(r===0?S.rt:S.rm)[e];else if(r===b.h-2)t=(e===1&&c%2===1)?S.win:S.w[e];else t=c===(b.w>>1)?S.door:S.w[e];kTile('t',t,(b.x+c)*TILE,(b.y+r)*TILE);}}
function drawFarm(){for(let r=0;r<3;r++)for(let c=0;c<5;c++){const x=(28+c)*TILE,y=(25+r)*TILE;kTile('f',[48,49,49,49,51][c],x,y);kTile('f',[6,20,32,44,54][(c+r)%5],x,y);}for(let c=0;c<5;c++){const f=c===0?80:c===4?82:81;kTile('t',f,(28+c)*TILE,24*TILE);kTile('t',f,(28+c)*TILE,28*TILE);}kTile('f',120,36*TILE,26*TILE);kTile('f',122,31*TILE,30*TILE);kTile('f',96,34*TILE,24*TILE);kTile('f',85,35*TILE,25*TILE);for(let j=19;j<22;j++)for(let i=4;i<9;i++)kTile('f',65,i*TILE,j*TILE);[[18,19,19,19,20],[36,37,37,37,38],[36,37,37,37,38],[54,55,55,55,56]].forEach((row,j)=>row.forEach((t,i)=>kTile('b',t,(21+i)*TILE,(24+j)*TILE)));}
function drawGates(){for(const g of GUARDS){if(state.beaten[g.id])continue;const h=g.gate.w>=g.gate.h;for(let j=0;j<g.gate.h;j++)for(let i=0;i<g.gate.w;i++)kTile('t',h?81:59,(g.gate.x+i)*TILE,(g.gate.y+j)*TILE);(h?[[g.gate.x-1,g.gate.y],[g.gate.x+g.gate.w,g.gate.y]]:[[g.gate.x,g.gate.y-1],[g.gate.x,g.gate.y+g.gate.h]]).forEach(([a,c])=>kTile('b',88,a*TILE,c*TILE));}}
/* ===== Battles: alert -> screen wipe -> entrance -> animated turn-based fight ===== */
let battle=null,lastCam={camX:0,camY:0},FXC=null;
const $b=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp01=v=>Math.max(0,Math.min(1,v)),ease=p=>p*p*(3-2*p),rnd=n=>Math.floor(Math.random()*n);
/* --- tiny synth sound effects (WebAudio, no files needed) --- */
let AC=null;
function audio(){try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();}catch(e){}return AC;}
function tone(f,d,type,v,slide,delay){const a=audio();if(!a)return;try{const t=a.currentTime+(delay||0),o=a.createOscillator(),g=a.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);g.gain.setValueAtTime(v||.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03);}catch(e){}}
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
el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.a)pkAct(b.dataset.a);else if(b.dataset.s!==undefined)pkSkillPick(+b.dataset.s);else if(b.dataset.m)pkMenu(b.dataset.m);});
return el;}
function pkMenu(kind){const m=$b('pk-menu');if(!m||!battle)return;battle.sel=-1;
if(kind==='skills'){const list=SKILLS[state.heroClass]||SKILLS.Guardian;m.className='pk-menu sk';
m.innerHTML=list.map((s,i)=>'<button data-s="'+i+'"'+(state.mp<s.mp?' disabled':'')+'><b>'+s.n+'</b><em>'+s.mp+' MP</em></button>').join('')+'<button data-m="main" class="back">\u25C0 BACK</button>';
$b('pk-t').textContent='Choose a skill. You have '+state.mp+' / '+state.maxMp+' MP.';}
else{m.className='pk-menu';m.innerHTML='<button data-a="attack">FIGHT</button><button data-a="skill">SKILL</button><button data-a="guard">GUARD</button><button data-a="item">POTION \u00D7'+(state.potions||0)+'</button><button data-a="run">RUN</button>';$b('pk-t').textContent='What will you do?';}}
function pkSkillPick(i){if(!battle||battle.busy)return;const sk=(SKILLS[state.heroClass]||SKILLS.Guardian)[i];if(!sk)return;
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
let fk,fh;if(boss){fk=Math.max(2,Math.min(Math.floor(PH*.62/64),Math.floor(W*.44/64)));fh=64*fk;}else if(e&&e.mi!==undefined){fk=Math.max(4,Math.floor(PH*.3/16));fh=16*fk;}else if(e&&e.an!==undefined){fk=Math.max(3,Math.floor(PH*.52/56));fh=56*fk;}else{fk=Math.max(5,Math.floor(PH*.3/16));fh=16*fk;}
return{W,H,PH,hk,fk,fh,hx:W*.24,hy:PH*.96,fx:W*.7,fy:boss?PH*.72:PH*.56};}
function tween(ms,fn){return new Promise(res=>{const t0=performance.now();(function f(now){const p=clamp01((now-t0)/ms);fn(p);if(p<1&&battle)requestAnimationFrame(f);else res();})(t0);});}
function burst(x,y,n,cols,spd){const b=battle;if(!b)return;for(let i=0;i<n;i++){const a=Math.random()*6.283,v=(spd||160)*(.3+Math.random());b.parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-40,g:260,life:.5+Math.random()*.4,max:.9,c:cols[rnd(cols.length)],s:3+rnd(4)});}}
function rise(x,y,n,cols,w){const b=battle;if(!b)return;for(let i=0;i<n;i++)b.parts.push({x:x+(Math.random()-.5)*(w||60),y:y+Math.random()*10,vx:(Math.random()-.5)*20,vy:-50-Math.random()*70,g:-10,life:.8+Math.random()*.6,max:1.4,c:cols[rnd(cols.length)],s:3+rnd(3)});}
function pop(txt,x,y,c,size){battle.pops.push({t:txt,x,y,c:c||'#fff',s:size||18,age:0});}

/* --- starting a battle: ! alert -> stripe wipe -> entrance -> fight --- */
function startBattle(g){state.level=state.level||1;state.maxHp=Math.max(state.maxHp||0,state.hp,40);state.maxMp=state.maxMp||20;state.mp=state.mp??state.maxMp;state.potions=state.potions??3;state.xp=state.xp||0;state.hp=Math.max(state.hp,1);
const B=g.bi!==undefined?BOSSES[g.bi]:null,hp=B?B.hp:g.hp,atk=B?B.atk:g.atk;
battle={g,B,e:{name:g.name,hp,max:hp,atk,row:g.row,an:g.an,mi:g.mi,bi:g.bi,boss:!!B,status:{},turn:0,charging:false,enraged:false},ward:0,evade:false,guard:false,busy:true,sel:-1,phase:'alert',t0:performance.now(),last:performance.now(),
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
b.busy=true;const e=b.e;
if(a==='run'){if(b.g.wild){await pkSay('You got away safely!');pkEnd();return;}await pkSay(e.boss?'There is no escape from a boss!':'You can\u2019t run from a trainer battle!',900);pkMenu('main');b.busy=false;return;}
if(a==='guard'){b.guard=true;shieldFx();state.mp=Math.min(state.maxMp,state.mp+2);pkPanel();await pkSay('You brace yourself. (+2 MP)',700);await endRound();return;}
if(a==='item'){if(!state.potions){await pkSay('No potions left!',800);pkMenu('main');b.busy=false;return;}state.potions--;state.hp=Math.min(state.maxHp,state.hp+28);healFx(28);pkPanel();await pkSay('A potion restores 28 HP!',900);await endRound();return;}
await heroAttack(null);}
async function pkSkill(i){const b=battle;if(!b||b.busy)return;const sk=(SKILLS[state.heroClass]||SKILLS.Guardian)[i];if(!sk||state.mp<sk.mp)return;b.busy=true;state.mp-=sk.mp;pkPanel();$b('pk-menu').innerHTML='';await heroAttack(sk);}
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
const reward=B?B.reward:g.reward,xp=B?B.xp:40;state.coins+=reward;state.xp+=xp;let up=0;
while(state.xp>=state.level*100){state.xp-=state.level*100;state.level++;state.maxHp+=6;state.maxMp+=2;state.hp=state.maxHp;up++;}
state.mp=Math.min(state.maxMp,state.mp+(B?state.maxMp:5));if(B){state.hp=Math.min(state.maxHp,state.hp+Math.round(state.maxHp*.5));state.potions=(state.potions||0)+2;}
if(!g.wild)state.beaten[g.id]=true;const i=npcs.findIndex(n=>n.trainer&&n.trainer.id===g.id);if(i>=0)npcs.splice(i,1);
const extra=[];
if(B){state.stage=Math.max(state.stage||0,g.bi+1);if(g.bi<BOSSES.length-1){const nx=chapters[g.bi+1];extra.push(['CHAPTER '+(g.bi+1)+' COMPLETE',chapters[g.bi].title+' \u2014 cleared!'],['NEXT CHAPTER',nx.title+' \u00B7 '+nx.place+'. '+nx.quest+'.']);}else extra.push(['THE LAST HARVEST','The Everfeast burns bright again. Hearthvale is saved, thanks to you, '+state.name+'.']);spawnLair();}
pkEnd();
const lines=(g.win||[]).map(t=>[g.name,t]);lines.push(['REWARD','You earned '+reward+' coins'+(B?' and 2 potions':'')+(up?' and reached level '+state.level+'!':'.')]);
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
else if(e.mi!==undefined)drawMon(e.mi,fxp,fyp+bob,G.fk);else if(e.an!==undefined)drawAnime(e.an,fxp,fyp+bob,G.fk);else drawSpriteK(e.row,0,0,fxp,fyp+bob,G.fk);
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
function drawSpriteK(row,face,step,x,fy,k){if(!CHARS.complete||!CHARS.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(Math.round(x-6*k),Math.round(fy-k),12*k,2*k);ctx.imageSmoothingEnabled=false;ctx.drawImage(CHARS,(face*3+(step||0))*16,row*16,16,16,Math.round(x-8*k),Math.round(fy-16*k),16*k,16*k);}
const AIMG=new Image();AIMG.src='/img/last-harvest/anime.png?v=8';
/* anime.png: 16 anime busts 48x56: 0-2 heroes, 3 Rowan, 4 Rowan hollowed, 5 Brawn, 6 Winona, 7 Elder Maple, 8 Mara, 9 Thomas, 10 Instructor, 11 Millie, 12 Gus, 13 Piper, 14 Challenger, 15 Masked Merchant */
function drawAnime(i,x,fy,k){if(!AIMG.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(Math.round(x),Math.round(fy),18*k,3*k,0,0,7);ctx.fill();ctx.imageSmoothingEnabled=false;ctx.drawImage(AIMG,(i%8)*48,((i/8)|0)*56,48,56,Math.round(x-24*k),Math.round(fy-56*k),48*k,56*k);}
function drawSprite(row,face,step,x,y){drawSpriteK(row,face,step,x,y+8,2);}
function drawPerson(x,y,shirt,hat,name=''){if(BOSS_NPC[name]!==undefined){drawBossSprite(BOSS_NPC[name],x,y+8,2,Math.floor(performance.now()/500)%2,true);return;}const row=NPC_ROW[name]??[11,15,22,27,32][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];const t=scene==='inside'?insidePlayer:state,dx=t.x-x,dy=t.y-y;let face=0;if(Math.hypot(dx,dy)<120)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);drawSprite(row,face,0,x,y);}
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
{t:'MAPLE COTTAGE',st:4,c:11,r:8,d:5,it:[['w',0,0,2,1,2,0,0],['w',0,0,2,1,7,0,0],['i',14,14,2,2,4,0,1],['i',19,12,1,1,9,1,0],['i',23,17,1,1,0,1,1],['i',23,17,1,1,1,1,1],['i',16,8,3,2,3,4,0],['i',3,0,2,2,2,3,1],['i',0,2,1,1,2,5,1],['i',8,0,2,2,9,2,1],['i',16,0,1,1,0,6,1],['i',17,0,1,1,10,6,1]],npc:[[7,4],[3,6]]},
{t:'HEARTHVALE INN',st:1,c:16,r:9,d:8,it:[['w',0,0,2,1,1,0,0],['w',0,0,2,1,13,0,0],['i',5,12,2,2,2,0,1],['i',14,14,2,2,12,0,1],['i',22,9,1,3,14,0,1],['i',0,12,3,2,5,2,1],['i',0,12,3,2,8,2,1],['i',23,8,2,2,1,3,1],['i',16,10,3,2,6,6,0],['i',0,0,3,2,2,5,1],['i',0,0,3,2,10,5,1],['i',1,2,1,1,3,4,1],['i',1,2,1,1,11,4,1],['i',16,0,1,1,0,7,1],['i',17,0,1,1,15,7,1]],npc:[[7,1],[13,6]]},
{t:'TILLY’S GENERAL STORE',st:0,c:14,r:9,d:7,it:[['w',0,0,2,1,1,0,0],['i',5,12,2,2,3,0,1],['i',5,12,2,2,5,0,1],['i',5,12,2,2,8,0,1],['i',5,12,2,2,10,0,1],['i',0,12,3,2,1,3,1],['i',5,12,2,2,6,4,1],['i',5,12,2,2,9,4,1],['i',16,8,3,2,5,6,0],['f',85,0,1,1,12,2,1],['f',96,0,1,1,13,2,1],['f',85,0,1,1,12,6,1],['f',74,0,1,1,1,6,1],['i',16,0,1,1,0,7,1]],npc:[[2,2],[10,7]]},
{t:'ORIN’S WORKSHOP',st:3,c:9,r:7,d:4,it:[['w',0,0,2,1,6,0,0],['i',14,14,2,2,1,0,1],['t',115,0,1,1,4,1,0],['t',116,0,1,1,5,1,0],['d',74,0,1,1,3,3,1],['i',0,0,3,2,5,2,1],['d',89,0,1,1,0,5,1],['t',107,0,1,1,8,4,1],['t',107,0,1,1,8,5,1]],npc:[[2,3],[6,5]]}
];
function roomGeom(id){const R=RM[id],W=innerWidth,H=innerHeight,Z=Math.max(1,Math.min(3,Math.floor(Math.min(W*.94/(R.c*32),(H-150)/(R.r*32))))),U=32*Z,ox=Math.round((W-R.c*U)/2),oy=Math.round(120+(H-120-R.r*U)/2);return{R,Z,U,ox,oy,exitY:oy+(R.r-1)*U};}
const rcx=(g,c)=>g.ox+(c+.5)*g.U,rcy=(g,r)=>g.oy+(r+.9)*g.U;
function roomStart(id){const g=roomGeom(id);return{x:rcx(g,g.R.d),y:rcy(g,g.R.r-2)};}
function roomHit(x,y){const g=roomGeom(interiorId),R=g.R,c=Math.floor((x-g.ox)/g.U),r=Math.floor((y-g.oy)/g.U);if(c<0||c>=R.c||r<0||r>=R.r)return true;if(r===R.r-1)return c!==R.d;if(r<2)return true;if(R.it.some(i=>i[7]&&c>=i[5]&&c<i[5]+i[3]&&r>=i[6]&&r<i[6]+i[4]))return true;return R.npc.some(n=>n[0]===c&&n[1]===r);}
function personK(x,fy,name,k){const row=NPC_ROW[name]??[11,15,22,27,32][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];let face=0;if(scene==='inside'){const dx=insidePlayer.x-x,dy=insidePlayer.y-fy;if(Math.hypot(dx,dy)<k*40)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);}drawSpriteK(row,face,0,x,fy,k);}
function drawRoom(id,W,H,withNpc){const g=roomGeom(id),R=g.R,U=g.U,s=2*g.Z;px(0,0,W,H,'#1d1220');
roomShell(W,H,{wall:'#d5b88a',trim:'#49352d'},g.ox/W,g.oy/H,R.c*U/W,R.r*U/H,R.st,s,2);
px(g.ox,g.oy+(R.r-1)*U,R.c*U,U,'#2b1a24');if(INT.naturalWidth){ctx.imageSmoothingEnabled=false;ctx.drawImage(INT,0,R.st*16,16,16,g.ox+R.d*U,g.oy+(R.r-1)*U,U,U);ctx.drawImage(INT,96,R.st*16,16,16,g.ox+R.d*U,g.oy+(R.r-1)*U,U,U);}
ctx.strokeStyle='#3a2418';ctx.lineWidth=4;ctx.strokeRect(g.ox-2,g.oy-2,R.c*U+4,R.r*U+4);
const dr=i=>{const x=g.ox+i[5]*U,y=g.oy+i[6]*U;if(i[0]==='i')kBlock(i[1],i[2],i[3],i[4],x,y,s);else if(i[0]==='w')winFrame(x+U*.12,y+U*.2,i[3]*U*.76,U*.9);else kTile(i[0],i[1],x,y,s);};
R.it.filter(i=>i[0]==='w'||(!i[7]&&i[6]<2)).forEach(dr);R.it.filter(i=>!i[7]&&i[0]!=='w'&&i[6]>=2).forEach(dr);
const list=R.it.filter(i=>i[7]).map(i=>({y:g.oy+(i[6]+i[4])*U,f:()=>dr(i)}));
if(withNpc!==false)R.npc.forEach((n,k)=>{const nm=roomNPCs[id][k].name;list.push({y:rcy(g,n[1]),f:()=>personK(rcx(g,n[0]),rcy(g,n[1]),nm,s)});});
return{g,list};}
function drawInterior(W,H){ctx.clearRect(0,0,W,H);const{g,list}=drawRoom(interiorId,W,H),R=g.R,U=g.U,k=2*g.Z;
R.npc.forEach((n,i)=>{roomNPCSpots[interiorId][i]={x:rcx(g,n[0])/W,y:rcy(g,n[1])/H};});
list.push({y:insidePlayer.y,f:()=>{drawSpriteK(heroRow(),facing,walking?1+alt:0,insidePlayer.x,insidePlayer.y,k);drawGear(insidePlayer.x,insidePlayer.y,k,facing,state.heroClass);}});
list.sort((a,b)=>a.y-b.y).forEach(o=>o.f());
const vg=ctx.createRadialGradient(W/2,H*.55,H*.25,W/2,H*.55,Math.max(W,H)*.7);vg.addColorStop(0,'rgba(255,220,150,0)');vg.addColorStop(1,'rgba(30,12,10,.4)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
ctx.fillStyle=C.cream;ctx.font='bold 15px ui-monospace';ctx.textAlign='center';ctx.fillText(R.t,W/2,g.oy-16);
let tg=-1,dist=Infinity;R.npc.forEach((n,i)=>{const d=Math.hypot(insidePlayer.x-rcx(g,n[0]),insidePlayer.y-rcy(g,n[1]));if(d<U*3.3&&d<dist){tg=i;dist=d;}});
if(tg>=0)drawWorldPrompt(rcx(g,R.npc[tg][0]),rcy(g,R.npc[tg][1])-U*1.05,'E · TALK');else if(insidePlayer.y>g.exitY)drawWorldPrompt(rcx(g,R.d),g.oy+(R.r-1)*U-6,'E · EXIT');}
function drawWorldPrompt(x,y,label){const w=Math.max(66,label.length*7+22),h=22;ctx.fillStyle='#26334a';ctx.fillRect(Math.round(x-w/2-2),Math.round(y-h-2),w+4,h+4);ctx.fillStyle='#f3e6bf';ctx.fillRect(Math.round(x-w/2),Math.round(y-h),w,h);ctx.fillStyle='#26334a';ctx.font='bold 10px ui-monospace';ctx.textAlign='center';ctx.fillText(label,x,y-7);}
function drawPlayer(x,y){drawSprite(heroRow(),facing,walking?1+alt:0,x,y);drawGear(x,y+8,2,facing,state.heroClass);}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];const speaker=line[0]==='NARRATOR'?'ROWAN':line[0];$('lh-speaker').textContent=speaker;typeText(line[1]);drawDialoguePortrait(speaker);$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
function drawDialoguePortrait(name){
const c=$('lh-portrait'),p=c.getContext('2d');p.clearRect(0,0,64,64);p.fillStyle='#26334a';p.fillRect(0,0,64,64);
const AN={ROWAN:3,'ELDER MAPLE':7,MARA:8,THOMAS:9,INSTRUCTOR:10,MILLIE:11,GUS:12,PIPER:13,'GATEKEEPER BRAWN':5,'GATEKEEPER WINONA':6,CHALLENGER:14,YOU:({Guardian:0,Scout:1,Mage:2})[state.heroClass]??0}[name];if(AN!==undefined&&AIMG.naturalWidth){p.imageSmoothingEnabled=false;p.drawImage(AIMG,(AN%8)*48,((AN/8)|0)*56,48,56,8,6,48,56);return;}
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
function positionSpeechBubble(){}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function typeText(t){clearInterval(typer);fullText=t;typing=true;const el=$('lh-dialogue-text');let i=0;el.textContent='';typer=setInterval(()=>{el.textContent=t.slice(0,++i);if(i>=t.length)finishType();},24);}
function finishType(){clearInterval(typer);typing=false;$('lh-dialogue-text').textContent=fullText;}
function advanceDialogue(){if(!dialogue)return;if(typing){finishType();return;}dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function enterBuilding(id){if(transitioning||scene!=='outside')return;transitioning=true;const doors=[{x:10.5*TILE,y:10.55*TILE},{x:34*TILE,y:10.55*TILE},{x:22*TILE,y:22.55*TILE},{x:5.5*TILE,y:29.55*TILE}],door=doors[id],from={x:state.x,y:state.y},start=performance.now(),duration=620;function walk(now){const p=Math.min(1,(now-start)/duration),ease=p*p*(3-2*p);state.x=from.x+(door.x-from.x)*ease;state.y=from.y+(door.y-from.y)*ease;playerFrame+=.45;if(p<1)requestAnimationFrame(walk);else{interiorId=id;scene='inside';insideTalked=false;insidePlayer=roomStart(id);facing=1;updateHud();save();setTimeout(()=>{transitioning=false;},180);}}requestAnimationFrame(walk);}
let transitioning=false,insidePlayer={x:innerWidth/2,y:innerHeight*.76};
function interact(){if(transitioning||battle)return;if(scene==='inside'){if(dialogue){advanceDialogue();return;}const W=innerWidth,H=innerHeight,pxp=insidePlayer.x,pyp=insidePlayer.y;let target=null,dist=Infinity;for(let i=0;i<roomNPCs[interiorId].length;i++){const n=roomNPCs[interiorId][i],spot=roomNPCSpots[interiorId][i];const d=Math.hypot(pxp-W*spot.x,pyp-H*spot.y);if(d<roomGeom(interiorId).U*3.3&&d<dist){target=n;dist=d;}}if(target){if(target.name==='INNKEEPER BRAM'){state.hp=Math.max(state.maxHp||state.hp,state.hp);state.mp=state.maxMp||state.mp;updateHud();save();target={...target,lines:[...target.lines,'You look worn out. Rest a moment... there, good as new!']};}setDialogue(target.lines.map(t=>[target.name,t]));if(interiorId===3&&target.name==='OLD CRAFTSMAN ORIN'&&questStep<3){questStep=3;updateQuest();}return;}if(pyp>roomGeom(interiorId).exitY){scene='outside';state.x=([10.5,34,22,5.5][interiorId])*TILE;state.y=([10.9,10.9,22.9,29.9][interiorId])*TILE;updateHud();save();return;}setDialogue([['ROWAN','There is no one close enough to talk to. Walk up to someone and press INTERACT.']]);return;}if(dialogue){advanceDialogue();return;}if(cinematic)return;if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<64&&d<dist){found=n;dist=d;}}
if(found){
if(found.trainer&&!state.beaten[found.trainer.id]){setDialogue(found.lines.map(t=>[found.name,t]),()=>startBattle(found.trainer));return;}
if(found.name==='ELDER MAPLE'&&questStep===0){questStep=1;setDialogue([[found.name,'First, visit the village homes. Your parents may have left a clue.'],['QUEST UPDATED','Visit the homes around the village.']]);}
else if(found.name==='ROWAN'&&questStep===1){questStep=2;setDialogue([[found.name,'I will check the fountain. You should search the buildings.'],['QUEST UPDATED','Enter a building and look for clues.']]);}
else setDialogue(found.lines.map(t=>[found.name,t]));
save();updateQuest();return;}
const doors=[{x:10.5,y:10.5,id:0},{x:34,y:10.5,id:1},{x:22,y:22.5,id:2},{x:5.5,y:29.5,id:3}];for(const d of doors){if(Math.hypot(state.x-d.x*TILE,state.y-d.y*TILE)<82){enterBuilding(d.id);return;}}
const sx=27*TILE,sy=10*TILE;if(Math.hypot(state.x-sx,state.y-sy)<75){setDialogue([['OLD SIGN','AUTUMNWOOD — follow the golden leaves beyond the village.'],['QUEST','Explore Hearthvale and speak with the villagers. The road north-east leads to your first chapter.']]);return;}
setDialogue([['ROWAN','The wind smells like cinnamon and fallen leaves. Maybe there is something nearby.']]);}
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
const won=await new Promise(res=>startBattle({id:'friendly',name:'ROWAN',an:3,friendly:true,hp:42,atk:5,reward:0,win:[],onEnd:res}));
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
cinematic=null;document.body.classList.remove('lh-cinematic');scene='outside';state.x=10*TILE+16;state.y=12*TILE+24;state.seenIntro=true;questStep=0;updateQuest();save();
})();
}

function areaName(){return(state.stage>0&&state.y>=31*TILE)?chapters[Math.min(state.stage,9)].place:chapters[0].place;}
function updateQuest(){if(state.beaten&&state.beaten.south){const i=Math.min(state.stage||0,BOSSES.length-1);$('lh-quest-text').textContent=(state.beaten['boss'+i]||(state.stage||0)>=BOSSES.length)?'Hearthvale is saved!':'Defeat the '+BOSSES[i].name+' on the south road';return;}const q=['Speak with Elder Maple','Visit Rowan in the village square','Enter a building and search for clues','Return to Elder Maple with what you found','Follow the golden leaves beyond the village'];$('lh-quest-text').textContent=q[Math.min(questStep,q.length-1)];}
function updateHud(){ $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-health').textContent=state.hp;$('lh-coins').textContent=state.coins;$('lh-location').textContent=scene==='inside'?['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]:areaName().toUpperCase();updateQuest();}
function move(dt){walking=false;const ins=scene==='inside',P=ins?insidePlayer:state;
if(stepper){stepper.t+=dt/.19;const e=Math.min(1,stepper.t);P.x=stepper.fx+(stepper.tx-stepper.fx)*e;P.y=stepper.fy+(stepper.ty-stepper.fy)*e;walking=true;if(stepper.t<1)return;P.x=stepper.tx;P.y=stepper.ty;stepper=null;alt^=1;if(!ins){const an=areaName();if(an!==lastArea){lastArea=an;updateHud();}}if(!ins&&++stepCount%4===0)save();if(!ins&&!battle&&!dialogue&&inGrass(P)&&Math.random()<.14){startBattle(wildEncounter());}}
if(battle||dialogue||cinematic||transitioning||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;
if(!ins){P.x=Math.floor(P.x/TILE)*TILE+16;P.y=Math.floor(P.y/TILE)*TILE+24;}
let dx=joystick.x,dy=joystick.y;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;
if(Math.abs(dx)<.35&&Math.abs(dy)<.35){turnWait=0;return;}
const f=Math.abs(dx)>=Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
if(f!==facing){facing=f;turnWait=.09;return;}
if(turnWait>0){turnWait-=dt;return;}
const SS=ins?roomGeom(interiorId).U:TILE,nx=P.x+[0,0,-1,1][f]*SS,ny=P.y+[1,-1,0,0][f]*SS;
const hit=ins?roomHit(nx,ny):(blocked(nx,ny)||npcs.some(n=>Math.floor(n.x/TILE)===Math.floor(nx/TILE)&&Math.floor(n.y/TILE)===Math.floor(ny/TILE)));
if(hit)return;stepper={fx:P.x,fy:P.y,tx:nx,ty:ny,t:0};walking=true;}
function loop(t){const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;move(dt);lastCam=drawWorld();drawBattleFx(innerWidth,innerHeight);if(dialogue)positionSpeechBubble(dialogue[dialogueIndex][0]);requestAnimationFrame(loop);}
requestAnimationFrame(loop);
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='e'||e.key==='E'||e.key===' '){if(!e.repeat)interact();return;}keys[e.key]=true;});
addEventListener('keyup',e=>{keys[e.key]=false;});
const joy=$('lh-joystick'),stick=$('lh-stick');let joyPointer=null;
function setJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy),scale=len>max?max/len:1;joystick.x=(dx*scale)/max;joystick.y=(dy*scale)/max;stick.style.transform='translate('+joystick.x*34+'px,'+joystick.y*34+'px)';}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)setJoy(e);});
function releaseJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;joystick.x=joystick.y=0;stick.style.transform='translate(0,0)';}
joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
canvas.addEventListener('pointerup',e=>{if(dialogue){advanceDialogue();return;}interact();});
$('lh-next').addEventListener('click',advanceDialogue);
document.querySelectorAll('#lh-school-class .lh-class').forEach(b=>b.addEventListener('click',()=>{$('lh-school-class').querySelectorAll('.lh-class').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');}));
$('lh-school-confirm').addEventListener('click',()=>{const selected=$('lh-school-class').querySelector('.lh-class.selected');state.heroClass=selected.dataset.class;state.hp=state.heroClass==='Guardian'?50:state.heroClass==='Mage'?36:40;$('lh-school-class').hidden=true;updateHud();save();if(window.__lhClassChosen){const done=window.__lhClassChosen;window.__lhClassChosen=null;done();}});
$('lh-begin').addEventListener('click',startIntro);
$('lh-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')startIntro();});
function renderRpgMenu(tab='status'){
  document.querySelectorAll('[data-rpg-tab]').forEach(b=>b.classList.toggle('active',b.dataset.rpgTab===tab));
  const panel=$('lh-rpg-content'),chapter=chapters[Math.min(state.stage,9)];
  if(tab==='status'){
    panel.innerHTML='<h3>ADVENTURER STATUS</h3><div class="lh-rpg-stat-grid">'+
      '<div class="lh-rpg-stat"><b>NAME</b>'+escapeMenuText(state.name||'Adventurer')+'</div>'+
      '<div class="lh-rpg-stat"><b>PATH</b>'+escapeMenuText(state.heroClass||'Guardian')+'</div>'+
      '<div class="lh-rpg-stat"><b>HEALTH</b>'+Number(state.hp||0)+'</div>'+
      '<div class="lh-rpg-stat"><b>COINS</b>'+Number(state.coins||0)+'</div>'+
      '<div class="lh-rpg-stat"><b>CHAPTER</b>'+(Number(state.stage)+1)+' / 10</div>'+
      '<div class="lh-rpg-stat"><b>LOCATION</b>'+escapeMenuText(chapter.place)+'</div></div>';
  }else if(tab==='bag'){
    const kit={Guardian:['Harvest Longsword — weapon','Oak Kite Shield — offhand','Steel Plate Armor — armor'],Scout:['Hunter’s Longbow — weapon','Leaf-Stitched Quiver — offhand','Ranger Leather Armor — armor'],Mage:['Amber Orb Staff — weapon','Spellbound Mantle — armor']}[state.heroClass]||[];const items=[...kit,...(Array.isArray(state.inventory)?state.inventory:[])];
    panel.innerHTML='<h3>ADVENTURER’S BAG</h3>'+(items.length?items.map(item=>'<p>• '+escapeMenuText(typeof item==='string'?item:(item.name||'Unknown item'))+'</p>').join(''):'<div class="lh-rpg-empty">Your bag is empty for now.<br>Supplies and treasures you discover will appear here.</div>');
  }else if(tab==='map'){
    const rows=['FFFFFFFFFFFF','FHH...F...HF','FHH...F...HF','pppppppppppp','...ppp......','...ppp......','HHH.ppp.....','HHH.ppp.....','FFFFFFFFFFFF'];
    const mx=Math.max(0,Math.min(11,Math.floor(state.x/TILE/4))),my=Math.max(0,Math.min(8,Math.floor(state.y/TILE/4)));
    const cells=rows.map((line,y)=>Array.from(line).map((cell,x)=>'<span class="lh-map-cell '+({F:'forest',H:'building',p:'path','.':'grass'}[cell]||'grass')+(x===mx&&y===my?' player':'')+'"'+(x===mx&&y===my?' aria-label="Your location" title="You are here"':'')+'></span>').join('')).join('');
    panel.innerHTML='<h3>HEARTHVALE VILLAGE MAP</h3><div class="lh-map-grid" role="img" aria-label="Map of Hearthvale Village. Your position is marked in gold.">'+cells+'</div><div class="lh-map-legend"><span><i class="forest"></i> Woods</span><span><i class="building"></i> Buildings</span><span><i class="path"></i> Roads</span><span><i class="player"></i> You</span></div><p class="lh-map-note">A field sketch of the village. Explore the roads to find homes, shops, and familiar faces.</p>';
  }else{
    panel.innerHTML='<h3>JOURNAL · '+escapeMenuText(chapter.title.toUpperCase())+'</h3><p><b>Current objective:</b> '+escapeMenuText(chapter.quest)+'</p><p><b>Region:</b> '+escapeMenuText(chapter.place)+'</p><p><b>Story progress:</b> Chapter '+(Number(state.stage)+1)+' of 10</p><p>Revisit Hearthvale’s people and places to uncover clues about the Everfeast.</p>';
  }
}
function escapeMenuText(value){return String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
$('lh-menu').addEventListener('click',()=>{$('lh-game-menu').hidden=false;renderRpgMenu('status');});
document.querySelectorAll('[data-rpg-tab]').forEach(b=>b.addEventListener('click',()=>renderRpgMenu(b.dataset.rpgTab)));
$('lh-resume').addEventListener('click',()=>{$('lh-game-menu').hidden=true;});
$('lh-reset').addEventListener('click',()=>{if(confirm('Start a new adventure? Your saved progress on this device will be replaced.')){localStorage.removeItem(SAVE);location.reload();}});
if(state.name){$('lh-create').hidden=true;updateHud();}else{$('lh-create').hidden=false;}
if(!state.seenIntro&&state.name){$('lh-create').hidden=false;}
})();
