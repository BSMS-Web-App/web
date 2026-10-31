/* The Last Harvest - private single-player contest client. */
(function(){
'use strict';
const API='/api/last-harvest';
const DEMO=new URLSearchParams(location.search).get('mode')==='demo';
const DEMO_KEY='last_harvest_public_demo_v1';
const demoFresh=()=>({state:{version:1,character:'Harvest Guardian',sidekick:'Rowan',pet:'Pumpkin Pup',stage:0,inventory:['wooden_sword','pumpkin_armor','acorn_helmet','autumn_boots'],equipped:{weapon:'wooden_sword',armor:'pumpkin_armor',helmet:'acorn_helmet',boots:'autumn_boots'},coins:50,xp:0,health:30,maxHealth:30,completedAt:null,updatedAt:Date.now()},openStage:10,displayName:'Demo Player'});
function demoLoad(){try{return JSON.parse(localStorage.getItem(DEMO_KEY))||demoFresh();}catch{return demoFresh();}}
function demoSave(){localStorage.setItem(DEMO_KEY,JSON.stringify(data));}
const chapters=[
 {place:'Hearthvale Village',title:'The Missing Feast',text:'The morning bell rings, but the village square is empty. Your parents, the keepers of the Everfeast, have vanished. Rowan promises to help you search the village. A strange harvest sigil is carved into the old fountain.'},
 {place:'Autumnwood Forest',title:'The Whispering Woods',text:'The trees whisper names as you follow a trail of golden leaves. A Thornback Stag guards the path. Beyond it, you find footprints that belong to someone from Hearthvale.'},
 {place:'Golden Apple Valley',title:'The Forgotten Orchard',text:'The orchard has withered overnight. Deep beneath its oldest tree, a note reveals that your parents were taken to the Sunken Pantry.'},
 {place:'The Sunken Pantry',title:'The Sunken Pantry',text:'A flooded city lies beneath the valley. You discover a letter addressed to Rowan—and realize your friend has been hiding something important.'},
 {place:'Shadowmarket',title:'The Feast of Shadows',text:'In a market lit by lanterns, masked merchants trade memories for secrets. Rowan disappears, leaving behind a message that changes everything.'},
 {place:'Broken Banquet Hall',title:'The Betrayal',text:'Rowan admits he helped the kidnappers. He believes the Everfeast protects Hearthvale at someone else’s expense. You clash, but he escapes and leaves you a fortress key.'},
 {place:'Frostfall Mountains',title:'The Frozen Feast',text:'A frozen pass leads to the Hollow King’s former watchtower. Its records reveal that he once protected the valley—and was betrayed by its founders.'},
 {place:'The Hollow Fortress',title:'The Hollow Fortress',text:'Inside the fortress, you learn why the Hollow King took the keepers: he wants the truth of the Everfeast revealed, not simply the village destroyed.'},
 {place:'Everfeast Sanctuary',title:'The Final Harvest',text:'You confront the Hollow King. Rowan returns, finally ready to help uncover the truth. The ritual begins, but the sanctuary starts to collapse.'},
 {place:'Heart of Hearthvale',title:'The Last Harvest',text:'Your parents are found. Together, the village uncovers the Everfeast’s forgotten promise and chooses a kinder way forward. In the quiet after the celebration, Elder Maple reveals a hidden door beneath Hearthvale…'}
];
let data=null, busy=false;
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function request(method,body){if(DEMO){if(method==='GET')return data;if(body?.action==='save-loadout'){data.state={...data.state,character:body.character,sidekick:body.sidekick,pet:body.pet,equipped:body.equipped};demoSave();return {state:data.state};}if(body?.action==='complete-stage'){const stage=Number(body.stage);if(stage!==data.state.stage+1||stage>10)throw new Error('Complete chapters in order.');data.state={...data.state,stage,xp:data.state.xp+stage*100,coins:data.state.coins+stage*25,health:30,completedAt:stage===10?Date.now():data.state.completedAt};demoSave();return {state:data.state,finished:stage===10};}throw new Error('Unknown demo action.');}const session=localStorage.getItem('session_id')||'';const r=await fetch(API,{method,headers:{'Content-Type':'application/json','X-Session-ID':session},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json().catch(()=>({error:'Unexpected server response.'}));if(!r.ok)throw new Error(j.error||'Request failed.');return j;}
function pixelScene(stage){
 const c=$('lh-pixel-scene'),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.clearRect(0,0,480,220);
 const rect=(a,b,w,h,col)=>{x.fillStyle=col;x.fillRect(a,b,w,h)};
 rect(0,0,480,220,'#283b35');rect(0,130,480,90,'#72502f');
 for(let i=0;i<24;i++){const xx=(i*73)%480;rect(xx,25+(i*19)%75,18,18,['#b65e2e','#d08a3e','#e0b14d'][i%3]);rect(xx+5,42+(i*19)%75,8,25,'#563b28');}
 rect(0,160,480,8,'#a87943');rect(60,92,105,75,'#75472b');rect(48,82,130,20,'#b65e2e');rect(87,120,22,47,'#30231c');rect(260,100,125,67,'#865331');rect(245,87,155,20,'#c17b35');rect(300,126,24,41,'#30231c');
 rect(215,145,14,14,'#f0c36a');rect(210,159,24,22,'#365a9a');rect(211,181,8,16,'#30231c');rect(225,181,8,16,'#30231c');
 if(stage>=5){rect(395,90,35,70,'#31243c');rect(402,76,22,22,'#c4b6a1');}
 if(stage>=7){rect(0,0,480,220,'#6b8ca433');}
 x.fillStyle='#f6d98c';x.font='bold 12px monospace';x.fillText('HEARTHVALE  •  CHAPTER '+String(stage||1).padStart(2,'0'),12,18);
}
function render(){
 const stage=data.state.stage,open=data.openStage,finished=stage===10,idx=Math.min(stage,9),chapter=chapters[idx];
 $('lh-player-name').textContent=data.displayName;$('lh-health').textContent=data.state.health+' / '+data.state.maxHealth;$('lh-coins').textContent=data.state.coins.toLocaleString();$('lh-xp').textContent=data.state.xp.toLocaleString();
 $('lh-character').value=data.state.character;$('lh-sidekick').value=data.state.sidekick;$('lh-pet').value=data.state.pet;
 $('lh-stage-label').textContent=finished?'CONTEST COMPLETE':'CHAPTER '+(stage+1)+' / 10';$('lh-stage-title').textContent=finished?'The Harvest Is Restored':chapter.title;$('lh-stage-description').textContent=finished?'You have completed all ten chapters. Your verified finish time has been recorded.':chapter.text;$('lh-scene-caption').textContent=finished?'Hearthvale Restored':chapter.place;
 $('lh-stage-status').textContent=finished?'You finished the contest!':stage<open?'Chapter '+(stage+1)+' is unlocked.': 'Next chapter unlocks at 8:00 AM Eastern on its scheduled weekday.';
 $('lh-progress-fill').style.width=(stage*10)+'%';$('lh-stage-action').textContent=finished?'Completed':stage<open?'Complete Chapter '+(stage+1):'Chapter Locked';$('lh-stage-action').disabled=finished||busy||stage>=open;
 $('lh-stage-list').innerHTML=chapters.map((c,i)=>'<div class="lh-stage '+(i<stage?'done':i===stage?'open':'')+'">'+(i<stage?'✓':i+1+'.')+' '+esc(c.title)+(i>=open?' 🔒':'')+'</div>').join('');
 $('lh-equipment').innerHTML=Object.entries(data.state.equipped).map(([slot,id])=>'<div class="lh-item"><b>'+esc(slot)+'</b><br>'+esc(id.replaceAll('_',' '))+'</div>').join('');
 $('lh-inventory').innerHTML=data.state.inventory.map(id=>'<div class="lh-item">◆ '+esc(id.replaceAll('_',' '))+'</div>').join('');
 pixelScene(stage+1);
 loadLeaderboard();
}
async function loadLeaderboard(){
 const target=document.querySelector('.lh-leaderboard');
 if(!target)return;
 if(DEMO){target.innerHTML='<h2>Public Test Build</h2><p>All ten chapters are open for testing. Your progress is saved only in this browser on this device.</p><p class="lh-small">This test has no official leaderboard and cannot determine a contest winner.</p>';return;}
 try{
  const result=await request('GET');
  const response=await fetch(API+'?action=leaderboard',{headers:{'X-Session-ID':localStorage.getItem('session_id')||''},cache:'no-store'});
  const board=await response.json();
  if(!response.ok)throw new Error(board.error||'Unavailable');
  target.innerHTML='<h2>Contest standings</h2><p>First player to finish all ten chapters wins. Verified completion times are ranked earliest first.</p>'+(board.rankings.length?'<ol class="lh-rankings">'+board.rankings.map(row=>'<li><b>'+esc(row.displayName)+'</b><span>'+new Date(row.completedAt).toLocaleString()+'</span></li>').join('')+'</ol>':'<p class="lh-small">No verified finishers yet.</p>');
 }catch(e){target.innerHTML='<h2>Contest standings</h2><p class="lh-small">Standings will appear when the private event opens.</p>';}
}
async function refresh(){try{if(DEMO){data=demoLoad();demoSave();}else{data=await request('GET');}$('lh-gate').hidden=true;$('lh-game').hidden=false;render();}catch(e){$('lh-gate-message').textContent=e.message;$('lh-gate').hidden=false;$('lh-game').hidden=true;}}
$('lh-save-party').addEventListener('click',async()=>{if(busy)return;busy=true;try{const result=await request('POST',{action:'save-loadout',character:$('lh-character').value,sidekick:$('lh-sidekick').value,pet:$('lh-pet').value,equipped:data.state.equipped});data.state=result.state;$('lh-stage-status').textContent='Your party has been saved.';}catch(e){$('lh-stage-status').textContent=e.message;}finally{busy=false;}});
$('lh-stage-action').addEventListener('click',async()=>{if(busy||!data)return;busy=true;render();try{const result=await request('POST',{action:'complete-stage',stage:data.state.stage+1});data.state=result.state;render();}catch(e){$('lh-stage-status').textContent=e.message;}finally{busy=false;render();}});
if(DEMO){document.body.classList.add('lh-demo');$('lh-gate-message').textContent='Public test mode is active.';}
refresh();
})();