// modules/sprites.js — процедурная генерация пиксель-арт спрайтов (без картинок и моделей)
//
// Идея: на сетке 32x32 из простых фигур (эллипсы, прямоугольники, линии, полигоны)
// собирается силуэт, зеркалируется по вертикальной оси (симметрия = «живой» вид),
// затем раскрашивается (палитра из HSL по seed), добавляются свет/тень, глаза, рот и обводка.
// Один и тот же seed всегда даёт одного и того же монстра.

const SPRITE_N = 32;
const SPRITE_C = 15.5; // ось симметрии

// Сетка «частей»: 0 пусто, 1 тело, 2 голова/кожа, 3 конечности, 4 акцент (рога, глаза-свет), 5 блик, 6 пустота (тень)
class SpriteGrid {
    constructor(n = SPRITE_N) {
        this.n = n;
        this.cells = new Uint8Array(n * n);
    }
    get(x, y) {
        if (x < 0 || y < 0 || x >= this.n || y >= this.n) return 0;
        return this.cells[y * this.n + x];
    }
    set(x, y, p, sym = true) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.cells[y * this.n + x] = p;
        if (sym) {
            const mx = this.n - 1 - x;
            if (mx >= 0 && y >= 0 && mx < this.n && y < this.n) this.cells[y * this.n + mx] = p;
        }
    }
    rect(x0, y0, x1, y1, p, sym = true) {
        const ax = Math.round(Math.min(x0, x1)), bx = Math.round(Math.max(x0, x1));
        const ay = Math.round(Math.min(y0, y1)), by = Math.round(Math.max(y0, y1));
        for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.set(x, y, p, sym);
    }
    ellipse(cx, cy, rx, ry, p, sym = true) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const dx = (x - cx) / rx, dy = (y - cy) / ry;
                if (dx * dx + dy * dy <= 1) this.set(x, y, p, sym);
            }
        }
    }
    line(x0, y0, x1, y1, p, sym = true, thick = 1) {
        const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 || 1;
        for (let i = 0; i <= steps; i++) {
            const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
            for (let t = 0; t < thick; t++) this.set(x + t, y, p, sym);
        }
    }
    poly(pts, p, sym = true) {
        let minX = 99, maxX = -99, minY = 99, maxY = -99;
        for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
            for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const [xi, yi] = pts[i], [xj, yj] = pts[j];
                    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
                }
                if (inside) this.set(x, y, p, sym);
            }
        }
    }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapHue = h => ((h % 360) + 360) % 360;

class SpriteFactory {
    // ---------- Монстры ----------
    // body: 'blob' | 'brute' | 'caster' | 'wraith' | 'fiend'
    static monster(body, hue, seed, opts = {}) {
        const rng = new RNG(seed);
        const g = new SpriteGrid();
        const build = SpriteFactory.archetypes[body] || SpriteFactory.archetypes.brute;
        const info = build(g, rng);
        if (opts.traits && opts.traits.length) SpriteFactory.applyTraits(g, info, opts.traits);

        if (opts.elite && info.top != null) { // «корона» элитных
            const t = Math.round(info.top);
            g.rect(SPRITE_C - 3, t - 1, SPRITE_C + 3, t, 4);
            for (const dx of [-3, 0, 3]) g.set(SPRITE_C + dx, t - 2, 4);
        }
        return SpriteFactory.render(g, rng, hue, info, opts);
    }

    // Детали свойств монстра: игрок «читает» их прямо на спрайте
    static applyTraits(g, info, traits) {
        const my = Math.round(info.my != null ? info.my : 17), top = Math.round(info.top != null ? info.top : 6);
        const empty = (x, y, p) => { if (!g.get(x, y)) g.set(x, y, p, false); };
        if (traits.includes('armored')) {                       // стальные пластины
            for (let y = my - 4; y <= my + 5; y++)
                for (let x = 6; x <= 25; x++) {
                    const p = g.get(x, y);
                    if (p && p !== 6 && (((x >> 1) + (y >> 1)) & 1) === 0) g.set(x, y, 11, false);
                }
            for (let y = top; y <= top + 2; y++) for (let x = 10; x <= 21; x++) if (g.get(x, y)) g.set(x, y, 11, false);
        }
        if (traits.includes('explosive')) {                     // раскалённое ядро и трещины
            g.ellipse(SPRITE_C, my, 2.2, 2.2, 7);
            g.line(SPRITE_C - 5, my - 3, SPRITE_C - 2, my - 1, 7);
            g.line(SPRITE_C - 5, my + 3, SPRITE_C - 2, my + 1, 7);
        }
        if (traits.includes('regen')) {                         // зелёные кресты
            const cx = SPRITE_C - 5, cy = my - 1;
            g.set(cx, cy, 8); g.set(cx - 1, cy, 8); g.set(cx + 1, cy, 8); g.set(cx, cy - 1, 8); g.set(cx, cy + 1, 8);
        }
        if (traits.includes('summoner')) {                      // парящие руны над головой
            for (const dx of [-4, 0, 4]) g.set(SPRITE_C + dx, top - 3 + (dx === 0 ? -1 : 0), 9);
            g.line(SPRITE_C - 3, my - 2, SPRITE_C + 3, my - 2, 9);
        }
        if (traits.includes('swift')) {                         // линии скорости
            for (const i of [-2, 0, 2]) for (let x = 0; x <= 5; x++) empty(x, my + i, 10);
        }
    }

    static hero() {
        if (SpriteFactory._hero) return SpriteFactory._hero;
        const rng = new RNG(777);
        const g = new SpriteGrid();
        const C = SPRITE_C;
        g.ellipse(C, 7, 4.5, 4.5, 3);                                  // голова/волосы (вид со спины)
        for (let y = 11; y <= 24; y++) g.rect(C - (5 + (y - 11) * 0.3), y, C + (5 + (y - 11) * 0.3), y, 1); // плащ
        g.rect(C - 5, 24, C - 1.5, 29, 3);                              // ноги
        g.ellipse(C - 7.5, 16, 2, 3.5, 2);                              // рука
        g.line(26, 8, 26, 22, 5, false, 2);                             // меч (клинок)
        g.rect(24, 21, 28, 22, 4, false);                               // гарда
        g.rect(26, 23, 27, 25, 3, false);                               // рукоять
        const pal = {
            1: [215, 55, 38], 2: [28, 45, 66], 3: [25, 40, 28],
            4: [45, 90, 55], 5: [210, 15, 80], 6: [0, 0, 5]
        };
        SpriteFactory._hero = SpriteFactory.render(g, rng, 215, { palette: pal }, {});
        return SpriteFactory._hero;
    }

    // Кузнец: рыжий громила с горящими глазами
    static smith() {
        if (!SpriteFactory._smith) SpriteFactory._smith = SpriteFactory.monster('brute', 18, 5150, { eye: '#ffcf6a' });
        return SpriteFactory._smith;
    }

    static trader() {
        if (!SpriteFactory._trader) {
            SpriteFactory._trader = SpriteFactory.monster('caster', 32, 4242, { eye: '#ffffff' });
        }
        return SpriteFactory._trader;
    }

    // ---------- Иконки (предметы, портал, снаряды) ----------
    static icon(kind) {
        if (!SpriteFactory._icons) SpriteFactory._icons = {};
        if (SpriteFactory._icons[kind]) return SpriteFactory._icons[kind];
        const c = document.createElement('canvas');
        c.width = c.height = SPRITE_N;
        const x = c.getContext('2d');
        const bottle = color => {
            x.fillStyle = color; x.beginPath(); x.arc(16, 21, 7, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#cfe8ee'; x.fillRect(13, 9, 6, 8);
            x.fillStyle = '#a67c52'; x.fillRect(13, 6, 6, 3);
            x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(12, 18, 2, 4);
        };
        const glow = (inner, outer) => {
            const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
            g.addColorStop(0, inner); g.addColorStop(0.4, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g; x.fillRect(0, 0, 32, 32);
        };
        switch (kind) {
            case 'potion': bottle('#e8334a'); break;
            case 'mana_potion': bottle('#3a7bff'); break;
            case 'weapon':
                x.fillStyle = '#d6dbe3'; x.fillRect(15, 3, 3, 18);
                x.fillStyle = '#fff'; x.fillRect(15, 3, 1, 18);
                x.fillStyle = '#e0b030'; x.fillRect(11, 21, 11, 3);
                x.fillStyle = '#6b4423'; x.fillRect(15, 24, 3, 6);
                break;
            case 'gold':
                x.fillStyle = '#d9a400'; x.beginPath(); x.arc(16, 20, 8, 0, Math.PI * 2); x.fill();
                x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(16, 20, 5.5, 0, Math.PI * 2); x.fill();
                x.fillStyle = '#d9a400'; x.fillRect(15, 16, 2, 8);
                break;
            case 'scroll':
                x.fillStyle = '#e9d9a8'; x.fillRect(8, 8, 16, 18);
                x.fillStyle = '#a33'; x.fillRect(6, 7, 20, 3); x.fillRect(6, 24, 20, 3);
                x.fillStyle = '#7a5a2a'; for (let i = 0; i < 4; i++) x.fillRect(11, 13 + i * 3, 10, 1);
                break;
            case 'portal': {
                glow('rgba(255,120,255,.9)', 'rgba(170,40,220,.55)');
                x.strokeStyle = '#ffd0ff'; x.lineWidth = 2;
                x.beginPath(); x.ellipse(16, 16, 7, 11, 0, 0, Math.PI * 2); x.stroke();
                break;
            }
            case 'armor':
                x.fillStyle = '#7c8696'; x.beginPath(); x.moveTo(8, 8); x.lineTo(24, 8); x.lineTo(27, 14); x.lineTo(23, 17); x.lineTo(23, 27); x.lineTo(9, 27); x.lineTo(9, 17); x.lineTo(5, 14); x.closePath(); x.fill();
                x.fillStyle = '#b8c2d1'; x.fillRect(12, 9, 8, 3); x.fillStyle = '#4e5766'; x.fillRect(15, 12, 2, 15);
                break;
            case 'accessory':
                x.strokeStyle = '#e0b030'; x.lineWidth = 3; x.beginPath(); x.arc(16, 19, 8, 0, Math.PI * 2); x.stroke();
                x.fillStyle = '#4fd1ff'; x.beginPath(); x.moveTo(16, 6); x.lineTo(20, 11); x.lineTo(16, 14); x.lineTo(12, 11); x.closePath(); x.fill();
                break;
            case 'key':
                x.fillStyle = '#ffd34a'; x.beginPath(); x.arc(11, 11, 6, 0, Math.PI * 2); x.fill();
                x.fillStyle = '#222'; x.beginPath(); x.arc(11, 11, 2.2, 0, Math.PI * 2); x.fill();
                x.fillStyle = '#ffd34a'; x.fillRect(14, 14, 12, 3); x.fillRect(21, 17, 3, 5); x.fillRect(17, 17, 3, 4);
                break;
            case 'scroll_cleanse':
                x.fillStyle = '#e9e9f5'; x.fillRect(8, 8, 16, 18);
                x.fillStyle = '#3a6ad8'; x.fillRect(6, 7, 20, 3); x.fillRect(6, 24, 20, 3);
                x.fillStyle = '#6aa0ff'; x.beginPath(); x.arc(16, 17, 4, 0, Math.PI * 2); x.fill();
                break;
            case 'chest':
            case 'chest_open':
                x.fillStyle = '#6b4423'; x.fillRect(5, 14, 22, 14);
                x.fillStyle = '#8a5a30'; x.fillRect(5, 14, 22, 3);
                x.fillStyle = '#d9a400'; x.fillRect(5, 20, 22, 2); x.fillRect(14, 17, 4, 7);
                if (kind === 'chest') { x.fillStyle = '#7a4e28'; x.fillRect(5, 8, 22, 7); x.fillStyle = '#d9a400'; x.fillRect(5, 11, 22, 2); }
                else { x.fillStyle = '#4a2f18'; x.fillRect(5, 4, 22, 5); glow('rgba(255,230,120,.8)', 'rgba(255,190,40,.35)'); }
                break;
            case 'altar':
            case 'altar_used':
                x.fillStyle = '#555a66'; x.fillRect(8, 20, 16, 8); x.fillStyle = '#6e7480'; x.fillRect(10, 14, 12, 7); x.fillRect(7, 26, 18, 3);
                if (kind === 'altar') { glow('rgba(220,150,255,.95)', 'rgba(150,60,220,.5)'); x.fillStyle = '#e8c0ff'; x.beginPath(); x.moveTo(16, 3); x.lineTo(20, 12); x.lineTo(12, 12); x.closePath(); x.fill(); }
                else { x.fillStyle = '#333'; x.fillRect(12, 10, 8, 4); }
                break;
            case 'spikes':
                x.fillStyle = '#3a3a42'; x.fillRect(4, 24, 24, 5);
                x.fillStyle = '#c8ccd6';
                for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(6 + i * 6, 24); x.lineTo(9 + i * 6, 10); x.lineTo(12 + i * 6, 24); x.fill(); }
                break;
            case 'spikes_off':
                x.fillStyle = '#3a3a42'; x.fillRect(4, 24, 24, 5);
                x.fillStyle = '#16161a'; for (let i = 0; i < 4; i++) x.fillRect(8 + i * 6, 25, 3, 2);
                break;
            case 'alarm':
                x.fillStyle = '#3a3a42'; x.fillRect(4, 24, 24, 5);
                x.fillStyle = '#d33'; x.beginPath(); x.arc(16, 22, 6, Math.PI, 0); x.fill();
                break;
            case 'ring': x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 3; x.beginPath(); x.arc(16, 16, 13, 0, Math.PI * 2); x.stroke(); break;
            case 'ring_ice': x.strokeStyle = 'rgba(150,220,255,.95)'; x.lineWidth = 3; x.beginPath(); x.arc(16, 16, 13, 0, Math.PI * 2); x.stroke(); break;
            case 'boom': glow('#fff3b0', 'rgba(255,120,20,.8)'); break;
            case 'orb': glow('#fff7a0', 'rgba(255,200,40,.75)'); break;
            case 'frostball': glow('#ffffff', 'rgba(90,190,255,.85)'); break;
            case 'fairy_heal': case 'fairy_attack': case 'fairy_shield': case 'fairybolt': {
                const col = { fairy_heal: '110,255,140', fairy_attack: '255,100,100', fairy_shield: '110,170,255', fairybolt: '255,120,80' }[kind];
                const g = x.createRadialGradient(16, 16, 0, 16, 16, 13);
                g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
                x.fillStyle = g; x.fillRect(0, 0, 32, 32);
                if (kind !== 'fairybolt') {                       // крылышки феи
                    x.fillStyle = `rgba(${col},0.55)`;
                    x.beginPath(); x.ellipse(10, 12, 5, 2.5, -0.6, 0, Math.PI * 2); x.fill();
                    x.beginPath(); x.ellipse(22, 12, 5, 2.5, 0.6, 0, Math.PI * 2); x.fill();
                }
                break;
            }
            case 'venomball': glow('#eaffc0', 'rgba(110,210,60,.85)'); break;
            case 'deathball': glow('#e8c8ff', 'rgba(130,40,190,.9)'); break;
            case 'stone':
                x.fillStyle = '#2f7fd6'; x.beginPath(); x.moveTo(16, 5); x.lineTo(24, 14); x.lineTo(20, 27); x.lineTo(12, 27); x.lineTo(8, 14); x.closePath(); x.fill();
                x.fillStyle = '#8fd0ff'; x.beginPath(); x.moveTo(16, 5); x.lineTo(24, 14); x.lineTo(16, 15); x.closePath(); x.fill();
                x.fillStyle = '#1b4f93'; x.beginPath(); x.moveTo(16, 15); x.lineTo(20, 27); x.lineTo(12, 27); x.closePath(); x.fill();
                break;
            case 'fireball': glow('#ffffff', 'rgba(255,90,20,.85)'); break;
            default:
                if (kind.startsWith('shrine_')) {          // святилище бога: алтарь с цветным свечением
                    const god = GODS[kind.slice(7)];
                    x.fillStyle = '#4a4f5a'; x.fillRect(9, 20, 14, 8); x.fillStyle = '#666c78'; x.fillRect(11, 14, 10, 7); x.fillRect(7, 26, 18, 3);
                    const g = x.createRadialGradient(16, 10, 1, 16, 10, 14);
                    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, god.color); g.addColorStop(1, 'rgba(0,0,0,0)');
                    x.fillStyle = g; x.fillRect(0, 0, 32, 24);
                    x.font = '14px Arial'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.fillText(god.icon, 16, 16);
                } else { x.fillStyle = '#f0f'; x.fillRect(8, 8, 16, 16); }
        }
        SpriteFactory._icons[kind] = { canvas: c, flash: c, ghostly: false };
        return SpriteFactory._icons[kind];
    }

    // ---------- Раскраска ----------
    static render(g, rng, hue, info, opts) {
        const n = g.n;
        const cv = document.createElement('canvas');
        cv.width = cv.height = n;
        const ctx = cv.getContext('2d');

        const h = hue + rng.range(-14, 14), s = rng.range(45, 70), l = rng.range(38, 50);
        const pal = info.palette || {
            1: [h, s, l],
            2: [h + rng.range(-10, 10), s - 8, l + 8],
            3: [h + rng.range(-20, 20), s - 12, l - 8],
            4: [h + 150 + rng.range(-30, 30), 85, 58],
            5: [h, s - 25, Math.min(90, l + 32)],
            6: [h, 30, 5],
            7: [18, 100, 55],    // тлеющее ядро (взрывной)
            8: [135, 80, 52],    // регенерация
            9: [285, 85, 65],    // руны призывателя
            10: [195, 75, 78],   // скорость
            11: [215, 10, 60]    // сталь
        };

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const p = g.get(x, y);
                if (!p) continue;
                let [hh, ss, ll] = pal[p];
                if (p !== 4 && p !== 6 && !(p >= 7 && p <= 10)) {
                    if (!g.get(x, y - 1)) ll += 12; else if (!g.get(x, y + 1)) ll -= 10; // верхний блик / нижняя тень
                    if (!g.get(x - 1, y)) ll += 6;  if (!g.get(x + 1, y)) ll -= 8;       // свет слева-сверху
                    ll += (0.5 - y / n) * 10 + rng.range(-3, 3);                         // объём + шум
                }
                ctx.fillStyle = `hsl(${wrapHue(hh)},${clamp(ss, 0, 100)}%,${clamp(ll, 2, 95)}%)`;
                ctx.fillRect(x, y, 1, 1);
            }
        }

        // Глаза
        if (info.ey !== undefined) {
            const eye = opts.eye || info.eye || '#fff176';
            const count = info.eyes || rng.pick([2, 2, 2, 1, 3]);
            const size = info.esize || 2;
            const es = info.es || 2;
            const ey = Math.round(info.ey);
            const xs = [];
            if (count === 1) xs.push(Math.round(SPRITE_C - (size - 1) / 2));
            else {
                const xl = Math.round(SPRITE_C - es);
                xs.push(xl, n - 1 - xl - (size - 1));
                if (count === 3) xs.push(Math.round(SPRITE_C - (size - 1) / 2));
            }
            ctx.fillStyle = '#0a0a0a';
            for (const ex of xs) ctx.fillRect(ex - 1, ey - 1, size + 2, size + 2);   // тёмная глазница
            ctx.fillStyle = eye;
            for (const ex of xs) ctx.fillRect(ex, ey, size, size);
        }

        // Рот
        if (info.mouth) {
            const { y, w, teeth } = info.mouth;
            const x0 = Math.round(SPRITE_C - w), x1 = n - 1 - x0;
            ctx.fillStyle = '#140808';
            ctx.fillRect(x0, Math.round(y), x1 - x0 + 1, 1);
            if (teeth) {
                ctx.fillStyle = '#f2efe6';
                for (let x = x0; x <= x1; x += 2) ctx.fillRect(x, Math.round(y), 1, 1);
            }
        }

        // Обводка (золотая у элитных)
        ctx.fillStyle = opts.elite ? '#ffcc33' : '#0a0a0f';
        for (let y = -1; y <= n; y++) {
            for (let x = -1; x <= n; x++) {
                if (g.get(x, y)) continue;
                if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) ctx.fillRect(x, y, 1, 1);
            }
        }

        // Белый силуэт для вспышки при попадании
        const fl = document.createElement('canvas');
        fl.width = fl.height = n;
        const fx = fl.getContext('2d');
        fx.drawImage(cv, 0, 0);
        fx.globalCompositeOperation = 'source-atop';
        fx.fillStyle = '#fff';
        fx.fillRect(0, 0, n, n);

        return { canvas: cv, flash: fl, ghostly: !!info.ghostly,
                 frames: SpriteFactory.makeFrames(cv), flashFrames: SpriteFactory.makeFrames(fl) };
    }

    // 4 кадра ходьбы: тело «подпрыгивает», нижняя часть (ноги/хвост) качается вправо-влево
    // Окраска существа в «нежить»: зеленоватый оттенок поверх исходного спрайта (форма и детали сохраняются)
    static tinted(spr, color = 'rgba(70,230,150,0.40)') {
        const n = spr.canvas.width;
        const mk = src => {
            const c = document.createElement('canvas');
            c.width = c.height = n;
            const x = c.getContext('2d');
            x.drawImage(src, 0, 0);
            x.globalCompositeOperation = 'source-atop';
            x.fillStyle = color; x.fillRect(0, 0, n, n);
            return c;
        };
        const base = mk(spr.canvas);
        const fl = document.createElement('canvas');
        fl.width = fl.height = n;
        const fx = fl.getContext('2d');
        fx.drawImage(base, 0, 0);
        fx.globalCompositeOperation = 'source-atop';
        fx.fillStyle = '#fff'; fx.fillRect(0, 0, n, n);
        return { canvas: base, flash: fl, ghostly: spr.ghostly,
                 frames: SpriteFactory.makeFrames(base), flashFrames: SpriteFactory.makeFrames(fl) };
    }

    static skeleton() {
        if (!SpriteFactory._skeleton) SpriteFactory._skeleton = SpriteFactory.monster('skeleton', 45, 9001, {});
        return SpriteFactory._skeleton;
    }

    static makeFrames(cv) {
        const n = cv.width, split = Math.round(n * 0.72);
        const mk = legShift => {
            const c = document.createElement('canvas');
            c.width = c.height = n;
            const x = c.getContext('2d');
            x.drawImage(cv, 0, 0, n, split, 0, -1, n, split);
            x.drawImage(cv, 0, split, n, n - split, legShift, split - 1, n, n - split);
            return c;
        };
        return [cv, mk(-1), cv, mk(1)];
    }

    // Какая иконка соответствует предмету
    static itemIconKind(item) {
        switch (item.itemType) {
            case 'scroll': return item.effect === 'cleanse' ? 'scroll_cleanse' : 'scroll';
            default: return item.itemType || 'gold';
        }
    }
}

// ---------- Архетипы тел ----------
const CX = SPRITE_C;
SpriteFactory.archetypes = {

    // Слизень: купол с волнистым краем, ядро и капли
    blob(g, rng) {
        const w = rng.range(9, 13), h = rng.range(12, 17), base = 28;
        const wob = rng.range(0.6, 1.6), fr = rng.range(0.5, 1.2), ph = rng.range(0, 6);
        for (let y = base - h; y <= base; y++) {
            const t = (y - (base - h)) / h;
            const half = w * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) + Math.sin(y * fr + ph) * wob * t;
            g.rect(CX - half, y, CX + half, y, 1);
        }
        g.ellipse(CX, base - h * 0.4, w * 0.32, h * 0.22, 3);              // ядро
        g.rect(CX - w * 0.55, base - h * 0.82, CX - w * 0.55 + 1, base - h * 0.82 + 1, 5, false); // блик
        for (let i = 0; i < rng.int(0, 3); i++) {                          // капли
            const x = rng.int(8, 23); g.rect(x, base + 1, x, base + 2, 1, false);
        }
        return { top: base - h, my: base - h * 0.45, ey: base - h * 0.62, es: w * 0.3, eyes: rng.pick([1, 2, 2, 3]),
                 mouth: rng.chance(0.5) ? { y: base - h * 0.3, w: w * 0.3, teeth: false } : null };
    },

    // Орк / громила: широкие плечи, кулаки, клыки
    brute(g, rng) {
        const hr = rng.range(4, 5.2), sh = rng.range(6.5, 9), tH = rng.range(8, 10);
        const top = 12, legTop = top + tH;
        g.ellipse(CX, 8, hr, hr * 0.9, 2);
        g.rect(CX - sh, top, CX + sh, legTop, 1);
        g.rect(CX - sh - 3, top, CX - sh - 1, legTop + 1, 3);
        g.ellipse(CX - sh - 2, legTop + 2, 2.2, 2.2, 2);
        g.rect(CX - 5, legTop, CX - 1.5, 29, 3);
        if (rng.chance(0.6)) g.ellipse(CX - sh, top + 1, 3, 2.5, 4);        // наплечники
        if (rng.chance(0.5)) g.line(CX - hr + 1, 5, CX - hr - 1, 1, 4);      // рожки
        if (rng.chance(0.4)) g.rect(CX - sh + 1, top + 4, CX + sh - 1, top + 5, 4); // пояс/ремень
        return { top: 8 - hr * 0.9, my: 16, ey: 7, es: hr * 0.5, eyes: 2,
                 mouth: { y: 10.5, w: hr * 0.8, teeth: rng.chance(0.7) } };
    },

    // Послушник: балахон, капюшон, посох с орбой
    caster(g, rng) {
        const hood = rng.range(4.5, 5.5), flare = rng.range(0.3, 0.5), top = 11;
        for (let y = top; y <= 29; y++) {
            const half = 4 + (y - top) * flare + (y >= 27 ? rng.range(-1, 1) : 0);
            g.rect(CX - half, y, CX + half, y, 1);
        }
        g.ellipse(CX, 8, hood, hood, 2);
        g.ellipse(CX, 9, hood * 0.62, hood * 0.58, 6);                      // тень под капюшоном
        g.ellipse(CX - 7.5, 17, 2.2, 4, 3);                                 // рукава
        g.rect(CX - 4, 15, CX + 4, 16, 4);                                   // пояс
        g.line(27, 5, 27, 30, 3, false);                                   // посох
        g.ellipse(27, 4, 2.2, 2.2, 4, false);                              // орба
        return { top: 8 - hood, my: 21, ey: 8.5, es: hood * 0.38, eyes: 2, esize: 1 };
    },

    // Призрак: парящая голова, рваный хвост, полупрозрачность
    wraith(g, rng) {
        const ph = rng.range(0, 6);
        g.ellipse(CX, 10, 6, 6.5, 2);
        for (let y = 14; y <= 29; y++) {
            const t = (y - 14) / 15;
            const half = Math.max(0.5, 6.5 - t * 5 + Math.sin(y * 0.9 + ph) * 1.4);
            g.rect(CX - half, y, CX + half, y, 1);
        }
        g.line(CX - 6, 15, CX - 12, 22, 3);                                  // руки-wisps
        g.line(CX - 12, 22, CX - 13, 25, 3);
        g.ellipse(CX, 14, 2, 2.5, 6);                                       // раскрытый рот
        return { top: 3.5, my: 18, ey: 8, es: 2.8, eyes: 2, esize: 2, ghostly: true, eye: '#b8ffff' };
    },

    // Демон: рога, крылья, хвост
    fiend(g, rng) {
        const w = rng.range(7, 9);
        g.ellipse(CX, 17, w, 8, 1);
        g.poly([[CX - w + 1, 12], [1, rng.range(2, 8)], [3, rng.range(16, 22)], [CX - w + 2, 20]], 3); // крылья
        g.ellipse(CX, 8, 5, 4.5, 2);
        g.line(CX - 4, 5, CX - 8, rng.int(0, 2), 4, true, 2);                // рога
        g.line(CX - 8, rng.int(0, 2), CX - 6, 0, 4);
        g.rect(CX - 5, 23, CX - 2, 29, 3);
        g.line(CX - w, 14, CX - w - 3, 22, 3, true, 2);                      // руки
        g.line(20, 26, 27, 24, 4, false);                                  // хвост
        g.line(27, 24, 28, 21, 4, false);
        return { top: 3.5, my: 17, ey: 7, es: 2.2, eyes: 2, eye: '#ff4a3a',
                 mouth: { y: 10.5, w: 2.5, teeth: true } };
    },

    // Мимик: сундук с пастью, зубами и языком
    mimic(g, rng) {
        g.rect(CX - 10, 15, CX + 10, 28, 1);                 // корпус
        g.rect(CX - 10, 9, CX + 10, 14, 2);                  // крышка
        g.rect(CX - 8, 15, CX + 8, 17, 6);                   // пасть
        for (let x = CX - 8; x <= CX + 8; x += 2) { g.set(x, 14, 5, false); g.set(x, 18, 5, false); }
        g.rect(CX - 2, 17, CX + 2, 22, 4);                   // язык
        g.rect(CX - 6, 9, CX - 5, 28, 3);                    // металлические полосы
        g.rect(CX - 9, 28, CX - 7, 30, 3);                   // лапки
        return { top: 9, my: 22, ey: 11, es: 4, eyes: 2, esize: 2, eye: '#ff4a3a', mouth: null };
    },

    // Скелет: череп с горящими глазницами, рёбра, позвоночник
    skeleton(g, rng) {
        g.ellipse(CX, 7, 4.6, 4.6, 2);
        g.rect(CX - 3, 11, CX + 3, 12, 2);
        g.ellipse(CX - 2, 7, 1.3, 1.6, 6);
        g.rect(CX - 1, 13, CX + 1, 23, 3);
        for (const y of [14, 16, 18, 20]) g.rect(CX - 5, y, CX + 5, y, 1);
        g.rect(CX - 4, 22, CX + 4, 23, 1);
        g.line(CX - 6, 14, CX - 9, 23, 3);
        g.rect(CX - 4, 24, CX - 3, 30, 3);
        g.rect(CX - 5, 30, CX - 2, 30, 3);
        return { top: 3, my: 18, ey: 6, es: 2, eyes: 2, esize: 1, eye: '#7fff9a',
                 palette: { 1: [45, 12, 84], 2: [45, 10, 90], 3: [42, 14, 72], 4: [130, 80, 55], 5: [45, 8, 97], 6: [0, 0, 4],
                            7: [18, 100, 55], 8: [135, 80, 52], 9: [285, 85, 65], 10: [195, 75, 78], 11: [215, 10, 60] } };
    }
};
