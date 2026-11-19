// modules/gods.js — боги, их благословения и заклинания.
// Благословения складываются в течение забега (до 3 одинаковых). Качество q: 1 / 1.5 / 2.

const GODS = {
    azaul:  { name: 'Азаул',  title: 'бог войны',            icon: '⚔️', color: '#e5533d' },
    maria:  { name: 'Мария',  title: 'богиня жизни',         icon: '✨', color: '#ffe08a' },
    aforis: { name: 'Афорис', title: 'бог магии и знаний',   icon: '🔮', color: '#6fb7ff' },
    karlaz: { name: 'Кэрлаз', title: 'бог смерти',           icon: '💀', color: '#c27be0' }
};

const GIFT_QUALITY = [
    { name: 'Обычный',   q: 1,   color: '#dddddd', w: 60 },
    { name: 'Редкий',    q: 1.5, color: '#5aaaff', w: 30 },
    { name: 'Эпический', q: 2,   color: '#c66bff', w: 10 }
];

// Бонусы-«флаги»: не масштабируются качеством
const FLAG_KEYS = ['lastStand', 'rebirth', 'elements', 'deathWord', 'meteor', 'killRage', 'cleanse', 'raise'];

const pct = v => Math.round(v * 100) + '%';
const num = (v, q) => Math.round(v * q);

const BLESSINGS = [
    // ---- Азаул: война, сила, стойкость ----
    { id: 'a_might',  god: 'azaul', name: 'Мощь войны',        max: 3, mods: { dmgPct: 0.10 },      text: q => `+${pct(0.10 * q)} к урону` },
    { id: 'a_iron',   god: 'azaul', name: 'Железная кожа',     max: 3, mods: { armor: 3 },          text: q => `+${num(3, q)} к броне` },
    { id: 'a_vigor',  god: 'azaul', name: 'Выносливость',      max: 3, mods: { hp: 30 },            text: q => `+${num(30, q)} к максимальному HP` },
    { id: 'a_resist', god: 'azaul', name: 'Устойчивость',      max: 3, mods: { dmgReduce: 0.06 },   text: q => `−${pct(0.06 * q)} получаемого урона` },
    { id: 'a_immune', god: 'azaul', name: 'Невосприимчивость', max: 2, mods: { statusResist: 0.35 },text: q => `−${pct(Math.min(0.85, 0.35 * q))} к силе ядов, огня и заморозки` },
    { id: 'a_rage',   god: 'azaul', name: 'Кровавая ярость',   max: 1, mods: { killRage: 1 },       text: () => 'После убийства: +30% урона на 4 с' },
    { id: 'a_last',   god: 'azaul', name: 'Несокрушимый',      max: 1, mods: { lastStand: 1 },      text: () => 'Раз на этаже вы переживаете смертельный удар с 1 HP' },

    // ---- Мария: жизнь, исцеление, очищение ----
    { id: 'm_kill',   god: 'maria', name: 'Исцеляющая победа', max: 3, mods: { killHeal: 4 },       text: q => `Убийство лечит на ${num(4, q)} HP + 1% макс. HP` },
    { id: 'm_regen',  god: 'maria', name: 'Дар жизни',         max: 3, mods: { hpRegen: 1.0 },      text: q => `+${(1.0 * q).toFixed(1)} HP/с регенерации` },
    { id: 'm_herbs',  god: 'maria', name: 'Целебные травы',    max: 2, mods: { healPct: 0.35 },     text: q => `+${pct(0.35 * q)} к лечению зельями` },
    { id: 'm_holy',   god: 'maria', name: 'Святой свет',       max: 3, mods: { holy: 0.30 },        text: q => `+${pct(0.30 * q)} урона по злым духам и демонам` },
    { id: 'm_clean',  god: 'maria', name: 'Очищение',          max: 1, mods: { cleanse: 1, statusResist: 0.15 }, text: () => 'Каждые 12 с снимает с вас яды, огонь и заморозку' },
    { id: 'm_rebirth',god: 'maria', name: 'Возрождение',       max: 1, mods: { rebirth: 1 },        text: () => 'Раз за забег: смерть → возрождение с 50% HP' },

    // ---- Афорис: магия, мана, стихии ----
    { id: 'f_mana',   god: 'aforis', name: 'Источник маны',    max: 3, mods: { mana: 25, manaRegen: 0.4 }, text: q => `+${num(25, q)} маны и +${(0.4 * q).toFixed(1)} маны/с` },
    { id: 'f_wise',   god: 'aforis', name: 'Познание',         max: 3, mods: { int: 3, spellPct: 0.15 },   text: q => `+${num(3, q)} ИНТ, +${pct(0.15 * q)} урона заклинаний` },
    { id: 'f_light',  god: 'aforis', name: 'Лёгкость чар',     max: 2, mods: { spellCostCut: 2 },   text: q => `−${num(2, q)} к стоимости заклинаний` },
    { id: 'f_elem',   god: 'aforis', name: 'Дар стихий',       max: 1, mods: { elements: 1 },       text: () => 'Новые заклинания: Ледяная стрела и Ядовитый дротик (G — смена)' },
    { id: 'f_meteor', god: 'aforis', name: 'Арканный взрыв',   max: 1, mods: { meteor: 1 },         text: () => 'Огненный шар взрывается по площади' },
    { id: 'f_flow',   god: 'aforis', name: 'Поток',            max: 2, mods: { manaRegen: 1.2 },    text: q => `+${(1.2 * q).toFixed(1)} маны/с` },

    // ---- Кэрлаз: смерть, жатва, проклятия ----
    { id: 'k_hunger', god: 'karlaz', name: 'Жажда крови',      max: 3, mods: { lifesteal: 0.06 },   text: q => `${pct(0.06 * q)} нанесённого урона возвращается как HP` },
    { id: 'k_exec',   god: 'karlaz', name: 'Казнь',            max: 2, mods: { execute: 0.14 },     text: q => `Враги с HP ниже ${pct(Math.min(0.3, 0.14 * q))} умирают (боссы — вдвое меньше, максимум 30%)` },
    { id: 'k_curse',  god: 'karlaz', name: 'Чары слабости',    max: 2, mods: { weakChance: 0.30 },  text: q => `${pct(Math.min(1, 0.30 * q))} шанс ослабить врага ударом (−25% урона, +20% получаемого)` },
    { id: 'k_word',   god: 'karlaz', name: 'Слово смерти',     max: 1, mods: { deathWord: 1 },      text: () => 'Заклинание мгновенной смерти (кроме боссов; элиты теряют 40% HP), перезарядка 25 с' },
    { id: 'k_soul',   god: 'karlaz', name: 'Жатва душ',        max: 3, mods: { killMana: 6 },       text: q => `Убийство возвращает ${num(6, q)} маны` },
    { id: 'k_dark',   god: 'karlaz', name: 'Тёмная сила',      max: 3, mods: { dmgPct: 0.08, crit: 0.05 }, text: q => `+${pct(0.08 * q)} к урону, +${pct(0.05 * q)} к шансу крита` },
    { id: 'k_raise',  god: 'karlaz', name: 'Некромантия',      max: 1, mods: { raise: 1 },          text: () => 'Поднимайте павших врагов (T): 1 мертвец, сила зависит от запаса маны' },
    { id: 'k_legion', god: 'karlaz', name: 'Легион',           max: 2, mods: { armyPlus: 1 },       text: () => '+1 к лимиту армии мертвецов' },

    // ---- Афорис: духи ----
    { id: 'f_contract', god: 'aforis', name: 'Контракт с духом', max: 3, mods: {},                  text: () => 'Фея-спутница на выбор: 🟢 лечит, 🔴 атакует, 🔵 ставит щит (уровни 1–10)' }
];
const BLESSING_BY_ID = {};
for (const b of BLESSINGS) BLESSING_BY_ID[b.id] = b;

// Заклинания (G — смена). costAdj прибавляется к базовой стоимости
const SPELLS = {
    fireball: { name: 'Огненный шар',    icon: 'fireball',  status: 'burn',   dur: 3, dmgMul: 1.0,  costAdj: 0 },
    frost:    { name: 'Ледяная стрела',  icon: 'frostball', status: 'freeze', dur: 3, dmgMul: 0.85, costAdj: 2 },
    venom:    { name: 'Ядовитый дротик', icon: 'venomball', status: 'poison', dur: 6, dmgMul: 0.6,  costAdj: -1 },
    death:    { name: 'Слово смерти',    icon: 'deathball', status: null,     dur: 0, dmgMul: 0,    costAdj: 0, cooldown: 25 }
};

// Случайные 3 дара от разных богов. boost — смещение к редким (босс/арена)
function rollBlessingOffer(gifts, boost = 0, exclude = []) {
    const have = id => gifts.filter(g => g.id === id).length;
    const gods = Object.keys(GODS).sort(() => Math.random() - 0.5).slice(0, 3);
    const offer = [];
    for (const god of gods) {
        const pool = BLESSINGS.filter(b => b.god === god && have(b.id) < b.max && !exclude.includes(b.id));
        if (!pool.length) continue;
        const b = pool[Math.floor(Math.random() * pool.length)];
        const w = GIFT_QUALITY.map((g, i) => g.w * (i === 0 ? 1 : 1 + boost));
        let r = Math.random() * w.reduce((a, c) => a + c, 0), qi = 0;
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { qi = i; break; } }
        offer.push({ id: b.id, q: GIFT_QUALITY[qi].q, qi });
    }
    return offer;
}

// ---------- Методы игры, связанные с богами (подмешиваются в Roguelike) ----------
const GodMethods = {

    // Окно выбора из трёх даров. source: 'shrine' | 'arena' | 'boss'
    offerBlessings(source, shrine = null) {
        const boost = source === 'boss' ? 1.2 : source === 'arena' ? 0.6 : 0.3;
        // Что не имеет смысла: некромантия для некроманта, легион без некромантии, 4-я фея
        const exclude = [];
        if (this.isNecro()) exclude.push('k_raise');
        if (!this.canRaise()) exclude.push('k_legion');
        if (this.fairies.length >= 3) exclude.push('f_contract');
        const offer = rollBlessingOffer(this.player.gifts, boost, exclude);
        if (!offer.length) { this.log('Боги молчат: вы уже получили все дары.'); return; }
        const title = source === 'boss' ? '👑 Боги наблюдали за вашей победой' : source === 'arena' ? '🏛 Боги довольны вашей победой' : '🕯 Святилище';
        const options = offer.map(o => {
            const b = BLESSING_BY_ID[o.id], god = GODS[b.god], qn = GIFT_QUALITY[o.qi];
            return {
                label: `${god.icon} ${god.name} · ${b.name} [${qn.name}] — ${b.text(o.q)}`,
                color: god.color,
                fn: () => {
                    if (shrine) shrine.used = true;
                    this.closeEventModal();          // сначала закрываем окно: дар может открыть следующее (выбор феи)
                    this.applyBlessing(o);
                }
            };
        });
        this.audio.play('altar');
        this.showEventModal(title, 'Выберите один дар. Благословения действуют до конца забега и складываются.', options, '', { noLeave: true });
    },

    applyBlessing(o) {
        const p = this.player, b = BLESSING_BY_ID[o.id], god = GODS[b.god];
        const hp0 = p.maxHp, mana0 = p.maxMana;
        p.gifts.push({ id: o.id, q: o.q });
        p.recalc();
        p.hp += Math.max(0, p.maxHp - hp0);                       // дар на здоровье/ману сразу пополняет
        p.mana += Math.max(0, p.maxMana - mana0);
        this.audio.play('levelup');
        this.renderer.showBanner(`${god.icon} ${b.name}`, god.color);
        this.log(`<span style="color:${god.color}">${god.name} дарует: ${b.name} — ${b.text(o.q)}</span>`);
        if (b.id === 'f_elem') this.log('Новые заклинания! G — смена заклинания.');
        if (b.id === 'k_word') this.log('Слово смерти доступно (G — смена заклинания).');
        if (b.id === 'k_raise') this.log('Теперь можно поднимать павших врагов: подойдите к телу и нажмите T.');
        if (b.id === 'f_contract') this.chooseFairy();
        this.updateUI();
    },

    useShrine(s) {
        if (s.used) return;
        this.offerBlessings('shrine', s);
    }
};
