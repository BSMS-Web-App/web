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
npcs.forEach(n=>{n.x=Math.round(n.x/TILE)*TILE+16;n.y=Math.round(n.y/TILE)*TILE+24;});state.x=Math.floor(state.x/TILE)*TILE+16;state.y=Math.floor(state.y/TILE)*TILE+24;
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
function drawTree(x,y){if(!BLD.complete||!BLD.naturalWidth)return;const r=BR[rand(x+3,y+9)>.5?'tree':'pine'];ctx.imageSmoothingEnabled=false;ctx.drawImage(BLD,r[0],r[1],r[2],r[3],Math.round(x*TILE+16-r[2]/2),Math.round(y*TILE+36-r[3]),r[2],r[3]);}
function drawBuilding(b,n){if(!BLD.complete||!BLD.naturalWidth)return;const r=BR[n];ctx.imageSmoothingEnabled=false;ctx.drawImage(BLD,r[0],r[1],r[2],r[3],Math.round(b.x*TILE+b.w*TILE/2-r[2]),Math.round((b.y+b.h)*TILE-r[3]*2),r[2]*2,r[3]*2);}
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
function path(x,y,w,h){px(x,y,w,h,'#d8b878');for(let yy=y;yy<y+h;yy+=TILE)for(let xx=x;xx<x+w;xx+=TILE){const r=rand(xx/TILE+7,yy/TILE+3);px(xx+4+r*14,yy+6+r*10,4,2,'#c09858');px(xx+20-r*10,yy+20-r*8,3,3,'#e8d098');px(xx+12,yy+14+r*6,2,2,'#b88850');}}
path(0,11*TILE,MAP_W*TILE,4*TILE);path(15*TILE,0,4*TILE,MAP_H*TILE);path(19*TILE,14*TILE,10*TILE,2*TILE);
// Background trees render before buildings so trunks/canopies cannot cover roofs or doors.
for(const t of trees)drawTree(t.x,t.y);
HOUSES.forEach((n,i)=>drawBuilding(solids[i],n));
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
const CS_ROW={'#b86c78':14,'#577f9b':8,'#bb6542':2,'#7d526f':20,'#6b9c70':5,'#d5b64e':10};
function drawCutscenePerson(x,y,shirt,hat,scale=1.75){drawSpriteK(CS_ROW[shirt]??7,0,0,x,y+10*scale,scale*2);}
function drawCutscenePlayer(x,y,scale=1.75){drawSpriteK(state.heroClass==='Mage'?20:state.heroClass==='Scout'?1:0,0,0,x,y+10*scale,scale*2);}
const GEAR_COL={Guardian:['#aab4c4','#6e788c','#ffffff'],Scout:['#7a9a52','#4e6a34','#c8e090'],Mage:['#7a52b8','#4a2e82','#d8b8ff'],Foe:['#4a3858','#241830','#9a5a8a']};
/* pixel-art armor + weapons drawn over the character sprite (x = centre, fy = feet, k = pixel scale) */
function drawGear(x,fy,k,face,cls){const C=GEAR_COL[cls];if(!C)return;const m=face===2?-1:1,side=face>1;
 const s=(px,py,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x+(m<0?-px-w:px)*k),Math.round(fy+py*k),w*k,h*k);};
 if(!side){s(-9,-15,5,4,C[0]);s(4,-15,5,4,C[0]);s(-9,-15,5,1,C[2]);s(4,-15,5,1,C[2]);s(-9,-12,5,1,C[1]);s(4,-12,5,1,C[1]);s(-4,-12,8,5,C[0]);s(-4,-12,8,1,C[2]);s(-4,-8,8,1,C[1]);s(-1,-11,2,2,'#e8c050');}
 else{s(-3,-15,6,4,C[0]);s(-3,-15,6,1,C[2]);s(-3,-12,6,5,C[0]);s(-3,-8,6,1,C[1]);}
 const fx=side?3:8;
 if(cls==='Guardian'||cls==='Foe'){const b=cls==='Foe'?['#3a2a4a','#7a5a8a']:['#e8eef8','#ffffff'];s(fx,-22,2,14,b[0]);s(fx,-22,1,14,b[1]);s(fx-2,-9,6,2,'#e8c050');s(fx,-7,2,3,'#7a4a28');
  if(cls==='Guardian'&&!side){s(-14,-14,6,9,'#2e5a96');s(-14,-14,6,1,'#e8c050');s(-14,-6,6,1,'#e8c050');s(-12,-12,2,5,'#e8c050');}}
 if(cls==='Scout'){s(fx,-20,2,14,'#8a5a2a');s(fx+2,-18,1,10,'#eeeeee');s(fx-1,-21,3,2,'#6a4018');s(fx-1,-7,3,2,'#6a4018');s(-4,-21,3,10,'#6a4a2a');s(-4,-23,1,2,'#e8e0c0');s(-2,-23,1,2,'#e8e0c0');}
 if(cls==='Mage'){s(fx,-27,2,26,'#8a5a2a');s(fx-1,-32,4,4,'#a8e8ff');s(fx,-31,2,2,'#ffffff');}
}
const heroRow=()=>state.heroClass==='Mage'?20:state.heroClass==='Scout'?1:0;
function actor(x,fy,row,face,k,g){drawSpriteK(row,face,0,x,fy,k);if(g)drawGear(x,fy,k,face,g);}
function bars(W,H){px(0,0,W,H*.07,'#000');px(0,H*.93,W,H*.07,'#000');}
function sceneTitle(t,W,y){ctx.font='13px "Press Start 2P",monospace';ctx.textAlign='center';ctx.fillStyle='#000';ctx.fillText(t,W/2+2,y+2);ctx.fillStyle='#f8f8f8';ctx.fillText(t,W/2,y);}
function drawDreamScene(W,H){const k=Math.max(3,Math.round(H/190)),a=cinematic.actors,cls=state.heroClass;
px(0,0,W,H,'#2b2140');px(0,0,W,H*.42,'#4b3562');
for(let i=0;i<9;i++){const x=W*(i+.5)/9;px(x-16,H*.08,32,H*.15,i%2?'#c8502c':'#e8b84c');px(x-16,H*.23,32,6,i%2?'#8a3418':'#b8902c');px(x-3,H*.08-10,6,10,'#d8d0c0');}
for(let r=0;r<2;r++){const by=H*.31+r*H*.055;px(0,by+10,W,8,'#6a4a38');for(let x=(r%2)*28;x<W;x+=56)drawSpriteK([5,7,10,12,9,14,16][((x/56|0)+r)%7],0,0,x+20,by+10,2);}
px(0,H*.44,W,H*.56,'#dcbc7c');for(let y=H*.44;y<H;y+=32)for(let x=0;x<W;x+=32){const r=rand(x/32,y/32);if(r>.68)px(x+8+r*10,y+9,4,2,'#c09858');if(r<.12)px(x+14,y+20,3,3,'#e8d4a0');}
px(0,H*.44,W,8,'#7a5a38');ctx.strokeStyle='#b88850';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(W/2,H*.76,W*.32,H*.13,0,0,6.3);ctx.stroke();
[[a.MARA,14,0,null],[a.THOMAS,8,0,null],[a.ROWAN,2,0,null],[a.HERO,heroRow(),3,cls],[a.FOE,20,2,'Foe']].sort((p,q)=>p[0].y-q[0].y).forEach(([p,row,face,g])=>actor(p.x,p.y,row,face,g==='Foe'?k+1:k,g));
const v=ctx.createRadialGradient(W/2,H*.6,H*.2,W/2,H*.6,Math.max(W,H)*.7);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(10,0,30,.55)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
sceneTitle('HARVEST FESTIVAL CHAMPIONSHIP',W,H*.045+H*.07);bars(W,H);}
function drawSchoolScene(W,H){const k=Math.max(3,Math.round(H/190)),a=cinematic.actors;
roomShell(W,H,{wall:'#cfe0cf',trim:'#496848'},0,0,1,1);
px(W*.28,H*.06,W*.44,H*.16,'#4a3020');px(W*.29,H*.075,W*.42,H*.13,'#2e5a4a');px(W*.3,H*.2,W*.4,5,'#e8e0c8');ctx.fillStyle='#e8f0e0';ctx.font='10px "Press Start 2P",monospace';ctx.textAlign='center';ctx.fillText('WELCOME TO HEARTHVALE',W/2,H*.15);
for(const x of [.08,.82]){px(W*x,H*.07,W*.1,H*.15,'#5a4030');px(W*x+6,H*.07+6,W*.1-12,H*.15-12,'#9fd8f0');}
actor(W/2,H*.34,22,0,k);px(W*.42,H*.3,W*.16,H*.05,'#7a4e30');px(W*.42,H*.3,W*.16,5,'#b88858');
for(let r=0;r<2;r++)for(let c=0;c<4;c++){const x=W*(.14+c*.2),y=H*(.46+r*.13);px(x,y,W*.12,H*.05,'#a87848');px(x,y,W*.12,5,'#d8a868');}
for(const p of [a.HERO,a.ROWAN]){actor(p.x,p.y,p===a.HERO?heroRow():2,0,k);px(p.x-8*k,p.y-4*k,16*k,5*k,'#a87848');px(p.x-8*k,p.y-4*k,16*k,4,'#d8a868');}
sceneTitle('HEARTHVALE SCHOOL',W,H*.115+H*.0);bars(W,H);}
function drawWakeScene(W,H){const k=Math.max(3,Math.round(H/190)),pose=cinematic.wakePose||'lying',hr=heroRow();
roomShell(W,H,{wall:'#e6d4b0',trim:'#714832'},0,0,1,1);
px(W*.08,H*.07,W*.16,H*.17,'#5a4030');px(W*.09,H*.085,W*.14,H*.14,'#9fd8f0');px(W*.155,H*.085,6,H*.14,'#5a4030');px(W*.09,H*.145,W*.14,6,'#5a4030');
px(W*.7,H*.12,W*.2,H*.1,'#8a5a3a');px(W*.71,H*.13,W*.18,H*.03,'#c89868');
px(W*.3,H*.6,W*.4,H*.26,'#a8483c');px(W*.32,H*.62,W*.36,H*.22,'#c8685a');px(W*.34,H*.64,W*.32,H*.18,'#a8483c');
const u=k*3,x0=W/2-11*u,y0=H*.2;
px(x0-u/2,y0-u,23*u,2*u,'#5a3a28');px(x0,y0,22*u,30*u,'#7a4e30');px(x0+u,y0+2*u,20*u,27*u,'#f2e8d0');px(x0+4*u,y0+3*u,14*u,5*u,'#fffaf0');
ctx.imageSmoothingEnabled=false;
if(pose==='lying')ctx.drawImage(CHARS,0,hr*24+2,16,10,Math.round(W/2-8*k),Math.round(y0+3.5*u),16*k,10*k);
else if(pose==='sitting')actor(W/2,y0+18*u,hr,0,k);
const bt=pose==='lying'?13:pose==='sitting'?19:11;px(x0+u,y0+bt*u,20*u,(29-bt)*u,'#4f8f98');px(x0+u,y0+bt*u,20*u,u,'#8fc8c0');px(x0+u,y0+(bt+4)*u,20*u,u/2,'#3a7078');
if(pose==='standing')actor(x0+25*u,y0+30*u,hr,0,k);
actor(W*.26,H*.86,14,3,k);actor(W*.74,H*.86,8,2,k);
ctx.fillStyle='rgba(255,236,170,.14)';ctx.beginPath();ctx.moveTo(W*.09,H*.24);ctx.lineTo(W*.23,H*.24);ctx.lineTo(W*.55,H*.9);ctx.lineTo(W*.25,H*.9);ctx.fill();
sceneTitle('HEARTHVALE — MORNING',W,H*.115);bars(W,H);}
let stepper=null,alt=0,stepCount=0,turnWait=0,facing=0,walking=false,typing=false,typer=null,fullText='';
const BLD=new Image();BLD.src='/img/last-harvest/buildings.png';
const BR={cottage:[0,0,97,92],inn:[101,0,96,106],store:[201,0,88,106],workshop:[293,0,66,81],tree:[530,0,58,76],pine:[592,0,54,72]},HOUSES=['cottage','inn','store','workshop'];
const CHARS=new Image();CHARS.src='/img/last-harvest/characters.png';
const NPC_ROW={'ELDER MAPLE':22,'ROWAN':2,'MILLIE':12,'GUS':7,'PIPER':5,'MARA THE NEIGHBOR':14,'JUNIPER':16,'INNKEEPER BRAM':8,'NELL THE TRAVELER':6,'SHOPKEEPER TILLY':13,'FINN':10,'OLD CRAFTSMAN ORIN':9,'WREN THE APPRENTICE':19};
/* characters.png: one row per character, 12 frames: down, up, left, right x (idle, step, step) */
function drawSpriteK(row,face,step,x,fy,k){if(!CHARS.complete||!CHARS.naturalWidth)return;ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(Math.round(x-5*k),Math.round(fy-k),10*k,3*k);ctx.imageSmoothingEnabled=false;ctx.drawImage(CHARS,(face*3+step)*16,row*24,16,24,Math.round(x-8*k),Math.round(fy-24*k),16*k,24*k);}
function drawSprite(row,face,step,x,y){drawSpriteK(row,face,step,x,y+8,2);}
function drawPerson(x,y,shirt,hat,name=''){const row=NPC_ROW[name]??[2,5,7,9,10][[...String(name)].reduce((a,c)=>a+c.charCodeAt(0),0)%5];const t=scene==='inside'?insidePlayer:state,dx=t.x-x,dy=t.y-y;let face=0;if(Math.hypot(dx,dy)<120)face=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);drawSprite(row,face,0,x,y);}
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
function roomShell(W,H,pal,fx,fy,fw,fh){const x=W*fx,y=H*fy,w=W*fw,h=H*fh,wallH=Math.min(h*.26,120);
for(let r=0,yy=y+wallH;yy<y+h;r++,yy+=24){px(x,yy,w,24,r%2?'#c99a6a':'#d4a674');px(x,yy+22,w,2,'#a97a52');for(let xx=x+(r%2)*48;xx<x+w;xx+=96)px(xx,yy,2,22,'#a97a52');}
px(x,y,w,wallH,pal.wall);for(let xx=x;xx<x+w;xx+=32)px(xx,y,2,wallH,'rgba(0,0,0,.06)');px(x,y+wallH-10,w,10,pal.trim);px(x,y+wallH-12,w,2,'rgba(255,255,255,.3)');}
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
roomShell(W,H,palettes,.05,.19,.9,.7);
px(W*.05,H*.19,W*.9,H*.07,'#8b5b42');
for(let i=0;i<5;i++)px(W*(.08+i*.17),H*.27,W*.14,4,'#d0b48c');
px(W*.42,H*.23,W*.16,H*.18,'#714b38');px(W*.445,H*.25,W*.11,H*.14,'#a64e3e');px(W*.47,H*.29,W*.06,H*.09,'#f1a45c');
px(W*.11,H*.38,W*.12,H*.12,'#79513a');px(W*.13,H*.4,W*.08,H*.08,'#d0a36d');
}else if(interiorId===1){
px(0,0,W,H*.23,'#4d382f');roomShell(W,H,palettes,.08,.22,.84,.67);
for(let i=0;i<4;i++){px(W*(.1+i*.21),H*.29,W*.16,H*.035,'#9b714c');px(W*(.12+i*.21),H*.33,W*.12,H*.02,'#d5b780');}
px(W*.08,H*.48,W*.25,H*.09,'#70462f');px(W*.1,H*.5,W*.21,H*.05,'#c18a49');
px(W*.68,H*.48,W*.24,H*.09,'#70462f');px(W*.7,H*.5,W*.20,H*.05,'#c18a49');
}else if(interiorId===2){
roomShell(W,H,palettes,.04,.18,.92,.72);
px(W*.08,H*.26,W*.84,H*.035,'#a56e43');
for(const x of [.11,.32,.57,.78]){px(W*x,H*.34,W*.1,H*.19,'#70462f');for(let j=0;j<3;j++)px(W*(x+.012),H*(.37+j*.05),W*.076,H*.018,['#c96f4e','#7d9b69','#e0b85f'][j]);}
px(W*.38,H*.59,W*.24,H*.08,'#a64f3f');px(W*.4,H*.61,W*.2,H*.04,'#d8aa66');
}else{
roomShell(W,H,palettes,.05,.2,.9,.69);
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
function drawPlayer(x,y){const row=state.heroClass==='Mage'?20:state.heroClass==='Scout'?1:0;drawSprite(row,facing,walking?1+alt:0,x,y);drawGear(x,y+8,2,facing,state.heroClass);}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];const speaker=line[0]==='NARRATOR'?'ROWAN':line[0];$('lh-speaker').textContent=speaker;typeText(line[1]);drawDialoguePortrait(speaker);$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
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
function positionSpeechBubble(){}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function typeText(t){clearInterval(typer);fullText=t;typing=true;const el=$('lh-dialogue-text');let i=0;el.textContent='';typer=setInterval(()=>{el.textContent=t.slice(0,++i);if(i>=t.length)finishType();},24);}
function finishType(){clearInterval(typer);typing=false;$('lh-dialogue-text').textContent=fullText;}
function advanceDialogue(){if(!dialogue)return;if(typing){finishType();return;}dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
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
function move(dt){walking=false;const ins=scene==='inside',P=ins?insidePlayer:state;
if(stepper){stepper.t+=dt/.19;const e=Math.min(1,stepper.t);P.x=stepper.fx+(stepper.tx-stepper.fx)*e;P.y=stepper.fy+(stepper.ty-stepper.fy)*e;walking=true;if(stepper.t<1)return;P.x=stepper.tx;P.y=stepper.ty;stepper=null;alt^=1;if(!ins&&++stepCount%4===0)save();}
if(dialogue||cinematic||transitioning||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;
if(!ins){P.x=Math.floor(P.x/TILE)*TILE+16;P.y=Math.floor(P.y/TILE)*TILE+24;}
let dx=joystick.x,dy=joystick.y;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;
if(Math.abs(dx)<.35&&Math.abs(dy)<.35){turnWait=0;return;}
const f=Math.abs(dx)>=Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
if(f!==facing){facing=f;turnWait=.09;return;}
if(turnWait>0){turnWait-=dt;return;}
const nx=P.x+[0,0,-1,1][f]*TILE,ny=P.y+[1,-1,0,0][f]*TILE;
const hit=ins?(roomBlocked(nx,ny)||roomNPCSpots[interiorId].some(s=>Math.hypot(nx-innerWidth*s.x,ny-innerHeight*s.y)<28)):(blocked(nx,ny)||npcs.some(n=>Math.floor(n.x/TILE)===Math.floor(nx/TILE)&&Math.floor(n.y/TILE)===Math.floor(ny/TILE)));
if(hit)return;stepper={fx:P.x,fy:P.y,tx:nx,ty:ny,t:0};walking=true;}
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
