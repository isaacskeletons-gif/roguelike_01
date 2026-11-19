// modules/touch.js — режим для телефона/планшета: джойстик, кнопки, обзор свайпом, HUD,
// выдвижные панели и НАСТРОЙКА РАСКЛАДКИ (перетаскивание и размер каждой кнопки).

// Ручное переключение из меню (если режим определился неверно)
function toggleTouchMode() {
    let cur = null;
    try { cur = localStorage.getItem('rogue_touch'); } catch (e) {}
    try { localStorage.setItem('rogue_touch', cur === 'on' ? 'off' : 'on'); } catch (e) {}
    location.reload();
}

(function () {
    let override = null;
    try { override = localStorage.getItem('rogue_touch'); } catch (e) {}
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const mobileUA = /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent || '');
    const ipadOS = /Mac/i.test(nav.platform || '') && (nav.maxTouchPoints || 0) > 1;
    const smallTouch = (nav.maxTouchPoints || 0) > 0 && (window.screen ? Math.min(screen.width, screen.height) <= 900 : false);
    const auto = coarse || mobileUA || ipadOS || smallTouch;
    const enabled = override === 'on' ? true : override === 'off' ? false : auto;

    const lbl = document.getElementById('touch-toggle');
    if (lbl) lbl.innerText = enabled ? '📱 Сенсорный режим: ВКЛ (нажмите, чтобы выключить)' : '📱 Сенсорный режим: ВЫКЛ (нажмите, чтобы включить)';
    if (!enabled) return;

    game.touchMode = true;
    game.renderer.hud = true;
    document.body.classList.add('touch');
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerdown', () => game.audio.init(), { once: true });

    const area = document.getElementById('game-area');
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    area.appendChild(ui);

    // ---------- Раскладка: позиции в % от области управления, масштаб s ----------
    // Кнопки и джойстик стоят посередине экрана слева и справа (по высоте ~ 45–65%)
    const DEFAULTS = {
        land: {
            joy: { x: 14, y: 60, s: 1 }, attack: { x: 88, y: 58, s: 1 }, spell: { x: 75, y: 74, s: 1 },
            cycle: { x: 62, y: 80, s: 1 }, potion: { x: 75, y: 42, s: 1 }, ability: { x: 88, y: 30, s: 1 },
            use: { x: 62, y: 58, s: 1 }, raise: { x: 62, y: 38, s: 1 },
            view: { x: 5, y: 9, s: 1 }, skills: { x: 13, y: 9, s: 1 }, full: { x: 70, y: 9, s: 1 },
            menu: { x: 79, y: 9, s: 1 }, map: { x: 88, y: 9, s: 1 }, pause: { x: 96, y: 9, s: 1 }
        },
        port: {
            joy: { x: 20, y: 56, s: 1 }, attack: { x: 82, y: 56, s: 1 }, spell: { x: 62, y: 76, s: 1 },
            cycle: { x: 44, y: 82, s: 1 }, potion: { x: 62, y: 34, s: 1 }, ability: { x: 82, y: 22, s: 1 },
            use: { x: 44, y: 56, s: 1 }, raise: { x: 44, y: 32, s: 1 },
            view: { x: 8, y: 9, s: 1 }, skills: { x: 20, y: 9, s: 1 }, full: { x: 50, y: 9, s: 1 },
            menu: { x: 62, y: 9, s: 1 }, map: { x: 74, y: 9, s: 1 }, pause: { x: 92, y: 9, s: 1 }
        }
    };
    const LS_KEY = 'rogue_touch_layout';
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) {}
    const orient = () => (window.innerHeight > window.innerWidth ? 'port' : 'land');
    const ctl = {};                       // id -> элемент
    const cfg = id => Object.assign({}, DEFAULTS[orient()][id], (saved[orient()] || {})[id]);
    const labels = { joy: 'Джойстик', attack: 'Удар', spell: 'Заклинание', cycle: 'Смена заклинания', potion: 'Зелье', ability: 'Умение класса',
        use: 'Действие', raise: 'Поднять мёртвого', view: 'Камера', skills: 'Навыки', full: 'Полный экран', menu: 'Панель персонажа', map: 'Панель карты', pause: 'Пауза' };

    function applyLayout() {
        for (const id in ctl) {
            const c = cfg(id), el = ctl[id];
            el.style.left = c.x + '%'; el.style.top = c.y + '%';
            el.style.transform = `translate(-50%, -50%) scale(${c.s})`;
        }
    }
    function saveLayout() { try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch (e) {} }
    function setCfg(id, patch) {
        const o = orient();
        saved[o] = saved[o] || {};
        saved[o][id] = Object.assign({}, cfg(id), patch);
    }
    window.addEventListener('resize', applyLayout);

    // ---------- Режим настройки ----------
    let editing = false, selected = null, drag = null;
    const bar = document.createElement('div');
    bar.id = 'touch-editor';
    bar.className = 'hidden';
    bar.innerHTML = `<span id="te-label">Перетащите кнопку пальцем</span>
        <button id="te-minus">−</button><button id="te-plus">+</button>
        <button id="te-all-minus">Все −</button><button id="te-all-plus">Все +</button>
        <button id="te-reset">Сброс</button><button id="te-done" class="done">Готово</button>`;
    document.body.appendChild(bar);

    function select(id) {
        selected = id;
        for (const k in ctl) ctl[k].classList.toggle('sel', k === id);
        document.getElementById('te-label').innerText = id ? `${labels[id]} · размер ×${cfg(id).s}` : 'Перетащите кнопку пальцем';
    }
    function resize(id, d) {
        const s = Math.max(0.6, Math.min(2.2, +(cfg(id).s + d).toFixed(2)));
        setCfg(id, { s });
    }
    function setEditing(on) {
        editing = on;
        document.body.classList.toggle('touch-edit', on);
        bar.classList.toggle('hidden', !on);
        document.getElementById('pause-menu').classList.toggle('hidden', on);   // игра остаётся на паузе
        select(null);
        if (!on) saveLayout();
    }
    document.getElementById('te-plus').onclick = () => { if (selected) { resize(selected, 0.1); applyLayout(); select(selected); saveLayout(); } };
    document.getElementById('te-minus').onclick = () => { if (selected) { resize(selected, -0.1); applyLayout(); select(selected); saveLayout(); } };
    document.getElementById('te-all-plus').onclick = () => { for (const id in ctl) resize(id, 0.1); applyLayout(); select(selected); saveLayout(); };
    document.getElementById('te-all-minus').onclick = () => { for (const id in ctl) resize(id, -0.1); applyLayout(); select(selected); saveLayout(); };
    document.getElementById('te-reset').onclick = () => { delete saved[orient()]; saveLayout(); applyLayout(); select(null); };
    document.getElementById('te-done').onclick = () => setEditing(false);
    game.openTouchEditor = () => setEditing(true);

    // Перетаскивание: слушатели регистрируются ПЕРВЫМИ и гасят обычные действия кнопки в режиме настройки
    function addEditHandlers(id, el) {
        ctl[id] = el;
        el.addEventListener('pointerdown', e => {
            if (!editing) return;
            e.stopImmediatePropagation(); e.preventDefault();
            select(id);
            drag = { id, pid: e.pointerId };
            if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', e => {
            if (!editing || !drag || drag.pid !== e.pointerId || drag.id !== id) return;
            e.stopImmediatePropagation();
            const r = ui.getBoundingClientRect();
            const x = Math.max(3, Math.min(97, (e.clientX - r.left) / r.width * 100));
            const y = Math.max(3, Math.min(97, (e.clientY - r.top) / r.height * 100));
            setCfg(id, { x: +x.toFixed(1), y: +y.toFixed(1) });
            applyLayout();
        });
        const end = e => { if (drag && drag.pid === e.pointerId) { drag = null; saveLayout(); } };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    // ---------- Зона обзора (свайп по правой части) ----------
    const look = document.createElement('div');
    look.className = 'look-zone';
    ui.appendChild(look);
    let lookId = null, lx = 0;
    look.addEventListener('pointerdown', e => { if (editing) return; lookId = e.pointerId; lx = e.clientX; look.setPointerCapture(e.pointerId); });
    look.addEventListener('pointermove', e => {
        if (e.pointerId !== lookId) return;
        if (game.renderer.viewMode !== 'top' && !game.paused) game.player.dir += (e.clientX - lx) * 0.008;
        lx = e.clientX;
    });
    const endLook = e => { if (e.pointerId === lookId) lookId = null; };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    // ---------- Джойстик ----------
    const base = document.createElement('div'); base.className = 'joy-base';
    const knob = document.createElement('div'); knob.className = 'joy-knob';
    base.appendChild(knob); ui.appendChild(base);
    addEditHandlers('joy', base);
    let joyId = null;
    const setJoy = e => {
        const r = base.getBoundingClientRect(), rad = r.width / 2;
        let x = (e.clientX - (r.left + rad)) / rad, y = (e.clientY - (r.top + rad)) / rad;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        game.touchMove = { x: Math.abs(x) < 0.12 ? 0 : x, y: Math.abs(y) < 0.12 ? 0 : y };
        knob.style.transform = `translate(${x * rad * 0.6 / (cfg('joy').s || 1)}px, ${y * rad * 0.6 / (cfg('joy').s || 1)}px)`;
    };
    const endJoy = e => {
        if (e.pointerId !== joyId) return;
        joyId = null; game.touchMove = { x: 0, y: 0 };
        knob.style.transform = 'translate(0,0)';
    };
    base.addEventListener('pointerdown', e => { if (editing) return; joyId = e.pointerId; base.setPointerCapture(e.pointerId); setJoy(e); });
    base.addEventListener('pointermove', e => { if (e.pointerId === joyId) setJoy(e); });
    base.addEventListener('pointerup', endJoy);
    base.addEventListener('pointercancel', endJoy);

    // ---------- Кнопки ----------
    const mk = (id, cls, label, onPress, hold) => {
        const b = document.createElement('button');
        b.className = 'tbtn ' + cls;
        b.textContent = label;
        ui.appendChild(b);
        addEditHandlers(id, b);                    // первым — перехват для настройки
        let timer = null;
        b.addEventListener('pointerdown', e => {
            if (editing) return;
            e.preventDefault();
            if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
            onPress();
            if (hold) timer = setInterval(onPress, 120);
        });
        const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
        b.addEventListener('pointerup', stop);
        b.addEventListener('pointercancel', stop);
        return b;
    };
    mk('attack', 'big', '⚔', () => game.attack(), true);
    mk('spell', '', '🔥', () => game.castSpell());
    mk('cycle', 'small', '⇄', () => game.cycleSpell());
    const abBtn = mk('ability', '', '✦', () => game.useAbility());
    mk('potion', '', '🧪', () => game.quickHeal());
    mk('use', '', '✋', () => game.interact());
    mk('raise', '', '🦴', () => { if (game.raiseNearest) game.raiseNearest(); });
    mk('view', 'small', '👁', () => game.setView(game.renderer.cycleView()));
    mk('skills', 'small', '📜', () => game.toggleSkills());
    mk('menu', 'small', '☰', () => game.toggleDrawer('right'));
    mk('map', 'small', '🗺', () => game.toggleDrawer('left'));
    mk('pause', 'small', '⏸', () => game.openPause());
    mk('full', 'small', '⛶', () => {
        const el = document.documentElement;
        if (document.fullscreenElement) { document.exitFullscreen(); return; }
        if (el.requestFullscreen) {
            el.requestFullscreen().then(() => {
                if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
            }).catch(() => {});
        }
    });
    applyLayout();

    // Выдвижные панели: инвентарь/характеристики (справа) и карта/журнал (слева)
    game.toggleDrawer = function (side = 'right') {
        const cl = document.body.classList;
        if (cl.contains('drawer-open') || cl.contains('drawer-left-open')) { game.closeAllModals(); return; }
        if (game.paused || game.inMenu || game.isGameOver) return;
        cl.add(side === 'left' ? 'drawer-left-open' : 'drawer-open');
        game.pauseForModal();
        game.updateUI();
    };

    // Кулдаун умения на кнопке
    setInterval(() => {
        const cd = game.player.abilityCooldown;
        abBtn.textContent = cd > 0 ? Math.ceil(cd) : '✦';
        abBtn.style.opacity = cd > 0 ? 0.5 : 1;
    }, 250);
})();
