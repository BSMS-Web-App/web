/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
(function(){const start=new Date('2026-10-26T00:00:00-04:00').getTime(),end=new Date('2026-10-30T15:10:00-04:00').getTime();function tick(){const now=Date.now(),pill=document.getElementById('homeEventStatus'),title=document.getElementById('homeEventTitle'),btn=document.querySelector('.events-card .event-coming-soon-btn');if(pill){const span=pill.querySelector('span:last-child');if(span)span.textContent=now<start?'UPCOMING EVENT':now<end?'LIVE NOW':'EVENT ENDED';}if(title)title.textContent=now<start?'Upcoming Event: Halloween Haunt':now<end?'Live Event: Halloween Haunt':'Past Event: Halloween Haunt';if(btn){const span=btn.querySelector('span:first-child');if(span)span.textContent=now<start?'View Events':now<end?'Play Halloween Haunt':'View Event Results';}}tick();setInterval(tick,1000);})();
