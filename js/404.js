/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/* =========================================
   OFFLINE & SESSION MGMT
   ========================================= */
const banner = document.getElementById('offlineBanner');
window.addEventListener('offline', () => banner.classList.add('show'));
window.addEventListener('online', () => banner.classList.remove('show'));
if (!navigator.onLine) banner.classList.add('show');

if (!localStorage.getItem('session_id')) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let sid = '';
    for (let i = 0; i < 10; i++) sid += chars.charAt(Math.floor(Math.random() * chars.length));
    localStorage.setItem('session_id', sid);
    console.log("[BSMS Web :: System] Generated new session_id.");
}

/* =========================================
   GLOBAL SYSTEM & COLORS 
   ========================================= */

const tints = [
    `saturate(1.18) contrast(1.04) hue-rotate(0deg) drop-shadow(0 0 8px rgba(187, 0, 30, .40)) drop-shadow(0 0 18px rgba(187, 0, 30, .16))`,
    `saturate(1.20) contrast(1.04) hue-rotate(18deg) drop-shadow(0 0 8px rgba(255, 125, 35, .42)) drop-shadow(0 0 18px rgba(255, 125, 35, .16))`,
    `saturate(1.20) contrast(1.04) hue-rotate(38deg) drop-shadow(0 0 8px rgba(255, 210, 40, .42)) drop-shadow(0 0 18px rgba(255, 210, 40, .16))`,
    `saturate(1.18) contrast(1.04) hue-rotate(85deg) drop-shadow(0 0 8px rgba(45, 205, 100, .40)) drop-shadow(0 0 18px rgba(45, 205, 100, .15))`,
    `saturate(1.20) contrast(1.04) hue-rotate(175deg) drop-shadow(0 0 8px rgba(40, 115, 255, .42)) drop-shadow(0 0 18px rgba(40, 115, 255, .16))`,
    `saturate(1.20) contrast(1.04) hue-rotate(260deg) drop-shadow(0 0 8px rgba(165, 70, 255, .42)) drop-shadow(0 0 18px rgba(165, 70, 255, .16))`,
    `saturate(1.20) contrast(1.04) hue-rotate(315deg) drop-shadow(0 0 8px rgba(255, 70, 160, .42)) drop-shadow(0 0 18px rgba(255, 70, 160, .16))`
];

function createColorBag() {
    let bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = bag.length - 1; i > 0; i--) {
        const randomI = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[randomI]] = [bag[randomI], bag[i]];
    }
    return bag;
}


/* =========================================
   BULLDOGS & ENGINE PHYSICS
   ========================================= */

const COLOR_CHANGE_COOLDOWN = 450;
const MAX_BULLDOGS = 75;
const bulldogs = [];
let hasUnleashedChaos = false;

function applyTint(b) {
    b.el.style.filter = tints[b.tintIndex];
}

function changeTint(b, currentTime) {
    if (currentTime - b.lastColorChange < COLOR_CHANGE_COOLDOWN) return;

    if (b.colorBag.length === 0) {
        b.colorBag = createColorBag();
        
        // BUGFIX: Prevent exact identical color from frontloading the next random sequence!
        if (b.colorBag[0] === b.tintIndex) {
            let temp = b.colorBag[0];
            b.colorBag[0] = b.colorBag[b.colorBag.length - 1];
            b.colorBag[b.colorBag.length - 1] = temp;
        }
    }

    b.tintIndex = b.colorBag.shift();
    applyTint(b);
    b.lastColorChange = currentTime;
}

// SPAM & CREATION FACTORY
function spawnBulldog(startX, startY, speedX, speedY, popInEffect = false) {
    if(bulldogs.length >= MAX_BULLDOGS) return;

    const wSize = window.innerWidth <= 600 ? 68 : 92;

    const el = document.createElement('img');
    el.className = 'dvd-logo';
    el.src = '/img/icon.png';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = wSize + "px";
    el.style.height = wSize + "px";
    
    // Add zIndex tracking upwards so latest spawned is heavily favored in front!
    el.style.zIndex = 20 + bulldogs.length; 
    document.body.appendChild(el);

    const bConfig = {
        el,
        x: startX, y: startY, w: wSize, h: wSize,
        vx: speedX, vy: speedY,
        colorBag: createColorBag(),
        tintIndex: 0,
        lastColorChange: performance.now()
    };
    
    bConfig.tintIndex = bConfig.colorBag.shift();
    applyTint(bConfig);

    // CLICK TRAP EVENT! 
    el.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        triggerMadness(bConfig);
    });
    
    // Smooth animated popup if birthed forcefully from an exploding original dog
    if(popInEffect) {
        el.animate([ { transform: `translate3d(${startX}px, ${startY}px, 0) scale(0)`, opacity: 0 },
                     { transform: `translate3d(${startX}px, ${startY}px, 0) scale(1)`, opacity: 1 } ], 
                   { duration: 400, easing: "ease-out" });
    }

    bulldogs.push(bConfig);
}


/* =========================================
   TRIGGER THE TRAP 
   ========================================= */
let shakeTimer = null;
const theComicBox = document.getElementById('chaosBox');

function triggerMadness(clickedDogConfig) {
    
    // == FLIP THE SCREENS! First time execution ==
    if(!hasUnleashedChaos) {
        hasUnleashedChaos = true;
        document.body.classList.add("chaos-bg");
        document.getElementById("classic-mode").classList.remove("active");
        document.getElementById("chaos-mode").classList.add("active");
        
        banner.classList.add("comic-style"); 
        if(!navigator.onLine) {
           banner.innerText = "Dang! You are currently offline ✂️";
        }
        
        // Make original floating dog way more jittery immediately!
        bulldogs[0].vx *= 1.8; bulldogs[0].vy *= 1.8;
    }

    // == APPLY CAMERA/SCREEN DAMAGE SHAKES (resets itself over and over!) ==
    document.body.classList.remove('shaking-v2');
    void document.body.offsetWidth; // Recalculate frame reflow buffer
    document.body.classList.add('shaking-v2');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => { document.body.classList.remove('shaking-v2'); }, 850);

    // Bounce the center card module out-of-whack temporarily! 
    const randRots = ["10deg", "-12deg", "25deg", "-15deg"];
    theComicBox.style.transform = `scale(1.08) rotate(${randRots[Math.floor(Math.random() * randRots.length)]})`;
    setTimeout(() => { theComicBox.style.transform = ""; }, 500);

    // Visually distort and explode whichever single bulldog is targeted by User Pointer
    clickedDogConfig.el.animate([
        { transform: `translate3d(${clickedDogConfig.x}px, ${clickedDogConfig.y}px, 0) scale(1) rotate(0)` },
        { transform: `translate3d(${clickedDogConfig.x}px, ${clickedDogConfig.y}px, 0) scale(3.5) rotate(720deg)`, filter: 'saturate(4) invert(1)' },
        { transform: `translate3d(${clickedDogConfig.x}px, ${clickedDogConfig.y}px, 0) scale(1) rotate(0)` }
    ], { duration: 600, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });

    // The Magic Part - Vomit Mini Dogs!
    const spawnNum = Math.floor(Math.random() * 4) + 4; // Yield between 4 and 7 additions every touch
    for (let i = 0; i < spawnNum; i++) {
        // High explosive burst velocity multiplier mapping limits to page corner edges!
        let fastSpeedsX = (Math.random() > 0.5 ? 1 : -1) * (2.8 + (Math.random() * 4.0));
        let fastSpeedsY = (Math.random() > 0.5 ? 1 : -1) * (2.8 + (Math.random() * 4.0));
        spawnBulldog(clickedDogConfig.x, clickedDogConfig.y, fastSpeedsX, fastSpeedsY, true);
    }
}


/* =========================================
   ANIMATION TICKS
   ========================================= */
let lastTime = performance.now();

function animateBulldogs(currentTime) {
    const delta = Math.min((currentTime - lastTime) / 16.6667, 3);
    lastTime = currentTime;

    const mX = window.innerWidth;
    const mY = window.innerHeight;

    for (let i = 0; i < bulldogs.length; i++) {
        let b = bulldogs[i];

        const boundX = Math.max(0, mX - b.w);
        const boundY = Math.max(0, mY - b.h);

        b.x += b.vx * delta;
        b.y += b.vy * delta;

        let collided = false;
        
        // Screen bounds mapping / Deflection logic. 
        if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); collided = true; }
        else if (b.x >= boundX) { b.x = boundX; b.vx = -Math.abs(b.vx); collided = true; }
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); collided = true; }
        else if (b.y >= boundY) { b.y = boundY; b.vy = -Math.abs(b.vy); collided = true; }

        if (collided) changeTint(b, currentTime);
        b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
    }

    requestAnimationFrame(animateBulldogs);
}


window.addEventListener('resize', () => {
    const wS = window.innerWidth <= 600 ? 68 : 92;
    for (let i = 0; i < bulldogs.length; i++) {
        let b = bulldogs[i];
        b.w = wS; b.h = wS;
        b.el.style.width = wS + 'px';
        b.el.style.height = wS + 'px';

        const maxX = Math.max(0, window.innerWidth - b.w);
        const maxY = Math.max(0, window.innerHeight - b.h);

        b.x = Math.max(0, Math.min(b.x, maxX));
        b.y = Math.max(0, Math.min(b.y, maxY));
    }
});

/* =========================================
   BOOT LOAD OPERATION SEQUENCE 
   ========================================= */

const initSize = window.innerWidth <= 600 ? 68 : 92;
let sX = Math.random() * Math.max(1, window.innerWidth - initSize);
let sY = Math.random() * Math.max(1, window.innerHeight - initSize);
let vxS = (Math.random() > 0.5 ? 1 : -1) * (1.70 + Math.random() * 0.90);
let vyS = (Math.random() > 0.5 ? 1 : -1) * (1.50 + Math.random() * 0.80);

spawnBulldog(sX, sY, vxS, vyS, false);
requestAnimationFrame(animateBulldogs);
