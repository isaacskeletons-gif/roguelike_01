// modules/player.js — класс, экипировка, навыки, итоговые бонусы
const FIST = { name: 'Кулаки', dmg: 2, speed: 1, itemType: 'weapon', fist: true, mods: {} };

class Player {
    constructor(classId = 'warrior') {
        const P = BALANCE.player, cls = CLASSES[classId] || CLASSES.warrior;
        this.classId = classId;
        this.className = cls.name;
        this.ability = cls.ability;

        this.x = 1.5; this.y = 1.5; this.dir = 0;
        this.str = cls.str; this.dex = cls.dex; this.int = cls.int;       // базовые (без вещей)
        this.baseMaxHp = cls.hp;
        this.baseMaxMana = cls.mana;
        this.level = 1; this.xp = 0;
        this.points = P.startPoints;       // очки характеристик
        this.skillPoints = 1;              // очки навыков
        this.skills = Object.assign({}, cls.skills);
        this.gold = 0;
        this.keys = 0;
        this.stones = 0;                   // камни улучшения (кузнец)
        this.gifts = [];                   // благословения богов: [{id, q}]
        this.spellIndex = 0;
        this.rageTimer = 0; this.deathCd = 0;
        this.lastStandUsed = false; this.rebirthUsed = false;
        this.cleanseTimer = 12;
        this.status = {};
        this.shield = 0; this.shieldT = 0;     // щит феи-хранительницы
        this.blessing = null;              // 'rage' | 'haste' | 'regen' — до конца этажа

        this.equipment = { weapon: { ...cls.weapon }, armor: null, accessory: null };
        this.inventory = [];

        this.attackCooldown = 0;
        this.spellCooldown = 0;
        this.abilityCooldown = 0;
        this.invuln = 0;
        this.swingAnim = 0;
        this.walkBob = 0;
        this.moving = false;
        this.damageFlash = 0;

        this.bonus = {};
        this.maxHp = this.baseMaxHp; this.maxMana = this.baseMaxMana;
        this.recalc();
        this.hp = this.maxHp;
        this.mana = this.maxMana;
    }

    get weapon() { return this.equipment.weapon || FIST; }

    // Итоговые характеристики с учётом вещей
    get tStr() { return this.str + (this.bonus.str || 0); }
    get tDex() { return this.dex + (this.bonus.dex || 0); }
    get tInt() { return this.int + (this.bonus.int || 0); }

    // Пересчёт всех бонусов: вещи + проклятия + навыки + благословение
    recalc() {
        const b = {};
        const add = m => { for (const k in m) b[k] = (b[k] || 0) + m[k]; };
        for (const slot of ['weapon', 'armor', 'accessory']) {
            const it = this.equipment[slot];
            if (!it) continue;
            if (it.mods) add(it.mods);
            if (it.armor) add({ armor: it.armor });
            if (it.curse) add(CURSES[it.curse].mods);
        }
        for (const id in this.skills) {
            const sk = SKILL_BY_ID[id];
            if (!sk) continue;
            for (const k in sk.mods) b[k] = (b[k] || 0) + sk.mods[k] * this.skills[id];
        }
        for (const g of this.gifts) {                      // благословения богов
            const bl = BLESSING_BY_ID[g.id];
            if (!bl) continue;
            for (const k in bl.mods) {
                if (FLAG_KEYS.includes(k)) b[k] = 1;
                else if (k === 'armyPlus') b[k] = (b[k] || 0) + bl.mods[k];      // не зависит от качества дара
                else b[k] = (b[k] || 0) + bl.mods[k] * g.q;
            }
        }
        if (this.blessing === 'rage')  add({ dmgPct: 0.25 });
        if (this.blessing === 'haste') add({ moveSpeed: 0.2, atkSpeed: 0.15 });
        if (this.blessing === 'regen') add({ hpRegen: 2 });
        this.bonus = b;

        this.maxHp = Math.round(this.baseMaxHp * (1 + (b.hpPct || 0)) + (b.hp || 0));
        this.maxMana = Math.round(this.baseMaxMana * (1 + (b.manaPct || 0)) + (b.mana || 0));
        if (this.hp > this.maxHp) this.hp = this.maxHp;
        if (this.mana > this.maxMana) this.mana = this.maxMana;
    }

    get attackInterval() {
        const P = BALANCE.player;
        let ms = Math.max(P.attackMin, P.attackInterval - this.tDex * P.attackPerDex);
        ms *= (this.weapon.speed || 1) * (1 - Math.min(0.5, this.bonus.atkSpeed || 0));
        return Math.max(P.attackMin * 0.7, ms) / 1000;
    }

    get moveSpeed() { return BALANCE.player.moveSpeed * Math.max(0.5, 1 + (this.bonus.moveSpeed || 0)) * (Status.has(this, 'freeze') ? 0.55 : 1); }
    get critChance() { const P = BALANCE.player; return Math.min(0.6, P.critBase + this.tDex * P.critPerDex + (this.bonus.crit || 0)); }
    get dodgeChance() { const P = BALANCE.player; return Math.min(P.dodgeCap + 0.15, this.tDex * P.dodgePerDex + (this.bonus.dodge || 0)); }
    get armorValue() { return this.bonus.armor || 0; }
    get spellCost() { return Math.max(4, BALANCE.player.spellCost - (this.bonus.spellCostCut || 0)); }

    update(dt) {
        const b = this.bonus;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.spellCooldown > 0) this.spellCooldown -= dt;
        if (this.abilityCooldown > 0) this.abilityCooldown -= dt;
        if (this.invuln > 0) this.invuln -= dt;
        if (this.rageTimer > 0) this.rageTimer -= dt;
        if (this.deathCd > 0) this.deathCd -= dt;
        if (this.swingAnim > 0) this.swingAnim = Math.max(0, this.swingAnim - dt * 6);
        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 3);

        const regen = b.hpRegen || 0;                      // отрицательная — от проклятия «Кровотечение»
        if (regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + regen * dt);
        else if (regen < 0 && this.hp > 1) this.hp = Math.max(1, this.hp + regen * dt);

        const mr = BALANCE.player.manaRegen + (b.manaRegen || 0);
        if (this.mana < this.maxMana) this.mana = Math.min(this.maxMana, this.mana + mr * dt);
    }

    canAttack() { return this.attackCooldown <= 0; }
    startAttack() { this.attackCooldown = this.attackInterval; this.swingAnim = 1; }

    takeDamage(amount) {
        if (this.invuln > 0) return { dodged: true, damage: 0 };
        if (Math.random() < this.dodgeChance) return { dodged: true, damage: 0 };
        const K = BALANCE.loot.armorK;
        let dmg = amount * (1 + (this.bonus.dmgTakenPct || 0)) * (1 - Math.min(0.6, this.bonus.dmgReduce || 0)) * K / (K + this.armorValue);
        dmg = Math.max(1, Math.round(dmg));
        let absorbed = 0, broke = false;
        if (this.shield > 0) {                                       // щит поглощает урон первым
            absorbed = Math.min(this.shield, dmg);
            this.shield -= absorbed; dmg -= absorbed;
            if (this.shield <= 0) { this.shield = 0; broke = true; }
        }
        if (dmg > 0) { this.hp -= dmg; this.damageFlash = 1; }
        return { dodged: false, damage: dmg, absorbed, broke };
    }

    heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
    restoreMana(amount) { this.mana = Math.min(this.maxMana, this.mana + amount); }

    attackDamage(multiplier = 1) {
        const P = BALANCE.player, b = this.bonus;
        const isCrit = Math.random() < this.critChance;
        let dmg = (this.weapon.dmg || 0) + this.tStr * P.strDamage;
        dmg *= 1 + (b.dmgPct || 0);
        if (b.berserk && this.hp < this.maxHp * 0.35) dmg *= 1.3;
        if (this.rageTimer > 0) dmg *= 1.3;
        dmg *= (0.85 + Math.random() * 0.3) * multiplier;
        if (isCrit) dmg *= P.critMult + (b.critMult || 0);
        return { damage: Math.max(1, Math.round(dmg)), isCrit };
    }

    // Доступные заклинания зависят от благословений
    availableSpells() {
        const list = ['fireball'];
        if (this.bonus.elements) list.push('frost', 'venom');
        if (this.bonus.deathWord) list.push('death');
        return list;
    }
    get currentSpell() {
        const l = this.availableSpells();
        return l[this.spellIndex % l.length];
    }
    cycleSpell() { this.spellIndex = (this.spellIndex + 1) % this.availableSpells().length; return this.currentSpell; }
    spellCostFor(id) {
        if (id === 'death') return Math.max(25, Math.round(this.maxMana * 0.4));
        return Math.max(4, this.spellCost + SPELLS[id].costAdj);
    }

    spellDamage() {
        const P = BALANCE.player;
        return Math.round((P.spellBase + this.tInt * P.spellPerInt) * (1 + (this.bonus.spellPct || 0)));
    }

    // Возвращает число полученных уровней
    gainXp(amount) {
        this.xp += Math.round(amount * (1 + (this.bonus.xpPct || 0)));
        let gained = 0;
        while (this.xp >= BALANCE.xpToNext(this.level)) {
            this.xp -= BALANCE.xpToNext(this.level);
            this.level++;
            this.points += BALANCE.player.pointsPerLevel;
            this.skillPoints++;
            this.baseMaxHp += 5;
            this.hp = Math.min(this.maxHp + 5, this.hp + 5);
            gained++;
        }
        if (gained) this.recalc();
        return gained;
    }

    gainGold(amount) {
        const g = Math.max(0, Math.round(amount * (1 + (this.bonus.goldPct || 0))));
        this.gold += g;
        return g;
    }

    upgrade(stat) {
        if (this.points <= 0) return false;
        const P = BALANCE.player;
        this[stat]++;
        this.points--;
        if (stat === 'str') { this.baseMaxHp += P.hpPerStr; this.recalc(); this.hp += P.hpPerStr; }
        else if (stat === 'int') { this.baseMaxMana += P.manaPerInt; this.recalc(); this.mana += P.manaPerInt; }
        else this.recalc();
        return true;
    }

    canLearn(id) {
        const sk = SKILL_BY_ID[id];
        if (!sk || this.skillPoints <= 0) return false;
        if ((this.skills[id] || 0) >= sk.max) return false;
        return !sk.req || (this.skills[sk.req] || 0) > 0;
    }

    learn(id) {
        if (!this.canLearn(id)) return false;
        this.skills[id] = (this.skills[id] || 0) + 1;
        this.skillPoints--;
        const hpBefore = this.maxHp, manaBefore = this.maxMana;
        this.recalc();
        this.hp += Math.max(0, this.maxHp - hpBefore);        // навык на здоровье сразу даёт его
        this.mana += Math.max(0, this.maxMana - manaBefore);
        return true;
    }

    hasCursedGear() {
        return Object.values(this.equipment).some(it => it && it.curse);
    }
}
