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

// Initialize standard offline checking
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

// Establish global session ID (and primary device ID) on load if missing
if (!localStorage.getItem('session_id')) {
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    localStorage.setItem('session_id', id);
    console.log("[BSMS Web :: Auth] Generated new fallback session_id for device tracking.");
}

const SESSION_KEY = 'bsms_auth_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

let authSession = null;
let currentAccountData = null;
let authMode = 'login'; 
let pendingAvatarBase64 = null;
let deleteInterval = null;
let deleteTimer = 10;

// ---------- INIT & ROUTING ----------
window.addEventListener('hashchange', handleHash);

function init() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
        authSession = JSON.parse(raw);
        if(authSession.loggedIn && authSession.uid) {
            fetchCloudProfile();
            return;
        }
    }
    
    // Logged out
    authSession = null;
    handleHash();
}

async function apiFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    const sessionId = localStorage.getItem('session_id') || "";
    
    options.headers['X-Session-ID'] = sessionId;
    options.headers['X-Device-ID'] = sessionId;
    options.headers['Content-Type'] = 'application/json';

    try {
        const response = await fetch(endpoint, options);
        const data = await response.json().catch(() => ({}));
        
        if (response.status === 403 && data.account_status === "banned") {
            console.warn("[BSMS Web :: Auth] Device/Account banned. Showing UI.");
            if (window.showBanScreen) {
                window.showBanScreen({ 
                    banType: data.banType, 
                    reason: data.reason, 
                    expires: data.ban_expires 
                });
            }
            return null;
        }
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error ${response.status}`);
        }
        
        return data;
    } catch (err) {
        console.error(`[BSMS Web :: API] Fetch failed for ${endpoint}:`, err);
        throw err;
    }
}

async function fetchCloudProfile() {
    try {
        const data = await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'getProfile' })
        });
        
        if (data && data.profile) {
            currentAccountData = data.profile;
            loadDashboard();
        } else if (data === null) {
            return;
        } else {
            throw new Error("Invalid session data");
        }
    } catch(err) {
        localStorage.removeItem(SESSION_KEY);
        authSession = null;
        handleHash();
    }
}

function handleHash() {
    const banScreen = document.getElementById('ban-screen');
    if (banScreen && banScreen.style.display !== 'none') return;
    
    let hash = window.location.hash || '#';
    
    setTimeout(() => {
        document.getElementById('initLoadingScreen').classList.remove('show');
        
        if (authSession && authSession.loggedIn) {
            showScreen('appShell');
            if (hash === '#security') switchPanel('security');
            else if (hash === '#sessions') { switchPanel('sessions'); loadSessions(); }
            else switchPanel('profile');
        } else {
            showScreen('authScreen');
            if (hash === '#signup') {
                authMode = 'signup';
            } else {
                authMode = 'login';
            }
            updateAuthUI();
        }
    }, 50);
}

// ---------- UI HELPERS ----------
function showScreen(id) {
    document.querySelectorAll('.screen, #appShell').forEach(s => s.classList.remove('show'));
    void document.getElementById(id).offsetWidth;
    document.getElementById(id).classList.add('show');
}
function openPopup(id) { document.getElementById(id).classList.add('show'); }
function closePopup(id) { document.getElementById(id).classList.remove('show'); }

function setButtonLoading(btnId, isLoading, originalText = "") {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = "Please wait...";
    } else {
        btn.disabled = false;
        btn.textContent = originalText || btn.dataset.originalText || "Submit";
    }
}

function showAction(msg) { document.getElementById('actionLoadingText').textContent = msg; document.getElementById('actionLoadingScreen').classList.add('show'); }
function hideAction() { document.getElementById('actionLoadingScreen').classList.remove('show'); }
function showAlert(msg) { document.getElementById('alertText').innerText = msg; openPopup('alertOverlay'); }
function showToast(msg) {
    const c = document.getElementById('notifContainer');
    const n = document.createElement('div'); n.className = 'notif'; n.textContent = msg;
    n.onclick = () => { n.style.opacity='0'; setTimeout(()=>n.remove(), 280); }; c.appendChild(n);
    setTimeout(() => { if(n.parentNode) n.click(); }, 4000);
}

function preventSpaces(e) { this.value = this.value.replace(/ /g, '_'); }
document.getElementById('authUsername').addEventListener('input', preventSpaces);
document.getElementById('newUsernameInput').addEventListener('input', preventSpaces);

function toggleMobileDrawer(){
    const d=document.getElementById('mobileDrawer'), bd=document.getElementById('mobileDrawerBackdrop');
    const o=d.classList.toggle('open'); bd.classList.toggle('show',o);
}
function closeMobileDrawer(){
    document.getElementById('mobileDrawer').classList.remove('open');
    document.getElementById('mobileDrawerBackdrop').classList.remove('show');
}

function switchPanel(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
    document.querySelectorAll('.navBtn').forEach(b => b.classList.remove('active'));
    document.getElementById(name + 'Panel').classList.add('show');
    if(document.getElementById('dock-' + name)) document.getElementById('dock-' + name).classList.add('active');
    if(document.getElementById('mob-' + name)) document.getElementById('mob-' + name).classList.add('active');
    window.location.hash = `#${name}`;
}

// ---------- AUTHENTICATION ----------
function toggleAuthMode() {
    window.location.hash = authMode === 'login' ? '#signup' : '#login';
}

function updateAuthUI() {
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const btn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const toggleLink = toggleText.nextElementSibling;

    if (authMode === 'signup') {
        title.textContent = 'Create Account'; subtitle.textContent = 'Join the BSMS Web ecosystem';
        btn.textContent = 'Sign Up'; toggleText.textContent = 'Already have an account?'; toggleLink.textContent = 'Log in here';
    } else {
        title.textContent = 'Sign In'; subtitle.textContent = 'Access your BSMS Web Account';
        btn.textContent = 'Login'; toggleText.textContent = "Don't have an account?"; toggleLink.textContent = 'Sign up here';
    }
}

async function handleAuth() {
    let user = document.getElementById('authUsername').value.replace(/ /g, '_');
    const pass = document.getElementById('authPassword').value.trim();

    if (user.length < 3 || user.length > 20) return showAlert("Username must be between 3 and 20 characters.");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(user)) return showAlert("Username must start with a letter/number and contain only letters, numbers, dashes, and underscores.");
    if (!pass) return showAlert("Password is required.");

    setButtonLoading('authSubmitBtn', true);

    try {
        const data = await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ 
                action: authMode === 'signup' ? 'register' : 'login',
                username: user, 
                password: pass 
            })
        });
        
        if (data && data.success) {
            completeLogin(data);
        }
    } catch (err) { 
        showAlert(err.message || "Connection error."); 
    } finally {
        setButtonLoading('authSubmitBtn', false);
    }
}

function completeLogin(data) {
    if (data.sessionId) {
        localStorage.setItem('session_id', data.sessionId);
    }
    const sessionObj = {
        loggedIn: true, 
        sessionId: data.sessionId || localStorage.getItem('session_id') || "",
        uid: data.uid, 
        username: data.profile.username,
        displayName: data.profile.displayName || data.profile.username, 
        pfp: data.profile.avatar || "",
        chatColor: data.profile.chatColor || "",
        nameColor: data.profile.nameColor || data.profile.chatColor || ""
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
    localStorage.setItem('bsms_session', JSON.stringify(sessionObj));
    authSession = sessionObj;
    currentAccountData = data.profile;
    
    document.getElementById('authPassword').value = '';
    
    const cb = new URLSearchParams(window.location.search).get('callback_url');
    if (cb && cb.startsWith('/') && !cb.startsWith('//')) {
        window.location.href = cb;
    } else {
        window.location.hash = '#profile';
        loadDashboard();
    }
}

async function logout() {
    try {
        await apiFetch(`/api/auth`, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'logout' }) 
        });
    } catch(e) {
        console.warn("[BSMS Web :: Auth] Backend logout failed, clearing locally.");
    }
    localStorage.removeItem(SESSION_KEY);
    authSession = null; currentAccountData = null; pendingAvatarBase64 = null;
    showToast("Logged out.");
    window.location.hash = '#login';
}

// ---------- COLOR SWITCHER HELPERS ----------
function updateChatColorPreview() {
    const hexInput = document.getElementById('profileChatColorHex');
    const colorInput = document.getElementById('profileChatColor');
    const preview = document.getElementById('chatColorPreviewText');
    const dNameInput = document.getElementById('profileDisplayName');
    
    if (!preview) return;
    const name = (dNameInput && dNameInput.value.trim()) || (authSession && authSession.displayName) || (authSession && authSession.username) || 'Username';
    preview.textContent = name;

    const val = (hexInput && hexInput.value.trim()) || (colorInput && colorInput.value) || '';
    if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
        preview.style.color = val;
    } else {
        preview.style.color = 'var(--fg)';
    }
}

function onColorPickerChange(hex) {
    const hexInput = document.getElementById('profileChatColorHex');
    if (hexInput) hexInput.value = hex;
    updateChatColorPreview();
}

function onHexInputChange(val) {
    const colorInput = document.getElementById('profileChatColor');
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        if (colorInput) colorInput.value = val;
    }
    updateChatColorPreview();
}

function setPresetColor(hex) {
    const colorInput = document.getElementById('profileChatColor');
    const hexInput = document.getElementById('profileChatColorHex');
    if (colorInput) colorInput.value = hex;
    if (hexInput) hexInput.value = hex;
    updateChatColorPreview();
}

function resetChatColor() {
    const colorInput = document.getElementById('profileChatColor');
    const hexInput = document.getElementById('profileChatColorHex');
    if (colorInput) colorInput.value = '#ffffff';
    if (hexInput) hexInput.value = '';
    updateChatColorPreview();
}

// ---------- DASHBOARD POPULATION ----------
function loadDashboard() {
    document.getElementById('initLoadingScreen').classList.remove('show');
    showScreen('appShell');
    
    const savedColor = currentAccountData.nameColor || currentAccountData.chatColor || authSession.nameColor || authSession.chatColor || "";
    document.getElementById('sidebarUsername').textContent = authSession.username;
    document.getElementById('sidebarUsername').style.color = savedColor || 'var(--fg)';
    document.getElementById('mobileSidebarUsername').textContent = authSession.username;
    document.getElementById('mobileSidebarUsername').style.color = savedColor || 'var(--fg)';
    
    document.getElementById('profileUsername').value = authSession.username;
    document.getElementById('profileDisplayName').value = currentAccountData.displayName || authSession.username;
    document.getElementById('profileBio').value = currentAccountData.bio || "";
    document.getElementById('profileEmail').value = currentAccountData.email || "";
    document.getElementById('profilePhone').value = currentAccountData.phone || "";
    document.getElementById('toggleShowInUsers').checked = (currentAccountData.showInUsersList !== false);
    pendingAvatarBase64 = currentAccountData.avatar || null;
    
    const colorInput = document.getElementById('profileChatColor');
    const hexInput = document.getElementById('profileChatColorHex');
    if (colorInput) colorInput.value = (savedColor && /^#[0-9a-fA-F]{6}$/.test(savedColor)) ? savedColor : (savedColor.toLowerCase() === 'red' ? '#ef4444' : '#ffffff');
    if (hexInput) hexInput.value = savedColor;
    updateChatColorPreview();

    let cd = 'Unknown';
    if (currentAccountData.createdAt) {
        const dateObj = new Date(currentAccountData.createdAt);
        if (!isNaN(dateObj.getTime())) {
            cd = dateObj.toLocaleDateString();
        }
    }
    document.getElementById('accountCreatedDate').textContent = cd;
    
    renderAvatarPreview();
    updateBioPreview();
}

function renderBioMarkdown(str) {
    if (!str) return '';
    let out = str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]));
    out = out.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>');
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__(.*?)__/g, '<u>$1</u>');
    out = out.replace(/(^|[^*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^_])_(?!_)(.*?)(?<!_)_/g, '$1<em>$2</em>');
    return out;
}

function updateBioPreview() {
    const text = document.getElementById('profileBio').value.trim();
    const preview = document.getElementById('bioPreviewContent');
    if (!preview) return;
    if (!text) {
        preview.innerHTML = '<span style="color:var(--fg2); font-style:italic;">No bio set.</span>';
    } else {
        preview.innerHTML = renderBioMarkdown(text);
    }
}

function renderAvatarPreview() {
    const container = document.getElementById('avatarPreviewContainer');
    const removeBtn = document.getElementById('removeAvatarBtn');
    if (pendingAvatarBase64) {
        container.innerHTML = `<img src="${pendingAvatarBase64}" onerror="this.onerror=null;const p=this.parentElement;this.remove();p.textContent=(document.getElementById('profileDisplayName').value||authSession.username||'?').charAt(0).toUpperCase();p.style.border='3px solid var(--red)'">`;
        container.style.border = "none";
        if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
        container.innerHTML = (document.getElementById('profileDisplayName').value || authSession.username).charAt(0).toUpperCase();
        container.style.border = "3px solid var(--red)";
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

async function confirmRemoveAvatar() {
    closePopup('removeAvatarModal');
    try {
        await apiFetch('/api/auth', {
            method: 'POST',
            body: JSON.stringify({ action: 'removeAvatar' })
        });
        pendingAvatarBase64 = null;
        currentAccountData.avatar = "";
        authSession.pfp = null;
        localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
        const fileInp = document.getElementById('avatarUpload');
        if (fileInp) fileInp.value = '';
        renderAvatarPreview();
        showToast("Profile picture removed!");
        loadDashboard();
    } catch (err) {
        showAlert(err.message || "Failed to remove picture.");
    }
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showAlert("Please select a valid image.");

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            
            const scale = Math.max(256 / img.width, 256 / img.height);
            const x = (256 / 2) - (img.width / 2) * scale;
            const y = (256 / 2) - (img.height / 2) * scale;
            
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            
            pendingAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);
            renderAvatarPreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// ---------- UPDATES ----------
async function saveProfile() {
    const dName = document.getElementById('profileDisplayName').value.trim();
    if (dName.length > 30) return showAlert("Display name cannot exceed 30 characters.");
    
    setButtonLoading('saveProfileBtn', true);
    
    try {
        const colorVal = document.getElementById('profileChatColorHex').value.trim();
        const validColor = (/^#[0-9a-fA-F]{3,8}$/.test(colorVal) || /^[a-zA-Z]+$/.test(colorVal)) ? colorVal : "";
        const updateObj = {
            action: 'updateProfile',
            displayName: dName || authSession.username,
            bio: document.getElementById('profileBio').value.trim(),
            email: document.getElementById('profileEmail').value.trim(),
            phone: document.getElementById('profilePhone').value.trim(),
            avatar: pendingAvatarBase64 || "",
            chatColor: validColor,
            nameColor: validColor,
            showInUsersList: document.getElementById('toggleShowInUsers').checked
        };
        
        await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify(updateObj)
        });
        
        Object.assign(currentAccountData, updateObj);
        
        authSession.displayName = updateObj.displayName;
        authSession.pfp = updateObj.avatar;
        authSession.chatColor = updateObj.chatColor;
        authSession.nameColor = updateObj.nameColor;
        localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));

        // Also sync bsms_auth_session used by chat.html
        try {
            const chatSess = JSON.parse(localStorage.getItem('bsms_auth_session') || '{}');
            chatSess.displayName = updateObj.displayName;
            chatSess.nameColor = updateObj.nameColor;
            chatSess.chatColor = updateObj.chatColor;
            if (updateObj.avatar) chatSess.avatar = updateObj.avatar;
            localStorage.setItem('bsms_auth_session', JSON.stringify(chatSess));
        } catch(e) {}
        
        showToast("Profile updated!"); 
        loadDashboard();
    } catch (err) { 
        showAlert(err.message || "Failed to save profile."); 
    } finally {
        setButtonLoading('saveProfileBtn', false);
    }
}

function openUsernameModal() {
    const lastChange = currentAccountData.lastUsernameChange || 0;
    const timeSince = Date.now() - lastChange;
    const warnText = document.getElementById('usernameCooldownText');

    if (timeSince < SEVEN_DAYS_MS) {
        const daysLeft = Math.ceil((SEVEN_DAYS_MS - timeSince) / (1000 * 60 * 60 * 24));
        warnText.textContent = `Cooldown active. Change available in ${daysLeft} day(s).`;
        warnText.style.display = 'block';
    } else {
        warnText.style.display = 'none';
        document.getElementById('newUsernameInput').value = '';
        openPopup('changeUsernameModal');
    }
}

async function executeUsernameChange() {
    let newName = document.getElementById('newUsernameInput').value.replace(/ /g, '_');
    if (newName.length < 3 || newName.length > 20) return showAlert("3-20 characters required.");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(newName)) return showAlert("Letters, numbers, underscores, and dashes only.");
    if (newName === authSession.username) return showAlert("That is already your username.");

    setButtonLoading('confirmUsernameBtn', true);
    try {
        const data = await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'changeUsername', newUsername: newName })
        });
        
        authSession.username = newName;
        localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
        
        closePopup('changeUsernameModal'); showToast("Username changed!");
        fetchCloudProfile();
    } catch (err) { 
        showAlert(err.message || "Error changing username."); 
    } finally {
        setButtonLoading('confirmUsernameBtn', false);
    }
}

async function changePassword() {
    const cp = document.getElementById('secCurrentPass').value, np = document.getElementById('secNewPass').value, cnp = document.getElementById('secConfirmPass').value;
    if (!cp || !np || !cnp) return showAlert("All fields required.");
    if (np.length < 6) return showAlert("New password min 6 characters.");
    if (np !== cnp) return showAlert("Passwords do not match.");
    
    setButtonLoading('updatePasswordBtn', true);
    try {
        await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'changePassword', currentPassword: cp, newPassword: np })
        });
        
        document.getElementById('secCurrentPass').value = ''; document.getElementById('secNewPass').value = ''; document.getElementById('secConfirmPass').value = '';
        showToast("Password updated successfully.");
    } catch(err) { 
        showAlert(err.message || "Error changing password."); 
    } finally {
        setButtonLoading('updatePasswordBtn', false);
    }
}

async function loadSessions() {
    const container = document.getElementById('sessionsListContainer');
    container.innerHTML = `<div style="text-align:center; color:var(--fg2); padding: 20px;">Loading sessions...</div>`;
    
    try {
        const data = await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'getSessions' })
        });
        container.innerHTML = '';
        
        if (!data.sessions || Object.keys(data.sessions).length === 0) {
            container.innerHTML = `<div style="text-align:center; color:var(--fg2); padding: 20px;">No active sessions found.</div>`;
            return;
        }

        const freshSessionId = localStorage.getItem('session_id');

        for (const [sid, sData] of Object.entries(data.sessions)) {
            const isCurrent = sid === freshSessionId;
            const lastActive = new Date(sData.lastActive).toLocaleString();
            
            const card = document.createElement('div');
            card.className = `session-card ${isCurrent ? 'current' : ''}`;
            card.innerHTML = `
                <div class="session-info">
                    <strong>${isCurrent ? 'This Device' : 'Other Device'}</strong>
                    <span>Last Active: ${lastActive}</span>
                </div>
                ${!isCurrent ? `<button class="btn sec" style="width:auto; margin:0; padding:6px 12px; font-size:16px;" onclick="revokeSession('${sid}')">Revoke</button>` : `<span style="color:var(--red); font-weight:bold;">Active</span>`}
            `;
            container.appendChild(card);
        }
    } catch(err) {
        container.innerHTML = `<div style="text-align:center; color:#ff3333; padding: 20px;">Failed to load sessions.</div>`;
    }
}

async function revokeSession(sid) {
    if(!confirm("Are you sure you want to log out this device?")) return;
    try {
        await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'revokeSession', sessionId: sid })
        });
        showToast("Session revoked.");
        loadSessions();
    } catch(err) {
        showAlert("Failed to revoke session.");
    }
}

async function exportData() {
    setButtonLoading('exportDataBtn', true, "Preparing Data...");
    try {
        const data = await apiFetch(`/api/export-data`);
        
        const zip = new JSZip();
        zip.file("profile.json", JSON.stringify(data.profile, null, 2));
        if (data.messages) zip.file("messages.json", JSON.stringify(data.messages, null, 2));
        if (data.game_saves) zip.file("game_saves.json", JSON.stringify(data.game_saves, null, 2));
        
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `bsms_export_${authSession.username}.zip`;
        a.click();
        
        showToast("Export complete.");
    } catch(err) {
        showAlert("Failed to export data.");
    } finally {
        setButtonLoading('exportDataBtn', false, "Request Data Export");
    }
}

function verifyAccountDeletion() {
    const iu = document.getElementById('delAuthUser').value.trim(), ip = document.getElementById('delAuthPass').value.trim();
    if (iu !== authSession.username) return showAlert("Incorrect username.");
    if (!ip) return showAlert("Password is required.");

    closePopup('deleteAccountModal');
    
    deleteTimer = 10;
    document.getElementById('deleteCountdownDisplay').textContent = deleteTimer;
    openPopup('deleteCountdownModal');
    deleteInterval = setInterval(() => {
        deleteTimer--; document.getElementById('deleteCountdownDisplay').textContent = deleteTimer;
        if (deleteTimer <= 0) { clearInterval(deleteInterval); executeFinalDeletion(ip); }
    }, 1000);
}

function cancelDeletion() {
    if (deleteInterval) clearInterval(deleteInterval);
    closePopup('deleteCountdownModal'); 
    document.getElementById('delAuthUser').value = ''; document.getElementById('delAuthPass').value = '';
    showToast("Deletion Canceled.");
}

async function executeFinalDeletion(password) {
    showAction("Deleting account...");
    try {
        await apiFetch(`/api/auth`, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteAccount', password })
        });
        
        closePopup('deleteCountdownModal');
        localStorage.removeItem(SESSION_KEY);
        authSession = null;
        showAlert("Account successfully deleted.");
        setTimeout(() => window.location.hash = '#login', 1500);
    } catch (err) { 
        hideAction();
        closePopup('deleteCountdownModal'); 
        showAlert(err.message || "Failed to delete account. Incorrect password?"); 
    }
}

// Add Enter listeners
document.getElementById('authUsername').addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('authPassword').focus(); });
document.getElementById('authPassword').addEventListener('keydown', e => { if(e.key === 'Enter') handleAuth(); });

setTimeout(init, 300);
