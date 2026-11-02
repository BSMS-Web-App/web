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
const CHARS=new Image();CHARS.src='/img/last-harvest/characters.png';
const NPC_ROW={'ELDER MAPLE':22,'ROWAN':2,'MILLIE':12,'GUS':7,'PIPER':5,'MARA THE NEIGHBOR':14,'JUNIPER':16,'INNKEEPER BRAM':8,'NELL THE TRAVELER':6,'SHOPKEEPER TILLY':13,'FINN':10,'OLD CRAFTSMAN ORIN':9,'WREN THE APPRENTICE':19};
const CS_ROW={'#b86c78':14,'#577f9b':8,'#bb6542':2,'#7d526f':20,'#6b9c70':5,'#d5b64e':10};
let facing=0,walking=false,walkFrame=0;
function drawSpriteK(row,face,step,x,feet,k){
 if(!CHARS.complete||!CHARS.naturalWidth)return false;
 const sx=(face*3+step)*16,sy=row*24;
 ctx.imageSmoothingEnabled=false;
 ctx.drawImage(CHARS,sx,sy,16,24,Math.round(x-8*k),Math.round(feet-24*k),16*k,24*k);
 return true;
}
function drawSprite(row,face,step,x,y){return drawSpriteK(row,face,step,x,y+8,2);}
const heroRow=()=>state.heroClass==='Mage'?20:state.heroClass==='Scout'?1:0;
function drawPerson(x,y,shirt,hat,name=''){
 const row=NPC_ROW[name]??[2,5,7,9,10][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];
 const t=scene==='inside'?insidePlayer:state,dx=t.x-x,dy=t.y-y;
 let face=0;
 if(Math.hypot(dx,dy)<140)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
 drawSprite(row,face,0,x,y);
}
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
function drawTree(x,y){
 const X=x*TILE,Y=y*TILE;
 if(buildingSheet.complete&&buildingSheet.naturalWidth){
  const variant=(x+y)%2;
  ctx.drawImage(buildingSheet,variant?588:529,0,variant?61:58,91,X-10,Y-27,52,60);
  return;
 }
 px(X+12,Y+17,9,16,'#68452e');px(X+9,Y+25,15,5,'#4c392b');
 px(X+2,Y+7,28,18,'#286344');px(X+5,Y+1,22,19,'#347e4b');px(X+9,Y-3,14,13,'#48a65a');
 px(X+6,Y+5,7,6,'#78c96b');px(X+19,Y+3,6,7,'#70c66a');px(X+2,Y+15,7,6,'#3e9853');px(X+21,Y+15,7,5,'#2d7548');
 px(X+13,Y+7,4,3,'#a4d978');
}
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
 if(buildingSheet.complete&&buildingSheet.naturalWidth){
  const sources=[
   [0,0,94,96],[96,0,98,105],[197,0,92,104],[291,0,72,99]
  ];
  const index=solids.indexOf(b),src=sources[Math.max(0,Math.min(3,index))];
  ctx.drawImage(buildingSheet,src[0],src[1],src[2],src[3],x-8,y-10,w+16,h+18);
  return;
 }

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
 const row=CS_ROW[shirt]??7;
 drawSpriteK(row,0,0,x,y+10*scale,scale*2);
}
function drawCutscenePlayer(x,y,scale=1.75){
 drawSpriteK(heroRow(),facing,0,x,y+10*scale,scale*2);
}
function drawDreamScene(W,H){
 // Cutscenes own the entire canvas: clear any previous village frame before drawing.
 const dpr=Math.min(devicePixelRatio||1,2);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,W,H);
 ctx.fillStyle='#2b2140';ctx.fillRect(0,0,W,H);
 const a=cinematic.actors,k=Math.max(3,Math.round(H/190));
 px(0,0,W,H,'#2b2140');px(0,0,W,H*.42,'#4b3562');
 for(let i=0;i<9;i++){const x=W*(i+.5)/9;px(x-16,H*.08,32,H*.15,i%2?'#c8502c':'#e8b84c');px(x-16,H*.23,32,6,i%2?'#8a3418':'#b8902c');}
 for(let r=0;r<2;r++){const by=H*.31+r*H*.055;px(0,by+10,W,8,'#6a4a38');for(let x=(r%2)*28;x<W;x+=56)drawSpriteK([5,7,10,12,9,14,16][((x/56|0)+r)%7],0,0,x+20,by+10,2);}
 px(0,H*.44,W,H*.56,'#dcbc7c');for(let y=H*.44;y<H;y+=32)for(let x=0;x<W;x+=32){const r=rand(x/32,y/32);if(r>.68)px(x+8+r*10,y+9,4,2,'#c09858');}
 ctx.strokeStyle='#b88850';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(W/2,H*.76,W*.32,H*.13,0,0,6.3);ctx.stroke();
 [[a.MARA,14,0,null],[a.THOMAS,8,0,null],[a.ROWAN,2,0,null],[a.HERO,heroRow(),facing,state.heroClass],[a.FOE,20,2,'Foe']].sort((p,q)=>p[0].y-q[0].y).forEach(([p,row,face,g])=>{drawSpriteK(row,face,0,p.x,p.y,k*(g==='Foe'?1.12:1));/* class-specific appearance comes from the character sheet row */});
 ctx.fillStyle='#fff2c7';ctx.font='bold 22px ui-monospace';ctx.textAlign='center';ctx.fillText('HARVEST FESTIVAL CHAMPIONSHIP',W/2,H*.08);
 ctx.font='bold 14px ui-monospace';ctx.fillText('THE CROWD IS CHEERING FOR YOU!',W/2,H*.2);
 ctx.font='bold 13px ui-monospace';ctx.fillText('CHALLENGER',a.FOE.x,a.FOE.y-58);
}
function drawSchoolScene(W,H){
 const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 const a=cinematic.actors,k=Math.max(3,Math.round(H/190));
 px(0,0,W,H,'#789f8c');px(0,H*.7,W,H*.3,'#63865b');
 px(W*.06,H*.08,W*.88,H*.65,'#c9b18b');px(W*.06,H*.08,W*.88,H*.09,'#654832');
 px(W*.09,H*.19,W*.82,H*.48,'#e1d1aa');
 for(const x of [.12,.78]){px(W*x,H*.19,W*.1,H*.19,'#5a4030');px(W*x+6,H*.19+6,W*.1-12,H*.17,'#9fd8f0');}
 px(W*.32,H*.2,W*.36,H*.14,'#345b54');px(W*.34,H*.22,W*.32,H*.1,'#497b67');
 ctx.fillStyle='#fff0c6';ctx.font='bold 13px ui-monospace';ctx.textAlign='center';ctx.fillText('HEARTHVALE SCHOOL',W/2,H*.28);
 for(let r=0;r<2;r++)for(let c=0;c<4;c++){const x=W*(.14+c*.2),y=H*(.48+r*.12);px(x,y,W*.12,H*.045,'#80563d');px(x,y,W*.12,4,'#d4ad70');}
 drawSpriteK(heroRow(),0,0,a.HERO.x,a.HERO.y,k);drawSpriteK(2,0,0,a.ROWAN.x,a.ROWAN.y,k);
}
function drawWakeScene(W,H){
 const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 const k=Math.max(3,Math.round(H/190)),a=cinematic.actors,pose=cinematic.wakePose||'lying';
 px(0,0,W,H,'#493b49');px(0,0,W,H*.34,'#8d7780');
 for(let x=0;x<W;x+=Math.max(70,W*.09)){px(x,0,4,H*.34,'#78616e');px(x+4,0,2,H*.34,'#a58b8d');}
 px(0,H*.34,W,8,'#4e3940');
 for(let y=H*.35;y<H;y+=32){px(0,y,W,29,(Math.floor(y/32)%2)?'#a97853':'#b9855d');px(0,y+28,W,4,'#80513b');}
 // Window, dresser, rug and bed establish a readable bedroom set.
 px(W*.07,H*.09,W*.2,H*.22,'#343d54');px(W*.085,H*.105,W*.17,H*.19,'#6caab8');px(W*.165,H*.105,5,H*.19,'#ead8ad');px(W*.085,H*.2,W*.17,5,'#ead8ad');
 px(W*.75,H*.39,W*.16,H*.23,'#76503a');px(W*.765,H*.405,W*.13,H*.2,'#b37c4c');px(W*.78,H*.39,W*.1,H*.025,'#e1bd80');
 px(W*.17,H*.72,W*.66,H*.17,'#75443c');px(W*.19,H*.74,W*.62,H*.13,'#c18a58');
 const bx=W*.36,by=H*.48,bw=W*.28,bh=H*.27;
 px(bx-12,by+bh-4,bw+24,24,'#49342e');px(bx,by+bh-17,bw,20,'#70452f');px(bx-8,by+10,12,bh-10,'#805239');px(bx+bw-4,by+10,12,bh-10,'#805239');
 px(bx,by,bw,bh-10,'#e0c18c');px(bx+8,by+8,bw-16,bh-28,'#f0dfb6');px(bx+10,by+10,bw-20,13,'#b56d63');
 if(pose==='lying'){drawSpriteK(heroRow(),0,0,W/2,by+bh*.65,k*1.5);}
 else{drawSpriteK(heroRow(),0,0,W/2,by+bh*.75,k*1.5);}
 drawSpriteK(14,3,0,W*.25,H*.88,k);drawSpriteK(8,2,0,W*.75,H*.88,k);
 ctx.fillStyle='rgba(255,236,170,.14)';ctx.beginPath();ctx.moveTo(W*.09,H*.24);ctx.lineTo(W*.23,H*.24);ctx.lineTo(W*.55,H*.9);ctx.lineTo(W*.25,H*.9);ctx.fill();
}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];const speaker=line[0]==='NARRATOR'?'ROWAN':line[0];$('lh-speaker').textContent=speaker;$('lh-dialogue-text').textContent=line[1];drawDialoguePortrait(speaker);$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
function drawDialoguePortrait(name){
 const c=$('lh-portrait'),p=c.getContext('2d');
 p.clearRect(0,0,64,64);p.imageSmoothingEnabled=false;
 p.fillStyle='#26334a';p.fillRect(0,0,64,64);
 const npcRows={'ROWAN':2,'MARA':14,'THOMAS':8,'ELDER MAPLE':22,'OLD CRAFTSMAN ORIN':9,'SHOPKEEPER TILLY':13,'INNKEEPER BRAM':8,'MILLIE':12,'GUS':7,'PIPER':5,'JUNIPER':16,'NELL THE TRAVELER':6,'FINN':10,'WREN THE APPRENTICE':19};
 const row=npcRows[name]??NPC_ROW[name]??7;
 if(CHARS.complete&&CHARS.naturalWidth)p.drawImage(CHARS,0,row*24,16,24,12,5,40,54);
 else{p.fillStyle='#b94b38';p.fillRect(15,26,34,23);p.fillStyle='#f1b58c';p.fillRect(21,11,22,20);}
}
function positionSpeechBubble(name){
 const el=$('lh-dialogue');
 if(cinematic){
  el.style.left='50%';el.style.right='auto';el.style.top='auto';
  el.style.bottom='max(16px, env(safe-area-inset-bottom))';
  el.style.width='min(620px, calc(100vw - 28px))';
  el.style.maxWidth='calc(100vw - 28px)';
  el.style.transform='translateX(-50%)';
  return;
 }
 let p=null;
 if(scene==='outside'){const n=npcs.find(v=>v.name===name);if(n)p={x:n.x,y:n.y};}
 else if(scene==='inside'){
  const i=roomNPCs[interiorId].findIndex(v=>v.name===name);
  if(i>=0){const spot=roomNPCSpots[interiorId][i];p={x:innerWidth*spot.x,y:innerHeight*spot.y};}
 }
 if(p&&scene==='outside'){
  const camX=Math.max(0,Math.min(MAP_W*TILE-innerWidth,state.x-innerWidth/2));
  const camY=Math.max(0,Math.min(MAP_H*TILE-innerHeight,state.y-innerHeight/2));
  p={x:p.x-camX,y:p.y-camY};
 }
 if(p){
  el.style.width='min(430px, calc(100vw - 28px))';
  el.style.maxWidth='calc(100vw - 28px)';
  const half=Math.min(215,(innerWidth-28)/2),box=el.getBoundingClientRect();
  const left=Math.max(half+14,Math.min(innerWidth-half-14,p.x));
  const top=Math.max(70,Math.min(innerHeight-Math.max(150,box.height+18),p.y-18));
  el.style.left=left+'px';el.style.right='auto';el.style.top=top+'px';
  el.style.bottom='auto';el.style.transform='translate(-50%,-100%)';
 }else{
  el.style.left='50%';el.style.right='auto';el.style.top='auto';
  el.style.bottom='max(16px, env(safe-area-inset-bottom))';
  el.style.width='min(430px, calc(100vw - 28px))';
  el.style.transform='translateX(-50%)';
 }
}
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
function move(dt){
 walking=false;
 if(dialogue||cinematic||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;
 let dx=0,dy=0;
 if(keys.ArrowLeft||keys.a||touch.left)dx--;
 if(keys.ArrowRight||keys.d||touch.right)dx++;
 if(keys.ArrowUp||keys.w||touch.up)dy--;
 if(keys.ArrowDown||keys.s||touch.down)dy++;
 dx+=joystick.x;dy+=joystick.y;
 if(Math.abs(dx)<.12&&Math.abs(dy)<.12)return;
 const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;
 facing=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
 walking=true;walkFrame=Math.floor(performance.now()/150)%2;
 const speed=state.heroClass==='Scout'?190:state.heroClass==='Guardian'?145:165;
 if(scene==='inside'){
  const nx=insidePlayer.x+dx*speed*dt,ny=insidePlayer.y+dy*speed*dt;
  if(!roomBlocked(nx,insidePlayer.y))insidePlayer.x=nx;
  if(!roomBlocked(insidePlayer.x,ny))insidePlayer.y=ny;
  insidePlayer.x=Math.max(innerWidth*.1,Math.min(innerWidth*.9,insidePlayer.x));
  insidePlayer.y=Math.max(innerHeight*.29,Math.min(innerHeight*.87,insidePlayer.y));
  playerFrame+=dt*14;return;
 }
 const nx=state.x+dx*speed*dt,ny=state.y+dy*speed*dt;
 if(!blocked(nx,state.y))state.x=nx;
 if(!blocked(state.x,ny))state.y=ny;
 playerFrame+=dt*14;moveCooldown+=dt;
 if(moveCooldown>.6){moveCooldown=0;save();}
}
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
// Tapping the world must never trigger a random NPC conversation.
canvas.addEventListener('pointerup',()=>{});
$('lh-dialogue').addEventListener('pointerup',e=>{e.preventDefault();advanceDialogue();});
$('lh-dialogue').addEventListener('click',e=>{if(e.target!==$('lh-next'))advanceDialogue();});

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