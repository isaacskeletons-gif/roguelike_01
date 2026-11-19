// modules/status.js — эффекты состояний (яд, горение, кровотечение, заморозка, слабость).
// Работают одинаково на игроке и на врагах: у цели появляется поле status.

const STATUS = {
    poison: { name: 'Яд',           icon: '🟢', color: '#8d4', dot: true },
    burn:   { name: 'Горение',      icon: '🔥', color: '#f93', dot: true },
    bleed:  { name: 'Кровотечение', icon: '🩸', color: '#d33', dot: true },
    freeze: { name: 'Заморозка',    icon: '❄️', color: '#8df', dot: false },   // замедляет
    weak:   { name: 'Слабость',     icon: '💀', color: '#b6d', dot: false }    // бьёт слабее, получает больше урона
};

const Status = {
    add(t, kind, dur, power = 0) {
        if (!t.status) t.status = {};
        const cur = t.status[kind];
        if (cur) { cur.t = Math.max(cur.t, dur); cur.power = Math.max(cur.power, power); }
        else t.status[kind] = { t: dur, power, acc: 0 };
    },
    has(t, kind) { return !!(t.status && t.status[kind]); },
    clear(t) { t.status = {}; },
    // cb(урон, вид) вызывается, когда накопился целый пункт урона
    tick(t, dt, cb) {
        if (!t.status) return;
        for (const k in t.status) {
            const s = t.status[k];
            s.t -= dt;
            if (STATUS[k].dot) {
                s.acc += s.power * dt;
                if (s.acc >= 1) { const d = Math.floor(s.acc); s.acc -= d; cb(d, k); }
            }
            if (s.t <= 0) delete t.status[k];
        }
    },
    icons(t) {
        if (!t.status) return '';
        return Object.keys(t.status).map(k => STATUS[k].icon).join('');
    },
    text(t) {
        if (!t.status) return '';
        return Object.keys(t.status).map(k => `${STATUS[k].icon} ${STATUS[k].name} ${Math.ceil(t.status[k].t)}с`).join('  ');
    }
};
