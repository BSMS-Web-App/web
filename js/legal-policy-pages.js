/* BSMS Web - dynamically published legal documents */
(() => {
    'use strict';
    const path = location.pathname.replace(/\/$/, '');
    const key = path === '/terms' ? 'terms' : path === '/privacy' ? 'privacy' : '';
    if (!key) return;

    function escapeHTML(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function inline(value) {
        return escapeHTML(value)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }
    function render(source) {
        const out = [];
        let paragraph = [];
        let list = '';
        const flush = () => { if (paragraph.length) out.push('<p>' + paragraph.map(inline).join('<br>') + '</p>'); paragraph = []; };
        const close = () => { if (list) out.push('</' + list + '>'); list = ''; };
        for (const line of String(source).replace(/\r/g, '').split('\n')) {
            const h = line.match(/^(#{1,3})\s+(.+)$/);
            const ul = line.match(/^\s*[-*]\s+(.+)$/);
            const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (!line.trim()) { flush(); close(); continue; }
            if (h) { flush(); close(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); continue; }
            if (ul || ol) { flush(); const type = ul ? 'ul' : 'ol'; if (list !== type) { close(); list = type; out.push('<' + type + '>'); } out.push('<li>' + inline((ul || ol)[1]) + '</li>'); continue; }
            close(); paragraph.push(line);
        }
        flush(); close(); return out.join('');
    }

    fetch('/api/policies', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
        const content = data?.policies?.[key]?.content;
        if (typeof content !== 'string' || !content.trim()) return;
        const main = document.querySelector('main');
        if (!main) return;
        main.replaceChildren();
        const back = document.createElement('a');
        back.href = '/'; back.className = 'btn legal-home-link'; back.textContent = '← Go Back Home';
        const title = document.createElement('h1'); title.textContent = key === 'terms' ? 'Terms of Service' : 'Privacy Policy';
        const body = document.createElement('div'); body.className = 'legal-published-content'; body.innerHTML = render(content);
        main.append(back, title, body);
    }).catch(() => {});
})();
