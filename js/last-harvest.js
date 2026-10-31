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
let keys={},touch={},dialogue=null,dialogueIndex=0,nearby=null,lastTime=0,moveCooldown=0,playerFrame=0,worldSeed=13;
const rand=(x,y)=>{let n=Math.sin(x*127.1+y*311.7+worldSeed)*43758.5453;return n-Math.floor(n)};
const save=()=>localStorage.setItem(SAVE,JSON.stringify(state));
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();
function tileAt(x,y){if(x<0||y<0||x>=MAP_W||y>=MAP_H)return 1;return 0;}
const solids=[{x:7,y:5,w:7,h:5},{x:30,y:5,w:8,h:5},{x:18,y:17,w:8,h:5},{x:3,y:25,w:5,h:4}];
function blocked(x,y){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);if(tileAt(tx,ty))return true;for(const b of solids)if(tx>=b.x&&tx<b.x+b.w&&ty>=b.y&&ty<b.y+b.h)return true;for(const t of trees)if(Math.hypot(x-(t.x*TILE+16),y-(t.y*TILE+18))<20)return true;return false;}
const trees=[];for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++)if((x<4||y<3||x>MAP_W-5||y>MAP_H-5)&&rand(x,y)>.18)trees.push({x,y});
const npcs=[{x:16*TILE,y:12*TILE,name:'ELDER MAPLE',color:'#b8c7a1',lines:['The village square feels colder today. Your parents were last seen near the fountain.','The Everfeast is older than Hearthvale. Find the truth, not just the missing keepers.']},{x:22*TILE,y:13*TILE,name:'ROWAN',color:'#bb6542',lines:['I will come with you. We have been friends forever—trust me.','The woods are full of strange creatures. Keep your guard up.']}];
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)}
function drawTree(x,y){const px=x*TILE,py=y*TILE;rect(px+9,py+16,14,18,'#69452a');rect(px+2,py+4,28,22,'#275a36');rect(px+5,py,22,22,'#347344');rect(px+8,py+3,6,6,'#699448');rect(px+20,py+10,6,5,'#b65d35')}
function drawHouse(b,roof='#a85c32'){const x=b.x*TILE,y=b.y*TILE,w=b.w*TILE,h=b.h*TILE;rect(x,y+20,w,h-20,'#b58c5b');rect(x-8,y,w+16,28,roof);rect(x+10,y+30,24,24,'#8ec5c2');rect(x+w-34,y+30,24,24,'#8ec5c2');rect(x+w/2-13,y+h-38,26,38,'#573725');rect(x+w/2-4,y+h-20,4,4,'#edc66e');}
function drawWorld(){const W=innerWidth,H=innerHeight,camX=Math.max(0,Math.min(MAP_W*TILE-W,state.x-W/2)),camY=Math.max(0,Math.min(MAP_H*TILE-H,state.y-H/2));ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(-Math.floor(camX),-Math.floor(camY));
for(let y=Math.max(0,Math.floor(camY/TILE));y<Math.min(MAP_H,Math.ceil((camY+H)/TILE)+1);y++)for(let x=Math.max(0,Math.floor(camX/TILE));x<Math.min(MAP_W,Math.ceil((camX+W)/TILE)+1);x++){rect(x*TILE,y*TILE,TILE,TILE,(x+y)%2?'#57934e':'#609b53');if(rand(x,y)>.86)rect(x*TILE+rand(y,x)*24,y*TILE+rand(x+3,y)*24,3,3,'#8ab45d');}
rect(0,11*TILE,MAP_W*TILE,4*TILE,'#c3b98e');rect(0,11*TILE,MAP_W*TILE,5,'#e5d8b1');rect(15*TILE,0,4*TILE,MAP_H*TILE,'#c3b98e');rect(15*TILE,0,5,'#e5d8b1');rect(19*TILE,14*TILE,10*TILE,2*TILE,'#c3b98e');
drawHouse(solids[0],'#bb853d');drawHouse(solids[1],'#8b6540');drawHouse(solids[2],'#9b5838');drawHouse(solids[3],'#c18a42');
for(const t of trees)drawTree(t.x,t.y);
/* fountain */rect(18*TILE,12*TILE,3*TILE,2*TILE,'#8eaaa0');rect(18*TILE+10,12*TILE+8,2*TILE-20,24,'#5d9fa2');rect(18*TILE+16,12*TILE-8,28,8,'#d5d5bd');
/* signpost */rect(27*TILE,10*TILE,5,30,'#654326');rect(27*TILE-15,10*TILE,38,14,'#d6b36c');rect(27*TILE-10,10*TILE+4,26,3,'#654326');
for(const n of npcs){rect(n.x-7,n.y-17,14,24,n.color);rect(n.x-6,n.y-26,12,11,'#e9b98c');rect(n.x-7,n.y-29,14,5,'#5a3828');rect(n.x-5,n.y-4,4,12,'#493d36');rect(n.x+2,n.y-4,4,12,'#493d36');}
drawPlayer(state.x,state.y);
ctx.restore();return{camX,camY};}
function drawPlayer(x,y){const bob=Math.sin(playerFrame/5)*2;rect(x-8,y-8+bob,16,19,'#244b9a');rect(x-7,y-18+bob,14,12,'#edb88d');rect(x-8,y-21+bob,16,6,state.heroClass==='Mage'?'#5b4c9a':state.heroClass==='Scout'?'#47764a':'#a13f32');rect(x-7,y+9+bob,5,8,'#49382d');rect(x+2,y+9+bob,5,8,'#49382d');rect(x-10,y-4+bob,4,10,'#edb88d');rect(x+6,y-4+bob,4,10,'#edb88d');rect(x-4,y-14+bob,2,2,'#30251e');rect(x+3,y-14+bob,2,2,'#30251e');}
function setDialogue(lines,done){dialogue=lines;dialogueIndex=0;dialogueDone=done||null;showLine();}
let dialogueDone=null;
function showLine(){if(!dialogue||dialogueIndex>=dialogue.length){closeDialogue();return;}const line=dialogue[dialogueIndex];$('lh-speaker').textContent=line[0];$('lh-dialogue-text').textContent=line[1];$('lh-dialogue').hidden=false;}
function closeDialogue(){ $('lh-dialogue').hidden=true;dialogue=null;if(dialogueDone){const fn=dialogueDone;dialogueDone=null;fn();}}
function advanceDialogue(){if(!dialogue)return;dialogueIndex++;if(dialogueIndex>=dialogue.length)closeDialogue();else showLine();}
function interact(){if(dialogue){advanceDialogue();return;}if($('lh-create').hidden===false||!$('lh-game-menu').hidden)return;
let found=null,dist=Infinity;for(const n of npcs){const d=Math.hypot(state.x-n.x,state.y-n.y);if(d<64&&d<dist){found=n;dist=d;}}
if(found){setDialogue(found.lines.map(t=>[found.name,t]));return;}
const sx=27*TILE,sy=10*TILE;if(Math.hypot(state.x-sx,state.y-sy)<75){setDialogue([['OLD SIGN','AUTUMNWOOD — follow the golden leaves beyond the village.'],['QUEST','Explore Hearthvale and speak with the villagers. The road north-east leads to your first chapter.']]);return;}
setDialogue([['NARRATOR','The wind carries the smell of cinnamon and fallen leaves. There may be something nearby.']]);}
function startIntro(){state.name=$('lh-name-input').value.trim().slice(0,16)||'Adventurer';state.heroClass=document.querySelector('.lh-class.selected').dataset.class;state.x=20*TILE;state.y=15*TILE;state.hp=state.heroClass==='Guardian'?50:state.heroClass==='Mage'?36:40;state.coins=100;state.stage=0;state.seenIntro=true;save();$('lh-create').hidden=true;updateHud();setDialogue([['NARRATOR','Hearthvale. A peaceful village at the edge of the autumn woods…'],['NARRATOR','Every year, the Everfeast brings warmth and abundance to the valley. This year, the harvest bell never rang.'],['ELDER MAPLE',''+state.name+'! Thank goodness you are here. Your parents have disappeared!'],['ROWAN','We found strange tracks near the fountain. Come on, '+state.name+'—let’s find them!'],['NARRATOR','Your journey to uncover the truth behind the Everfeast begins now.']],()=>{save();});}
function updateHud(){ $('lh-name-hud').textContent=state.name.toUpperCase();$('lh-class-hud').textContent=state.heroClass.toUpperCase();$('lh-health').textContent=state.hp;$('lh-coins').textContent=state.coins;$('lh-location').textContent=chapters[Math.min(state.stage,9)].place.toUpperCase();}
function move(dt){if(dialogue||!$('lh-create').hidden||!$('lh-game-menu').hidden)return;let dx=0,dy=0;if(keys.ArrowLeft||keys.a||touch.left)dx--;if(keys.ArrowRight||keys.d||touch.right)dx++;if(keys.ArrowUp||keys.w||touch.up)dy--;if(keys.ArrowDown||keys.s||touch.down)dy++;if(!dx&&!dy)return;const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;const speed=state.heroClass==='Scout'?190:state.heroClass==='Guardian'?145:165;const nx=state.x+dx*speed*dt,ny=state.y+dy*speed*dt;if(!blocked(nx,state.y))state.x=nx;if(!blocked(state.x,ny))state.y=ny;playerFrame+=dt*14;moveCooldown+=dt;if(moveCooldown>.6){moveCooldown=0;save();}}
function loop(t){const dt=Math.min((t-lastTime)/1000||0,.04);lastTime=t;move(dt);drawWorld();requestAnimationFrame(loop);}
requestAnimationFrame(loop);
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='e'||e.key==='E'||e.key===' '){if(!e.repeat)interact();return;}keys[e.key]=true;});
addEventListener('keyup',e=>{keys[e.key]=false;});
document.querySelectorAll('[data-dir]').forEach(b=>{const dir=b.dataset.dir;const on=e=>{e.preventDefault();touch[dir]=true;};const off=e=>{e.preventDefault();touch[dir]=false;};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off);});
$('lh-action-touch').addEventListener('pointerdown',e=>{e.preventDefault();interact();});
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