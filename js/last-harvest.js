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
const trees=[];for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++)if((x<4||y<3||x>MAP_W-5||y>MAP_H-5)&&rand(x,y)>.18)trees.push({x,y});
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
function drawWorld(){const W=innerWidth,H=innerHeight;if(cinematic&&cinematic.phase==='dream'){drawDreamScene(W,H);return{camX:0,camY:0};}if(cinematic&&cinematic.phase==='wake'){drawWakeScene(W,H);return{camX:0,camY:0};}if(scene==='inside'){drawInterior(W,H);return{camX:0,camY:0};}
const focus=cinematic?cinematic.camera:{x:state.x,y:state.y};const camX=Math.max(0,Math.min(MAP_W*TILE-W,focus.x-W/2)),camY=Math.max(0,Math.min(MAP_H*TILE-H,focus.y-H/2));
ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.floor(camX),-Math.floor(camY));
for(let y=Math.max(0,Math.floor(camY/TILE));y<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);y++)for(let x=Math.max(0,Math.floor(camX/TILE));x<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);x++){
px(x*TILE,y*TILE,TILE,TILE,(x+y)%2?C.grass:C.grass2);
if(rand(x,y)>.78){px(x*TILE+5+rand(y,x)*18,y*TILE+5+rand(x+3,y)*18,3,3,C.light);px(x*TILE+12,y*TILE+22,2,2,'#d7c66b');}}
/* Broad stone paths with alternating diamond-like paving and dark grout */
function path(x,y,w,h){px(x,y,w,h,C.pathShade);for(let yy=y+2;yy<y+h-2;yy+=24)for(let xx=x+2;xx<x+w-2;xx+=32){px(xx,yy,29,21,C.path2);px(xx+2,yy+2,25,17,C.path);px(xx+14,yy+2,2,17,'#aab9b5');px(xx+2,yy+9,25,2,'#e5e5d3');}}
path(0,11*TILE,MAP_W*TILE,4*TILE);path(15*TILE,0,4*TILE,MAP_H*TILE);path(19*TILE,14*TILE,10*TILE,2*TILE);
drawHouse(solids[0],'#c18a43');drawHouse(solids[1],'#8e5940');drawHouse(solids[2],'#a64e37');drawHouse(solids[3],'#c18a43');
for(const t of trees)drawTree(t.x,t.y);
// Hand-placed landmarks and decorative sprite clusters make the village feel lived-in.
for(const p of [[12,9],[14,10],[29,9],[32,15],[12,19],[27,20],[9,24],[39,25],[17,28],[31,29]])drawBush(p[0],p[1]);
for(const p of [[15,10],[24,10],[13,17],[26,17],[30,23],[11,27],[35,27]])drawFlower(p[0],p[1]);
for(const p of [[15,14],[29,14],[12,22],[32,20]])drawLamp(p[0],p[1]);
drawBench(16,15);drawBench(24,15);drawPumpkin(13,12);drawPumpkin(26,18);drawRock(9,18);drawRock(37,17);drawFence(3,22,4);drawFence(40,22,4);
drawSign(27,9,'TOWN');drawSign(15,10,'INN');
/* fountain, sign and village details */
px(18*TILE,12*TILE,3*TILE,2*TILE,'#536a78');px(18*TILE+5,12*TILE+4,3*TILE-10,34,'#b5d1c9');px(18*TILE+12,12*TILE+8,42,25,'#5cabb4');px(18*TILE+20,12*TILE-7,26,10,'#e8e6cf');px(18*TILE+29,12*TILE-3,8,5,'#7dc9cf');
px(27*TILE,10*TILE,5,30,C.wood);px(27*TILE-15,10*TILE,38,14,C.gold);px(27*TILE-10,10*TILE+4,26,3,C.wood);
for(const n of npcs){const a=cinematic&&cinematic.actors[n.name];drawPerson(a?a.x:n.x,a?a.y:n.y,n.color,n.name==='ROWAN'?'#9b4a36':'#637b55');}
if(cinematic&&cinematic.actors.CHAMPION){const a=cinematic.actors.CHAMPION;drawPerson(a.x,a.y,'#d5b64e','#e8bd58');}
drawPlayer(state.x,state.y);
let promptTarget=null,promptDist=Infinity,promptLabel='E · TALK';
for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<104&&d<promptDist){promptTarget=n;promptDist=d;promptLabel='E · TALK';}}
const doors=[{x:10.5,y:10.5},{x:34,y:10.5},{x:22,y:22.5},{x:5.5,y:29.5}];
for(const d of doors){const wx=d.x*TILE,wy=d.y*TILE,dd=Math.hypot(state.x-wx,state.y-wy);if(dd<112&&dd<promptDist){promptTarget={x:wx,y:wy};promptDist=dd;promptLabel='E · ENTER';}}
const signDist=Math.hypot(state.x-27*TILE,state.y-10*TILE);if(signDist<100&&signDist<promptDist){promptTarget={x:27*TILE,y:10*TILE};promptLabel='E · READ';}
if(promptTarget)drawWorldPrompt(promptTarget.x,promptTarget.y-30,promptLabel);
ctx.restore();return{camX,camY};}
function drawDreamScene(W,H){px(0,0,W,H,'#49345f');for(let i=0;i<14;i++){px(i*W/14,0,W/14,H*.24,i%2?'#bd874e':'#e2b95c');px(i*W/14,H*.24,W/14,H*.1,'#7b4b68');}px(0,H*.34,W,H*.66,'#704b36');px(0,H*.76,W,H*.24,'#c18b49');for(let i=0;i<12;i++){const x=i*W/11;drawPerson(x,H*.38,'#6b9c70','#d8b86a');}px(W*.2,H*.55,W*.6,H*.26,'#9b633d');px(W*.22,H*.57,W*.56,H*.22,'#c18a48');const a=cinematic.actors;drawPerson(a.MARA.x,a.MARA.y,'#b86c78','#70485c');drawPerson(a.THOMAS.x,a.THOMAS.y,'#577f9b','#4a536e');drawPerson(a.ROWAN.x,a.ROWAN.y,'#bb6542','#9b4a36');drawPlayer(a.HERO.x,a.HERO.y);drawPerson(a.FOE.x,a.FOE.y,'#7d526f','#45364e');ctx.fillStyle='#fff2c7';ctx.font='bold 22px ui-monospace';ctx.textAlign='center';ctx.fillText('HARVEST FESTIVAL CHAMPIONSHIP',W/2,H*.12);ctx.font='bold 14px ui-monospace';ctx.fillText('THE CROWD IS CHEERING FOR YOU!',W/2,H*.2);}
function drawWakeScene(W,H){px(0,0,W,H,'#463b4d');px(0,0,W,H*.22,'#6c6472');px(W*.08,H*.12,W*.2,H*.34,'#343d54');px(W*.1,H*.14,W*.16,H*.29,'#75a9b3');px(W*.18,H*.14,5,H*.29,'#e4d6b0');px(0,H*.72,W,H*.28,'#a77b54');px(W*.24,H*.52,W*.52,H*.3,'#654638');px(W*.26,H*.5,W*.48,H*.28,'#d6b27a');px(W*.28,H*.47,W*.44,H*.08,'#f0d6a0');px(W*.3,H*.52,W*.4,H*.19,'#9b6c50');px(W*.44,H*.54,W*.12,H*.13,'#d6b27a');drawPerson(W*.35,H*.56,'#b86c78','#70485c');drawPerson(W*.65,H*.56,'#577f9b','#4a536e');drawPlayer(W*.5,H*.72);ctx.fillStyle='#fff2c7';ctx.font='bold 18px ui-monospace';ctx.textAlign='center';ctx.fillText('HEARTHVALE — MORNING',W/2,H*.12);}
function drawPerson(x,y,shirt,hat){const bob=Math.sin(performance.now()/190+x*.035)*1.4;px(x-8,y-4,16,14,C.ink);px(x-6,y-16,12,13,C.skin);px(x-7,y-20,14,6,hat);px(x-8,y-7,16,12,shirt);px(x-7,y+5,5,8,'#3d4050');px(x+2,y+5,5,8,'#3d4050');px(x-5,y-12,2,2,C.ink);px(x+3,y-12,2,2,C.ink);px(x-11,y-5,4,8,C.skin);px(x+7,y-5,4,8,C.skin);}
function drawInterior(W,H){ctx.clearRect(0,0,W,H);px(0,0,W,H,'#59402f');
// A room with visible timber walls, floorboards, windows, rugs and furniture.
px(0,0,W,H*.2,'#4a352b');px(0,H*.17,W,H*.035,'#b47a45');
for(let y=H*.205;y<H;y+=28){px(0,y,W,26,(Math.floor(y/28)%2)?'#b98755':'#c99b66');px(0,y+24,W,3,'#98633f');}
px(W*.055,H*.23,W*.89,H*.69,'#704a34');px(W*.07,H*.25,W*.86,H*.65,'#dfc28d');
// windows with crossbars
for(const wx of [W*.18,W*.76]){px(wx-25,H*.29,52,58,'#493d39');px(wx-21,H*.33,44,48,'#67b7c6');px(wx-2,H*.33,4,48,'#e6d7ae');px(wx-21,H*.53,44,4,'#e6d7ae');}
// room-specific furnishings
if(interiorId===0){px(W*.38,H*.36,W*.24,55,'#8a5b3a');px(W*.4,H*.34,W*.2,13,'#e4c78c');px(W*.13,H*.64,95,38,'#8a4e3d');px(W*.13,H*.61,95,10,'#d9aa6a');px(W*.73,H*.62,60,48,'#95633e');}
if(interiorId===1){px(W*.16,H*.58,W*.68,62,'#8b5937');px(W*.18,H*.55,W*.64,16,'#e0b879');px(W*.2,H*.52,24,36,'#d6c18c');px(W*.76,H*.52,24,36,'#d6c18c');px(W*.4,H*.35,W*.2,28,'#8b583a');}
if(interiorId===2){for(let i=0;i<4;i++){px(W*.12+i*W*.2,H*.38,52,75,'#805136');px(W*.12+i*W*.2,H*.36,52,9,'#e0b879');for(let j=0;j<3;j++)px(W*.14+i*W*.2,H*.42+j*16,28,9,['#c66b45','#75a06b','#d6b65d'][j]);}}
if(interiorId===3){px(W*.18,H*.57,W*.64,36,'#805136');px(W*.2,H*.53,W*.6,12,'#d5a75e');px(W*.24,H*.47,26,35,'#7b8794');px(W*.66,H*.45,38,40,'#7b8794');px(W*.48,H*.32,42,38,'#c28c4d');}
// Extra room dressing: patterned rugs, lamps, potted plants, shelves and tiny props.
px(W*.34,H*.7,W*.32,H*.12,'#a64f3f');px(W*.36,H*.72,W*.28,H*.08,'#d7a65d');px(W*.48,H*.74,W*.04,H*.04,'#f2d58b');
for(const side of [W*.1,W*.84]){px(side,H*.34,24,48,'#68452e');px(side+3,H*.37,18,4,'#d2a35e');px(side+3,H*.48,18,4,'#d2a35e');px(side+7,H*.3,10,12,'#4b8b5b');px(side+9,H*.28,6,9,'#7abf68');}
px(W*.08,H*.78,28,20,'#6e4b34');px(W*.085,H*.74,18,12,'#4f8b58');px(W*.09,H*.72,8,9,'#7ac06b');
px(W*.88,H*.78,24,20,'#6e4b34');px(W*.885,H*.74,16,12,'#4f8b58');
px(W*.46,H*.28,W*.08,5,'#8a5938');px(W*.49,H*.23,W*.02,12,'#e6c77f');ctx.fillStyle=C.cream;ctx.font='bold 15px ui-monospace';ctx.textAlign='center';ctx.fillText(['MAPLE COTTAGE','VILLAGE INN','TILLY’S GENERAL STORE','ORIN’S WORKSHOP'][interiorId],W/2,H*.14);
for(const n of roomNPCs[interiorId])drawPerson(W*n.x,H*n.y,n.color,'#634b3a');
let roomTarget=null,roomDist=Infinity;for(const n of roomNPCs[interiorId]){const d=Math.hypot(insidePlayer.x-W*n.x,insidePlayer.y-H*n.y);if(d<Math.max(112,W*.14)&&d<roomDist){roomTarget=n;roomDist=d;}}
if(roomTarget)drawWorldPrompt(W*roomTarget.x,H*roomTarget.y-32,'E · TALK');else if(insidePlayer.y>H*.68)drawWorldPrompt(W*.5,H*.83,'E · EXIT');
// Door mat marks the exit; player walks here before leaving.
px(W*.43,H*.83,W*.14,12,'#a16b3f');px(W*.45,H*.85,W*.1,6,'#e0bd79');
drawPlayer(insidePlayer.x,insidePlayer.y);}
function drawWorldPrompt(x,y,label){const w=Math.max(66,label.length*7+22),h=22;ctx.fillStyle='#26334a';ctx.fillRect(Math.round(x-w/2-2),Math.round(y-h-2),w+4,h+4);ctx.fillStyle='#f3e6bf';ctx.fillRect(Math.round(x-w/2),Math.round(y-h),w,h);ctx.fillStyle='#26334a';ctx.font='bold 10px ui-monospace';ctx.textAlign='center';ctx.fillText(label,x,y-7);}
function drawPlayer(x,y){const bob=Math.sin(playerFrame/5)*1.5,step=Math.round(Math.sin(playerFrame*1.8)*2);px(x-9,y+7+bob,18,7,C.ink);px(x-7-step,y+10+bob,5,7,'#39415a');px(x+3+step,y+10+bob,5,7,'#39415a');
px(x-9,y-8+bob,18,17,C.ink);px(x-7,y-7+bob,14,14,state.heroClass==='Mage'?'#6658a5':state.heroClass==='Scout'?'#4c8955':'#b94b38');
px(x-11,y-4+bob,4,10,C.skin);px(x+7,y-4+bob,4,10,C.skin);px(x-7,y-20+bob,14,13,C.skin);
px(x-9,y-24+bob,18,7,C.ink);px(x-7,y-27+bob,14,6,state.heroClass==='Mage'?'#6554a5':state.heroClass==='Scout'?'#4a8a54':'#c44736');
px(x-7,y-21+bob,14,3,'#f2d6a2');px(x-5,y-15+bob,3,3,C.ink);px(x+3,y-15+bob,3,3,C.ink);
px(x-7,y+6+bob,6,5,C.ink);px(x+2,y+6+bob,6,5,C.ink);}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];$('lh-speaker').textContent=line[0];$('lh-dialogue-text').textContent=line[1];$('lh-dialogue').hidden=false;positionSpeechBubble(line[0]);}
function positionSpeechBubble(name){const el=$('lh-dialogue');let p=null;if(cinematic&&cinematic.actors&&cinematic.actors[name])p=cinematic.actors[name];else if(scene==='outside'){const n=npcs.find(v=>v.name===name);if(n)p={x:n.x,y:n.y};}else if(scene==='inside'){const n=roomNPCs[interiorId].find(v=>v.name===name);if(n)p={x:innerWidth*n.x,y:innerHeight*n.y};}if(p&&scene==='outside'&&!cinematic){const camX=Math.max(0,Math.min(MAP_W*TILE-innerWidth,state.x-innerWidth/2)),camY=Math.max(0,Math.min(MAP_H*TILE-innerHeight,state.y-innerHeight/2));p={x:p.x-camX,y:p.y-camY};}if(p){el.style.left=Math.max(12,Math.min(innerWidth-12,p.x))+'px';el.style.top=Math.max(70,p.y-88)+'px';el.style.bottom='auto';el.style.transform='translate(-50%,-100%)';}else{el.style.left='50%';el.style.top='auto';el.style.bottom='18px';el.style.transform='translateX(-50%)';}}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function advanceDialogue(){if(!dialogue)return;dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function enterBuilding(id){if(transitioning||scene!=='outside')return;transitioning=true;const doors=[{x:10.5*TILE,y:10.55*TILE},{x:34*TILE,y:10.55*TILE},{x:22*TILE,y:22.55*TILE},{x:5.5*TILE,y:29.55*TILE}],door=doors[id],from={x:state.x,y:state.y},start=performance.now(),duration=620;function walk(now){const p=Math.min(1,(now-start)/duration),ease=p*p*(3-2*p);state.x=from.x+(door.x-from.x)*ease;state.y=from.y+(door.y-from.y)*ease;playerFrame+=.45;if(p<1)requestAnimationFrame(walk);else{interiorId=id;scene='inside';insideTalked=false;insidePlayer={x:innerWidth/2,y:innerHeight*.76};updateHud();save();setTimeout(()=>{transitioning=false;},180);}}requestAnimationFrame(walk);}
let transitioning=false,insidePlayer={x:innerWidth/2,y:innerHeight*.76};
function interact(){if(transitioning)return;if(scene==='inside'){if(dialogue){advanceDialogue();return;}const W=innerWidth,H=innerHeight,pxp=insidePlayer.x,pyp=insidePlayer.y;let target=null,dist=Infinity;for(const n of roomNPCs[interiorId]){const d=Math.hypot(pxp-W*n.x,pyp-H*n.y);if(d<Math.max(92,W*.12)&&d<dist){target=n;dist=d;}}if(target){setDialogue(target.lines.map(t=>[target.name,t]));if(interiorId===3&&target.name==='OLD CRAFTSMAN ORIN'&&questStep<3){questStep=3;updateQuest();}return;}if(pyp>H*.78){scene='outside';state.x=([10.5,34,22,5.5][interiorId])*TILE;state.y=([10.9,10.9,22.9,29.9][interiorId])*TILE;updateHud();save();return;}setDialogue([['NARRATOR','There is no one close enough to talk to. Walk up to a person and press INTERACT.']]);return;}if(dialogue){advanceDialogue();return;}if(cinematic)return;if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<64&&d<dist){found=n;dist=d;}}
if(found){
if(found.name==='ELDER MAPLE'&&questStep===0){questStep=1;setDialogue([[found.name,'First, visit the village homes. Your parents may have left a clue.'],['QUEST UPDATED','Visit the homes around the village.']]);}
else if(found.name==='ROWAN'&&questStep===1){questStep=2;setDialogue([[found.name,'I will check the fountain. You should search the buildings.'],['QUEST UPDATED','Enter a building and look for clues.']]);}
else setDialogue(found.lines.map(t=>[found.name,t]));
save();updateQuest();return;}
const doors=[{x:10.5,y:10.5,id:0},{x:34,y:10.5,id:1},{x:22,y:22.5,id:2},{x:5.5,y:29.5,id:3}];for(const d of doors){if(Math.hypot(state.x-d.x*TILE,state.y-d.y*TILE)<82){enterBuilding(d.id);return;}}
const sx=27*TILE,sy=10*TILE;if(Math.hypot(state.x-sx,state.y-sy)<75){setDialogue([['OLD SIGN','AUTUMNWOOD — follow the golden leaves beyond the village.'],['QUEST','Explore Hearthvale and speak with the villagers. The road north-east leads to your first chapter.']]);return;}
setDialogue([['NARRATOR','The wind carries the smell of cinnamon and fallen leaves. There may be something nearby.']]);}
function startIntro(){document.body.classList.add('lh-cinematic');state.name=$('lh-name-input').value.trim().slice(0,16)||'Adventurer';state.heroClass=document.querySelector('.lh-class.selected').dataset.class;state.x=20*TILE;state.y=15*TILE;state.hp=state.heroClass==='Guardian'?50:state.heroClass==='Mage'?36:40;state.coins=100;state.stage=0;state.seenIntro=true;save();$('lh-create').hidden=true;updateHud();
cinematic={phase:'dream',camera:{x:0,y:0},actors:{HERO:{x:innerWidth*.28,y:innerHeight*.68},FOE:{x:innerWidth*.7,y:innerHeight*.68},MARA:{x:innerWidth*.18,y:innerHeight*.48},THOMAS:{x:innerWidth*.82,y:innerHeight*.48},ROWAN:{x:innerWidth*.5,y:innerHeight*.4}}};
const say=lines=>new Promise(resolve=>setDialogue(lines,resolve));
const moveActor=(name,to,duration=900)=>new Promise(resolve=>{const a=cinematic.actors[name],from={x:a.x,y:a.y},start=performance.now();function step(now){if(!cinematic)return resolve();const p=Math.min(1,(now-start)/duration),e=p*p*(3-2*p);a.x=from.x+(to.x-from.x)*e;a.y=from.y+(to.y-from.y)*e;if(p<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
(async()=>{
await say([['DREAM','The Harvest Festival arena roars with excitement. Golden banners wave as the crowd chants your name!']]);
await say([['CROWD',''+state.name+'! '+state.name+'! You can do it!'],['ROWAN','Show them what the future champion of Hearthvale can do!']]);
await moveActor('HERO',{x:innerWidth*.48,y:innerHeight*.68},1100);
await say([['ANNOUNCER','The challenger enters the arena! The final match begins now!']]);
await moveActor('FOE',{x:innerWidth*.58,y:innerHeight*.68},650);
await say([['CHALLENGER','You really think you can beat me?'],['CROWD','We believe in you, '+state.name+'!']]);
await moveActor('HERO',{x:innerWidth*.57,y:innerHeight*.68},700);
await say([['NARRATOR','You dash forward, dodge the challenger’s strike, and land one final heroic blow!']]);
await moveActor('FOE',{x:innerWidth*.77,y:innerHeight*.72},650);
await say([['ANNOUNCER','THE CHAMPION WINS!'],['CROWD',''+state.name+'! '+state.name+'! HEARTHVALE’S HERO!'],['MARA','That is our child! We are so proud of you!'],['THOMAS','The greatest warrior in all of Hearthvale!']]);
cinematic.phase='wake';cinematic.actors={HERO:{x:innerWidth*.5,y:innerHeight*.72},MARA:{x:innerWidth*.35,y:innerHeight*.56},THOMAS:{x:innerWidth*.65,y:innerHeight*.56}};
await say([['NARRATOR','“Wake up, sleepyhead…” A familiar voice pulls you out of the dream.']]);
await say([['MARA','There you are. We wanted to see you before we left for the Everfeast preparations.'],['THOMAS','Keep being brave, alright? We will be back before supper.'],[''+state.name,'I will. I promise.'],['MARA','We love you. Never forget that.']]);
await moveActor('MARA',{x:innerWidth*.42,y:innerHeight*.58},500);
await moveActor('THOMAS',{x:innerWidth*.58,y:innerHeight*.58},500);
await say([['NARRATOR','Your parents smile, then step out of the room. It is the last time you will see them before they disappear.'],['NARRATOR','A little later, a distant bell rings. You climb out of bed. Something is wrong in Hearthvale.']]);
cinematic.phase='outside';cinematic.camera={x:20*TILE,y:15*TILE};cinematic.actors={ROWAN:{x:24*TILE,y:13*TILE},'ELDER MAPLE':{x:15*TILE,y:12*TILE}};
await moveActor('ROWAN',{x:21*TILE,y:14*TILE},1100);
await say([['ROWAN',''+state.name+'! Your parents are missing. I have been looking everywhere!']]);
cinematic.camera={x:16*TILE,y:13*TILE};await moveActor('ELDER MAPLE',{x:17*TILE,y:13*TILE},800);
await say([['ELDER MAPLE','The keepers of the Everfeast are gone. We need you to help us find them.'],['ROWAN','I saw strange tracks near the fountain. Come on!'],['NARRATOR','Your dream felt so real. But now Hearthvale needs you.']]);
cinematic=null;document.body.classList.remove('lh-cinematic');questStep=0;updateQuest();save();
})();}

function updateQuest(){const q=['Speak with Elder Maple','Visit Rowan in the village square','Enter a building and search for clues','Return to Elder Maple with what you found','Follow the golden leaves beyond the village'];$('lh-quest-text').textContent=q[Math.min(questStep,q.length-1)];}
function updateHud(){ $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-health').textContent=state.hp;$('lh-coins').textContent=state.coins;$('lh-location').textContent=scene==='inside'?['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]:chapters[Math.min(state.stage,9)].place.toUpperCase();updateQuest();}
function move(dt){if(dialogue||cinematic||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;let dx=0,dy=0;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;dx+=joystick.x;dy+=joystick.y;if(!dx&&!dy)return;const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;const speed=state.heroClass==='Scout'?190:state.heroClass==='Guardian'?145:165;if(scene==='inside'){const nx=insidePlayer.x+dx*speed*dt,ny=insidePlayer.y+dy*speed*dt;insidePlayer.x=Math.max(innerWidth*.12,Math.min(innerWidth*.88,nx));insidePlayer.y=Math.max(innerHeight*.28,Math.min(innerHeight*.88,ny));playerFrame+=dt*14;return;}const nx=state.x+dx*speed*dt,ny=state.y+dy*speed*dt;if(!blocked(nx,state.y))state.x=nx;if(!blocked(state.x,ny))state.y=ny;playerFrame+=dt*14;moveCooldown+=dt;if(moveCooldown>.6){moveCooldown=0;save();}}
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
document.querySelectorAll('.lh-class').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.lh-class').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');}));
$('lh-begin').addEventListener('click',startIntro);
$('lh-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')startIntro();});
$('lh-menu').addEventListener('click',()=>{ $('lh-menu-stats').textContent=state.name+' · '+state.heroClass+' · '+chapters[Math.min(state.stage,9)].title+' · '+state.coins+' coins';$('lh-game-menu').hidden=false;});
$('lh-resume').addEventListener('click',()=>{$('lh-game-menu').hidden=true;});
$('lh-reset').addEventListener('click',()=>{if(confirm('Start a new adventure? Your saved progress on this device will be replaced.')){localStorage.removeItem(SAVE);location.reload();}});
if(state.name){$('lh-create').hidden=true;updateHud();}else{$('lh-create').hidden=false;}
if(!state.seenIntro&&state.name){$('lh-create').hidden=false;}
})();