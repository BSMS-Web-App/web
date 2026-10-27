/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
(function(){const modal=document.getElementById('hh-prize-modal'),button=document.getElementById('hhPrizeGotIt'),closeButton=document.getElementById('hhPrizeClose');if(!modal||!button)return;const close=()=>{modal.hidden=true;try{localStorage.setItem('hh_prize_notice_seen_v1','1')}catch{}};button.addEventListener('click',close);closeButton?.addEventListener('click',close);modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close()});try{if(localStorage.getItem('hh_prize_notice_seen_v1')!=='1')modal.hidden=false}catch{modal.hidden=false}})();
