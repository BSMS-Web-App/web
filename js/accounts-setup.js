/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
window.showBanScreen = function(banData) {
    const render = () => {
        // Hide Main App & Loaders without touching session memory
        const appShell = document.getElementById('appShell');
        const initLoadingScreen = document.getElementById('initLoadingScreen');
        const authScreen = document.getElementById('authScreen');
        
        if (appShell) appShell.style.display = 'none';
        if (initLoadingScreen) initLoadingScreen.style.display = 'none';
        if (authScreen) authScreen.style.display = 'none';
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
        
        // Show Ban Screen Elements
        const banScreen = document.getElementById('ban-screen');
        const msg = document.getElementById('ban-message');
        const reasonNode = document.getElementById('ban-reason');
        const timerNode = document.getElementById('ban-timer');
        const logoutBtn = document.getElementById('ban-logout-btn');
        const deviceWarning = document.getElementById('ban-device-warning');
        
        // Differentiate Ban Types
        if (banData.banType === 'device') {
            msg.textContent = "Your device has been banned from accessing BSMS Web services.";
            logoutBtn.style.display = 'none';
            deviceWarning.style.display = 'block';
        } else {
            msg.textContent = "Your account has been banned from accessing BSMS Web services.";
            logoutBtn.style.display = 'inline-block';
            deviceWarning.style.display = 'none';
        }

        reasonNode.textContent = banData.reason || 'Violation of Ecosystem Terms.';

        // Live Timer Logic
        if (window.banTimerInterval) clearInterval(window.banTimerInterval);

        if (!banData.expires || banData.expires <= 0) {
            timerNode.textContent = "Permanent";
        } else {
            const updateTimer = () => {
                const now = Date.now();
                const diff = banData.expires - now;
                if (diff <= 0) {
                    timerNode.textContent = "Expired. Please refresh the page.";
                    clearInterval(window.banTimerInterval);
                    return;
                }
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diff / 1000 / 60) % 60);
                const s = Math.floor((diff / 1000) % 60);
                
                let str = [];
                if (d > 0) str.push(`${d}d`);
                if (h > 0) str.push(`${h}h`);
                str.push(`${m}m`);
                str.push(`${s}s remaining`);
                
                timerNode.textContent = str.join(' ');
            };
            updateTimer(); // fire immediately
            window.banTimerInterval = setInterval(updateTimer, 1000);
        }

        // Setup the Explicit Logout Action
        logoutBtn.onclick = async function() {
            logoutBtn.disabled = true;
            logoutBtn.textContent = 'Logging out...';
            try {
                await fetch('/api/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': localStorage.getItem('session_id') || ""
                    },
                    body: JSON.stringify({ action: 'logout' })
                });
            } catch(e) {}
            
            localStorage.removeItem('bsms_auth_session');
            localStorage.removeItem('bsms_banned_data');
            window.location.href = '/';
        };
        
        if (banScreen) {
            banScreen.style.display = 'flex'; 
            banScreen.classList.add('show');
        }
    };
    
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
};
