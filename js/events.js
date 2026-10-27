/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
// Event status and live public leaderboard.
const EVENT_START=new Date('2026-10-26T00:00:00-04:00').getTime();
const EVENT_END=new Date('2026-10-30T15:10:00-04:00').getTime();
function eventTime(ms){const t=Math.max(0,Math.floor(ms/1000)),d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60),s=t%60;return d>0?d+'d '+String(h).padStart(2,'0')+'h '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function updateEventStatus(){const now=Date.now(),badge=document.getElementById('eventStatusBadge'),timer=document.getElementById('hh-cd-timer'),label=document.getElementById('eventCountdownLabel'),heading=document.getElementById('eventCountdownHeading'),play=document.getElementById('eventPlayButton'),learn=document.getElementById('eventLearnMore'),title=document.getElementById('eventModalTitle'),dates=document.querySelector('.hh-dates');const status=now<EVENT_START?'upcoming':now<EVENT_END?'active':'ended',left=status==='upcoming'?EVENT_START-now:status==='active'?EVENT_END-now:0;if(badge)badge.textContent=status==='active'?'LIVE NOW':status==='ended'?'ENDED':'UPCOMING';if(timer)timer.textContent=status==='ended'?'Event Ended':eventTime(left);if(label)label.textContent=status==='upcoming'?'Begins In':status==='active'?'Ends In':'Event Ended';if(heading)heading.textContent=status==='active'?'Halloween Haunt is live!':status==='ended'?'Halloween Haunt has ended.':'The countdown to Halloween Haunt is on.';if(play)play.style.display=status==='active'?'inline-block':'none';if(learn)learn.style.display=status==='active'?'none':'inline-block';if(title)title.textContent=status==='active'?'Halloween Haunt Is Live!':status==='ended'?'Halloween Haunt Has Ended':'Halloween Haunt Is Coming!';if(dates&&status==='active')dates.innerHTML='<strong>Started:</strong> Monday, October 26, 2026<br><strong>Ends:</strong> Friday, October 30, 2026 at 3:10 PM EDT';if(dates&&status==='ended')dates.innerHTML='<strong>Ended:</strong> Friday, October 30, 2026 at 3:10 PM EDT';}
function eventEscape(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll(String.fromCharCode(34),'&quot;').replaceAll(String.fromCharCode(39),'&#39;');}
async function refreshEventLeaderboard(){const rows=document.getElementById('eventLeaderboardRows'),note=document.getElementById('eventLeaderboardNote'),status=document.getElementById('eventLeaderboardStatus');try{const response=await fetch('/api/halloween-haunt?action=leaderboard',{cache:'no-store'}),data=await response.json();if(!response.ok||!Array.isArray(data.rankings))throw new Error(data.error||'Leaderboard unavailable');if(rows)rows.innerHTML=data.rankings.slice(0,5).map((p,i)=>'<div class="lb-row"><span class="lb-rank">'+(i+1)+'</span><div style="flex:1;min-width:0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+eventEscape(p.displayName)+'</div><span class="lb-score">'+Number(p.cash||0).toLocaleString()+' cash</span></div>').join('')||'<p class="lb-note">No players yet. Be the first to play!</p>';if(note)note.textContent=data.rankings.length?'Live · refreshes every 60 seconds':'The leaderboard is ready for its first player.';if(status)status.textContent='Ranked by current cash. Last updated '+new Date().toLocaleTimeString();}catch(error){if(note)note.textContent='Leaderboard temporarily unavailable. It will retry automatically.';console.warn('[Events] Leaderboard refresh failed',error);}}
updateEventStatus();setInterval(updateEventStatus,1000);refreshEventLeaderboard();setInterval(refreshEventLeaderboard,60000);// --- Modal Logic ---
const modal = document.getElementById('hhModal');
function openHHModal() {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeHHModal() {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
}
function handleModalClick(e) {
    if (e.target === modal) {
        closeHHModal();
    }
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeHHModal();
    }
});
