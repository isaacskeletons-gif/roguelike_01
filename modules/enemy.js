// modules/enemy.js — враги: типы, свойства (traits), поиск пути, замах перед ударом.
// Картинки не нужны: образ генерируется в sprites.js. speed — клеток в секунду.

const ENEMY_TYPES = [
    { name: "Слизень",   body: 'blob',   hue: 210, hp: 12, dmg: 2,  speed: 1.5, range: 7,  ai: 'chase',  xp: 2,  minFloor: 1, maxFloor: 8,  weight: 5, scale: 0.55 },
    { name: "Гоблин", onHit: { kind: 'bleed', chance: 0.30, dur: 4 },    body: 'brute',  hue: 75,  hp: 16, dmg: 4,  speed: 3.2, range: 9,  ai: 'chase',  xp: 4,  minFloor: 2, maxFloor: 12, weight: 3, scale: 0.55 },
    { name: "Орк",       body: 'brute',  hue: 110, hp: 30, dmg: 5,  speed: 2.4, range: 9,  ai: 'chase',  xp: 5,  minFloor: 2, weight: 4, scale: 0.7 },
    { name: "Послушник", body: 'caster', hue: 50,  hp: 20, dmg: 4,  speed: 1.8, range: 10, ai: 'ranged', xp: 7,  minFloor: 3, weight: 3, scale: 0.7 },
    { name: "Призрак", evil: true,   body: 'wraith', hue: 180, hp: 18, dmg: 6,  speed: 2.1, range: 11, ai: 'ghost',  xp: 8,  minFloor: 4, weight: 3, scale: 0.7 },
    { name: "Каменный голем", body: 'brute', hue: 28, hp: 70, dmg: 9, speed: 1.4, range: 9,  ai: 'chase',  xp: 14, minFloor: 6, weight: 2, scale: 0.95 },
    { name: "Тёмный маг", onHit: { kind: 'poison', chance: 0.60, dur: 5 }, body: 'caster', hue: 285, hp: 28, dmg: 8,  speed: 1.8, range: 11, ai: 'ranged', xp: 14, minFloor: 7, weight: 2, scale: 0.75 },
    { name: "Банши", evil: true, onHit: { kind: 'freeze', chance: 0.35, dur: 2.5 },     body: 'wraith', hue: 300, hp: 30, dmg: 10, speed: 2.6, range: 12, ai: 'ghost',  xp: 14, minFloor: 8, weight: 2, scale: 0.75 },
    { name: "Лавовый слизень", onHit: { kind: 'burn', chance: 0.50, dur: 3 }, body: 'blob', hue: 14, hp: 40, dmg: 7, speed: 1.9, range: 8,  ai: 'chase',  xp: 12, minFloor: 10, weight: 3, scale: 0.8 },
    // Боссы (каждые 5 этажей по кругу): Демон → Лич → Страж
    { name: "Демон", evil: true,     body: 'fiend',  hue: 0,   hp: 65, dmg: 10, speed: 2.7, range: 14, ai: 'chase',  xp: 15, minFloor: 5, weight: 0, scale: 0.95, boss: true },
    { name: "Лич", evil: true,       body: 'caster', hue: 270, hp: 75, dmg: 9,  speed: 2.0, range: 14, ai: 'ranged', xp: 18, minFloor: 10, weight: 0, scale: 1.0, boss: true, forceTraits: ['summoner'] },
    { name: "Страж",     body: 'brute',  hue: 205, hp: 60, dmg: 9, speed: 1.9, range: 14, ai: 'chase', xp: 22, minFloor: 15, weight: 0, scale: 1.15, boss: true, forceTraits: ['armored'] },
    // Особые: не появляются как обычные враги
    { name: "Мимик",     body: 'mimic',  hue: 28,  hp: 36, dmg: 9,  speed: 2.6, range: 14, ai: 'chase',  xp: 12, minFloor: 99, weight: 0, scale: 0.65, special: true },
    { name: "Разбойник", body: 'brute', hue: 15, hp: 22, dmg: 6, speed: 2.7, range: 10, ai: 'chase', xp: 6, minFloor: 99, weight: 0, scale: 0.65, special: true, bandit: true, goldMul: 2.5, onHit: { kind: 'bleed', chance: 0.25, dur: 4 } },
    { name: "Малый слизень", body: 'blob', hue: 285, hp: 6, dmg: 2,  speed: 2.2, range: 14, ai: 'chase',  xp: 0,  minFloor: 99, weight: 0, scale: 0.38, minion: true }
];

const TRAITS = {
    explosive: { prefix: 'Взрывной',       icon: '💥' },
    regen:     { prefix: 'Регенерирующий', icon: '💚' },
    summoner:  { prefix: 'Призывающий',    icon: '🔮' },
    swift:     { prefix: 'Быстрый',        icon: '⚡' },
    armored:   { prefix: 'Бронированный',  icon: '🛡' }
};

// Случайные свойства монстра (используется генератор уровня, поэтому — Rand с сидом)
function rollTraits(floor, elite, typeData) {
    if (typeData.minion || typeData.special) return [];
    const chance = elite ? 1 : Math.min(0.35, 0.04 * floor);
    if (!Rand.chance(chance)) return [];
    const pool = Object.keys(TRAITS).filter(t => t !== 'summoner' || floor >= 3);
    const count = elite && Rand.chance(0.35) ? 2 : 1;
    const out = [];
    while (out.length < count && pool.length) out.push(pool.splice(Rand.int(0, pool.length - 1), 1)[0]);
    return out;
}

class Enemy {
    constructor(typeData, x, y, floor = 1, elite = false, traits = []) {
        const B = BALANCE.enemy;
        const boss = !!typeData.boss;
        const hpMul  = B.hpBase * (1 + B.hpPerFloor  * (floor - 1)) * (boss ? B.bossHp  : elite ? B.eliteHp  : 1);
        const dmgMul =            (1 + B.dmgPerFloor * (floor - 1)) * (boss ? B.bossDmg : elite ? B.eliteDmg : 1);
        const xpMul  =            (1 + B.xpPerFloor  * (floor - 1)) * (boss || elite ? B.eliteXp : 1) * (1 + 0.25 * traits.length);

        this.x = x; this.y = y;
        this.type = 'enemy';
        this.typeName = typeData.name;
        this.traits = traits;
        this.elite = elite;
        this.boss = boss;
        this.minion = !!typeData.minion;
        this.name = (elite ? 'Элитный ' : '') + traits.map(t => TRAITS[t].prefix + ' ').join('') + typeData.name;
        this.hp = this.maxHp = Math.max(1, Math.round(typeData.hp * hpMul * (this.minion ? 1 : 1)));
        this.dmg = Math.round(typeData.dmg * dmgMul);
        this.xp = typeData.xp === 0 ? 0 : Math.max(1, Math.round(typeData.xp * xpMul));
        this.gold = Math.round(this.xp * B.goldPerXp * (typeData.goldMul || 1));
        this.speed = typeData.speed * (traits.includes('swift') ? 1.5 : 1);
        this.range = typeData.range;
        this.ai = typeData.ai;
        this.scale = typeData.scale * (elite ? 1.1 : 1);
        // Уровень от этажа: элитные +2, боссы +3 (цвет метки показывает опасность)
        this.level = this.minion ? Math.max(1, floor - 1) : floor + (boss ? 3 : elite ? 2 : 0);
        this.onHit = typeData.onHit || null;
        this.evil = !!typeData.evil;
        this.bandit = !!typeData.bandit;
        this.passive = false;      // «дремлет» (разбойники до конца разговора)
        this.status = {};
        this.typeName0 = typeData.name;
        this.cooldown = boss ? B.bossCooldown : B.attackCooldown;

        // Уникальный образ: seed определяет форму, цвет, глаза, детали свойств
        this.seed = Rand.int(1, 2147483646);
        this.sprite = SpriteFactory.monster(typeData.body, typeData.hue, this.seed, { elite, traits });
        this.spec = { body: typeData.body, hue: typeData.hue, seed: this.seed, elite, traits };   // чтобы воссоздать образ нежитью
        this.raisable = false;     // тело можно поднять (T)
        this.raised = false;

        this.alive = true;
        this.corpse = 0;          // таймер исчезновения после смерти
        this.flash = 0;           // вспышка при попадании
        this.windup = 0;          // замах ближней атаки
        this.lastAttack = 0;
        this.alert = 0;           // «помнит» игрока, пока таймер > 0 (идёт по BFS даже без прямой видимости)
        this.slow = 0;
        this.hurtAt = -1e9;
        this.lastTime = 0;
        this.summonTimer = 4 + Rand.range(0, 4);
        this.owner = null;        // для призванных миньонов
        this.arenaRoom = null;
        this.moving = false;
        this.anim = Rand.range(0, 4);
        this.phase = Rand.range(0, 6.28);
        this.canSee = false;
        this.losTime = -Rand.range(0, 120);
    }

    update(time, dt, player, world) {
        if (!this.alive) return null;
        this.lastTime = time;
        this.moving = false;
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
        if (this.slow > 0) this.slow -= dt;
        const B = BALANCE.enemy;
        if (this.passive) return null;

        if (this.traits.includes('regen') && this.hp < this.maxHp && time - this.hurtAt > 2000) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.04 * dt);
        }

        const d = Math.hypot(player.x - this.x, player.y - this.y);

        // Замах: враг стоит, потом бьёт, если игрок всё ещё рядом (можно отбежать!)
        if (this.windup > 0) {
            this.windup -= dt;
            if (this.windup <= 0) {
                this.windup = 0;
                if (d <= B.meleeReach * 1.25) return { type: 'melee', dmg: this.dmg * (Status.has(this, 'weak') ? 0.75 : 1) };
            }
            return null;
        }

        // Обнаружение: линия видимости раз в ~120 мс
        if (d < this.range) {
            if (this.ai === 'ghost') this.canSee = true;
            else if (time - this.losTime > 120) {
                this.canSee = world.mapGen.hasLineOfSight(world.map, this.x, this.y, player.x, player.y);
                this.losTime = time;
            }
            if (this.canSee) this.alert = 6;
        } else this.canSee = false;

        if (this.alert <= 0) return null;       // не заметил игрока — стоит
        this.alert -= dt;

        const spd = this.speed * ((this.slow > 0 || Status.has(this, 'freeze')) ? 0.4 : 1);

        // Призыватель
        if (this.traits.includes('summoner') && this.canSee) {
            this.summonTimer -= dt;
            if (this.summonTimer <= 0) { this.summonTimer = 9; return { type: 'summon' }; }
        }

        if (this.ai === 'ranged') {
            if (this.canSee) {
                if (d > 3.5) this.stepTo(world, player.x, player.y, dt, spd, 1);
                else if (d < 2) this.stepTo(world, player.x, player.y, dt, spd, -1);   // держит дистанцию
                if (time - this.lastAttack > 2000) {
                    this.lastAttack = time;
                    const a = Math.atan2(player.y - this.y, player.x - this.x);
                    return { type: 'projectile', owner: 'enemy', x: this.x, y: this.y,
                             vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, dmg: this.dmg * (Status.has(this, 'weak') ? 0.75 : 1), life: 3, status: this.onHit };
                }
            } else this.followPath(world, dt, spd);
            return null;
        }

        // Ближний бой
        if (d > B.meleeReach * 0.8) {
            if (this.canSee && (d < 8 || this.ai === 'ghost')) this.stepTo(world, player.x, player.y, dt, spd, 1);
            else this.followPath(world, dt, spd);
        }
        if (this.canSee && d <= B.meleeReach && time - this.lastAttack > this.cooldown * 1000) {
            this.lastAttack = time;
            this.windup = B.windup;
        }
        return null;
    }

    // Идём по полю расстояний BFS (обходим стены, огибаем углы)
    followPath(world, dt, spd) {
        if (this.ai === 'ghost') { this.stepTo(world, world.player.x, world.player.y, dt, spd, 1); return; }
        const wp = world.path.next(world.map, this.x, this.y);
        if (wp) this.stepTo(world, wp.x, wp.y, dt, spd, 1);
    }

    stepTo(world, tx, ty, dt, spd, sign) {
        const a = Math.atan2(ty - this.y, tx - this.x);
        const mx = Math.cos(a) * spd * dt * sign, my = Math.sin(a) * spd * dt * sign;
        this.moving = true;
        this.anim += dt * 9;
        if (this.ai === 'ghost') { this.x += mx; this.y += my; return; }
        const pad = 0.2;
        if (world.enemyCanEnter(this.x + mx + Math.sign(mx) * pad, this.y)) this.x += mx;
        if (world.enemyCanEnter(this.x, this.y + my + Math.sign(my) * pad)) this.y += my;
    }

    takeDamage(amount) {
        if (Status.has(this, 'weak')) amount = Math.round(amount * 1.2);
        if (this.traits.includes('armored')) amount = Math.max(1, Math.round(amount * 0.7));
        this.hp -= amount;
        this.flash = 1;
        this.hurtAt = this.lastTime;
        this.alert = Math.max(this.alert, 8);
        if (this.hp <= 0) {
            this.alive = false;
            this.corpse = this.traits.includes('explosive') ? 0.6 : 0.4;
            return { died: true, damage: amount };
        }
        return { died: false, damage: amount };
    }
}
