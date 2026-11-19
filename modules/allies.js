// modules/allies.js — союзники: армия мертвецов (некромантия Кэрлаза) и феи Афориса.
//
// Армия: павшего врага можно поднять (T). Сила мертвеца зависит от запаса маны в момент подъёма.
// Лимит армии: по этажу (1,1,2,2,3,3,4,4,5,6…) и по запасу маны (слоты открываются при 4/10/14/19/23/27 маны).
// Элитные требуют 45 маны и 30 интеллекта, боссы — 65–80 маны и 30 интеллекта (и вдвое слабее живых).
// Мертвецы и феи растут от 1 до 10 уровня; на 5-м и 10-м уровнях получают особые способности.

const ARMY_MANA = [4, 10, 14, 19, 23, 27];
const ARMY_DEPTH = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
const ALLY_MAX_LEVEL = 10;
const allyXpToNext = lvl => Math.round(10 * Math.pow(1.4, lvl - 1));

const FAIRY_ROLES = {
    heal:   { name: 'Фея-целительница', icon: 'fairy_heal',   color: '#6f6', desc: 'лечит вас и союзников' },
    attack: { name: 'Огонёк-воин',      icon: 'fairy_attack', color: '#f66', desc: 'стреляет по врагам' },
    shield: { name: 'Хранительница',    icon: 'fairy_shield', color: '#6af', desc: 'ставит защитный щит' }
};

// Особые способности по уровням
const ALLY_PERKS = { 5: 'Регенерация (1.5% HP/с)', 10: 'Взрыв при гибели + урон ×1.2' };
const FAIRY_PERKS = {
    heal:   { 5: 'снимает яды и огонь с вас', 10: 'лечит всех сразу' },
    attack: { 5: 'огненные снаряды поджигают', 10: 'стреляет двумя снарядами' },
    shield: { 5: 'щит ×1.5 и быстрее', 10: 'щит ×2' }
};

class Ally {
    constructor(d) {
        this.type = 'ally';
        this.name = d.name;
        this.spec = d.spec;                                   // как воссоздать образ: {body,hue,seed,elite,traits}
        this.base = { hp: d.base.hp, dmg: d.base.dmg, speed: d.base.speed };
        this.ai = d.ai || 'chase';
        this.range = d.range || 9;
        this.scale = d.scale || 0.65;
        this.cooldown = d.cooldown || 1.1;
        this.onHit = d.onHit || null;
        this.traits = d.traits || [];
        this.boss = !!d.boss;
        this.elite = !!d.elite;
        this.level = d.level || 1;
        this.xp = d.xp || 0;
        this.temp = d.temp || 0;                              // >0 — временный призванный (не входит в лимит)
        this.x = d.x || 0; this.y = d.y || 0;
        this.sprite = d.sprite || Ally.makeSprite(this.spec);
        this.flash = 0; this.moving = false;
        this.anim = Math.random() * 4; this.phase = Math.random() * 6;
        this.lastAttack = 0; this.commandT = 0; this.summonT = 8;
        this.path = new Pathfinder(); this.pathT = 0; this.pathKey = -1;
        this.target = null; this.retargetT = 0;
        this.maxHp = 0;
        this.recalc();
        this.hp = d.hp !== undefined ? Math.min(d.hp, this.maxHp) : this.maxHp;
    }

    static makeSprite(spec) {
        if (spec.body === 'skeleton') return SpriteFactory.skeleton();
        return SpriteFactory.tinted(SpriteFactory.monster(spec.body, spec.hue, spec.seed, { elite: spec.elite, traits: spec.traits }));
    }

    static skeleton() {
        return new Ally({ name: 'Скелет', spec: { body: 'skeleton', hue: 45, seed: 9001, elite: false, traits: [] },
                          base: { hp: 26, dmg: 5, speed: 2.6 }, ai: 'chase', range: 9, scale: 0.68 });
    }

    // s — множитель силы (зависит от маны), живой враг → нежить с тем же обликом и свойствами
    static fromCorpse(e, s) {
        return new Ally({
            name: e.name + ' (нежить)', spec: e.spec,
            base: { hp: e.maxHp * s, dmg: e.dmg * s, speed: e.speed },
            ai: e.ai, range: e.range, scale: e.scale, cooldown: e.cooldown, onHit: e.onHit,
            traits: e.traits.slice(), boss: e.boss, elite: e.elite,
            sprite: SpriteFactory.tinted(e.sprite)
        });
    }

    recalc() {
        const m = 1 + 0.14 * (this.level - 1);
        const old = this.maxHp;
        this.maxHp = Math.max(1, Math.round(this.base.hp * m));
        this.dmgBase = this.base.dmg * m * (this.level >= 10 ? 1.2 : 1);
        if (old && this.hp !== undefined) this.hp += this.maxHp - old;      // рост уровня сразу лечит на прибавку
    }
    get dmg() { return Math.max(1, Math.round(this.dmgBase * (this.commandT > 0 ? 1.4 : 1))); }
    get speed() { return Math.max(1.4, Math.min(3.4, this.base.speed)) * (this.commandT > 0 ? 1.3 : 1); }

    gainXp(n) {
        if (this.level >= ALLY_MAX_LEVEL) return false;
        this.xp += n;
        let up = false;
        while (this.level < ALLY_MAX_LEVEL && this.xp >= allyXpToNext(this.level)) {
            this.xp -= allyXpToNext(this.level);
            this.level++; this.recalc(); up = true;
        }
        if (this.level >= ALLY_MAX_LEVEL) this.xp = 0;
        return up;
    }

    serialize() {
        return { name: this.name, spec: this.spec, base: this.base, ai: this.ai, range: this.range, scale: this.scale,
                 cooldown: this.cooldown, onHit: this.onHit, traits: this.traits, boss: this.boss, elite: this.elite,
                 level: this.level, xp: this.xp, hp: this.hp };
    }

    // ---------- Поведение ----------
    update(time, dt, g) {
        this.moving = false;
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
        if (this.commandT > 0) this.commandT -= dt;
        if (this.temp > 0) { this.temp -= dt; if (this.temp <= 0) return 'expire'; }
        const reg = (this.level >= 5 ? 0.015 : 0) + (this.traits.includes('regen') ? 0.04 : 0);
        if (reg && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * reg * dt);

        const p = g.player, dp = Math.hypot(p.x - this.x, p.y - this.y);
        if (dp > 11) { this.x = p.x + (Math.random() - 0.5); this.y = p.y + (Math.random() - 0.5); return null; }   // отстал — догоняет мгновенно

        this.retargetT -= dt;
        if (this.retargetT <= 0 || (this.target && (!this.target.alive || this.target.passive))) {
            this.target = g.allyTarget(this);
            this.retargetT = 0.35;
        }
        const t = this.target;
        if (t && t.alive) this.fight(time, dt, g, t);
        else this.follow(g, dt, dp);
        return null;
    }

    moveToward(g, tx, ty, dt, sign = 1) {
        const a = Math.atan2(ty - this.y, tx - this.x);
        const mx = Math.cos(a) * this.speed * dt * sign, my = Math.sin(a) * this.speed * dt * sign;
        this.moving = true;
        this.anim += dt * 9;
        if (this.ai === 'ghost') { this.x += mx; this.y += my; return; }
        const pad = 0.2;
        if (g.enemyCanEnter(this.x + mx + Math.sign(mx) * pad, this.y)) this.x += mx;
        if (g.enemyCanEnter(this.x, this.y + my + Math.sign(my) * pad)) this.y += my;
    }

    // Дойти до точки: напрямую, если путь свободен, иначе по своему BFS
    goTo(g, tx, ty, dt) {
        if (this.ai === 'ghost' || g.mapGen.hasLineOfSight(g.map, this.x, this.y, tx, ty)) { this.moveToward(g, tx, ty, dt); return; }
        const key = Math.floor(ty) * MAP_SIZE + Math.floor(tx);
        this.pathT -= dt;
        if (this.pathT <= 0 || this.pathKey !== key) {
            this.path.compute(g.map, Math.floor(tx), Math.floor(ty));
            this.pathKey = key; this.pathT = 0.5;
        }
        const wp = this.path.next(g.map, this.x, this.y);
        if (wp) this.moveToward(g, wp.x, wp.y, dt);
    }

    follow(g, dt, dp) {
        if (dp <= 3.2) return;
        const p = g.player;
        if (g.mapGen.hasLineOfSight(g.map, this.x, this.y, p.x, p.y)) this.moveToward(g, p.x, p.y, dt);
        else {                                               // идём по общему полю расстояний до игрока
            const wp = g.path.next(g.map, this.x, this.y);
            if (wp) this.moveToward(g, wp.x, wp.y, dt);
        }
    }

    fight(time, dt, g, t) {
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (this.traits.includes('summoner')) {
            this.summonT -= dt;
            if (this.summonT <= 0) { this.summonT = 10; g.allySummon(this); }
        }
        if (this.ai === 'ranged') {
            if (d > 5) this.goTo(g, t.x, t.y, dt);
            else if (d < 2.5) this.moveToward(g, t.x, t.y, dt, -1);
            if (d < 9 && time - this.lastAttack > 2000 && g.mapGen.hasLineOfSight(g.map, this.x, this.y, t.x, t.y)) {
                this.lastAttack = time; g.allyShoot(this, t);
            }
            return;
        }
        if (d > 0.9) this.goTo(g, t.x, t.y, dt);
        if (d <= 1.1 && time - this.lastAttack > this.cooldown * 1000) { this.lastAttack = time; g.allyAttack(this, t); }
    }
}

// Феи: светящиеся точки рядом с игроком. Не получают урона.
class Fairy {
    constructor(d) {
        this.type = 'fairy';
        this.role = d.role;
        this.level = d.level || 1;
        this.xp = d.xp || 0;
        this.x = d.x || 0; this.y = d.y || 0;
        this.angle = d.angle !== undefined ? d.angle : Math.random() * 6.28;
        this.t = 2 + Math.random() * 2;
        this.phase = Math.random() * 6;
    }
    gainXp(n) {
        if (this.level >= ALLY_MAX_LEVEL) return false;
        this.xp += n;
        let up = false;
        while (this.level < ALLY_MAX_LEVEL && this.xp >= allyXpToNext(this.level)) { this.xp -= allyXpToNext(this.level); this.level++; up = true; }
        if (this.level >= ALLY_MAX_LEVEL) this.xp = 0;
        return up;
    }
    serialize() { return { role: this.role, level: this.level, xp: this.xp }; }

    update(time, dt, g) {
        const p = g.player;
        this.angle += dt * 1.3;
        const tx = p.x + Math.cos(this.angle) * 0.9, ty = p.y + Math.sin(this.angle) * 0.9;
        const k = Math.min(1, dt * 5);
        const nx = this.x + (tx - this.x) * k, ny = this.y + (ty - this.y) * k;
        if (g.mapGen.isWalkable(g.map, nx, ny)) { this.x = nx; this.y = ny; }
        else { this.x += (p.x - this.x) * k; this.y += (p.y - this.y) * k; }
        if (Math.hypot(p.x - this.x, p.y - this.y) > 6) { this.x = p.x; this.y = p.y; }
        this.t -= dt;
        if (this.t <= 0) this.t = g.fairyAct(this);
    }
}

const AllyMethods = {

    startArmy() {
        this.allies = []; this.fairies = [];
        if (this.player.classId === 'necromancer') this.allies.push(Ally.skeleton());   // стартовый скелет
    },

    isNecro() { return this.player.classId === 'necromancer'; },
    canRaise() { return this.isNecro() || !!this.player.bonus.raise; },
    armyCount() { return this.allies.filter(a => !a.temp).length; },

    // Лимит: по этажу и по запасу маны. Без класса «Некромант» (только дар Кэрлаза) — один мертвец
    armyLimit() {
        const p = this.player, f = Math.max(1, this.floor);
        const depth = f >= 10 ? 6 : ARMY_DEPTH[f - 1];
        const byMana = ARMY_MANA.filter(m => m <= p.maxMana).length;
        let cap = this.isNecro() ? Math.min(depth, byMana) : 1;
        cap += p.bonus.armyPlus || 0;
        return Math.max(1, Math.min(6, cap));
    },

    raiseCost(e) {
        if (e.boss) return 65 + Math.min(15, e.level);
        if (e.elite) return 45;
        return Math.max(4, Math.round(4 + e.level * 0.6));
    },

    nearestCorpse(r = 3.5) {
        let best = null, bd = r;
        for (const e of this.entities) {
            if (e.type !== 'enemy' || e.alive || !e.raisable || e.raised || e.corpse <= 0) continue;
            const d = this.dist(this.player, e);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    },

    raiseHint() {
        if (!this.canRaise()) return '';
        const c = this.nearestCorpse();
        return c ? `T — поднять: ${c.name} (${this.raiseCost(c)} маны)` : '';
    },

    raiseFail(msg) {
        if (this.throttle('raisefail', 900)) { this.log(`<span style="color:#c27be0">${msg}</span>`); this.renderer.showBanner(msg, '#c27be0', 1.8); }
    },

    // T — поднять ближайшее тело
    raiseNearest() {
        if (this.inMenu || this.paused || this.isGameOver) return;
        const p = this.player;
        if (!this.canRaise()) { this.raiseFail('Некромантия недоступна: нужен класс Некромант или дар Кэрлаза'); return; }
        const c = this.nearestCorpse();
        if (!c) { this.raiseFail('Рядом нет тела, которое можно поднять'); return; }
        const limit = this.armyLimit(), count = this.armyCount();
        if (count >= limit) { this.raiseFail(`Армия полна (${count}/${limit}). Уберите лишнего (✕ в списке армии)`); return; }
        const cost = this.raiseCost(c);
        if ((c.boss || c.elite) && p.tInt < 30) { this.raiseFail(`Для ${c.boss ? 'босса' : 'элитного'} нужен интеллект 30 (сейчас ${p.tInt})`); return; }
        if (p.mana < cost) { this.raiseFail(`Не хватает маны: нужно ${cost}, есть ${Math.floor(p.mana)}`); return; }

        const frac = p.mana / p.maxMana;                          // чем меньше маны в запасе — тем слабее мертвец
        let strength = 0.35 + 0.65 * frac;
        if (c.boss) strength *= 0.5;                              // боссы вдвое слабее живых
        p.mana -= cost;
        const a = Ally.fromCorpse(c, strength);
        a.x = c.x; a.y = c.y;
        this.allies.push(a);
        c.raised = true; c.corpse = 0;
        this.audio.play('summon');
        this.renderer.addEffect('ring', c.x, c.y, 0.6, 0.9);
        this.renderer.showBanner(`Восстал: ${a.name}`, '#7fe0a0', 1.8);
        this.log(`<span style="color:#7fe0a0">💀 ${a.name} служит вам (сила ${Math.round(strength * 100)}%, ${cost} маны)</span>`);
        this.updateUI();
    },

    // ---------- Цели, бой ----------
    allyTarget(a) {
        let best = null, bd = 8;
        for (const e of this.entities) {
            if (e.type !== 'enemy' || !e.alive || e.passive) continue;
            const d = Math.hypot(e.x - a.x, e.y - a.y);
            if (d < bd && (d < 3 || this.mapGen.hasLineOfSight(this.map, a.x, a.y, e.x, e.y))) { bd = d; best = e; }
        }
        return best;
    },

    // Враг выбирает цель: игрок или ближайший видимый союзник
    pickTarget(e) {
        let best = this.player, bd = Math.hypot(this.player.x - e.x, this.player.y - e.y);
        for (const a of this.allies) {
            const d = Math.hypot(a.x - e.x, a.y - e.y);
            if (d < bd && d < 4.5 && this.mapGen.hasLineOfSight(this.map, e.x, e.y, a.x, a.y)) { best = a; bd = d; }
        }
        return best;
    },

    updateAllies(time, dt) {
        for (let i = this.allies.length - 1; i >= 0; i--) {
            if (this.allies[i].update(time, dt, this) === 'expire') this.allies.splice(i, 1);
        }
        for (const f of this.fairies) f.update(time, dt, this);
    },

    allyAttack(a, t) {
        const dmg = Math.max(1, Math.round(a.dmg * (0.9 + Math.random() * 0.2)));
        this.audio.play('hit', 0.5);
        this.damageEnemy(t, dmg, false, a.name, false, { silent: true, color: '#9f9' });
        if (t.alive && a.onHit && Math.random() < (a.onHit.chance || 1)) {
            const k = a.onHit.kind;
            Status.add(t, k, a.onHit.dur, k === 'poison' ? 2 + a.dmg * 0.3 : k === 'burn' ? 3 + a.dmg * 0.3 : k === 'bleed' ? 2 + a.dmg * 0.2 : 0);
        }
    },

    allyShoot(a, t) {
        const ang = Math.atan2(t.y - a.y, t.x - a.x);
        this.projectiles.push({ owner: 'ally', icon: 'venomball', label: a.name, x: a.x, y: a.y,
                                vx: Math.cos(ang) * 6.5, vy: Math.sin(ang) * 6.5, dmg: a.dmg, life: 2.5, status: a.onHit ? a.onHit.kind : null });
        this.audio.play('spell', 0.3);
    },

    allySummon(a) {                                               // способность «Призыватель» у мертвеца
        const n = this.allies.filter(x => x.temp).length;
        if (n >= 3) return;
        for (let i = 0; i < 2; i++) {
            const x = a.x + (Math.random() - 0.5) * 1.6, y = a.y + (Math.random() - 0.5) * 1.6;
            if (!this.mapGen.isWalkable(this.map, x, y)) continue;
            this.allies.push(new Ally({ name: 'Дух слизня', spec: { body: 'blob', hue: 285, seed: 777 + i, elite: false, traits: [] },
                base: { hp: Math.max(4, a.maxHp * 0.2), dmg: Math.max(2, a.dmg * 0.3), speed: 2.4 }, ai: 'chase', scale: 0.4, temp: 14, x, y }));
            this.renderer.addEffect('ring', x, y, 0.4, 0.5);
        }
        this.audio.play('summon', 0.5);
    },

    hurtAlly(a, dmg, srcName) {
        if (!a || a.hp <= 0) return;
        if (a.traits.includes('armored')) dmg *= 0.7;
        dmg = Math.max(1, Math.round(dmg));
        a.hp -= dmg; a.flash = 1;
        this.renderer.addDamageNumber(320, 190, dmg, false, '#ff9966');
        if (a.hp <= 0) this.killAlly(a, srcName);
    },

    killAlly(a, srcName) {
        const i = this.allies.indexOf(a);
        if (i >= 0) this.allies.splice(i, 1);
        this.renderer.addEffect('ring', a.x, a.y, 0.5, 0.7);
        if (a.temp) return;
        this.audio.play('kill', 0.6);
        this.log(`<span style="color:#f77">💀 ${a.name} пал${srcName ? ` (${srcName})` : ''} — навсегда.</span>`);
        if (a.level >= 10 || a.traits.includes('explosive')) {       // взрыв при гибели
            this.audio.play('boom', 0.7);
            this.renderer.addEffect('boom', a.x, a.y, 0.5, 1.0);
            this.areaDamage(a.x, a.y, 2.0, Math.round(a.dmg * 2), 'Взрыв мертвеца');
        }
        this.updateUI();
    },

    // Опыт союзникам за убийства (кто бы ни убил)
    shareXp(e) {
        if (!e.xp) return;
        for (const a of this.allies) {
            if (!a.temp && a.gainXp(Math.ceil(e.xp * 0.6))) {
                this.log(`<span style="color:#7fe0a0">${a.name} → уровень ${a.level}!${ALLY_PERKS[a.level] ? ' Способность: ' + ALLY_PERKS[a.level] : ''}</span>`);
                this.audio.play('levelup', 0.5);
            }
        }
        for (const f of this.fairies) {
            if (f.gainXp(Math.ceil(e.xp * 0.4))) {
                const perk = FAIRY_PERKS[f.role][f.level];
                this.log(`<span style="color:${FAIRY_ROLES[f.role].color}">${FAIRY_ROLES[f.role].name} → уровень ${f.level}!${perk ? ' Способность: ' + perk : ''}</span>`);
                this.audio.play('levelup', 0.5);
            }
        }
    },

    dismissAlly(i) {
        const a = this.allies[i];
        if (!a) return;
        this.allies.splice(i, 1);
        this.log(`${a.name} отпущен.`);
        this.updateUI();
    },
    dismissFairy(i) {
        const f = this.fairies[i];
        if (!f) return;
        this.fairies.splice(i, 1);
        this.log(`${FAIRY_ROLES[f.role].name} покинула вас.`);
        this.updateUI();
    },

    // Расставить армию возле игрока (новый этаж)
    placeArmy() {
        const p = this.player;
        this.allies.forEach((a, i) => {
            const ang = (i / Math.max(1, this.allies.length)) * Math.PI * 2;
            let x = p.x + Math.cos(ang) * 1.1, y = p.y + Math.sin(ang) * 1.1;
            if (!this.mapGen.isWalkable(this.map, x, y)) { x = p.x; y = p.y; }
            a.x = x; a.y = y; a.target = null;
        });
        for (const f of this.fairies) { f.x = p.x; f.y = p.y; }
    },

    // ---------- Феи ----------
    chooseFairy() {
        if (this.fairies.length >= 3) {
            for (const f of this.fairies) f.gainXp(30);
            this.log('Духи усилились (контракт укрепил связь).');
            return;
        }
        const opts = Object.keys(FAIRY_ROLES).map(role => ({
            label: `${FAIRY_ROLES[role].name} — ${FAIRY_ROLES[role].desc}`,
            color: FAIRY_ROLES[role].color,
            fn: () => { this.closeEventModal(); this.addFairy(role); }
        }));
        this.showEventModal('✨ Контракт с духом', 'К вам присоединяется волшебное существо. Выберите, какое.', opts, '', { noLeave: true });
    },

    addFairy(role) {
        if (this.fairies.length >= 3) return;
        const f = new Fairy({ role, x: this.player.x, y: this.player.y });
        this.fairies.push(f);
        this.audio.play('levelup');
        this.renderer.showBanner(`${FAIRY_ROLES[role].name} с вами`, FAIRY_ROLES[role].color);
        this.log(`<span style="color:${FAIRY_ROLES[role].color}">Контракт заключён: ${FAIRY_ROLES[role].name}</span>`);
        this.updateUI();
    },

    // Срабатывание способности феи. Возвращает, через сколько секунд повторить
    fairyAct(f) {
        const p = this.player, L = f.level;
        if (f.role === 'heal') {
            let who = null, ratio = p.hp / p.maxHp;
            if (ratio < 0.95) who = p;
            for (const a of this.allies) { const r = a.hp / a.maxHp; if (r < 0.9 && r < ratio) { who = a; ratio = r; } }
            if (!who) return 1.0;
            const targets = L >= 10 ? [p, ...this.allies] : [who];
            for (const x of targets) {
                const amount = Math.round(3 + L * 2.2 + x.maxHp * 0.008 * L);
                if (x === p) { p.heal(amount); this.renderer.addDamageNumber(320, 215, amount, false, '#66ff88'); }
                else x.hp = Math.min(x.maxHp, x.hp + amount);
                this.renderer.addEffect('ring', x.x, x.y, 0.4, 0.5);
            }
            if (L >= 5 && targets.includes(p)) Status.clear(p);
            this.audio.play('pickup', 0.4);
            return Math.max(2.5, 5.5 - 0.3 * L);
        }
        if (f.role === 'attack') {
            let t = null, bd = 7.5;
            for (const e of this.entities) {
                if (e.type !== 'enemy' || !e.alive || e.passive) continue;
                const d = Math.hypot(e.x - f.x, e.y - f.y);
                if (d < bd && this.mapGen.hasLineOfSight(this.map, f.x, f.y, e.x, e.y)) { bd = d; t = e; }
            }
            if (!t) return 0.5;
            const dmg = Math.round((4 + L * 2.8 + p.tInt * 0.35) * (1 + (p.bonus.spellPct || 0)));
            const shots = L >= 10 ? 2 : 1;
            const base = Math.atan2(t.y - f.y, t.x - f.x);
            for (let i = 0; i < shots; i++) {
                const a = base + (shots > 1 ? (i ? 0.12 : -0.12) : 0);
                this.projectiles.push({ owner: 'fairy', icon: 'fairybolt', label: 'Огонёк', x: f.x, y: f.y,
                                        vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, dmg, life: 2, status: L >= 5 ? 'burn' : null });
            }
            this.audio.play('spell', 0.25);
            return Math.max(0.7, 1.6 - 0.06 * L);
        }
        if (f.role === 'shield') {
            if (p.shield > 0) return 1.0;
            const mult = L >= 10 ? 2 : L >= 5 ? 1.5 : 1;
            p.shield = Math.round((12 + L * 6) * mult + p.armorValue * 0.5);
            p.shieldT = 8 + L * 0.4;
            this.renderer.addEffect('ring_ice', p.x, p.y, 0.5, 1.0);
            this.audio.play('nova', 0.3);
            return Math.max(5, 11 - 0.5 * L) * (L >= 5 ? 0.75 : 1);
        }
        return 2;
    },

    onShieldBroken() {
        const p = this.player;
        if (this.fairies.some(f => f.role === 'shield' && f.level >= 10)) {   // 10-й уровень: ударная волна холода
            for (const e of this.entities) {
                if (e.type === 'enemy' && e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 2.5) Status.add(e, 'freeze', 2);
            }
            this.renderer.addEffect('ring_ice', p.x, p.y, 0.5, 1.6);
        }
    },

    // Умение некроманта: армия на 6 секунд яростнее и быстрее
    commandArmy() {
        for (const a of this.allies) a.commandT = 6;
        for (const a of this.allies) this.renderer.addEffect('ring', a.x, a.y, 0.5, 0.7);
    },

    // ---------- Сохранение ----------
    serializeArmy() {
        return { allies: this.allies.filter(a => !a.temp).map(a => a.serialize()), fairies: this.fairies.map(f => f.serialize()) };
    },
    restoreArmy(d) {
        this.allies = []; this.fairies = [];
        if (d && Array.isArray(d.allies)) {
            for (const x of d.allies) { try { if (x && x.spec && x.base) this.allies.push(new Ally(x)); } catch (e) {} }
        }
        if (d && Array.isArray(d.fairies)) {
            for (const x of d.fairies.slice(0, 3)) if (FAIRY_ROLES[x.role]) this.fairies.push(new Fairy(x));
        }
        if (!d && this.player.classId === 'necromancer') this.allies.push(Ally.skeleton());
    },

    // ---------- Интерфейс: список армии и духов ----------
    renderArmy() {
        const list = this.$('army-list');
        if (!list) return;
        const key = this.allies.map(a => a.name + a.level + Math.ceil(a.hp) + (a.temp ? 't' : '')).join('|') + '#' + this.fairies.map(f => f.role + f.level).join(',') + '#' + this.canRaise();
        if (this._armyKey === key) return;
        this._armyKey = key;
        list.innerHTML = '';
        const limit = this.armyLimit();
        this.setText('army-count', this.canRaise() ? `(${this.armyCount()}/${limit})` : '');
        if (!this.allies.length && !this.fairies.length) {
            list.innerHTML = '<li class="inv-empty">' + (this.canRaise() ? 'Подойдите к павшему врагу и нажмите T' : 'Союзников нет: дар Афориса («Контракт с духом») или Кэрлаза («Некромантия»)') + '</li>';
            return;
        }
        this.allies.forEach((a, i) => {
            if (a.temp) return;
            const li = document.createElement('li');
            li.className = 'inv-item';
            const perk = a.level >= 10 ? ALLY_PERKS[10] : a.level >= 5 ? ALLY_PERKS[5] : '';
            li.title = `HP ${Math.ceil(a.hp)}/${a.maxHp} · урон ${a.dmg}${perk ? '\n' + perk : ''}`;
            li.innerHTML = `<div class="inv-main"><span style="color:#7fe0a0">💀 ${a.name}</span>
                <small>Ур.${a.level}${a.level < 10 ? ` (${a.xp}/${allyXpToNext(a.level)})` : ' МАКС'} · HP ${Math.ceil(a.hp)}/${a.maxHp} · урон ${a.dmg}</small></div>
                <div class="inv-btns"><button class="x" title="Отпустить" onclick="game.dismissAlly(${i})">✕</button></div>`;
            list.appendChild(li);
        });
        this.fairies.forEach((f, i) => {
            const r = FAIRY_ROLES[f.role], li = document.createElement('li');
            li.className = 'inv-item';
            const perks = FAIRY_PERKS[f.role];
            li.title = `${r.desc}${f.level >= 5 ? '\n5 ур.: ' + perks[5] : ''}${f.level >= 10 ? '\n10 ур.: ' + perks[10] : ''}`;
            li.innerHTML = `<div class="inv-main"><span style="color:${r.color}">✦ ${r.name}</span>
                <small>Ур.${f.level}${f.level < 10 ? ` (${f.xp}/${allyXpToNext(f.level)})` : ' МАКС'} · ${r.desc}</small></div>
                <div class="inv-btns"><button class="x" title="Отпустить" onclick="game.dismissFairy(${i})">✕</button></div>`;
            list.appendChild(li);
        });
    }
};
