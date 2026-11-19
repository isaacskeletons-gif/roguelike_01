// Запуск: node balance_sim.js
// Грубая модель: игрок получает ~1 уровень за этаж, качает STR 40% / DEX 40% / INT 20%,
// носит среднее оружие этажа. Считаем бой 1 на 1 в ближнем бою БЕЗ уворотов от замаха (худший случай).
const vm = require('vm'), fs = require('fs');
vm.runInThisContext(fs.readFileSync('modules/balance.js', 'utf8') + fs.readFileSync('modules/enemy.js', 'utf8').replace('class Enemy', 'class _Enemy').replace(/function rollTraits[\s\S]*?\n}\n/, ''));
const P = BALANCE.player, E = BALANCE.enemy;

console.log('Этаж | ур | HP игрока | урон удара | DPS | Враг: HP  урон  время боя(с) → потеря HP (% от макс.)');
for (const floor of [1, 2, 3, 5, 8, 10, 15]) {
    const level = floor + 1;
    const pts = P.startPoints + P.pointsPerLevel * (level - 1);
    const str = P.str + Math.round(pts * 0.4), dex = P.dex + Math.round(pts * 0.4);
    const maxHp = P.hp + 5 * (level - 1) + P.hpPerStr * (str - P.str);
    const weaponDmg = floor === 1 ? 2 : 5 + floor * BALANCE.loot.weaponPerFloor;   // средний «меч»
    const interval = Math.max(P.attackMin, P.attackInterval - dex * P.attackPerDex) / 1000;
    const crit = Math.min(P.critCap, P.critBase + dex * P.critPerDex);
    const hit = (weaponDmg + str * P.strDamage) * (1 + crit * (P.critMult - 1));
    const dps = hit / interval;
    const dodge = Math.min(P.dodgeCap, dex * P.dodgePerDex);
    const armor = floor === 1 ? 0 : (3 + floor * BALANCE.loot.armorPerFloor) * 1.1;   // среднее броня с этажа 2
    const armorK = BALANCE.loot.armorK / (BALANCE.loot.armorK + armor);
    console.log(`\n${String(floor).padStart(3)}  | ${level}  | ${maxHp}  | ${hit.toFixed(1)} | ${dps.toFixed(1)} dps | уклонение ${(dodge*100).toFixed(0)}%`);
    for (const t of ENEMY_TYPES) {
        if (t.minFloor > floor && !(t.boss && floor % E.bossEvery === 0)) continue;
        for (const elite of (t.boss ? [false] : [false, true])) {
            const hp = t.hp * E.hpBase * (1 + E.hpPerFloor * (floor - 1)) * (t.boss ? E.bossHp : elite ? E.eliteHp : 1);
            const dmg = t.dmg * (1 + E.dmgPerFloor * (floor - 1)) * (t.boss ? E.bossDmg : elite ? E.eliteDmg : 1);
            const ttk = hp / dps;
            const taken0 = 0; const taken = (ttk / (t.boss ? E.bossCooldown : E.attackCooldown)) * dmg * (1 - dodge) * armorK;
            const name = (t.boss ? '☠' : elite ? '★' : ' ') + t.name.padEnd(10);
            console.log(`        ${name} HP ${hp.toFixed(0).padStart(4)}  урон ${dmg.toFixed(0).padStart(3)}  ${ttk.toFixed(1).padStart(5)} с → -${taken.toFixed(0).padStart(3)} HP (${(taken / maxHp * 100).toFixed(0)}%)`);
        }
    }
}
