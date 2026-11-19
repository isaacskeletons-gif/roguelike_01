// modules/balance.js — ВСЕ числа баланса в одном месте.
// Меняйте цифры здесь, а потом прогоните `node balance_sim.js`, чтобы увидеть результат.

const BALANCE = {
    player: {
        hp: 100, mana: 50, str: 5, dex: 5, int: 5,
        startPoints: 3,          // стартовые очки характеристик
        pointsPerLevel: 2,       // очков за новый уровень
        hpPerStr: 8,             // +HP за каждую единицу STR
        manaPerInt: 8,           // +мана за каждую единицу INT
        strDamage: 0.8,          // урон удара = оружие + STR * strDamage
        attackInterval: 650,     // мс между ударами (база)
        attackPerDex: 12,        // каждая единица DEX ускоряет удар на 12 мс
        attackMin: 260,
        reach: 1.5,              // дальность удара (клетки)
        arc: 0.85,               // полу-угол конуса удара (рад)
        critBase: 0.05, critPerDex: 0.012, critCap: 0.4, critMult: 1.75,
        dodgePerDex: 0.01, dodgeCap: 0.25,
        moveSpeed: 3.9,          // клеток в секунду
        manaRegen: 1.0,          // мана в секунду
        floorHeal: 0.25,         // лечение при спуске (доля от макс. HP)
        spellCost: 10, spellBase: 6, spellPerInt: 2.5, spellSpeed: 7, spellCooldown: 0.5,
        maxInventory: 12
    },
    enemy: {
        hpBase: 2.0,             // общий множитель HP всех врагов
        hpPerFloor: 0.30,        // +30% HP за каждый этаж
        bossHp: 1.5, bossDmg: 1.2, bossCooldown: 1.5,   // у босса свои множители вместо элитных
        dmgPerFloor: 0.09,
        xpPerFloor: 0.10,
        goldPerXp: 2,
        eliteBase: 0.05, eliteEveryFloor: 0.01, eliteCap: 0.20,
        eliteHp: 2.0, eliteDmg: 1.35, eliteXp: 3,
        windup: 0.35,            // секунд «замаха» перед ударом — можно увернуться
        attackCooldown: 1.1,     // секунд между ударами
        meleeReach: 1.0,
        dropPotion: 0.12,
        bossEvery: 5
    },
    loot: {
        weaponPerFloor: 1.4,     // прибавка урона оружия за этаж
        armorPerFloor: 0.9,      // прибавка брони за этаж
        armorK: 25,              // снижение урона = armor / (armor + armorK)
        curseChance: 0.06, curseChancePerFloor: 0.008, curseCap: 0.18,
        rarity: [                // affixes — сколько случайных свойств у предмета
            { id: 'common',    name: 'Обычный',      mul: 1.0,  affixes: 0, color: '#dddddd' },
            { id: 'rare',      name: 'Редкий',       mul: 1.12, affixes: 1, color: '#5aaaff' },
            { id: 'epic',      name: 'Эпический',    mul: 1.25, affixes: 2, color: '#c66bff' },
            { id: 'legendary', name: 'Легендарный',  mul: 1.4,  affixes: 3, color: '#ffa733' }
        ],
        cursedMul: 1.3           // проклятые вещи сильнее, но с недостатком
    },
    events: {
        mimicChance: 0.22,       // шанс, что обычный сундук — мимик (с 2-го этажа)
        trapDamage: 6,           // + этаж * 2
        arenaWaves: 3,
        secretChestBonus: 0.8    // бонус к редкости в тайниках и за арену
    },
    // сколько опыта нужно для следующего уровня
    xpToNext: level => Math.floor(10 * Math.pow(1.45, level - 1))
};

// Вспомогательное: шанс элитного врага на этаже
BALANCE.eliteChance = floor => Math.min(
    BALANCE.enemy.eliteCap,
    BALANCE.enemy.eliteBase + BALANCE.enemy.eliteEveryFloor * (floor - 1)
);

// Веса редкости: чем глубже, тем чаще редкие вещи. bonus — для сундуков/тайников.
BALANCE.rarityWeights = (floor, bonus = 0) => {
    const w = [Math.max(25, 62 - floor * 2.2), 26 + floor * 0.4, 9 + floor * 1.1, 1.5 + floor * 0.5];
    w[2] *= 1 + bonus; w[3] *= 1 + bonus * 1.5;
    return w;
};
BALANCE.curseProb = floor => Math.min(BALANCE.loot.curseCap, BALANCE.loot.curseChance + BALANCE.loot.curseChancePerFloor * floor);
