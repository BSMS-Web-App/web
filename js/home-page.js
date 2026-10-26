/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

// Offline Handling
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

// Session Creation / Auth sync exactly preserving functionality
if (!localStorage.getItem('session_id')) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let sid = '';
    for (let i = 0; i < 10; i++) sid += chars.charAt(Math.floor(Math.random() * chars.length));
    localStorage.setItem('session_id', sid);
}

const SESSION_KEY = 'bsms_auth_session';
let authSession = null;
let isGuest = true;

function syncAuthSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
        authSession = JSON.parse(raw);
        isGuest = !authSession.loggedIn;
    } else {
        authSession = null;
        isGuest = true;
    }
    renderUserIcon();
}

window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY) syncAuthSession();
});

function renderUserIcon() {
    const btn = document.getElementById('globalUserBtn');
    if (isGuest) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        `;
    } else {
        if (authSession.pfp) {
            btn.innerHTML = `<img src="${authSession.pfp}" alt="Avatar">`;
        } else {
            btn.innerHTML = (authSession.displayName || authSession.username || "?").charAt(0).toUpperCase();
        }
    }
}

function handleUserIconClick() {
    if (isGuest) {
        window.location.href = '/accounts#signup';
    } else {
        document.getElementById('accPopupName').textContent = authSession.displayName || authSession.username;
        document.getElementById('accPopupUser').textContent = authSession.username;
        const ava = document.getElementById('accPopupAvatar');
        
        if (authSession.pfp) {
            ava.innerHTML = `<img src="${authSession.pfp}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            ava.innerHTML = (authSession.displayName || authSession.username).charAt(0).toUpperCase();
        }
        openPopup('accountPopup');
    }
}

function openPopup(id) { document.getElementById(id).classList.add('show'); }
function closePopup(id) { document.getElementById(id).classList.remove('show'); }

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
    }
}

if (window.location.hash) {
    const target = window.location.hash.replace(/^#/, '');
    try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch(e) {}
    setTimeout(() => scrollToSection(target), 200);
}

syncAuthSession();

// Dynamic Mouse Tracking for Pure CSS Parallax / 3D
if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        document.documentElement.style.setProperty('--mouse-x', x.toFixed(3));
        document.documentElement.style.setProperty('--mouse-y', y.toFixed(3));
    });
}

// Scroll Reveals Observer
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
const revealObserver = new IntersectionObserver((entries, ob) => {
    entries.forEach(entry => {
        if(entry.isIntersecting) {
            entry.target.classList.add('in-view');
            ob.unobserve(entry.target); 
        }
    });
}, observerOptions);
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));


// --- COUNTDOWN DEMO INTERACTIVITY ---
const demoCountdownContainer = document.getElementById('demoCountdown');
const demoTimerText = document.getElementById('demoTimerText');
const demoLabel = document.getElementById('demoLabel');
const demoBar = document.getElementById('demoBar');
const demoCanvas = document.getElementById('demoCelebrationCanvas');

let demoTime = 10;
let demoInterval = null;
let demoFinished = false;

const timerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            startDemoTimer();
        }
    });
}, { threshold: 0.5 });

if (document.getElementById('countdown')) {
    timerObserver.observe(document.getElementById('countdown'));
}

function startDemoTimer() {
    if (demoInterval || demoFinished) return;
    
    // Initial display setup
    demoTimerText.innerText = `0:${demoTime.toString().padStart(2, '0')}`;
    demoBar.style.width = '0%'; 
    
    // Transition the bar over 10 seconds smoothly
    demoBar.style.transition = 'width 10s linear';
    setTimeout(() => { demoBar.style.width = '100%'; }, 50);

    demoInterval = setInterval(() => {
        demoTime--;
        if (demoTime > 0) {
            demoTimerText.innerText = `0:${demoTime.toString().padStart(2, '0')}`;
        } else {
            finishDemoTimer();
        }
    }, 1000);
}

function finishDemoTimer() {
    clearInterval(demoInterval);
    demoTimerText.innerText = "0:00";
    demoLabel.innerText = "School has ended.";
    demoBar.style.transition = 'none';
    demoBar.style.width = '100%';
    demoFinished = true;
    triggerDemoCelebration();
}

function triggerDemoCelebration() {
    const ctx = demoCanvas.getContext('2d');
    const width = demoCanvas.offsetWidth;
    const height = demoCanvas.offsetHeight;
    demoCanvas.width = width;
    demoCanvas.height = height;
    
    let particles = [];
    const colors = ["#FF4B4B", "#FFD700", "#00E5FF", "#7CFC00", "#FF8C00", "#DA70D6"];
    
    for(let i=0; i < 100; i++) {
        particles.push({
            x: width / 2,
            y: height / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20 - 5,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 20
        });
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        let alive = false;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // gravity
            p.rot += p.rotSpeed;
            p.life -= 0.012; // fade out
            
            if (p.life > 0) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
            }
        });
        if (alive) requestAnimationFrame(animate);
        else ctx.clearRect(0, 0, width, height);
    }
    animate();
    
    // Scale pop effect to match authentic countdown end
    demoCountdownContainer.style.transform = 'scale(1.05)';
    setTimeout(() => { demoCountdownContainer.style.transform = 'scale(1)'; }, 200);
    demoLabel.style.color = '#FFD700'; 
}

// --- RECENT ANNOUNCEMENT & EVENTS INTEGRATION ---
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseAnnouncementMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHTML(text);

    // Support explicit underline <u> tags
    escaped = escaped.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>');

    // Headings: ## and #
    escaped = escaped.replace(/^##\s+(.*$)/gim, '<h2 style="font-family:var(--font-brand); font-size:18px; margin:10px 0 6px; color:#ff4458; font-weight:bold;">$1</h2>');
    escaped = escaped.replace(/^#\s+(.*$)/gim, '<h1 style="font-family:var(--font-brand); font-size:22px; margin:12px 0 8px; color:#fff; font-weight:bold;">$1</h1>');

    // Bold: **text**
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Underline: __text__
    escaped = escaped.replace(/__(.+?)__/g, '<u>$1</u>');

    // Italics: *text* or _text_
    escaped = escaped.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/\b_([^_]+?)_\b/g, '<em>$1</em>');

    // Markdown Links: [text](https://url)
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--red); text-decoration:underline;">$1</a>');

    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}

function formatRelativeTime(ts) {
    if (!ts) return 'Recently';
    const diff = Math.floor((Date.now() - Number(ts)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(Number(ts)).toLocaleDateString();
}

async function fetchRecentAnnouncement() {
    try {
        const res = await fetch('/api/announcements');
        if (!res.ok) throw new Error('API response was not ok');
        const data = await res.json();
        
        const a = data.recent || (data.announcements && data.announcements[0]);
        const titleEl = document.getElementById('homeAnnTitle');
        const contentEl = document.getElementById('homeAnnContent');
        const authorNameEl = document.getElementById('homeAnnAuthorName');
        const authorUserEl = document.getElementById('homeAnnAuthorUser');
        const authorPfpEl = document.getElementById('homeAnnPfp');
        const authorBadgeEl = document.getElementById('homeAnnAuthorBadge');
        const timeEl = document.getElementById('homeAnnTime');

        if (!a) {
            if (titleEl) titleEl.innerText = "Welcome to BSMS Web";
            if (contentEl) contentEl.innerHTML = "<p style='color:var(--fg2); margin:0;'>No announcements have been published yet. Check back soon for official updates, event notices, and tournaments!</p>";
            if (authorNameEl) authorNameEl.innerText = "BSMS Web Staff";
            if (authorUserEl) authorUserEl.innerText = "@staff";
            if (authorBadgeEl) authorBadgeEl.innerText = "SYSTEM";
            if (timeEl) timeEl.innerText = "Active";
            return;
        }

        if (titleEl) titleEl.innerText = a.title || "Official Announcement";
        if (contentEl) contentEl.innerHTML = parseAnnouncementMarkdown(a.content || "");
        if (authorNameEl) authorNameEl.innerText = a.authorDisplayName || a.authorUsername || "Administrator";
        if (authorUserEl) authorUserEl.innerText = `@${a.authorUsername || 'staff'}`;
        if (authorBadgeEl) {
            authorBadgeEl.innerText = (a.authorRole || 'ADMIN').toUpperCase();
            authorBadgeEl.className = `ann-role-badge ${a.authorRole || 'admin'}`;
        }
        if (timeEl) timeEl.innerText = formatRelativeTime(a.createdAt || a.timestamp);

        if (authorPfpEl) {
            if (a.authorAvatar && a.authorAvatar.trim() !== '') {
                authorPfpEl.innerHTML = `<img src="${escapeHTML(a.authorAvatar)}" alt="PFP" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                authorPfpEl.innerText = ((a.authorDisplayName || a.authorUsername || 'A').charAt(0)).toUpperCase();
            }
        }
    } catch (e) {
        console.warn('Failed to fetch recent announcement:', e);
        const titleEl = document.getElementById('homeAnnTitle');
        const contentEl = document.getElementById('homeAnnContent');
        if (titleEl) titleEl.innerText = "BSMS Web Announcements";
        if (contentEl) contentEl.innerHTML = "<p style='color:var(--fg2); margin:0;'>Stay tuned for upcoming news, schedule reminders, and platform updates.</p>";
    }
}

function showEventNotice() {
    const existing = document.getElementById('eventFloatingNotice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'eventFloatingNotice';
    toast.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:rgba(18,18,22,0.95); border:2px solid #eab308; color:#fff; padding:14px 24px; border-radius:16px; font-family:var(--font-brand); font-size:16px; z-index:9999; box-shadow:0 10px 40px rgba(0,0,0,0.8), 0 0 25px rgba(234,179,8,0.3); display:flex; align-items:center; gap:12px; pointer-events:none; transition:all 0.3s ease;';
    toast.innerHTML = '🏆 <span><strong>Events Starting Soon!</strong> Prepare for tournaments, roles, and Bulldog Bucks.</span>';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Start sequence when page renders
window.addEventListener('DOMContentLoaded', fetchRecentAnnouncement);
