// modules/events.js — наполнение этажа и комнаты-события:
// сундуки (в т.ч. мимики), алтари, ловушки, арены с волнами, тайники, ключи.
// Подмешивается в класс Roguelike (см. конец game.js).

const RoomEventMethods = {

    // ---------- Расстановка всего на новом этаже (использует Rand с сидом этажа) ----------
    populateLevel(data) {
        const floor = this.floor, rooms = data.rooms, gen = this.mapGen;
        const startRoom = rooms.find(r => r.role === 'start');
        const exitRoom = rooms.find(r => r.role === 'exit');
        const normal = rooms.filter(r => r.role === 'normal');
        const used = new Set();
        const takeCell = room => {            // свободная клетка комнаты (без повторов)
            const cells = Rand.shuffle(gen.roomCells(room));
            for (const c of cells) {
                const k = c.x + ',' + c.y;
                if (!used.has(k)) { used.add(k); return c; }
            }
            return null;
        };

        // 1. События комнат
        const caps = { altar: 1, arena: 1, shrine: 1, bandits: 1 };
        const weights = [['fight', 5], ['chest', 2], ['trap', 1.8], ['altar', 1.2], ['arena', floor >= 2 ? 1.3 : 0], ['shrine', 1.0], ['bandits', floor >= 2 ? 1.2 : 0]];
        for (const r of normal) {
            const pool = weights.filter(([k, w]) => w > 0 && caps[k] !== 0 && !(k === 'arena' && r.w * r.h < 20));
            let roll = Rand.next() * pool.reduce((s, [, w]) => s + w, 0), pick = pool[0][0];
            for (const [k, w] of pool) { roll -= w; if (roll <= 0) { pick = k; break; } }
            r.event = pick;
            if (caps[pick] !== undefined) caps[pick]--;
        }

        // 2. Содержимое событий
        for (const r of normal) {
            if (r.event === 'chest') { const c = takeCell(r); if (c) this.entities.push(this.makeChest(c.x + 0.5, c.y + 0.5, false)); }
            else if (r.event === 'trap') {
                const n = Rand.int(2, 4);
                for (let i = 0; i < n; i++) {
                    const c = takeCell(r);
                    if (c) this.entities.push({ type: 'trap', kind: Rand.chance(0.25) ? 'alarm' : 'spikes',
                                                x: c.x + 0.5, y: c.y + 0.5, armed: true, revealed: false });
                }
            } else if (r.event === 'altar') {
                used.add(r.cx + ',' + r.cy);
                this.entities.push(this.makeAltar(r.cx + 0.5, r.cy + 0.5));
            } else if (r.event === 'shrine') {
                used.add(r.cx + ',' + r.cy);
                this.entities.push({ type: 'shrine', god: Rand.pick(Object.keys(GODS)), x: r.cx + 0.5, y: r.cy + 0.5, used: false });
            } else if (r.event === 'bandits') {
                r.bandits = { done: false };
                const n = Math.min(5, 3 + Math.floor(floor / 4));
                const bType = ENEMY_TYPES.find(t => t.bandit);
                for (let i = 0; i <= n; i++) {                   // последний — главарь (элитный)
                    const c = takeCell(r);
                    if (!c) break;
                    const e = new Enemy(bType, c.x + 0.5, c.y + 0.5, floor, i === n, []);
                    e.passive = true; e.banditRoom = r.id;
                    if (i === n) e.name = 'Главарь разбойников';
                    this.entities.push(e);
                }
            } else if (r.event === 'arena') {
                r.arena = { active: false, done: false, wave: 0, timer: null, sealed: [] };
            }
        }
        for (const r of rooms.filter(r => r.role === 'secret')) {          // тайники: гарантированный хороший сундук
            const c = takeCell(r);
            if (c) this.entities.push(this.makeChest(c.x + 0.5, c.y + 0.5, true));
        }

        // 3. Враги — в комнатах (выход охраняется усиленно)
        const eligible = [];
        for (const r of normal) if (['fight', 'chest', 'trap'].includes(r.event)) eligible.push(r);
        if (data.keyRoom != null && !eligible.includes(rooms[data.keyRoom]) && rooms[data.keyRoom].event !== 'arena') eligible.push(rooms[data.keyRoom]);
        eligible.push(exitRoom, exitRoom);
        const types = ENEMY_TYPES;
        const count = Math.min(28, Math.round(3 + floor * 1.6));
        for (let i = 0; i < count; i++) {
            const c = takeCell(Rand.pick(eligible));
            if (!c) continue;
            this.entities.push(this.spawnEnemy(this.pickEnemyType(), c.x + 0.5, c.y + 0.5));
        }

        // Босс каждые N этажей — в комнате с выходом
        if (floor % BALANCE.enemy.bossEvery === 0) {
            const bosses = types.filter(t => t.boss);
            const bossType = bosses[(Math.floor(floor / BALANCE.enemy.bossEvery) - 1) % bosses.length];
            let c = null;
            for (let i = 0; i < 12; i++) {
                const cand = takeCell(exitRoom);
                if (cand && Math.hypot(cand.x + 0.5 - data.exit.x, cand.y + 0.5 - data.exit.y) >= 1.5) { c = cand; break; }
            }
            if (c) {
                const boss = this.spawnEnemy(bossType, c.x + 0.5, c.y + 0.5, true);
                boss.loot = ItemGenerator.randomGear(floor, 0.8);       // награда за босса
                this.entities.push(boss);
                this.log(`<span style="color:#f55">Здесь обитает ${bossType.name}! Портал закрыт, пока он жив.</span>`);
            }
        }

        // 4. Лут и ключ
        const lootCells = [];
        for (const r of [...eligible, ...normal.filter(r => r.event === 'chest')]) {
            for (const c of gen.roomCells(r)) {
                const k = c.x + ',' + c.y;
                if (!used.has(k)) lootCells.push(c);
            }
        }
        const lootList = Array.from(new Map(lootCells.map(c => [c.x + ',' + c.y, c])).values());
        this.entities.push(...ItemGenerator.spawnLoot(lootList, floor));

        if (data.keyRoom != null) {
            const c = takeCell(rooms[data.keyRoom]);
            if (c) this.entities.push(ItemGenerator.place({ name: 'Ключ', itemType: 'key' }, c.x + 0.5, c.y + 0.5));
            this.log('<span style="color:#fd3">Одна из комнат заперта. Найдите ключ 🗝</span>');
        }

        // 5. Торговец — в безопасной стартовой комнате каждые 3 этажа
        if (floor % 3 === 0) {
            const c = takeCell(startRoom);
            if (c) {
                this.trader = new Trader(c.x + 0.5, c.y + 0.5, floor);
                this.entities.push(this.trader);
                this.log('<span style="color:orange">В стартовой комнате торговец! (E рядом с ним)</span>');
            }
        } else this.trader = null;
        if (floor % 3 === 2) {
            const c = takeCell(startRoom);
            if (c) {
                this.smith = new Smith(c.x + 0.5, c.y + 0.5, floor);
                this.entities.push(this.smith);
                this.log('<span style="color:orange">В стартовой комнате кузнец! Улучшение снаряжения за камни 💎 (E)</span>');
            }
        } else this.smith = null;
    },

    spawnEnemy(typeData, x, y, forceElite = false) {
        const elite = forceElite || Rand.chance(BALANCE.eliteChance(this.floor));
        const traits = typeData.forceTraits ? typeData.forceTraits.slice() : rollTraits(this.floor, elite && !typeData.boss, typeData);
        return new Enemy(typeData, x, y, this.floor, elite && !typeData.boss, traits);
    },

    makeChest(x, y, guaranteed) {
        const floor = this.floor, ev = BALANCE.events;
        const mimic = !guaranteed && floor >= 2 && Rand.chance(ev.mimicChance);
        const bonus = guaranteed ? ev.secretChestBonus : 0;
        const loot = (guaranteed || Rand.chance(0.7)) ? ItemGenerator.randomGear(floor, bonus) : ItemGenerator.generatePotion(floor);
        return { type: 'chest', x, y, opened: false, mimic, loot, stones: Rand.int(0, 1) + (guaranteed ? 1 : 0), gold: Rand.int(10 + floor * 4, 25 + floor * 8) * (guaranteed ? 2 : 1) };
    },

    makeAltar(x, y) {
        const deal = Rand.pick(['blood', 'gold', 'curse', 'fortune']);
        return {
            type: 'altar', x, y, used: false, deal,
            curseItem: deal === 'curse' ? ItemGenerator.randomGear(this.floor, 0.6, true) : null,
            blessing: Rand.pick(['rage', 'haste', 'regen'])
        };
    },

    // ---------- Сундуки и мимики ----------
    openChest(c) {
        if (c.opened) return;
        c.opened = true;
        if (c.mimic) {
            const idx = this.entities.indexOf(c);
            if (idx >= 0) this.entities.splice(idx, 1);
            const m = new Enemy(ENEMY_TYPES.find(t => t.special && !t.bandit), c.x, c.y, this.floor, false, []);
            m.loot = c.loot; m.alert = 12; m.windup = 0.3;
            this.entities.push(m);
            this.audio.play('mimic');
            this.renderer.showBanner('Это был МИМИК!', '#f55');
            this.log('<span style="color:#f55">Сундук ожил — это мимик!</span>');
            return;
        }
        this.audio.play('pickup');
        const g = this.player.gainGold(c.gold);
        const drop = ItemGenerator.place(c.loot, c.x + 0.35, c.y + 0.35);
        this.entities.push(drop);
        if (c.stones) { this.player.stones += c.stones; this.log(`<span style="color:#7cf">+${c.stones} 💎 камней улучшения</span>`); }
        this.log(`<span style="color:gold">Сундук: +${g} 💰</span> и <span style="color:${c.loot.color || '#fff'}">${c.loot.name}</span>`);
        this.updateStats();
    },

    // ---------- Алтари ----------
    useAltar(a) {
        if (a.used) return;
        this.audio.play('altar');
        const p = this.player, floor = this.floor;
        const done = () => { a.used = true; this.closeEventModal(); this.updateUI(); };
        if (a.deal === 'blood') {
            const cost = Math.round(p.maxHp * 0.3);
            this.showEventModal('🩸 Алтарь Крови', 'Тёмный камень жаждет крови. Взамен он даст силу.', [
                { label: `Принести жертву (−${cost} HP) → +2 очка характеристик`, disabled: p.hp <= cost + 5,
                  fn: () => { p.hp -= cost; p.points += 2; this.log('<span style="color:#f55">Алтарь принял кровь. +2 очка характеристик</span>'); done(); } }
            ]);
        } else if (a.deal === 'gold') {
            const price = 40 + floor * 12;
            this.showEventModal('✨ Алтарь Щедрости', 'Пожертвуйте золото — и раны исчезнут.', [
                { label: `Отдать ${price} 💰 → полное исцеление и мана`, disabled: p.gold < price,
                  fn: () => { p.gold -= price; p.hp = p.maxHp; p.mana = p.maxMana; this.log('Вы полностью исцелены'); done(); } }
            ]);
        } else if (a.deal === 'curse') {
            const it = a.curseItem;
            this.showEventModal('☠ Тёмный Алтарь', 'Из тени протягивается рука с мощным даром. Но у всего есть цена...', [
                { label: `Принять дар: ${it.name} (проклят)`,
                  fn: () => {
                      this.audio.play('curse');
                      if (p.inventory.length < BALANCE.player.maxInventory) p.inventory.push(it);
                      else this.entities.push(ItemGenerator.place(it, a.x + 0.4, a.y + 0.4));
                      this.log(`<span style="color:#d6407a">Получено проклятое: ${it.name}</span>`);
                      done();
                  } }
            ], describeItem(it));
        } else {
            const names = { rage: '+25% урона', haste: '+20% скорости и +15% скорости атаки', regen: '+2 HP/с' };
            this.showEventModal('🙏 Алтарь Удачи', 'Помолитесь — получите благословение до конца этажа.', [
                { label: `Помолиться → ${names[a.blessing]}`,
                  fn: () => { p.blessing = a.blessing; p.recalc(); this.log(`<span style="color:#7cf">Благословение: ${names[a.blessing]}</span>`); done(); } }
            ]);
        }
    },

    // ---------- Ловушки ----------
    updateTraps() {
        const p = this.player;
        for (const t of this.entities) {
            if (t.type !== 'trap' || !t.armed) continue;
            const d = this.dist(p, t);
            if (!t.revealed && d < 1.0 + p.tDex * 0.12) { t.revealed = true; this.log('Вы заметили ловушку!'); this.audio.play('ui'); }
            if (d < 0.5) this.triggerTrap(t);
        }
    },

    triggerTrap(t) {
        t.armed = false; t.revealed = true;
        this.audio.play('trap');
        if (t.kind === 'alarm') {
            this.audio.play('alarm');
            this.renderer.showBanner('ТРЕВОГА! Враги вас услышали', '#fc3');
            this.log('<span style="color:#fc3">Сработала сигнализация — все враги идут к вам!</span>');
            for (const e of this.entities) if (e.type === 'enemy' && e.alive) e.alert = 15;
        } else {
            this.hurtPlayer(BALANCE.events.trapDamage + this.floor * 2, 'Шипы');
        }
    },

    // ---------- Арены ----------
    updateArenas(dt) {
        const p = this.player;
        for (const r of this.rooms) {
            const a = r.arena;
            if (!a || a.done) continue;
            if (!a.active) {
                if (p.x >= r.x + 1 && p.x <= r.x + r.w - 1 && p.y >= r.y + 1 && p.y <= r.y + r.h - 1) this.startArena(r);
                continue;
            }
            const alive = this.entities.some(e => e.type === 'enemy' && e.alive && e.arenaRoom === r.id);
            if (alive) { a.timer = null; continue; }
            if (a.timer === null) a.timer = 1.2;
            a.timer -= dt;
            if (a.timer <= 0) {
                a.timer = null;
                if (a.wave >= BALANCE.events.arenaWaves) this.finishArena(r); else this.spawnWave(r);
            }
        }
    },

    startArena(r) {
        const a = r.arena;
        a.active = true;
        for (const m of r.mouths) {
            a.sealed.push({ x: m.x, y: m.y, prev: this.map[m.y][m.x] });
            this.setTile(m.x, m.y, TILE_BARS);
        }
        this.audio.play('arena');
        this.log('<span style="color:#f55">Решётки опустились! Арена: победите все волны.</span>');
        this.spawnWave(r);
    },

    spawnWave(r) {
        const a = r.arena, p = this.player;
        a.wave++;
        const total = BALANCE.events.arenaWaves;
        this.renderer.showBanner(`Волна ${a.wave} / ${total}`, '#f96');
        const n = Math.min(9, 2 + Math.floor(this.floor / 2) + a.wave);
        const cells = Rand.shuffle(this.mapGen.roomCells(r)).filter(c => Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y) > 2.5);
        for (let i = 0; i < n && i < cells.length; i++) {
            const c = cells[i];
            const e = this.spawnEnemy(this.pickEnemyType(), c.x + 0.5, c.y + 0.5, Rand.chance(0.08 * a.wave));
            e.arenaRoom = r.id; e.alert = 12;
            this.entities.push(e);
            this.renderer.addEffect('ring', e.x, e.y, 0.5, 0.6);
        }
        this.audio.play('summon');
    },

    finishArena(r) {
        const a = r.arena;
        a.active = false; a.done = true;
        for (const s of a.sealed) this.setTile(s.x, s.y, s.prev);
        const chest = this.makeChest(r.cx + 0.5, r.cy + 0.5, true);
        this.entities.push(chest);
        this.audio.play('levelup');
        this.renderer.showBanner('Арена пройдена! Решётки подняты', '#7f7');
        this.log('<span style="color:#7f7">Арена пройдена — в центре появился сундук с наградой.</span>');
        this.offerBlessings('arena');
    },

    // ---------- Разбойники: диалог, когда вы полностью вошли в комнату ----------
    updateBandits() {
        const p = this.player;
        for (const r of this.rooms) {
            const b = r.bandits;
            if (!b || b.done) continue;
            if (p.x >= r.x + 1 && p.x <= r.x + r.w - 1 && p.y >= r.y + 1 && p.y <= r.y + r.h - 1) this.startBanditTalk(r);
        }
    },

    startBanditTalk(r) {
        r.bandits.done = true;
        const p = this.player, floor = this.floor;
        const members = this.entities.filter(e => e.type === 'enemy' && e.alive && e.banditRoom === r.id);
        if (!members.length) return;
        const demand = 40 + floor * 20;
        const best = p.inventory.filter(i => i.itemType !== 'key').sort((a, b) => (b.value || 0) - (a.value || 0))[0];
        const chance = stat => Math.max(0.12, Math.min(0.85, 0.2 + stat * 0.045 - floor * 0.01));
        const cs = chance(p.tStr), ci = chance(p.tInt), cd = chance(p.tDex);
        const pc = v => Math.round(v * 100) + '%';

        const fight = msg => {
            for (const e of members) { e.passive = false; e.alert = 12; }
            this.audio.play('arena');
            this.renderer.showBanner('Разбойники нападают!', '#f55');
            this.log(`<span style="color:#f55">${msg}</span>`);
            this.closeEventModal();
        };
        const leave = msg => {
            for (const e of members) {
                const i = this.entities.indexOf(e);
                if (i >= 0) this.entities.splice(i, 1);
                this.renderer.addEffect('ring', e.x, e.y, 0.5, 0.6);
            }
            this.log(msg);
            this.closeEventModal();
        };
        const give = () => this.entities.push(ItemGenerator.place(ItemGenerator.generatePotion(floor), r.cx + 0.5, r.cy + 0.5));

        this.audio.play('mimic');
        this.showEventModal('🗡 Разбойники!',
            `«Стой! Это наша комната. Раскошеливайся — или будет драка.» Требуют ${demand} 💰.`, [
            { label: `Заплатить ${demand} 💰`, disabled: p.gold < demand,
              fn: () => { p.gold -= demand; leave('Разбойники забрали золото и ушли.'); this.updateUI(); } },
            { label: best ? `Отдать лучшую вещь: ${best.name}` : 'Отдать вещь (у вас ничего нет)', disabled: !best,
              fn: () => { p.inventory.splice(p.inventory.indexOf(best), 1); leave(`Разбойники взяли «${best.name}» и ушли.`); this.updateUI(); } },
            { label: `Запугать (СИЛ) — шанс ${pc(cs)}`,
              fn: () => {
                  if (Math.random() < cs) { const g = p.gainGold(floor * 8); leave(`Разбойники в страхе разбежались, бросив ${g} 💰.`); this.updateUI(); }
                  else fight('Запугать не вышло — разбойники в ярости!');
              } },
            { label: `Уговорить (ИНТ) — шанс ${pc(ci)}`,
              fn: () => {
                  if (Math.random() < ci) { give(); leave('Разбойники посмеялись, оставили вам зелье и ушли.'); }
                  else fight('Уговоры не подействовали — драка!');
              } },
            { label: `Проскользнуть мимо (ЛОВ) — шанс ${pc(cd)}`,
              fn: () => {
                  if (Math.random() < cd) { this.log('Вы проскользнули мимо — разбойники вас не тронут, пока вы их не тронете.'); this.closeEventModal(); }
                  else fight('Вас заметили — драка!');
              } },
            { label: 'Отказать — драка', fn: () => fight('Вы отказались — разбойники нападают!') }
        ], '', { noLeave: true });
    },

    // ---------- Тайные стены ----------
    searchSecret(tx, ty) {
        this.setTile(tx, ty, TILE_OPEN);
        this.audio.play('unlock');
        this.renderer.showBanner('Вы нашли тайник!', '#4df');
        this.log('<span style="color:#4df">Часть стены сдвинулась — тайник открыт!</span>');
        this.lastReveal = -1;     // принудительно открыть карту вокруг
    }
};
