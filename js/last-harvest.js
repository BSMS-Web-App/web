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
const npcs=[{x:16*TILE,y:12*TILE,name:'ELDER MAPLE',color:'#b8c7a1',lines:['The village square feels colder today. Your parents were last seen near the fountain.','The Everfeast is older than Hearthvale. Find the truth, not just the missing keepers.']},{x:22*TILE,y:13*TILE,name:'ROWAN',color:'#bb6542',lines:['I will come with you. We have been friends forever—trust me.','The woods are full of strange creatures. Keep your guard up.']}];
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
function drawWorld(){const W=innerWidth,H=innerHeight;if(scene==='inside'){drawInterior(W,H);return{camX:0,camY:0};}
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
/* fountain, sign and village details */
px(18*TILE,12*TILE,3*TILE,2*TILE,'#536a78');px(18*TILE+5,12*TILE+4,3*TILE-10,34,'#b5d1c9');px(18*TILE+12,12*TILE+8,42,25,'#5cabb4');px(18*TILE+20,12*TILE-7,26,10,'#e8e6cf');px(18*TILE+29,12*TILE-3,8,5,'#7dc9cf');
px(27*TILE,10*TILE,5,30,C.wood);px(27*TILE-15,10*TILE,38,14,C.gold);px(27*TILE-10,10*TILE+4,26,3,C.wood);
for(const n of npcs){const a=cinematic&&cinematic.actors[n.name];drawPerson(a?a.x:n.x,a?a.y:n.y,n.color,n.name==='ROWAN'?'#9b4a36':'#637b55');}
if(cinematic&&cinematic.actors.CHAMPION){const a=cinematic.actors.CHAMPION;drawPerson(a.x,a.y,'#d5b64e','#e8bd58');}
drawPlayer(state.x,state.y);ctx.restore();return{camX,camY};}
function drawPerson(x,y,shirt,hat){const bob=0;px(x-8,y-4,16,14,C.ink);px(x-6,y-16,12,13,C.skin);px(x-7,y-20,14,6,hat);px(x-8,y-7,16,12,shirt);px(x-7,y+5,5,8,'#3d4050');px(x+2,y+5,5,8,'#3d4050');px(x-5,y-12,2,2,C.ink);px(x+3,y-12,2,2,C.ink);px(x-11,y-5,4,8,C.skin);px(x+7,y-5,4,8,C.skin);}
function drawInterior(W,H){ctx.clearRect(0,0,W,H);px(0,0,W,H,'#6e4932');px(0,0,W,H*.18,'#49372f');
for(let y=H*.2;y<H;y+=32)for(let x=0;x<W;x+=32){px(x+1,y+1,30,30,(x/32+y/32)%2?'#b98955':'#c99a61');px(x+2,y+2,28,2,'#dfb879');}
px(W*.1,H*.24,W*.8,H*.65,'#6b4935');px(W*.12,H*.26,W*.76,H*.61,'#dfc18a');
px(W*.17,H*.34,74,90,'#4b3c38');px(W*.18,H*.35,68,82,'#93613e');px(W*.72,H*.34,74,90,'#4b3c38');px(W*.73,H*.35,68,82,'#93613e');
px(W*.44,H*.56,W*.12,H*.35,'#51382d');px(W*.46,H*.59,W*.08,H*.32,'#98633d');px(W*.28,H*.69,W*.44,18,'#805339');px(W*.3,H*.66,W*.4,8,'#d8b879');
ctx.fillStyle=C.cream;ctx.font='bold 14px ui-monospace';ctx.textAlign='center';ctx.fillText(['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]||'HEARTHVALE HOME',W/2,H*.15);
drawPlayer(W/2,H*.72);}
function drawPlayer(x,y){const bob=Math.sin(playerFrame/5)*1.5;px(x-9,y+7+bob,18,7,C.ink);px(x-7,y+10+bob,5,7,'#39415a');px(x+3,y+10+bob,5,7,'#39415a');
px(x-9,y-8+bob,18,17,C.ink);px(x-7,y-7+bob,14,14,state.heroClass==='Mage'?'#6658a5':state.heroClass==='Scout'?'#4c8955':'#b94b38');
px(x-11,y-4+bob,4,10,C.skin);px(x+7,y-4+bob,4,10,C.skin);px(x-7,y-20+bob,14,13,C.skin);
px(x-9,y-24+bob,18,7,C.ink);px(x-7,y-27+bob,14,6,state.heroClass==='Mage'?'#6554a5':state.heroClass==='Scout'?'#4a8a54':'#c44736');
px(x-7,y-21+bob,14,3,'#f2d6a2');px(x-5,y-15+bob,3,3,C.ink);px(x+3,y-15+bob,3,3,C.ink);
px(x-7,y+6+bob,6,5,C.ink);px(x+2,y+6+bob,6,5,C.ink);}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];$('lh-speaker').textContent=line[0];$('lh-dialogue-text').textContent=line[1];$('lh-dialogue').hidden=false;}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function advanceDialogue(){if(!dialogue)return;dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function interact(){if(scene==='inside'){if(!insideTalked){insideTalked=true;questStep=Math.max(questStep,3);updateQuest();const names=['VILLAGER','INNKEEPER','SHOPKEEPER','OLD CRAFTSMAN'];const lines=[['There was a strange noise outside the village last night.','I saw two figures heading toward the fountain.'],['Travelers say the forest path has been acting strangely.','If you go, bring a lantern.'],['My shelves are nearly empty. Someone took the harvest supplies.','The Elder might know what was taken.'],['Your parents asked me to keep this safe. Take this old map.']];setDialogue([[names[interiorId],lines[interiorId][0]],[names[interiorId],lines[interiorId][1]],['QUEST UPDATED','Return to Elder Maple and report what you discovered.']]);return;}insideTalked=false;scene='outside';state.x=([10,34,22,5][interiorId])*TILE;state.y=([10,10,22,29][interiorId])*TILE;save();return;}if(dialogue){advanceDialogue();return;}if(cinematic)return;if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<64&&d<dist){found=n;dist=d;}}
if(found){
if(found.name==='ELDER MAPLE'&&questStep===0){questStep=1;setDialogue([[found.name,'First, visit the village homes. Your parents may have left a clue.'],['QUEST UPDATED','Visit the homes around the village.']]);}
else if(found.name==='ROWAN'&&questStep===1){questStep=2;setDialogue([[found.name,'I will check the fountain. You should search the buildings.'],['QUEST UPDATED','Enter a building and look for clues.']]);}
else setDialogue(found.lines.map(t=>[found.name,t]));
save();updateQuest();return;}
const doors=[{x:10,y:10,id:0},{x:34,y:10,id:1},{x:22,y:22,id:2},{x:5,y:29,id:3}];for(const d of doors){if(Math.hypot(state.x-d.x*TILE,state.y-d.y*TILE)<95){interiorId=d.id;insideTalked=false;scene='inside';return;}}
const sx=27*TILE,sy=10*TILE;if(Math.hypot(state.x-sx,state.y-sy)<75){setDialogue([['OLD SIGN','AUTUMNWOOD — follow the golden leaves beyond the village.'],['QUEST','Explore Hearthvale and speak with the villagers. The road north-east leads to your first chapter.']]);return;}
setDialogue([['NARRATOR','The wind carries the smell of cinnamon and fallen leaves. There may be something nearby.']]);}
function startIntro(){state.name=$('lh-name-input').value.trim().slice(0,16)||'Adventurer';state.heroClass=document.querySelector('.lh-class.selected').dataset.class;state.x=20*TILE;state.y=15*TILE;state.hp=state.heroClass==='Guardian'?50:state.heroClass==='Mage'?36:40;state.coins=100;state.stage=0;state.seenIntro=true;save();$('lh-create').hidden=true;updateHud();
// Scripted opening cinematic: actors move on-screen while the camera pans between them.
cinematic={time:0,camera:{x:20*TILE,y:15*TILE},actors:{CHAMPION:{x:17*TILE,y:15*TILE},ROWAN:{x:24*TILE,y:13*TILE},'ELDER MAPLE':{x:15*TILE,y:12*TILE}}};
const say=(lines)=>new Promise(resolve=>setDialogue(lines,resolve));
const moveActor=(name,to,duration=1100)=>new Promise(resolve=>{const a=cinematic.actors[name],from={x:a.x,y:a.y},start=performance.now();function step(now){if(!cinematic)return resolve();const p=Math.min(1,(now-start)/duration);const eased=p*p*(3-2*p);a.x=from.x+(to.x-from.x)*eased;a.y=from.y+(to.y-from.y)*eased;if(p<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
(async()=>{await say([['DREAM','A golden stadium stretches beneath an endless autumn sky. The crowd cheers as a champion steps forward.']]);cinematic.camera={x:17*TILE,y:15*TILE};await moveActor('CHAMPION',{x:19*TILE,y:15*TILE});await say([['DREAM','The champion raises a shining harvest blade. The crowd begins chanting your name: '+state.name+'!'],['DREAM','You step forward, ready to become the greatest warrior Hearthvale has ever known…']]);cinematic.camera={x:20*TILE,y:15*TILE};await say([['NARRATOR','A distant bell rings. The golden sky fades.']]);cinematic.actors.CHAMPION.x=17*TILE;cinematic.actors.CHAMPION.y=15*TILE;await say([['NARRATOR','You wake in your room. Morning light spills across the floor. Outside, the village bell is silent.']]);cinematic.camera={x:20*TILE,y:14*TILE};await moveActor('ROWAN',{x:21*TILE,y:14*TILE},1300);await say([['ROWAN',''+state.name+'! You are awake! Your parents are missing. I have been looking everywhere!']]);cinematic.camera={x:16*TILE,y:13*TILE};await moveActor('ELDER MAPLE',{x:17*TILE,y:13*TILE},900);await say([['ELDER MAPLE','The keepers of the Everfeast are gone. We need you to help us find them.'],['ROWAN','I saw strange tracks near the fountain. Come on—we have to move!'],['NARRATOR','Your dream of becoming a hero will have to wait. Hearthvale needs you now.']]);cinematic=null;questStep=0;updateQuest();save();})();}
function updateQuest(){const q=['Speak with Elder Maple','Visit Rowan in the village square','Enter a building and search for clues','Return to Elder Maple with what you found','Follow the golden leaves beyond the village'];$('lh-quest-text').textContent=q[Math.min(questStep,q.length-1)];}
function updateHud(){ $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-health').textContent=state.hp;$('lh-coins').textContent=state.coins;$('lh-location').textContent=scene==='inside'?['MAPLE COTTAGE','VILLAGE INN','GENERAL STORE','OLD WORKSHOP'][interiorId]:chapters[Math.min(state.stage,9)].place.toUpperCase();updateQuest();}
function move(dt){if(dialogue||cinematic||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;let dx=0,dy=0;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;dx+=joystick.x;dy+=joystick.y;if(!dx&&!dy)return;const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;const speed=state.heroClass==='Scout'?190:state.heroClass==='Guardian'?145:165;if(scene==='inside'){return;}const nx=state.x+dx*speed*dt,ny=state.y+dy*speed*dt;if(!blocked(nx,state.y))state.x=nx;if(!blocked(state.x,ny))state.y=ny;playerFrame+=dt*14;moveCooldown+=dt;if(moveCooldown>.6){moveCooldown=0;save();}}
function loop(t){const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;move(dt);drawWorld();requestAnimationFrame(loop);}
requestAnimationFrame(loop);
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='e'||e.key==='E'||e.key===' '){if(!e.repeat)interact();return;}keys[e.key]=true;});
addEventListener('keyup',e=>{keys[e.key]=false;});
const joy=$('lh-joystick'),stick=$('lh-stick');let joyPointer=null;
function setJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy),scale=len>max?max/len:1;joystick.x=(dx*scale)/max;joystick.y=(dy*scale)/max;stick.style.transform='translate('+joystick.x*34+'px,'+joystick.y*34+'px)';}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)setJoy(e);});
function releaseJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;joystick.x=joystick.y=0;stick.style.transform='translate(0,0)';}
joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
$('lh-action-touch').addEventListener('click',e=>{e.preventDefault();interact();});
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