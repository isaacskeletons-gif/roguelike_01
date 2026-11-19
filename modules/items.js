// modules/items.js — оружие, броня, аксессуары: редкость, аффиксы («Меч Вампира»), проклятые вещи
//
// Ключевые поля предмета: itemType ('weapon'|'armor'|'accessory'|'potion'|'mana_potion'|'scroll'|'gold'|'key'),
// rarity, mods (бонусы), curse (id проклятия или null), color, value (цена).

// Что означают бонусы (mods) и как их показывать
const MOD_LABELS = {
    str: v => `+${v} СИЛ`, dex: v => `+${v} ЛОВ`, int: v => `+${v} ИНТ`,
    hp: v => `+${v} HP`, mana: v => `+${v} маны`, armor: v => `+${v} брони`,
    dmgPct: v => `+${Math.round(v * 100)}% урона`, crit: v => `+${Math.round(v * 100)}% шанс крита`,
    critMult: v => `+${Math.round(v * 100)}% урона крита`, dodge: v => `+${Math.round(v * 100)}% уклонение`,
    lifesteal: v => `${Math.round(v * 100)}% вампиризм`, atkSpeed: v => `+${Math.round(v * 100)}% скорость атаки`,
    moveSpeed: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% скорость бега`,
    manaRegen: v => `+${v} маны/с`, hpRegen: v => `${v > 0 ? '+' : ''}${v} HP/с`,
    thorns: v => `отражает ${v} урона`, spellPct: v => `+${Math.round(v * 100)}% урона заклинаний`,
    goldPct: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% золота`, xpPct: v => `+${Math.round(v * 100)}% опыта`,
    dmgTakenPct: v => `+${Math.round(v * 100)}% получаемого урона`, healPct: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% к лечению`,
    burnC: v => `${Math.round(v * 100)}% шанс поджечь`, poisonC: v => `${Math.round(v * 100)}% шанс отравить`,
    freezeC: v => `${Math.round(v * 100)}% шанс заморозить`, bleedC: v => `${Math.round(v * 100)}% шанс вызвать кровотечение`
};

// Проклятия: предмет сильнее обычного, но снять его нельзя, пока не очистишь (Свиток Очищения)
const CURSES = {
    bleed:   { name: 'Кровотечение', mods: { hpRegen: -0.6 } },
    fragile: { name: 'Хрупкость',    mods: { dmgTakenPct: 0.25 } },
    heavy:   { name: 'Тяжесть',      mods: { moveSpeed: -0.15 } },
    greedy:  { name: 'Жадность',     mods: { goldPct: -0.5, healPct: -0.4 } }
};

// Аффиксы по типам предметов. roll(floor, q) возвращает bonus-объект (q — множитель качества)
const AFFIXES = {
    weapon: [
        { suffix: 'Вампира',  roll: (f, q) => ({ lifesteal: +(0.05 * q).toFixed(2) }) },
        { suffix: 'Ярости',   roll: (f, q) => ({ dmgPct: +(0.12 * q).toFixed(2) }) },
        { suffix: 'Меткости', roll: (f, q) => ({ crit: +(0.07 * q).toFixed(2) }) },
        { suffix: 'Ветра',    roll: (f, q) => ({ atkSpeed: +(0.10 * q).toFixed(2) }) },
        { suffix: 'Титана',   roll: (f, q) => ({ str: Math.round((2 + f / 4) * q) }) },
        { suffix: 'Тени',     roll: (f, q) => ({ dex: Math.round((2 + f / 4) * q) }) },
        { suffix: 'Мудреца',  roll: (f, q) => ({ int: Math.round((2 + f / 4) * q), spellPct: +(0.08 * q).toFixed(2) }) },
        { suffix: 'Пламени',  roll: (f, q) => ({ burnC: +(0.22 * q).toFixed(2) }) },
        { suffix: 'Яда',      roll: (f, q) => ({ poisonC: +(0.25 * q).toFixed(2) }) },
        { suffix: 'Мороза',   roll: (f, q) => ({ freezeC: +(0.20 * q).toFixed(2) }) },
        { suffix: 'Кровопускания', roll: (f, q) => ({ bleedC: +(0.25 * q).toFixed(2) }) }
    ],
    armor: [
        { suffix: 'Стойкости',     roll: (f, q) => ({ hp: Math.round((15 + f * 2) * q) }) },
        { suffix: 'Шипов',         roll: (f, q) => ({ thorns: Math.round((3 + f * 0.8) * q) }) },
        { suffix: 'Проворства',    roll: (f, q) => ({ dodge: +(0.05 * q).toFixed(2) }) },
        { suffix: 'Сопротивления', roll: (f, q) => ({ armor: Math.round((2 + f * 0.3) * q) }) },
        { suffix: 'Жизни',         roll: (f, q) => ({ hpRegen: +((0.5 + f * 0.05) * q).toFixed(1) }) },
        { suffix: 'Чародея',       roll: (f, q) => ({ mana: Math.round(20 * q), manaRegen: +(0.5 * q).toFixed(1) }) }
    ],
    accessory: [
        { suffix: 'Силы',      roll: (f, q) => ({ str: Math.round((2 + f / 4) * q) }) },
        { suffix: 'Ловкости',  roll: (f, q) => ({ dex: Math.round((2 + f / 4) * q) }) },
        { suffix: 'Разума',    roll: (f, q) => ({ int: Math.round((2 + f / 4) * q) }) },
        { suffix: 'Жизни',     roll: (f, q) => ({ hp: Math.round((20 + f * 2.5) * q) }) },
        { suffix: 'Удачи',     roll: (f, q) => ({ goldPct: +(0.25 * q).toFixed(2) }) },
        { suffix: 'Познания',  roll: (f, q) => ({ xpPct: +(0.2 * q).toFixed(2) }) },
        { suffix: 'Скорости',  roll: (f, q) => ({ moveSpeed: +(0.08 * q).toFixed(2) }) },
        { suffix: 'Исцеления', roll: (f, q) => ({ healPct: +(0.3 * q).toFixed(2) }) }
    ]
};

function addMods(target, mods) {
    for (const k in mods) target[k] = +(((target[k] || 0) + mods[k])).toFixed(3);
    return target;
}

// Текстовое описание для подсказки/инвентаря
function describeItem(item) {
    const lines = [];
    const rar = BALANCE.loot.rarity.find(r => r.id === item.rarity);
    if (rar && item.itemType !== 'potion') lines.push(rar.name);
    if (item.itemType === 'weapon') lines.push(`Урон ${item.dmg}, скорость ${item.speed <= 0.8 ? 'высокая' : item.speed >= 1.2 ? 'низкая' : 'средняя'}`);
    if (item.itemType === 'armor') lines.push(`Броня ${item.armor}`);
    if (item.plus) lines.push(`Улучшено: +${item.plus}`);
    if (item.mods) for (const k in item.mods) if (MOD_LABELS[k] && item.mods[k]) lines.push(MOD_LABELS[k](item.mods[k]));
    if (item.heal) lines.push(`Лечит ${item.heal} HP`);
    if (item.mana && item.itemType === 'mana_potion') lines.push(`+${item.mana} маны`);
    if (item.itemType === 'scroll') lines.push(item.effect === 'cleanse' ? 'Снимает проклятие с экипировки' : 'Огненный шар без затрат маны');
    if (item.itemType === 'key') lines.push('Открывает запертую дверь');
    if (item.curse) {
        const c = CURSES[item.curse];
        lines.push('☠ Проклятие «' + c.name + '»: ' + Object.keys(c.mods).map(k => MOD_LABELS[k](c.mods[k])).join(', '));
        lines.push('Нельзя снять, пока не очищено');
    }
    return lines.join('\n');
}

class ItemGenerator {
    static rollRarity(floor, bonus = 0) {
        const w = BALANCE.rarityWeights(floor, bonus);
        let r = Rand.next() * w.reduce((a, b) => a + b, 0);
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return BALANCE.loot.rarity[i]; }
        return BALANCE.loot.rarity[0];
    }

    // Общая сборка: аффиксы, проклятие, название, цена
    static finish(item, slot, rarity, floor, forceCurse) {
        const cursed = forceCurse || Rand.chance(BALANCE.curseProb(floor));
        let count = rarity.affixes + (cursed ? 1 : 0);
        const pool = AFFIXES[slot].slice();
        const q = rarity.mul * (cursed ? BALANCE.loot.cursedMul : 1);
        item.mods = item.mods || {};
        item.rarity = rarity.id;
        item.color = rarity.color;
        const names = [];
        while (count-- > 0 && pool.length) {
            const a = pool.splice(Rand.int(0, pool.length - 1), 1)[0];
            addMods(item.mods, a.roll(floor, q));
            names.push(a.suffix);
        }
        if (names.length) item.name += ' ' + names[0];
        if (cursed) {
            item.curse = Rand.pick(Object.keys(CURSES));
            item.name += ' ☠';
            item.color = '#d6407a';
        } else item.curse = null;
        const ri = BALANCE.loot.rarity.indexOf(rarity);
        item.value = Math.round((item.value || 20) + ri * 45 + names.length * 15);
        return item;
    }

    static generateWeapon(floor, bonus = 0, forceCurse = false) {
        const kinds = [
            { name: 'Меч',    dmg: 5,   speed: 1.0 },
            { name: 'Топор',  dmg: 8,   speed: 1.3 },
            { name: 'Кинжал', dmg: 3.5, speed: 0.7 },
            { name: 'Посох',  dmg: 3,   speed: 1.0, mods: { spellPct: 0.12 } }
        ];
        const k = Rand.pick(kinds);
        const r = this.rollRarity(floor, bonus);
        const cm = forceCurse ? BALANCE.loot.cursedMul : 1;
        const item = {
            name: k.name, itemType: 'weapon', speed: k.speed,
            dmg: Math.round((k.dmg + floor * BALANCE.loot.weaponPerFloor * k.speed) * r.mul * cm),
            mods: Object.assign({}, k.mods), value: 20 + Math.round(k.dmg * 4)
        };
        return this.finish(item, 'weapon', r, floor, forceCurse);
    }

    static generateArmor(floor, bonus = 0, forceCurse = false) {
        const kinds = [
            { name: 'Кожаная Броня', armor: 3, mods: {} },
            { name: 'Кольчуга',      armor: 5, mods: {} },
            { name: 'Латы',          armor: 7, mods: { moveSpeed: -0.05 } },
            { name: 'Мантия',        armor: 1, mods: { mana: 15 } }
        ];
        const k = Rand.pick(kinds);
        const r = this.rollRarity(floor, bonus);
        const cm = forceCurse ? BALANCE.loot.cursedMul : 1;
        const item = {
            name: k.name, itemType: 'armor',
            armor: Math.round((k.armor + floor * BALANCE.loot.armorPerFloor) * r.mul * cm),
            mods: Object.assign({}, k.mods), value: 20 + k.armor * 6
        };
        return this.finish(item, 'armor', r, floor, forceCurse);
    }

    static generateAccessory(floor, bonus = 0, forceCurse = false) {
        const r = this.rollRarity(floor, bonus);
        const base = Rand.pick(['Кольцо', 'Амулет']);
        const item = { name: base, itemType: 'accessory', mods: {}, value: 30 };
        // у аксессуара основное свойство — уже «аффикс», редкость добавляет ещё
        const bumped = { ...r, affixes: r.affixes + 1 };
        return this.finish(item, 'accessory', bumped, floor, forceCurse);
    }

    static generatePotion(floor = 1) {
        const small = 30 + floor * 3, big = 55 + floor * 5;
        const potions = [
            { name: 'Зелье Лечения', heal: small, itemType: 'potion', value: 20 + floor * 2 },
            { name: 'Большое Зелье', heal: big,   itemType: 'potion', value: 40 + floor * 4 },
            { name: 'Зелье Маны',    mana: 30,    itemType: 'mana_potion', value: 20 + floor * 2 }
        ];
        return { ...Rand.pick(potions) };
    }

    static generateScroll(kind = null) {
        kind = kind || (Rand.chance(0.6) ? 'fireball' : 'cleanse');
        return kind === 'cleanse'
            ? { name: 'Свиток Очищения', itemType: 'scroll', effect: 'cleanse', value: 60 }
            : { name: 'Свиток Огня', itemType: 'scroll', effect: 'fireball', value: 40 };
    }

    static generateStone(n = 1) { return { name: n > 1 ? `Камни улучшения ×${n}` : 'Камень улучшения', itemType: 'stone', amount: n }; }

    static generateGold(min, max) {
        const amount = Rand.int(min, max);
        return { name: `${amount} золота`, gold: amount, itemType: 'gold' };
    }

    // Случайная вещь для сундука/награды (bonus — к редкости)
    static randomGear(floor, bonus = 0, forceCurse = false) {
        const roll = Rand.next();
        if (roll < 0.4) return this.generateWeapon(floor, bonus, forceCurse);
        if (roll < 0.75) return this.generateArmor(floor, bonus, forceCurse);
        return this.generateAccessory(floor, bonus, forceCurse);
    }

    static spawnLoot(cells, floor) {
        const items = [];
        const lootCount = 3 + Math.floor(floor / 2);
        for (let i = 0; i < lootCount && cells.length > 0; i++) {
            const pos = cells.splice(Rand.int(0, cells.length - 1), 1)[0];
            const roll = Rand.next();
            let item;
            if (roll < 0.38) item = this.randomGear(floor);
            else if (roll < 0.58) item = this.generatePotion(floor);
            else if (roll < 0.63) item = this.generateScroll();
            else if (roll < 0.69) item = this.generateStone(1);
            else item = this.generateGold(10 + floor * 5, 30 + floor * 10);
            items.push(this.place(item, pos.x + 0.5, pos.y + 0.5));
        }
        return items;
    }

    // На земле любой предмет — сущность с type:'item' и координатами
    static place(item, x, y) { return { ...item, type: 'item', x, y }; }

    // Убираем «земные» поля при подборе
    static pickable(ent) {
        const { x, y, type, warned, ...item } = ent;
        return item;
    }
}
