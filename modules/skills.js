// modules/skills.js — классы, активные умения и дерево пассивных навыков

const CLASSES = {
    warrior: {
        name: 'Воин', icon: '🛡️',
        desc: 'Много здоровья и брони. Умение «Вихрь» (R) бьёт всех вокруг.',
        str: 8, dex: 4, int: 2, hp: 120, mana: 30,
        weapon: { name: 'Ржавый Меч', dmg: 4, speed: 1.0, itemType: 'weapon', mods: {} },
        skills: { toughness: 1 }, ability: 'whirl'
    },
    rogue: {
        name: 'Разбойник', icon: '🗡️',
        desc: 'Быстрые удары, криты и уклонение. Умение «Рывок» (R) — короткая неуязвимость.',
        str: 5, dex: 9, int: 3, hp: 100, mana: 40,
        weapon: { name: 'Кинжал', dmg: 3, speed: 0.7, itemType: 'weapon', mods: {} },
        skills: { nimble: 1 }, ability: 'dash'
    },
    mage: {
        name: 'Маг', icon: '🔮',
        desc: 'Много маны, мощные заклинания. Умение «Ледяная вспышка» (R) замораживает врагов.',
        str: 3, dex: 5, int: 9, hp: 85, mana: 90,
        weapon: { name: 'Посох', dmg: 2, speed: 1.0, itemType: 'weapon', mods: { spellPct: 0.15 } },
        skills: { scholar: 1 }, ability: 'nova'
    }
};

CLASSES.necromancer = {
    name: 'Некромант', icon: '💀',
    desc: 'Хрупкий, но с огромным запасом маны. Начинает со скелетом, поднимает павших врагов (T) и собирает армию мертвецов. Умение «Зов мёртвых» (R) усиливает армию.',
    str: 3, dex: 4, int: 10, hp: 70, mana: 110,
    weapon: { name: 'Костяной жезл', dmg: 2, speed: 1.0, itemType: 'weapon', mods: { spellPct: 0.1 } },
    skills: { scholar: 1 }, ability: 'command'
};

const ABILITIES = {
    command: { name: 'Зов мёртвых', cd: 14 },
    whirl: { name: 'Вихрь',           cd: 8 },
    dash:  { name: 'Рывок',           cd: 5 },
    nova:  { name: 'Ледяная вспышка', cd: 9 }
};

// Дерево навыков: 3 ветки, каждый следующий навык требует предыдущий. mods — за каждый ранг.
const BRANCHES = { fighter: 'Боец', shadow: 'Тень', mage: 'Чародей' };
const SKILLS = [
    { id: 'toughness', branch: 'fighter', name: 'Крепкая шкура', max: 3, req: null,        mods: { hpPct: 0.10 },      desc: '+10% к максимальному HP' },
    { id: 'tempering', branch: 'fighter', name: 'Закалка',       max: 3, req: 'toughness', mods: { armor: 2 },         desc: '+2 к броне' },
    { id: 'brawler',   branch: 'fighter', name: 'Рубака',        max: 3, req: 'tempering', mods: { dmgPct: 0.08 },     desc: '+8% к урону' },
    { id: 'berserk',   branch: 'fighter', name: 'Берсерк',       max: 1, req: 'brawler',   mods: { berserk: 1 },       desc: 'При HP < 35%: +30% урона' },

    { id: 'nimble',    branch: 'shadow',  name: 'Ловкие ноги',   max: 3, req: null,        mods: { dodge: 0.04 },      desc: '+4% к уклонению' },
    { id: 'eagle',     branch: 'shadow',  name: 'Меткий глаз',   max: 3, req: 'nimble',    mods: { crit: 0.05 },       desc: '+5% к шансу крита' },
    { id: 'quick',     branch: 'shadow',  name: 'Быстрые руки',  max: 3, req: 'eagle',     mods: { atkSpeed: 0.06 },   desc: '+6% к скорости атаки' },
    { id: 'deadly',    branch: 'shadow',  name: 'Смертельный удар', max: 1, req: 'quick',  mods: { critMult: 0.75 },   desc: 'Крит наносит ещё +75% урона' },

    { id: 'scholar',   branch: 'mage',    name: 'Эрудит',        max: 3, req: null,        mods: { manaPct: 0.10, manaRegen: 0.4 }, desc: '+10% маны, +0.4 маны/с' },
    { id: 'firepower', branch: 'mage',    name: 'Сила огня',     max: 3, req: 'scholar',   mods: { spellPct: 0.15 },   desc: '+15% урона заклинаний' },
    { id: 'thrift',    branch: 'mage',    name: 'Экономия',      max: 3, req: 'firepower', mods: { spellCostCut: 1.5 },desc: '−1.5 к стоимости заклинания' },
    { id: 'meteor',    branch: 'mage',    name: 'Метеор',        max: 1, req: 'thrift',    mods: { meteor: 1 },        desc: 'Огненный шар взрывается по площади' }
];
const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;
