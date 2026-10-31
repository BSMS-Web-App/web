/* THE LAST HARVEST — full-screen top-down pixel adventure */
(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('lh-world'),ctx=canvas.getContext('2d'),SAVE='last_harvest_adventure_v4';
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
const solids=[{x:7,y:5,w:7,h:5},{x:30,y:5,w:8,h:5},{x:18,y:17,w:8,h:5},{x:3,y:25,w:5,h:4}];
function blocked(x,y){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);if(tileAt(tx,ty))return true;for(const b of solids)if(tx>=b.x&&tx<b.x+b.w&&ty>=b.y&&ty<b.y+b.h)return true;for(const t of trees)if(Math.hypot(x-(t.x*TILE+16),y-(t.y*TILE+18))<20)return true;return false;}
const trees=[];for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){const edge=x<4||y<3||x>MAP_W-5||y>MAP_H-5;const inBuilding=solids.some(b=>x>=b.x-1&&x<b.x+b.w+1&&y>=b.y-1&&y<b.y+b.h+1);const onRoad=(y>=11&&y<15)||(x>=15&&x<19);if(edge&&!inBuilding&&!onRoad&&rand(x,y)>.18)trees.push({x,y});}
const npcs=[{x:16*TILE,y:12*TILE,name:'ELDER MAPLE',color:'#b8c7a1',lines:['The village square feels colder today. Your parents were last seen near the fountain.','The Everfeast is older than Hearthvale. Find the truth, not just the missing keepers.']},{x:22*TILE,y:13*TILE,name:'ROWAN',color:'#bb6542',lines:['I will come with you. We have been friends forever—trust me.','The woods are full of strange creatures. Keep your guard up.']},{x:14*TILE,y:16*TILE,name:'MILLIE',color:'#d9a0a5',lines:['I run the village flower stall. The golden leaves have been falling the wrong way today.','Your mother used to buy marigolds every Harvest Eve.']},{x:25*TILE,y:16*TILE,name:'GUS',color:'#668db4',lines:['I keep the village well clean. Last night, I heard footsteps by the north road.','Someone dropped a torn piece of a royal-looking banner near the fountain.']},{x:29*TILE,y:12*TILE,name:'PIPER',color:'#d1ad53',lines:['I saw Rowan speaking to a cloaked stranger. Maybe it was nothing…','Please be careful out there, okay?']}];
const roomNPCs=[
[{x:.35,y:.57,name:'MARA THE NEIGHBOR',color:'#bd6f68',lines:['I heard a commotion near the fountain before sunrise.','Your parents always helped everyone in Hearthvale. We will find them.']},{x:.68,y:.48,name:'JUNIPER',color:'#658b65',lines:['I brought Elder Maple some fresh bread.','There were muddy footprints on the cottage step this morning.']}],
[{x:.34,y:.56,name:'INNKEEPER BRAM',color:'#b47a45',lines:['Welcome, traveler. The inn is usually full this time of year.','A hooded guest checked out before dawn and left this behind.']},{x:.68,y:.48,name:'NELL THE TRAVELER',color:'#6589a9',lines:['I came from the eastern road. Something is stirring in Autumnwood.','Keep to the stone path if you leave town.']}],
[{x:.34,y:.56,name:'SHOPKEEPER TILLY',color:'#b95c49',lines:['Welcome to Tilly’s General Store! I sell supplies for the road.','Your parents bought a healing tonic here yesterday. They seemed worried.']},{x:.68,y:.48,name:'FINN',color:'#5d8b63',lines:['I help stock the shelves. Someone took all the lantern oil last night.','I found a strange black feather by the back door.']}],
[{x:.34,y:.56,name:'OLD CRAFTSMAN ORIN',color:'#7885a7',lines:['Your parents asked me to keep this old map safe.','The symbol on it matches the seal beneath the village fountain.']},{x:.68,y:.48,name:'WREN THE APPRENTICE',color:'#bd8c53',lines:['I am learning to repair tools. The workshop has been busy lately.','Orin knows more about the Everfeast than he lets on.']}]
];
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
const tileAtlas=(()=>{const a=document.createElement('canvas');a.width=192;a.height=32;const g=a.getContext('2d');g.imageSmoothingEnabled=false;
 const tiles=[
  {base:'#75b66a',shade:'#68a75f',light:'#91ce79',accent:'#e7ca70',kind:0},
  {base:'#70ad65',shade:'#609f59',light:'#86c477',accent:'#d8c36b',kind:0},
  {base:'#7bb96e',shade:'#6ba962',light:'#a0d27c',accent:'#e4bd62',kind:1},
  {base:'#689f61',shade:'#568d55',light:'#83ba6d',accent:'#c9a85c',kind:2},
  {base:'#82b96d',shade:'#70a65e',light:'#a6ce7b',accent:'#f0d18a',kind:1},
  {base:'#6da76b',shade:'#5d965e',light:'#91c17b',accent:'#d9b65f',kind:2}
 ];
 tiles.forEach((t,i)=>{const ox=i*32;g.fillStyle=t.base;g.fillRect(ox,0,32,32);
  for(let y=3;y<32;y+=7)for(let x=2;x<32;x+=8){g.fillStyle=((x+y+i)%3===0)?t.shade:t.light;g.fillRect(ox+x,y,2,2);}
  if(t.kind===1){g.fillStyle=t.accent;g.fillRect(ox+7,8,3,3);g.fillRect(ox+10,11,2,2);g.fillRect(ox+23,22,3,3);g.fillRect(ox+21,20,2,2);}
  if(t.kind===2){g.fillStyle='#c18b48';g.fillRect(ox+5,5,3,2);g.fillRect(ox+18,15,3,2);g.fillRect(ox+25,6,2,3);g.fillStyle=t.accent;g.fillRect(ox+13,24,3,3);}
  if(i===4){g.fillStyle='#b97845';g.fillRect(ox+4,17,5,2);g.fillRect(ox+22,5,4,2);}
 });
 return a;
})();
function drawTree(x,y){const X=x*TILE,Y=y*TILE;
px(X+12,Y+17,9,16,'#68452e');px(X+9,Y+25,15,5,'#4c392b');
px(X+2,Y+7,28,18,'#286344');px(X+5,Y+1,22,19,'#347e4b');px(X+9,Y-3,14,13,'#48a65a');
px(X+6,Y+5,7,6,'#78c96b');px(X+19,Y+3,6,7,'#70c66a');px(X+2,Y+15,7,6,'#3e9853');px(X+21,Y+15,7,5,'#2d7548');
px(X+13,Y+7,4,3,'#a4d978');}
function drawFlower(x,y,color='#e6b95d'){const X=x*TILE,Y=y*TILE;px(X+14,Y+18,3,9,'#39794b');px(X+9,Y+23,12,3,'#39794b');px(X+10,Y+11,5,5,color);px(X+17,Y+11,5,5,color);px(X+10,Y+17,5,5,color);px(X+17,Y+17,5,5,color);px(X+14,Y+14,4,4,'#f7e6a0');}
function drawBush(x,y){const X=x*TILE,Y=y*TILE;px(X+3,Y+14,26,13,'#24583c');px(X+1,Y+8,14,16,'#347e4b');px(X+15,Y+6,16,18,'#286b43');px(X+7,Y+4,12,13,'#4ca45a');px(X+8,Y+8,5,4,'#8acb68');px(X+21,Y+11,4,4,'#75bd5d');}
function drawLamp(x,y){const X=x*TILE,Y=y*TILE;px(X+14,Y+9,4,23,'#574638');px(X+9,Y+6,14,3,'#574638');px(X+10,Y-1,12,12,'#5a4637');px(X+12,Y+1,8,8,'#f3d88b');px(X+13,Y+2,6,6,'#fff1b4');}
function drawBench(x,y){const X=x*TILE,Y=y*TILE;px(X+4,Y+12,24,7,'#68452e');px(X+5,Y+10,22,4,'#b87942');px(X+7,Y+19,3,8,'#4c392b');px(X+22,Y+19,3,8,'#4c392b');}
function drawPumpkin(x,y){const X=x*TILE,Y=y*TILE;px(X+8,Y+13,17,13,'#b95f32');px(X+5,Y+16,23,8,'#d77b37');px(X+12,Y+9,9,5,'#e69a43');px(X+15,Y+6,4,5,'#477447');px(X+11,Y+17,2,4,'#713e2c');px(X+20,Y+17,2,4,'#713e2c');}
function drawRock(x,y){const X=x*TILE,Y=y*TILE;px(X+7,Y+13,18,12,'#64747a');px(X+11,Y+8,11,8,'#87969a');px(X+12,Y+10,5,3,'#bac2b6');px(X+8,Y+22,16,3,'#4b5b60');}
function drawSign(x,y,label){const X=x*TILE,Y=y*TILE;px(X+14,Y+12,4,18,'#68452e');px(X+3,Y+4,26,12,'#68452e');px(X+5,Y+6,22,8,'#e1c17c');ctx.fillStyle='#62452e';ctx.font='bold 6px ui-monospace';ctx.textAlign='center';ctx.fillText(label,X+16,Y+12);}
function drawFence(x,y,len=3){for(let i=0;i<len;i++){const X=(x+i)*TILE,Y=y*TILE;px(X+5,Y+10,4,21,'#68452e');px(X+21,Y+10,4,21,'#68452e');px(X+3,Y+12,24,5,'#b77a43');px(X+3,Y+22,24,4,'#95613a');}}
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
function drawWorld(){const W=innerWidth,H=innerHeight;if(cinematic&&cinematic.phase==='dream'){drawDreamScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='wake'){drawWakeScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='school'){drawSchoolScene(W,H);return{camX:0,camY:0};}if(scene==='inside'){drawInterior(W,H);return{camX:0,camY:0};}
const focus=cinematic?cinematic.camera:{x:state.x,y:state.y};const camX=Math.max(0,Math.min(MAP_W*TILE-W,focus.x-W/2)),camY=Math.max(0,Math.min(MAP_H*TILE-H,focus.y-H/2));
ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.floor(camX),-Math.floor(camY));
for(let y=Math.max(0,Math.floor(camY/TILE));y<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);y++)for(let x=Math.max(0,Math.floor(camX/TILE));x<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);x++){
const tileRoll=rand(x+41,y+17);const tileIndex=tileRoll<.43?0:tileRoll<.62?1:tileRoll<.77?2:tileRoll<.88?3:tileRoll<.96?4:5;ctx.drawImage(tileAtlas,tileIndex*32,0,32,32,x*TILE,y*TILE,TILE,TILE);}
/* Broad stone paths with alternating diamond-like paving and dark grout */
function path(x,y,w,h){px(x,y,w,h,C.pathShade);for(let yy=y+2;yy<y+h-2;yy+=24)for(let xx=x+2;xx<x+w-2;xx+=32){px(xx,yy,29,21,C.path2);px(xx+2,yy+2,25,17,C.path);px(xx+14,yy+2,2,17,'#aab9b5');px(xx+2,yy+9,25,2,'#e5e5d3');}}
path(0,11*TILE,MAP_W*TILE,4*TILE);path(15*TILE,0,4*TILE,MAP_H*TILE);path(19*TILE,14*TILE,10*TILE,2*TILE);
// Background trees render before buildings so trunks/canopies cannot cover roofs or doors.
for(const t of trees)drawTree(t.x,t.y);
drawHouse(solids[0],'#c18a43');drawHouse(solids[1],'#8e5940');drawHouse(solids[2],'#a64e37');drawHouse(solids[3],'#c18a43');
// Props are placed only in clear grass pockets: never on roads, building footprints, or the fountain.
function clearPropTile(tx,ty){const onRoad=(ty>=11&&ty<15)||(tx>=15&&tx<19)||(tx>=19&&tx<29&&ty>=14&&ty<16);const inHouse=solids.some(b=>tx>=b.x-1&&tx<b.x+b.w+1&&ty>=b.y-1&&ty<b.y+b.h+1);const nearFountain=tx>=17&&tx<=22&&ty>=11&&ty<=14;return !onRoad&&!inHouse&&!nearFountain&&tx>2&&tx<MAP_W-3&&ty>2&&ty<MAP_H-3;}
const props=[
['bush',11,8],['flower',15,8],['bush',27,8],['flower',39,8],['lamp',5,17],['bush',11,18],['flower',28,18],['lamp',33,18],['pumpkin',13,20],['rock',37,20],['bench',9,16],['bench',39,16],['bush',12,23],['flower',15,23],['bush',29,23],['flower',34,24],['lamp',10,27],['lamp',37,27],['rock',14,29],['pumpkin',32,29]
];
for(const [kind,x,y] of props){if(!clearPropTile(x,y))continue;({bush:drawBush,flower:drawFlower,lamp:drawLamp,bench:drawBench,pumpkin:drawPumpkin,rock:drawRock})[kind](x,y);}
drawFence(3,22,3);drawFence(41,22,3);
/* fountain, sign and village details */
px(18*TILE,12*TILE,3*TILE,2*TILE,'#536a78');px(18*TILE+5,12*TILE+4,3*TILE-10,34,'#b5d1c9');px(18*TILE+12,12*TILE+8,42,25,'#5cabb4');px(18*TILE+20,12*TILE-7,26,10,'#e8e6cf');px(18*TILE+29,12*TILE-3,8,5,'#7dc9cf');
px(27*TILE,10*TILE,5,30,C.wood);px(27*TILE-15,10*TILE,38,14,C.gold);px(27*TILE-10,10*TILE+4,26,3,C.wood);
for(const n of npcs){const a=cinematic&&cinematic.actors[n.name];drawPerson(a?a.x:n.x,a?a.y:n.y,n.color,n.name==='ROWAN'?'#9b4a36':'#637b55',n.name);}
if(cinematic&&cinematic.actors.CHAMPION){const a=cinematic.actors.CHAMPION;drawPerson(a.x,a.y,'#d5b64e','#e8bd58');}
drawPlayer(state.x,state.y);
let promptTarget=null,promptDist=Infinity,promptLabel='E · TALK';
for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<104&&d<promptDist){promptTarget=n;promptDist=d;promptLabel='E · TALK';}}
const doors=[{x:10.5,y:10.5},{x:34,y:10.5},{x:22,y:22.5},{x:5.5,y:29.5}];
for(const d of doors){const wx=d.x*TILE,wy=d.y*TILE,dd=Math.hypot(state.x-wx,state.y-wy);if(dd<112&&dd<promptDist){promptTarget={x:wx,y:wy};promptDist=dd;promptLabel='E · ENTER';}}
const signDist=Math.hypot(state.x-27*TILE,state.y-10*TILE);if(signDist<100&&signDist<promptDist){promptTarget={x:27*TILE,y:10*TILE};promptLabel='E · READ';}
if(promptTarget)drawWorldPrompt(promptTarget.x,promptTarget.y-30,promptLabel);
ctx.restore();return{camX,camY};}
function drawCutscenePerson(x,y,shirt,hat,scale=1.75){
const z=scale;px(x-10*z,y+6*z,20*z,6*z,'#352f3b');px(x-7*z,y+10*z,5*z,7*z,'#3d4050');px(x+2*z,y+10*z,5*z,7*z,'#3d4050');
px(x-10*z,y-9*z,20*z,17*z,C.ink);px(x-8*z,y-8*z,16*z,14*z,shirt);px(x-12*z,y-5*z,4*z,10*z,C.skin);px(x+8*z,y-5*z,4*z,10*z,C.skin);
px(x-7*z,y-23*z,14*z,14*z,C.skin);px(x-9*z,y-27*z,18*z,6*z,C.ink);px(x-7*z,y-30*z,14*z,5*z,hat);px(x-6*z,y-17*z,3*z,3*z,C.ink);px(x+3*z,y-17*z,3*z,3*z,C.ink);
}
function drawCutscenePlayer(x,y,scale=1.75){
drawCutscenePerson(x,y,state.heroClass==='Mage'?'#6658a5':state.heroClass==='Scout'?'#4c8955':'#b94b38',state.heroClass==='Mage'?'#6554a5':state.heroClass==='Scout'?'#4a8a54':'#c44736',scale);
}
function drawDreamScene(W,H){px(0,0,W,H,'#49345f');for(let i=0;i<14;i++){px(i*W/14,0,W/14,H*.24,i%2?'#bd874e':'#e2b95c');px(i*W/14,H*.24,W/14,H*.1,'#7b4b68');}px(0,H*.34,W,H*.66,'#704b36');px(0,H*.76,W,H*.24,'#c18b49');for(let i=0;i<12;i++){const x=i*W/11;drawPerson(x,H*.38,'#6b9c70','#d8b86a');}px(W*.2,H*.55,W*.6,H*.26,'#9b633d');px(W*.22,H*.57,W*.56,H*.22,'#c18a48');const a=cinematic.actors;drawCutscenePerson(a.MARA.x,a.MARA.y,'#b86c78','#70485c',1.65);drawCutscenePerson(a.THOMAS.x,a.THOMAS.y,'#577f9b','#4a536e',1.65);drawCutscenePerson(a.ROWAN.x,a.ROWAN.y,'#bb6542','#9b4a36',1.65);drawCutscenePlayer(a.HERO.x,a.HERO.y,1.8);drawCutscenePerson(a.FOE.x,a.FOE.y,'#7d526f','#45364e',2.05);ctx.fillStyle='#fff2c7';ctx.font='bold 22px ui-monospace';ctx.textAlign='center';ctx.fillText('HARVEST FESTIVAL CHAMPIONSHIP',W/2,H*.12);ctx.font='bold 14px ui-monospace';ctx.fillText('THE CROWD IS CHEERING FOR YOU!',W/2,H*.2);ctx.fillStyle='#fff2c7';ctx.font='bold 13px ui-monospace';ctx.fillText('CHALLENGER',a.FOE.x,a.FOE.y-58);}
function drawSchoolScene(W,H){
px(0,0,W,H,'#7eb6b0');px(0,H*.68,W,H*.32,'#719b60');
px(W*.08,H*.18,W*.84,H*.55,'#d8c99d');px(W*.08,H*.15,W*.84,H*.12,'#7d5742');px(W*.11,H*.18,W*.78,H*.07,'#a85f3d');
px(W*.43,H*.25,W*.14,H*.2,'#314b5d');px(W*.45,H*.27,W*.1,H*.16,'#a8d4d5');
for(let i=0;i<4;i++){px(W*(.16+i*.19),H*.42,W*.12,H*.12,'#80563d');px(W*(.17+i*.19),H*.43,W*.1,H*.08,'#d4ad70');}
px(W*.44,H*.55,W*.12,H*.08,'#61452f');px(W*.46,H*.52,W*.08,H*.05,'#e2c27d');
drawCutscenePlayer(W*.43,H*.68,1.7);drawCutscenePerson(W*.57,H*.68,'#bb6542','#9b4a36',1.7);
ctx.fillStyle='#fff2c7';ctx.font='bold 20px ui-monospace';ctx.textAlign='center';ctx.fillText('HEARTHVALE SCHOOL',W/2,H*.1);
}
function drawWakeScene(W,H){
const fy=H*.31;px(0,0,W,H,'#493b49');px(0,0,W,fy,'#8d7780');
for(let x=0;x<W;x+=Math.max(70,W*.09)){px(x,0,4,fy,'#78616e');px(x+4,0,2,fy,'#a58b8d');}
px(0,fy,W,8,'#4e3940');
for(let y=fy+8;y<H;y+=32){px(0,y,W,29,(Math.floor(y/32)%2)?'#a97853':'#b9855d');px(0,y+28,W,4,'#80513b');for(let x=(Math.floor(y/32)%2)*42;x<W;x+=84)px(x,y,2,29,'#986542');}
px(W*.06,H*.09,W*.2,H*.23,'#343d54');px(W*.075,H*.105,W*.17,H*.195,'#6caab8');px(W*.155,H*.105,5,H*.195,'#ead8ad');px(W*.075,H*.2,W*.17,5,'#ead8ad');
px(W*.38,H*.11,W*.2,H*.09,'#694b48');px(W*.395,H*.125,W*.17,H*.06,'#bd8b62');px(W*.43,H*.135,W*.1,H*.04,'#e2c58d');
px(W*.07,H*.39,W*.17,H*.25,'#634333');px(W*.085,H*.41,W*.14,H*.21,'#8e5e3d');for(let i=0;i<3;i++){px(W*.095,H*(.44+i*.055),W*.12,H*.012,'#d5ae75');px(W*(.11+i*.04),H*(.42+i*.055),W*.025,H*.03,['#a94f3e','#5b8b64','#d0a34d'][i]);}
px(W*.77,H*.4,W*.14,H*.23,'#76503a');px(W*.785,H*.415,W*.11,H*.2,'#b37c4c');px(W*.8,H*.39,W*.08,H*.025,'#e1bd80');
px(W*.2,H*.68,W*.6,H*.2,'#75443c');px(W*.22,H*.7,W*.56,H*.16,'#c18a58');for(let i=0;i<5;i++)px(W*(.25+i*.105),H*.73,W*.075,H*.09,i%2?'#d9b06f':'#b87950');
const bx=W*.43,by=H*.49,bw=W*.28,bh=H*.25;
px(bx-12,by+bh-4,bw+24,24,'#49342e');px(bx,by+bh-17,bw,20,'#70452f');px(bx-8,by+10,12,bh-10,'#805239');px(bx+bw-4,by+10,12,bh-10,'#805239');
px(bx,by,bw,bh-10,'#e0c18c');px(bx+8,by+8,bw-16,bh-28,'#f0dfb6');px(bx+10,by+10,bw-20,13,'#b56d63');
px(bx+14,by+17,bw*.32,34,'#f7e8c7');px(bx+bw*.57,by+17,bw*.3,34,'#f7e8c7');px(bx+12,by+51,bw-24,bh-78,'#6c8b91');px(bx+17,by+55,bw-34,bh-87,'#87a6a0');
const pose=cinematic.wakePose||'lying';
if(pose==='lying'){px(bx+bw*.5-15,by+24,30,24,'#d7a06e');px(bx+bw*.5-12,by+22,24,7,'#493b49');px(bx+bw*.5-8,by+32,4,3,C.ink);px(bx+bw*.5+5,by+32,4,3,C.ink);px(bx+bw*.5-26,by+43,52,10,state.heroClass==='Mage'?'#6554a5':state.heroClass==='Scout'?'#4a8a54':'#c44736');px(bx+bw*.5-31,by+50,62,48,'#66888b');px(bx+bw*.5-31,by+50,62,5,'#a8c1b0');}
else if(pose==='sitting')drawCutscenePlayer(bx+bw*.5,by+bh-22,1.65);else drawCutscenePlayer(bx+bw*.5,by+bh+8,1.65);
px(bx-55,by+bh-35,42,35,'#795039');px(bx-59,by+bh-39,50,7,'#d2a36d');px(bx-45,by+bh-60,22,22,'#f0c66c');px(bx-41,by+bh-68,14,10,'#f8e5a7');
px(bx+bw+25,by+bh-29,25,9,'#684638');px(bx+bw+55,by+bh-29,25,9,'#684638');
drawCutscenePerson(W*.28,H*.67,'#b86c78','#70485c',1.65);drawCutscenePerson(W*.72,H*.67,'#577f9b','#4a536e',1.65);
const light=ctx.createRadialGradient(bx+bw*.5,by+bh*.45,10,bx+bw*.5,by+bh*.45,Math.max(W,H)*.55);light.addColorStop(0,'rgba(255,224,157,.16)');light.addColorStop(1,'rgba(32,23,31,.22)');ctx.fillStyle=light;ctx.fillRect(0,0,W,H);
ctx.fillStyle='#fff2c7';ctx.font='bold 18px ui-monospace';ctx.textAlign='center';ctx.fillText('HEARTHVALE — MORNING',W/2,H*.075);
}
const spriteFrames=new Map();
function makeOverworldSprite(shirt,hat,variant=0){
 const frame=document.createElement('canvas');frame.width=24;frame.height=32;
 const g=frame.getContext('2d');g.imageSmoothingEnabled=false;
 const p=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
 const skin=['#f1b58c','#d99a72','#f0c49b','#b97859'][variant%4];
 const hair=['#594238','#342f38','#9a633c','#d5b17a','#6a5147'][variant%5];
 // compact GBA-style silhouette, dark outline and clustered pixel highlights
 p(6,26,12,3,'#26334a');p(7,28,4,2,'#e2d8c1');p(14,28,4,2,'#e2d8c1');
 p(5,13,14,13,'#26334a');p(6,14,12,11,shirt);
 p(3,15,3,8,'#26334a');p(4,16,2,6,skin);p(18,15,3,8,'#26334a');p(18,16,2,6,skin);
 p(8,4,9,11,'#26334a');p(9,5,7,9,skin);
 p(7,3,11,4,'#26334a');p(8,2,9,4,hair);p(7,5,3,5,hair);p(16,5,3,5,hair);
 p(10,9,2,2,'#26334a');p(14,9,2,2,'#26334a');p(11,12,4,1,'#a65f55');
 // collar, belt, tunic highlights and footwear
 p(9,14,6,2,'#f0d5a0');p(10,16,4,5,'rgba(255,255,255,.16)');
 p(7,23,10,2,hat);p(7,25,4,3,'#3b4050');p(14,25,4,3,'#3b4050');
 if(variant%5===0){p(6,1,12,3,hat);p(8,0,8,2,hat);} // cap
 if(variant%5===1){p(6,3,3,5,hair);p(15,3,3,5,hair);} // longer hair
 if(variant%5===2){p(6,1,12,2,hat);p(8,0,8,2,'#e8bd58');} // headband
 if(variant%5===3){p(5,2,14,3,hat);p(7,0,10,2,hat);} // brimmed hat
 if(variant%5===4){p(7,2,10,3,hair);p(8,0,8,2,hair);} // short hair
 return frame;
}
function drawPerson(x,y,shirt,hat,name=''){
 const bob=Math.sin(performance.now()/190+x*.035)*1.1;
 const variant=[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5;
 const key=shirt+'|'+hat+'|'+variant;let frame=spriteFrames.get(key);
 if(!frame){frame=makeOverworldSprite(shirt,hat,variant);spriteFrames.set(key,frame);}
 ctx.drawImage(frame,Math.round(x-12),Math.round(y-28+bob),24,32);
}
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
function drawInterior(W,H){
ctx.clearRect(0,0,W,H);
const palettes=[
{wall:'#ead9bd',floor:'#b9855d',trim:'#714832',accent:'#a85b48',title:'MAPLE COTTAGE'},
{wall:'#d5b88a',floor:'#80563e',trim:'#49352d',accent:'#c18a49',title:'HEARTHVALE INN'},
{wall:'#e4c991',floor:'#c99a61',trim:'#704a32',accent:'#b85c43',title:'TILLY’S GENERAL STORE'},
{wall:'#aeb7ad',floor:'#8b6749',trim:'#493c34',accent:'#6c7d86',title:'ORIN’S WORKSHOP'}
][interiorId];
px(0,0,W,H,palettes.trim);
if(interiorId===0){
px(W*.05,H*.19,W*.9,H*.7,palettes.wall);
px(W*.05,H*.19,W*.9,H*.07,'#8b5b42');
for(let i=0;i<5;i++)px(W*(.08+i*.17),H*.27,W*.14,4,'#d0b48c');
px(W*.42,H*.23,W*.16,H*.18,'#714b38');px(W*.445,H*.25,W*.11,H*.14,'#a64e3e');px(W*.47,H*.29,W*.06,H*.09,'#f1a45c');
px(W*.11,H*.38,W*.12,H*.12,'#79513a');px(W*.13,H*.4,W*.08,H*.08,'#d0a36d');
}else if(interiorId===1){
px(0,0,W,H*.23,'#4d382f');px(W*.08,H*.22,W*.84,H*.67,palettes.wall);
for(let i=0;i<4;i++){px(W*(.1+i*.21),H*.29,W*.16,H*.035,'#9b714c');px(W*(.12+i*.21),H*.33,W*.12,H*.02,'#d5b780');}
px(W*.08,H*.48,W*.25,H*.09,'#70462f');px(W*.1,H*.5,W*.21,H*.05,'#c18a49');
px(W*.68,H*.48,W*.24,H*.09,'#70462f');px(W*.7,H*.5,W*.20,H*.05,'#c18a49');
}else if(interiorId===2){
px(W*.04,H*.18,W*.92,H*.72,palettes.wall);
px(W*.08,H*.26,W*.84,H*.035,'#a56e43');
for(const x of [.11,.32,.57,.78]){px(W*x,H*.34,W*.1,H*.19,'#70462f');for(let j=0;j<3;j++)px(W*(x+.012),H*(.37+j*.05),W*.076,H*.018,['#c96f4e','#7d9b69','#e0b85f'][j]);}
px(W*.38,H*.59,W*.24,H*.08,'#a64f3f');px(W*.4,H*.61,W*.2,H*.04,'#d8aa66');
}else{
px(W*.05,H*.2,W*.9,H*.69,'#b3b9a8');
for(let i=0;i<6;i++){px(W*(.1+i*.14),H*.26,W*.12,H*.018,'#765139');px(W*(.11+i*.14),H*.29,W*.1,H*.045,'#8e6849');}
px(W*.22,H*.51,W*.56,H*.11,'#594638');px(W*.25,H*.53,W*.5,H*.06,'#b87945');
px(W*.43,H*.43,W*.14,H*.08,'#5a5550');px(W*.46,H*.39,W*.08,H*.06,'#a6a8a0');
}
for(let y=H*.9;y<H;y+=26){px(0,y,W,23,palettes.floor);px(0,y+22,W,4,palettes.trim);}
px(W*.045,H*.2,7,H*.7,palettes.trim);px(W*.948,H*.2,7,H*.7,palettes.trim);
px(W*.42,H*.12,W*.16,5,palettes.accent);
ctx.fillStyle=C.cream;ctx.font='bold 15px ui-monospace';ctx.textAlign='center';ctx.fillText(palettes.title,W/2,H*.105);
const nlist=roomNPCs[interiorId];
nlist.forEach((n,i)=>{const spot=roomNPCSpots[interiorId][i];drawPerson(W*spot.x,H*spot.y,n.color,'#634b3a',n.name);});
let target=null,dist=Infinity;
for(let i=0;i<nlist.length;i++){const n=nlist[i],spot=roomNPCSpots[interiorId][i],d=Math.hypot(insidePlayer.x-W*spot.x,insidePlayer.y-H*spot.y);if(d<Math.max(84,W*.095)&&d<dist){target=n;dist=d;}}
if(target){const i=nlist.indexOf(target),spot=roomNPCSpots[interiorId][i];drawWorldPrompt(W*spot.x,H*spot.y-31,'E · TALK');}
else if(insidePlayer.y>H*.79)drawWorldPrompt(W*.5,H*.84,'E · EXIT');
drawPlayer(insidePlayer.x,insidePlayer.y);
}function drawWorldPrompt(x,y,label){const w=Math.max(66,label.length*7+22),h=22;ctx.fillStyle='#26334a';ctx.fillRect(Math.round(x-w/2-2),Math.round(y-h-2),w+4,h+4);ctx.fillStyle='#f3e6bf';ctx.fillRect(Math.round(x-w/2),Math.round(y-h),w,h);ctx.fillStyle='#26334a';ctx.font='bold 10px ui-monospace';ctx.textAlign='center';ctx.fillText(label,x,y-7);}
function drawPlayer(x,y){
 const bob=Math.sin(playerFrame/5)*1.2,step=Math.round(Math.sin(playerFrame*1.8));
 const index=state.heroClass==='Mage'?1:state.heroClass==='Scout'?2:0;
 const looks=[
  {shirt:'#b94b38',hat:'#c44736',trim:'#e8bd58'},
  {shirt:'#6658a5',hat:'#6554a5',trim:'#c9b8ee'},
  {shirt:'#4c8955',hat:'#4a8a54',trim:'#e8bd58'}
 ][index];
 const key='PLAYER|'+index;let frame=spriteFrames.get(key);
 if(!frame){frame=makeOverworldSprite(looks.shirt,looks.hat,index);spriteFrames.set(key,frame);}
 ctx.drawImage(frame,Math.round(x-12-step),Math.round(y-28+bob),24,32);
}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];const speaker=line[0]==='NARRATOR'?'ROWAN':line[0];$('lh-speaker').textContent=speaker;$('lh-dialogue-text').textContent=line[1];drawDialoguePortrait(speaker);$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
function drawDialoguePortrait(name){
const c=$('lh-portrait'),p=c.getContext('2d');p.clearRect(0,0,64,64);p.fillStyle='#26334a';p.fillRect(0,0,64,64);
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
function positionSpeechBubble(name){const el=$('lh-dialogue');let p=null;if(cinematic&&cinematic.actors&&cinematic.actors[name])p=cinematic.actors[name];else if(scene==='outside'){const n=npcs.find(v=>v.name===name);if(n)p={x:n.x,y:n.y};}else if(scene==='inside'){const i=roomNPCs[interiorId].findIndex(v=>v.name===name);if(i>=0){const spot=roomNPCSpots[interiorId][i];p={x:innerWidth*spot.x,y:innerHeight*spot.y};}}if(p&&scene==='outside'&&!cinematic){const camX=Math.max(0,Math.min(MAP_W*TILE-innerWidth,state.x-innerWidth/2)),camY=Math.max(0,Math.min(MAP_H*TILE-innerHeight,state.y-innerHeight/2));p={x:p.x-camX,y:p.y-camY};}if(p){el.style.left=Math.max(12,Math.min(innerWidth-12,p.x))+'px';el.style.top=Math.max(70,p.y-88)+'px';el.style.bottom='auto';el.style.transform='translate(-50%,-100%)';}else{el.style.left='50%';el.style.top='auto';el.style.bottom='18px';el.style.transform='translateX(-50%)';}}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function advanceDialogue(){if(!dialogue)return;dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function enterBuilding(id){if(transitioning||scene!=='outside')return;transitioning=true;const doors=[{x:10.5*TILE,y:10.55*TILE},{x:34*TILE,y:10.55*TILE},{x:22*TILE,y:22.55*TILE},{x:5.5*TILE,y:29.55*TILE}],door=doors[id],from={x:state.x,y:state.y},start=performance.now(),duration=620;function walk(now){const p=Math.min(1,(now-start)/duration),ease=p*p*(3-2*p);state.x=from.x+(door.x-from.x)*ease;state.y=from.y+(door.y-from.y)*ease;playerFrame+=.45;if(p<1)requestAnimationFrame(walk);else{interiorId=id;scene='inside';insideTalked=false;insidePlayer={x:innerWidth/2,y:innerHeight*.76};updateHud();save();setTimeout(()=>{transitioning=false;},180);}}requestAnimationFrame(walk);}
let transitioning=false,insidePlayer={x:innerWidth/2,y:innerHeight*.76};
function interact(){if(transitioning)return;if(scene==='inside'){if(dialogue){advanceDialogue();return;}const W=innerWidth,H=innerHeight,pxp=insidePlayer.x,pyp=insidePlayer.y;let target=null,dist=Infinity;for(let i=0;i<roomNPCs[interiorId].length;i++){const n=roomNPCs[interiorId][i],spot=roomNPCSpots[interiorId][i];const d=Math.hypot(pxp-W*spot.x,pyp-H*spot.y);if(d<Math.max(84,W*.095)&&d<dist){target=n;dist=d;}}if(target){setDialogue(target.lines.map(t=>[target.name,t]));if(interiorId===3&&target.name==='OLD CRAFTSMAN ORIN'&&questStep<3){questStep=3;updateQuest();}return;}if(pyp>H*.78){scene='outside';state.x=([10.5,34,22,5.5][interiorId])*TILE;state.y=([10.9,10.9,22.9,29.9][interiorId])*TILE;updateHud();save();return;}setDialogue([['ROWAN','There is no one close enough to talk to. Walk up to someone and press INTERACT.']]);return;}if(dialogue){advanceDialogue();return;}if(cinematic)return;if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<64&&d<dist){found=n;dist=d;}}
if(found){
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
cinematic={phase:'dream',camera:{x:0,y:0},actors:{HERO:{x:innerWidth*.28,y:innerHeight*.68},FOE:{x:innerWidth*.7,y:innerHeight*.68},MARA:{x:innerWidth*.18,y:innerHeight*.48},THOMAS:{x:innerWidth*.82,y:innerHeight*.48},ROWAN:{x:innerWidth*.5,y:innerHeight*.4}}};
const say=lines=>new Promise(resolve=>setDialogue(lines,resolve));
const moveActor=(name,to,duration=900)=>new Promise(resolve=>{const a=cinematic.actors[name],from={x:a.x,y:a.y},start=performance.now();function step(now){if(!cinematic)return resolve();const p=Math.min(1,(now-start)/duration),e=p*p*(3-2*p);a.x=from.x+(to.x-from.x)*e;a.y=from.y+(to.y-from.y)*e;if(p<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
(async()=>{
await say([['DREAM','The Harvest Festival arena roars with excitement. Golden banners wave as the crowd chants your name!']]);
await say([['CROWD',state.name+'! '+state.name+'! You can do it!'],['ROWAN','Show them what the future champion of Hearthvale can do!']]);
await moveActor('HERO',{x:innerWidth*.48,y:innerHeight*.68},900);
await say([['ANNOUNCER','The challenger enters the arena! The final match begins now!'],['CHALLENGER','You really think you can beat me?']]);
await moveActor('HERO',{x:innerWidth*.57,y:innerHeight*.68},650);
await say([['ROWAN','You dodge the challenger’s move and land one final heroic strike!']]);
await moveActor('FOE',{x:innerWidth*.77,y:innerHeight*.72},600);
await say([['ANNOUNCER','THE CHAMPION WINS!'],['MARA','That is our child! We are so proud of you!'],['THOMAS','The greatest champion in all of Hearthvale!']]);
cinematic.phase='wake';cinematic.wakePose='lying';cinematic.actors={HERO:{x:innerWidth*.60,y:innerHeight*.65},MARA:{x:innerWidth*.32,y:innerHeight*.62},THOMAS:{x:innerWidth*.82,y:innerHeight*.62}};
await say([['MARA','Wake up, sleepyhead… You were dreaming about the championship again.']]);
cinematic.wakePose='sitting';
await say([['MARA','Good morning! Rowan is waiting outside. You are both old enough to attend Hearthvale School today.'],['THOMAS','The instructor will help you choose the path that suits you. We will see you after lessons.']]);
await say([['ROWAN','Ready? Let’s head to school together.']]);
cinematic.phase='school';cinematic.actors={HERO:{x:innerWidth*.43,y:innerHeight*.68},ROWAN:{x:innerWidth*.57,y:innerHeight*.68}};
await say([['ROWAN','I saved you a seat! I wonder which path you will choose.'],['INSTRUCTOR','Welcome to Hearthvale School. Every adventurer chooses one path: Guardian, Scout, or Mage. Your choice will shape how you face the world.']]);
$('lh-school-class').hidden=false;
await new Promise(resolve=>{window.__lhClassChosen=resolve;});
cinematic.phase='outside';cinematic.camera={x:20*TILE,y:15*TILE};cinematic.actors={HERO:{x:20*TILE,y:15*TILE},ROWAN:{x:22*TILE,y:14*TILE}};
await say([['ROWAN','That was exciting! Come on, let’s head home.'],['ROWAN','The house is quiet… Your parents must have already left for the Everfeast preparations. We just missed them.']]);
await say([['ROWAN','Wait… the front door is open. Where are Mara and Thomas?'],['ROWAN','They were supposed to be back by now. Something is wrong.']]);
cinematic=null;document.body.classList.remove('lh-cinematic');state.seenIntro=true;questStep=0;updateQuest();save();
})();
}

function updateQuest(){const q=['Speak with Elder Maple','Visit Rowan in the village square','Enter a building and search for clues','Return to Elder Maple with what you found','Follow the golden leaves beyond the village'];$('lh-quest-text').textContent=q[Math.min(questStep,q.length-1)];}
function updateHud(){ $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-health').textContent=state.hp;$('lh-coins').textContent=state.coins;$('lh-location').textContent=scene==='inside'?['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]:chapters[Math.min(state.stage,9)].place.toUpperCase();updateQuest();}
function move(dt){if(dialogue||cinematic||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;let dx=0,dy=0;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;dx+=joystick.x;dy+=joystick.y;if(!dx&&!dy)return;const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;const speed=state.heroClass==='Scout'?190:state.heroClass==='Guardian'?145:165;if(scene==='inside'){const nx=insidePlayer.x+dx*speed*dt,ny=insidePlayer.y+dy*speed*dt;if(!roomBlocked(nx,insidePlayer.y))insidePlayer.x=nx;if(!roomBlocked(insidePlayer.x,ny))insidePlayer.y=ny;insidePlayer.x=Math.max(innerWidth*.1,Math.min(innerWidth*.9,insidePlayer.x));insidePlayer.y=Math.max(innerHeight*.29,Math.min(innerHeight*.87,insidePlayer.y));playerFrame+=dt*14;return;}const nx=state.x+dx*speed*dt,ny=state.y+dy*speed*dt;if(!blocked(nx,state.y))state.x=nx;if(!blocked(state.x,ny))state.y=ny;playerFrame+=dt*14;moveCooldown+=dt;if(moveCooldown>.6){moveCooldown=0;save();}}
function loop(t){const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;move(dt);drawWorld();if(dialogue)positionSpeechBubble(dialogue[dialogueIndex][0]);requestAnimationFrame(loop);}
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
    const items=Array.isArray(state.inventory)?state.inventory:[];
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