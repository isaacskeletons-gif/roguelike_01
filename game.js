// game.js — главный игровой контроллер.
// События комнат — в modules/events.js, интерфейс — в modules/ui.js (подмешиваются в конце файла).

class Roguelike {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.minimapCanvas = document.getElementById('minimap');

        this.mapGen = new MapGenerator();
        this.path = new Pathfinder();
        this.audio = new AudioFX();
        this.records = this.loadRecords();

        this.classId = 'warrior';
        this.player = new Player(this.classId);
        this.renderer = new Renderer(this.canvas, this.minimapCanvas);

        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('rogue_keys')); } catch (e) {}
        this.controls = saved || { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD' };

        this.runSeed = '';
        this.isDaily = false;
        this.stats = { kills: 0 };
        this.floor = 1;
        this.biome = BIOMES[0];
        this.map = [];
        this.rooms = [];
        this.entities = [];
        this.projectiles = [];
        this.explosions = [];
        this._enemies = [];
        this.exit = { x: 0, y: 0 };
        this.trader = null;
        this.smith = null;
        this.allies = [];                              // армия мертвецов
        this.fairies = [];                             // духи Афориса
        this.relations = { trader: 0, smith: 0 };      // симпатия NPC (−100..100), на весь забег
        this.npcTalks = { trader: 3, smith: 3 };
        this.haggle = {};
        this.quest = null;
        this.bestiary = this.loadBestiary();

        this.keys = {};
        this.mouse = { x: 320, y: 240 };
        this.touchMove = { x: 0, y: 0 };
        this.touchMode = false;
        this.isGameOver = false;
        this.inMenu = true;
        this.paused = false;
        this.rebinding = null;
        this.lastTime = 0;
        this.lastUI = 0;
        this.flowTile = -1;
        this.flowDirty = true;
        this.revealTile = -1;
        this.lastReveal = 0;
        this.stepT = 0;
        this.msgAt = {};

        this.init();
    }

    init() {
        this.bindEvents();
        this.updateKeyUI();
        this.updateViewUI();
        this.updateSoundUI();
        this.selectClass(this.classId);
        this.renderMenuRecords();
        this.updateContinueButton();
        let last = null;
        try { last = localStorage.getItem('rogue_last_seed'); } catch (e) {}
        const inp = this.$('seed-input');
        if (inp && last) inp.value = last;
        requestAnimationFrame(t => this.gameLoop(t));
    }

    bindEvents() {
        window.addEventListener('keydown', e => {
            if (this.rebinding) {
                this.controls[this.rebinding] = e.code;
                try { localStorage.setItem('rogue_keys', JSON.stringify(this.controls)); } catch (err) {}
                this.rebinding = null;
                this.updateKeyUI();
                return;
            }
            if (e.target && e.target.tagName === 'INPUT') return;
            if (e.code === 'Escape' || e.code === 'KeyP') {
                if (this.paused) this.closeAllModals(); else this.openPause();
                return;
            }
            if (this.inMenu || this.isGameOver) return;
            if (e.code === 'KeyK') { this.toggleSkills(); return; }
            if (e.code === 'KeyB') { this.toggleBestiary(); return; }
            if (e.code === 'KeyN') { this.audio.toggle(); this.updateSoundUI(); return; }
            if (this.paused) return;

            this.keys[e.code] = true;
            if (e.code === 'KeyE') this.interact();
            if (e.code === 'KeyV' || e.code === 'KeyM') this.setView(this.renderer.cycleView());
            if (e.code === 'Digit1') this.setView('fps');
            if (e.code === 'Digit2') this.setView('tps');
            if (e.code === 'Digit3') this.setView('top');
            if (e.code === 'KeyF') this.castSpell();
            if (e.code === 'KeyG') this.cycleSpell();
            if (e.code === 'KeyT') this.raiseNearest();
            if (e.code === 'KeyQ') this.quickHeal();
            if (e.code === 'KeyR') this.useAbility();
        });
        window.addEventListener('keyup', e => this.keys[e.code] = false);
        window.addEventListener('blur', () => this.keys = {});

        this.canvas.addEventListener('mousemove', e => {
            const r = this.canvas.getBoundingClientRect();
            this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
            this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
        });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        this.canvas.addEventListener('mousedown', e => {
            if (this.touchMode) return;
            this.audio.init();
            if (this.inMenu || this.paused || this.isGameOver) return;
            if (this.renderer.viewMode !== 'top' && document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
                try { this.canvas.requestPointerLock(); } catch (err) {}
            }
            if (e.button === 2) this.castSpell(); else this.attack();
        });

        document.addEventListener('mousemove', e => {
            if (this.inMenu || this.isGameOver || this.paused) return;
            if (this.renderer.viewMode !== 'top' && document.pointerLockElement === this.canvas) {
                this.player.dir += e.movementX * 0.003;
            }
        });
    }

    // ---------- Запуск забега ----------
    startGame(mode = 'random') {
        this.audio.init();
        const input = this.$('seed-input') ? this.$('seed-input').value.trim() : '';
        this.isDaily = mode === 'daily';
        if (this.isDaily) this.runSeed = 'daily-' + this.todayKey();
        else this.runSeed = input || Math.random().toString(36).slice(2, 8);

        this.player = new Player(this.classId);
        this.startArmy();
        this.stats = { kills: 0 };
        this.relations = { trader: 0, smith: 0 };
        this.quest = null;
        this.floor = 1;
        this.isGameOver = false;
        this.paused = false;
        this.$('main-menu').classList.add('hidden');
        this.inMenu = false;
        this.generateLevel();
        this.updateUI();
        this.log(`Забег начат. Сид: <b>${this.runSeed}</b> — поделитесь им, чтобы друг прошёл те же этажи.`);
    }

    setView(mode) {
        this.renderer.setView(mode);
        if (mode === 'top' && document.pointerLockElement) document.exitPointerLock();
        this.log(`Камера: ${VIEW_NAMES[mode]}`);
        this.updateViewUI();
    }

    // ---------- Генерация этажа ----------
    pickEnemyType() {
        const pool = ENEMY_TYPES.filter(t => !t.boss && !t.special && !t.minion && t.minFloor <= this.floor && (!t.maxFloor || t.maxFloor >= this.floor));
        let r = Rand.next() * pool.reduce((s, t) => s + t.weight, 0);
        for (const t of pool) { r -= t.weight; if (r <= 0) return t; }
        return pool[0];
    }

    generateLevel() {
        Rand.seed(hashString(this.runSeed + ':' + this.floor));      // тот же сид → те же этажи
        this.biome = biomeForFloor(this.floor);
        const data = this.mapGen.generateLevel(this.floor);
        this.map = data.map;
        this.rooms = data.rooms;
        this.exit = data.exit;
        this.player.x = data.start.x;
        this.player.y = data.start.y;
        this.renderer.setLevel(this.map, this.biome);

        this.entities = [];
        this.projectiles = [];
        this.explosions = [];
        this.trader = null; this.smith = null;
        this.npcTalks = { trader: 3, smith: 3 };
        this.haggle = {};
        this.populateLevel(data);
        this.placeArmy();

        this.flowTile = -1; this.flowDirty = true; this.revealTile = -1;
        this.revealAround(true);
        this.audio.startAmbient(this.biome);
        this.renderer.showBanner(`Этаж ${this.floor} — ${this.biome.name}`, '#fff');
        this.log(`--- Этаж ${this.floor}: ${this.biome.name} ---`);
        this.autosave();
    }

    descend() {
        const p = this.player;
        this.audio.play('descend');
        this.floor++;
        p.blessing = null;
        p.keys = 0;
        p.lastStandUsed = false;
        this.checkQuestExpiry();
        p.recalc();
        p.heal(Math.round(p.maxHp * BALANCE.player.floorHeal));
        this.submitRecord(false);
        this.generateLevel();
        this.updateUI();
    }

    // ---------- Клетки и двери ----------
    tileAt(x, y) { return this.mapGen.tileAt(this.map, x, y); }

    setTile(x, y, t) {
        const old = this.map[y][x];
        this.map[y][x] = t;
        if (tileEnemyPassable(old) !== tileEnemyPassable(t)) this.flowDirty = true;
        this.renderer.updateTile(this.map, x, y);
    }

    openDoor(x, y, byEnemy = false) {
        this.setTile(x, y, TILE_OPEN);
        this.audio.play('door', byEnemy ? 0.5 : 1);
    }

    tryUnlock(x, y) {
        const p = this.player;
        if (p.keys > 0) {
            p.keys--;
            this.setTile(x, y, TILE_OPEN);
            this.audio.play('unlock');
            this.log('<span style="color:#fd3">Вы открыли запертую дверь ключом 🗝</span>');
            this.updateStats();
        } else if (this.throttle('locked', 1500)) {
            this.audio.play('locked');
            this.log('Дверь заперта. Нужен ключ 🗝');
            this.renderer.showBanner('Дверь заперта — найдите ключ', '#fd3', 1.6);
        }
    }

    throttle(key, ms) {
        if (this.lastTime - (this.msgAt[key] || -1e9) < ms) return false;
        this.msgAt[key] = this.lastTime;
        return true;
    }

    // Для игрока: двери открываются касанием
    canWalk(x, y) {
        const t = this.tileAt(x, y);
        if (tilePassable(t)) return true;
        if (t === TILE_DOOR) this.openDoor(Math.floor(x), Math.floor(y));
        else if (t === TILE_LOCKED) this.tryUnlock(Math.floor(x), Math.floor(y));
        return false;
    }

    // Для врагов (вызывает Enemy): обычные двери они открывают сами
    enemyCanEnter(x, y) {
        const t = this.tileAt(x, y);
        if (t === TILE_FLOOR || t === TILE_OPEN) return true;
        if (t === TILE_DOOR) { this.openDoor(Math.floor(x), Math.floor(y), true); return true; }
        return false;
    }

    updateFlow() {
        const tx = Math.floor(this.player.x), ty = Math.floor(this.player.y), ti = ty * MAP_SIZE + tx;
        if (this.flowDirty || ti !== this.flowTile) {
            this.path.compute(this.map, tx, ty);
            this.flowTile = ti; this.flowDirty = false;
        }
    }

    // Туман войны: открываем клетки в радиусе 6 по линии видимости
    revealAround(force = false) {
        const p = this.player, tx = Math.floor(p.x), ty = Math.floor(p.y), ti = ty * MAP_SIZE + tx;
        if (!force && ti === this.revealTile) return;
        this.revealTile = ti;
        const R = 6;
        for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
                const x = tx + dx, y = ty + dy;
                if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE || dx * dx + dy * dy > R * R) continue;
                if (this.renderer.isExplored(x, y)) continue;
                if (this.mapGen.hasLineOfSight(this.map, p.x, p.y, x + 0.5, y + 0.5, 0.6)) this.renderer.reveal(this.map, x, y);
            }
        }
    }

    // ---------- Главный цикл ----------
    gameLoop(time) {
        requestAnimationFrame(t => this.gameLoop(t));       // планируем следующий кадр первым: ошибка не «заморозит» игру
        // dt в секундах: скорость не зависит от частоты монитора
        const dt = Math.min(0.05, (time - (this.lastTime || time)) / 1000);
        this.lastTime = time;

        if (!this.inMenu && !this.isGameOver && !this.paused) {
            this.handleInput(dt);
            this.player.update(dt);
            this.updatePlayerStatus(dt);
            this.updateFlow();
            this.revealAround(this.lastReveal === -1);
            this.lastReveal = 0;
            this.updateEntities(time, dt);
            this.updateAllies(time, dt);
            this.updateProjectiles(dt);
            this.updateExplosions(dt);
            this.updateTraps();
            this.updateArenas(dt);
            this.updateBandits();
            this.pickupNearby();
            if (time - this.lastUI > 250) { this.updateStats(); this.updateHint(); this.lastUI = time; }
        }

        this.renderer.floorNum = this.floor;
        this.renderer.canRaise = this.canRaise();
        this.renderer.render(this.player, this.map, this.entities, this.projectiles, this.exit, time, { allies: this.allies, fairies: this.fairies });
        if (this.map.length) this.renderer.renderMinimap(this.player, this.entities, this.exit);
    }

    handleInput(dt) {
        const k = this.keys, c = this.controls, p = this.player, tm = this.touchMove;
        let dx = 0, dy = 0;

        if (this.renderer.viewMode === 'top') {
            // Сверху: WASD — по сторонам экрана, взгляд — на курсор
            if (k[c.forward])  dy -= 1;
            if (k[c.backward]) dy += 1;
            if (k[c.left])     dx -= 1;
            if (k[c.right])    dx += 1;
            dx += tm.x; dy += tm.y;
            if (this.touchMode) { if (Math.hypot(dx, dy) > 0.2) p.dir = Math.atan2(dy, dx); }
            else {
                const cam = this.renderer.topCam;
                p.dir = Math.atan2(this.mouse.y - (p.y * cam.tile - cam.y), this.mouse.x - (p.x * cam.tile - cam.x));
            }
        } else {
            const cd = Math.cos(p.dir), sd = Math.sin(p.dir);
            if (k[c.forward])  { dx += cd; dy += sd; }
            if (k[c.backward]) { dx -= cd; dy -= sd; }
            if (k[c.left])     { dx += sd; dy -= cd; }
            if (k[c.right])    { dx -= sd; dy += cd; }
            dx += cd * -tm.y - sd * tm.x;           // джойстик: вверх — вперёд, вправо — шаг вправо
            dy += sd * -tm.y + cd * tm.x;
        }

        const len = Math.hypot(dx, dy);
        p.moving = len > 0.05;
        if (p.moving) {
            if (len > 1) { dx /= len; dy /= len; }                    // по диагонали не быстрее
            const speed = p.moveSpeed * dt;
            p.walkBob += dt * 9;
            this.attemptMove(dx * speed, dy * speed);
            this.stepT -= dt;
            if (this.stepT <= 0) { this.audio.play('step'); this.stepT = 0.4; }
        }

        if (this.dist(p, this.exit) < 0.55) {
            if (this.bossAlive()) {
                if (this.throttle('portal', 2500)) this.renderer.showBanner('Портал закрыт, пока жив босс!', '#f55');
            } else this.descend();
        }
    }

    bossAlive() { return this.entities.some(e => e.type === 'enemy' && e.boss && e.alive); }

    attemptMove(dx, dy) {
        const pad = 0.25, p = this.player;
        if (this.canWalk(p.x + dx + (dx > 0 ? pad : -pad), p.y)) p.x += dx;
        if (this.canWalk(p.x, p.y + dy + (dy > 0 ? pad : -pad))) p.y += dy;
    }

    // ---------- Враги ----------
    updateEntities(time, dt) {
        const enemies = this._enemies;
        enemies.length = 0;
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const ent = this.entities[i];
            if (ent.type !== 'enemy') continue;
            if (!ent.alive) {                          // труп угасает и исчезает
                ent.corpse -= dt;
                if (ent.corpse <= 0) this.entities.splice(i, 1);
                continue;
            }
            enemies.push(ent);
            Status.tick(ent, dt, (d, k) => this.damageEnemy(ent, d, false, STATUS[k].name, false, { silent: true, color: STATUS[k].color }));
            if (!ent.alive) continue;
            if (ent.canSee && !ent.noted) { ent.noted = true; this.noteSeen(ent); }
            const target = this.pickTarget(ent);
            const res = ent.update(time, dt, target, this);
            if (!res) continue;
            if (res.type === 'projectile') { this.projectiles.push(res); this.audio.play('spell', 0.4); }
            else if (res.type === 'melee') {
                if (target === this.player) this.hurtPlayer(res.dmg, ent.name, ent, ent.onHit);
                else this.hurtAlly(target, res.dmg, ent.name);
            }
            else if (res.type === 'summon') this.spawnMinions(ent);
        }
        this.separate(enemies);
    }

    // Враги расталкивают друг друга, чтобы не слипаться в одну точку
    separate(en) {
        const min = 0.55;
        for (let i = 0; i < en.length; i++) {
            const a = en[i];
            for (let j = i + 1; j < en.length; j++) {
                const b = en[j];
                let dx = b.x - a.x, dy = b.y - a.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue;
                let d = Math.sqrt(d2);
                if (d < 1e-4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1; }
                const push = (min - d) / 2, nx = dx / d, ny = dy / d;
                const mv = (e, sx, sy) => {
                    const x = e.x + sx, y = e.y + sy;
                    if (e.ai === 'ghost' || this.mapGen.isWalkable(this.map, x, y)) { e.x = x; e.y = y; }
                };
                mv(a, -nx * push, -ny * push);
                mv(b, nx * push, ny * push);
            }
        }
    }

    spawnMinions(owner) {
        const mine = this.entities.filter(e => e.type === 'enemy' && e.alive && e.owner === owner).length;
        if (mine >= 4) return;
        const type = ENEMY_TYPES.find(t => t.minion);
        for (let i = 0; i < 2; i++) {
            const a = Math.random() * Math.PI * 2;
            const x = owner.x + Math.cos(a) * 0.9, y = owner.y + Math.sin(a) * 0.9;
            if (!this.mapGen.isWalkable(this.map, x, y)) continue;
            const m = new Enemy(type, x, y, this.floor, false, []);
            m.owner = owner; m.alert = 10; m.arenaRoom = owner.arenaRoom;
            this.entities.push(m);
            this.renderer.addEffect('ring', x, y, 0.5, 0.6);
        }
        this.audio.play('summon', 0.7);
        this.log(`${owner.name} призывает слизней!`);
    }

    // ---------- Урон игроку, эффекты состояний, смерть ----------
    hurtPlayer(dmg, source, enemy = null, status = null) {
        const r = this.player.takeDamage(dmg);
        if (r.broke) this.onShieldBroken();
        if (!r.dodged && r.damage === 0 && r.absorbed) {
            this.audio.play('dodge');
            this.log(`<span style="color:#8cf">Щит поглотил урон (${source}): ${r.absorbed}</span>`);
            return;
        }
        if (r.dodged) {
            this.audio.play('dodge');
            this.log(`<span style="color:cyan">Вы уклонились (${source})!</span>`);
            return;
        }
        this.audio.play('hurt');
        this.log(`<span style="color:red">${source}: -${r.damage} HP</span>`);
        this.renderer.addDamageNumber(320, 220, r.damage, false, '#ff5555');
        if (status && Math.random() < (status.chance || 1)) this.inflictPlayer(status.kind, status.dur);
        const thorns = this.player.bonus.thorns || 0;
        if (enemy && thorns > 0 && enemy.alive) this.damageEnemy(enemy, thorns, false, 'Шипы брони');
        this.updateStats();
        this.checkDeath();
    }

    enemyStatusPower(kind) {
        const f = this.floor;
        return kind === 'poison' ? 1.5 + f * 0.4 : kind === 'burn' ? 2 + f * 0.5 : kind === 'bleed' ? 1.5 + f * 0.4 : 0;
    }

    // Сила эффектов, наложенных игроком
    statusPower(kind) {
        const p = this.player, f = this.floor;
        if (kind === 'poison') return 2 + f * 0.6 + p.tInt * 0.15;
        if (kind === 'burn') return 3 + f * 0.8 + p.tInt * 0.2;
        if (kind === 'bleed') return 2 + f * 0.4 + p.tStr * 0.2;
        return 0;
    }

    inflictPlayer(kind, dur) {
        const p = this.player, res = Math.min(0.85, p.bonus.statusResist || 0);
        if (Math.random() < res * 0.5) return;                      // иногда эффект не проходит вовсе
        Status.add(p, kind, dur * (1 - res * 0.5), this.enemyStatusPower(kind) * (1 - res));
        this.log(`<span style="color:${STATUS[kind].color}">${STATUS[kind].icon} ${STATUS[kind].name}!</span>`);
    }

    updatePlayerStatus(dt) {
        const p = this.player;
        if (p.shield > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shield = 0; } }
        Status.tick(p, dt, (d, k) => this.dotPlayer(d, k));
        if (p.bonus.cleanse) {                                       // Очищение Марии
            p.cleanseTimer -= dt;
            if (p.cleanseTimer <= 0) {
                p.cleanseTimer = 12;
                if (p.status && Object.keys(p.status).length) { Status.clear(p); this.log('<span style="color:#ffe08a">Мария очистила вас от дурных эффектов</span>'); }
            }
        }
    }

    dotPlayer(d, kind) {
        const p = this.player;
        p.hp -= d;
        this.renderer.addDamageNumber(320, 230, d, false, STATUS[kind].color);
        this.checkDeath();
    }

    // Смерть: «Несокрушимый» Азаула и «Возрождение» Марии могут спасти
    checkDeath() {
        const p = this.player;
        if (p.hp > 0 || this.isGameOver) return;
        if (p.bonus.lastStand && !p.lastStandUsed) {
            p.lastStandUsed = true; p.hp = 1; p.invuln = 2.5;
            this.audio.play('levelup');
            this.renderer.showBanner('Несокрушимый! Вы устояли', '#e5533d');
            this.log('<span style="color:#e5533d">Азаул не даёт вам пасть: вы остались с 1 HP</span>');
            return;
        }
        if (p.bonus.rebirth && !p.rebirthUsed) {
            p.rebirthUsed = true; p.hp = Math.round(p.maxHp * 0.5); p.invuln = 2.5; Status.clear(p);
            this.audio.play('levelup');
            this.renderer.showBanner('Возрождение!', '#ffe08a');
            this.log('<span style="color:#ffe08a">Мария возрождает вас с половиной здоровья</span>');
            return;
        }
        this.gameOver();
    }

    // opts: { silent, color, player: удар игрока (даёт казнь/святость) }
    damageEnemy(target, dmg, isCrit, label, lifesteal = false, opts = null) {
        if (!target.alive) return;
        const b = this.player.bonus;
        if (opts && opts.player && b.holy && target.evil) dmg = Math.round(dmg * (1 + b.holy));
        const res = target.takeDamage(dmg);
        const silent = opts && opts.silent;
        this.renderer.addDamageNumber(320, 200, res.damage, isCrit, opts && opts.color);
        if (!silent) {
            this.log(`${label} по ${target.name}: ${res.damage}${isCrit ? ' КРИТ!' : ''}`);
            this.audio.play(isCrit ? 'crit' : 'hit');
        }
        if (lifesteal && b.lifesteal) this.player.heal(res.damage * b.lifesteal);
        // Казнь Кэрлаза: добиваем почти мёртвых
        if (!res.died && opts && opts.player && b.execute) {
            const thr = Math.min(0.3, b.execute) * (target.boss ? 0.5 : 1);
            if (target.hp <= target.maxHp * thr) { target.takeDamage(target.hp); this.log('<span style="color:#c27be0">Казнь!</span>'); res.died = true; }
        }
        if (res.died) this.onEnemyKilled(target);
        this.updateStats();
    }

    onEnemyKilled(e) {
        const p = this.player, b = p.bonus;
        this.stats.kills++;
        const g = p.gainGold(e.gold);
        this.audio.play('kill');
        this.log(`<span style="color:gold">Победа над ${e.name}! +${e.xp} XP, +${g} 💰</span>`);
        const lv = p.gainXp(e.xp);
        if (lv > 0) {
            this.audio.play('levelup');
            this.renderer.showBanner(`УРОВЕНЬ ${p.level}!`, '#7f7');
            this.log(`<span style="color:#7f7">УРОВЕНЬ ${p.level}! +${BALANCE.player.pointsPerLevel * lv} очков характеристик, +${lv} очко навыков (K)</span>`);
        }
        // Дары богов за убийство
        if (b.killHeal) p.heal(b.killHeal + p.maxHp * 0.01);
        if (b.killMana) p.restoreMana(b.killMana);
        if (b.killRage) p.rageTimer = 4;
        // Бестиарий и задания
        this.noteKill(e);
        this.questKill(e);
        this.shareXp(e);
        if (this.canRaise() && !e.minion) { e.raisable = true; e.corpse = 14; }       // тело лежит и ждёт воскрешения
        // Камни улучшения
        const stoneChance = e.boss ? 1 : e.elite ? 0.6 : e.minion ? 0 : 0.12;
        if (Math.random() < stoneChance) {
            const n = e.boss ? 3 : 1;
            this.entities.push(ItemGenerator.place(ItemGenerator.generateStone(n), e.x, e.y));
        }
        if (e.traits.includes('explosive')) {
            this.explosions.push({ x: e.x, y: e.y, t: 0.6, dmg: Math.round(e.dmg * 1.6), r: 1.8, src: e.name });
            this.renderer.addEffect('ring', e.x, e.y, 0.6, 0.7);
            this.log('<span style="color:#f93">Монстр вот-вот взорвётся — отбегите!</span>');
        }
        if (e.loot) this.entities.push(ItemGenerator.place(e.loot, e.x, e.y));
        else if (!e.minion && Math.random() < BALANCE.enemy.dropPotion) this.entities.push(ItemGenerator.place(ItemGenerator.generatePotion(this.floor), e.x, e.y));
        if (e.boss) {
            this.log('<span style="color:#7f7">Босс повержен! Портал открыт.</span>');
            this.offerBlessings('boss');
        }
        this.updateUI();
    }

    // ---------- Взрывы и область ----------
    updateExplosions(dt) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.t -= dt;
            if (ex.t > 0) continue;
            this.explosions.splice(i, 1);
            this.audio.play('boom');
            this.renderer.addEffect('boom', ex.x, ex.y, 0.5, ex.r * 0.6);
            const d = Math.hypot(this.player.x - ex.x, this.player.y - ex.y);
            if (d < ex.r) this.hurtPlayer(Math.round(ex.dmg * (1 - 0.5 * d / ex.r)), ex.src + ' (взрыв)');
            for (const e of this.entities.slice()) {
                if (e.type === 'enemy' && e.alive && Math.hypot(e.x - ex.x, e.y - ex.y) < ex.r) this.damageEnemy(e, Math.round(ex.dmg * 0.5), false, 'Взрыв');
            }
        }
    }

    areaDamage(x, y, r, dmg, label, exclude = null) {
        for (const e of this.entities.slice()) {
            if (e.type === 'enemy' && e.alive && e !== exclude && Math.hypot(e.x - x, e.y - y) < r) this.damageEnemy(e, dmg, false, label);
        }
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            const wall = !this.mapGen.isWalkable(this.map, p.x, p.y);
            if (p.life <= 0 || wall) {
                if (p.owner === 'player' && p.aoe && wall) this.explodeSpell(p, null);
                this.projectiles.splice(i, 1);
                continue;
            }
            if (p.owner === 'player' || p.owner === 'ally' || p.owner === 'fairy') {
                const hit = this.entities.find(e => e.type === 'enemy' && e.alive && (p.owner === 'player' || !e.passive) && this.dist(e, p) < 0.55);
                if (hit) {
                    if (p.owner === 'player') {
                        if (hit.passive) { hit.passive = false; hit.alert = 12; }
                        this.spellHit(p, hit);
                    } else {                                  // выстрел союзника или феи
                        this.damageEnemy(hit, p.dmg, false, p.label || 'Союзник', false, { silent: true, color: '#9f9' });
                        if (hit.alive && p.status) Status.add(hit, p.status, 3, this.statusPower(p.status));
                    }
                    this.projectiles.splice(i, 1);
                }
            } else if (this.dist(this.player, p) < 0.4) {
                this.projectiles.splice(i, 1);
                this.hurtPlayer(p.dmg, 'Заклинание', null, p.status);
            } else {
                const ally = this.allies.find(a => this.dist(a, p) < 0.45);
                if (ally) { this.projectiles.splice(i, 1); this.hurtAlly(ally, p.dmg, 'Заклинание'); }
            }
        }
    }

    explodeSpell(p, exclude) {
        this.audio.play('boom', 0.7);
        this.renderer.addEffect('boom', p.x, p.y, 0.45, p.aoe * 0.55);
        this.areaDamage(p.x, p.y, p.aoe, Math.round(p.dmg * 0.6), 'Метеор', exclude);
    }

    // ---------- Подбор ----------
    pickupNearby() {
        const p = this.player;
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const ent = this.entities[i];
            if (ent.type !== 'item' || this.dist(p, ent) > 0.7) continue;
            if (ent.itemType === 'gold') {
                const g = p.gainGold(ent.gold);
                this.audio.play('coin');
                this.log(`<span style="color:gold">Подобрано: ${g} золота</span>`);
            } else if (ent.itemType === 'stone') {
                p.stones += ent.amount || 1;
                this.audio.play('pickup');
                this.log(`<span style="color:#7cf">Найдено: ${ent.amount || 1} 💎 камней улучшения</span>`);
            } else if (ent.itemType === 'key') {
                p.keys++;
                this.audio.play('unlock');
                this.renderer.showBanner('Получен ключ 🗝', '#fd3', 1.8);
                this.log('<span style="color:#fd3">Найден ключ! Теперь можно открыть запертую дверь.</span>');
            } else {
                if (p.inventory.length >= BALANCE.player.maxInventory) {
                    if (!ent.warned) { ent.warned = true; this.log('Инвентарь полон!'); }
                    continue;
                }
                p.inventory.push(ItemGenerator.pickable(ent));
                this.audio.play('pickup');
                this.log(`Подобрано: <span style="color:${ent.color || '#fff'}">${ent.name}</span>`);
            }
            this.entities.splice(i, 1);
            this.updateUI();
        }
    }

    // ---------- Бой ----------
    nearestEnemy(range) {
        let best = null, bd = range;
        for (const e of this.entities) {
            if (e.type !== 'enemy' || !e.alive) continue;
            const d = this.dist(this.player, e);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    attack() {
        const p = this.player, P = BALANCE.player;
        if (this.inMenu || this.paused || this.isGameOver || !p.canAttack()) return;
        if (this.touchMode && this.renderer.viewMode === 'top') {      // на сенсоре сверху — автоприцел
            const n = this.nearestEnemy(3.5);
            if (n) p.dir = Math.atan2(n.y - p.y, n.x - p.x);
        }
        p.startAttack();
        this.audio.play('swing');

        let target = null, best = Infinity;
        for (const e of this.entities) {
            if (e.type !== 'enemy' || !e.alive) continue;
            const d = this.dist(p, e);
            if (d > P.reach) continue;
            let da = Math.atan2(e.y - p.y, e.x - p.x) - p.dir;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (d > 0.6 && Math.abs(da) > P.arc) continue;
            if (d < best) { best = d; target = e; }
        }
        if (!target) return;
        if (target.passive) { target.passive = false; target.alert = 12; }   // напали на «дремлющего»
        const info = p.attackDamage();
        this.damageEnemy(target, info.damage, info.isCrit, 'Удар', true, { player: true });
        if (target.alive) this.meleeEffects(target);
    }

    // Эффекты оружия и даров при ударе: яд, огонь, мороз, кровотечение, слабость
    meleeEffects(target) {
        const b = this.player.bonus;
        const roll = (key, kind, dur) => {
            if (b[key] && Math.random() < b[key]) Status.add(target, kind, dur, this.statusPower(kind));
        };
        roll('burnC', 'burn', 3); roll('poisonC', 'poison', 5); roll('freezeC', 'freeze', 2.5); roll('bleedC', 'bleed', 5);
        if (b.weakChance && Math.random() < Math.min(1, b.weakChance)) Status.add(target, 'weak', 6);
    }

    cycleSpell() {
        if (this.inMenu || this.paused || this.isGameOver) return;
        const id = this.player.cycleSpell();
        const sp = SPELLS[id];
        this.audio.play('ui');
        this.renderer.showBanner(`Заклинание: ${sp.name}`, '#9cf', 1.4);
        this.updateStats();
    }

    castSpell(free = false) {
        const p = this.player, P = BALANCE.player;
        if (this.inMenu || this.isGameOver || (this.paused && !free)) return;
        const id = free ? 'fireball' : p.currentSpell, sp = SPELLS[id];
        if (!free) {
            if (p.spellCooldown > 0) return;
            if (id === 'death' && p.deathCd > 0) { if (this.throttle('deathcd', 800)) this.log(`Слово смерти перезаряжается: ${Math.ceil(p.deathCd)} с`); return; }
            const cost = p.spellCostFor(id);
            if (p.mana < cost) { if (this.throttle('mana', 800)) this.log('Недостаточно маны'); return; }
            p.mana -= cost;
            p.spellCooldown = P.spellCooldown;
            if (id === 'death') p.deathCd = sp.cooldown;
        }
        if (this.touchMode && this.renderer.viewMode === 'top') {
            const n = this.nearestEnemy(8);
            if (n) p.dir = Math.atan2(n.y - p.y, n.x - p.x);
        }
        const a = p.dir;
        this.projectiles.push({
            owner: 'player', spell: id, icon: sp.icon,
            x: p.x + Math.cos(a) * 0.4, y: p.y + Math.sin(a) * 0.4,
            vx: Math.cos(a) * P.spellSpeed, vy: Math.sin(a) * P.spellSpeed,
            dmg: Math.round(p.spellDamage() * sp.dmgMul), life: 2.5, aoe: (id === 'fireball' && p.bonus.meteor) ? 1.6 : 0
        });
        this.audio.play(id === 'death' ? 'curse' : 'spell');
        this.updateStats();
    }

    // Попадание заклинания игрока
    spellHit(proj, target) {
        const sp = SPELLS[proj.spell || 'fireball'];
        if (proj.spell === 'death') {
            if (target.boss) this.damageEnemy(target, Math.round(target.maxHp * 0.10), false, sp.name, false, { player: true });
            else if (target.elite) this.damageEnemy(target, Math.round(target.maxHp * 0.40), false, sp.name, false, { player: true });
            else { this.log(`<span style="color:#c27be0">Слово смерти поражает: ${target.name}</span>`); this.damageEnemy(target, target.hp, false, sp.name, false, { player: true }); }
            this.renderer.addEffect('ring', target.x, target.y, 0.5, 0.8);
            return;
        }
        this.damageEnemy(target, proj.dmg, false, sp.name, false, { player: true });
        if (target.alive && sp.status) Status.add(target, sp.status, sp.dur, this.statusPower(sp.status));
        if (proj.aoe) this.explodeSpell(proj, target);
    }

    // Умение класса (R)
    useAbility() {
        const p = this.player;
        if (this.inMenu || this.isGameOver || this.paused || p.abilityCooldown > 0) return;
        const ab = ABILITIES[p.ability];
        if (p.ability === 'whirl') {
            this.audio.play('swing');
            this.renderer.addEffect('ring', p.x, p.y, 0.4, 1.8);
            for (const e of this.entities.slice()) {
                if (e.type === 'enemy' && e.alive && this.dist(p, e) < 2.1) {
                    const info = p.attackDamage(1.25);
                    this.damageEnemy(e, info.damage, info.isCrit, 'Вихрь', true, { player: true });
                }
            }
        } else if (p.ability === 'dash') {
            this.audio.play('dash');
            let moved = 0;
            while (moved < 2.8) {
                const nx = p.x + Math.cos(p.dir) * 0.2, ny = p.y + Math.sin(p.dir) * 0.2;
                if (!this.mapGen.isWalkable(this.map, nx + Math.cos(p.dir) * 0.25, ny + Math.sin(p.dir) * 0.25)) break;
                p.x = nx; p.y = ny; moved += 0.2;
            }
            p.invuln = 0.5;
            this.renderer.addEffect('ring', p.x, p.y, 0.35, 1.0);
        } else if (p.ability === 'command') {
            this.audio.play('summon');
            this.commandArmy();
            this.renderer.showBanner('Зов мёртвых!', '#7fe0a0', 1.4);
        } else if (p.ability === 'nova') {
            this.audio.play('nova');
            this.renderer.addEffect('ring_ice', p.x, p.y, 0.5, 2.2);
            const dmg = Math.round(p.spellDamage() * 0.8);
            for (const e of this.entities.slice()) {
                if (e.type === 'enemy' && e.alive && this.dist(p, e) < 3.3) {
                    Status.add(e, 'freeze', 3);
                    this.damageEnemy(e, dmg, false, 'Ледяная вспышка', false, { player: true });
                }
            }
        }
        p.abilityCooldown = ab.cd;
        this.log(`Умение: ${ab.name}`);
        this.updateStats();
    }

    // ---------- Взаимодействие (E) ----------
    findInteractable() {
        const p = this.player;
        let best = null, bd = 1.6;
        for (const e of this.entities) {
            const ok = e.type === 'trader' || e.type === 'smith' || (e.type === 'chest' && !e.opened) || ((e.type === 'altar' || e.type === 'shrine') && !e.used);
            if (!ok) continue;
            const d = this.dist(p, e);
            if (d < bd) { bd = d; best = { kind: e.type, ent: e }; }
        }
        const tx0 = Math.floor(p.x), ty0 = Math.floor(p.y);
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const row = this.map[ty0 + dy];
                if (!row || row[tx0 + dx] !== TILE_SECRET) continue;
                const d = Math.hypot(tx0 + dx + 0.5 - p.x, ty0 + dy + 0.5 - p.y);
                if (d < Math.min(bd + 0.2, 1.9)) { bd = d; best = { kind: 'secret', tx: tx0 + dx, ty: ty0 + dy }; }
            }
        }
        return best;
    }

    interact() {
        if (this.paused) return;
        const t = this.findInteractable();
        if (!t) return;
        if (t.kind === 'trader') this.openTraderModal();
        else if (t.kind === 'smith') this.openSmithModal();
        else if (t.kind === 'chest') this.openChest(t.ent);
        else if (t.kind === 'altar') this.useAltar(t.ent);
        else if (t.kind === 'shrine') this.useShrine(t.ent);
        else if (t.kind === 'secret') this.searchSecret(t.tx, t.ty);
        this.updateUI();
    }

    updateHint() {
        const t = this.findInteractable();
        const names = { trader: 'Торговля', smith: 'Кузнец', chest: 'Открыть сундук', altar: 'Алтарь', shrine: 'Святилище', secret: 'Обыскать трещину в стене' };
        this.renderer.hint = t ? `E — ${names[t.kind]}` : this.raiseHint();
    }

    // ---------- Предметы ----------
    useItem(index) {
        const p = this.player, item = p.inventory[index];
        if (!item) return;
        if (['weapon', 'armor', 'accessory'].includes(item.itemType)) { this.equipItem(index); return; }

        if (item.itemType === 'potion') {
            const heal = Math.round(item.heal * Math.max(0, 1 + (p.bonus.healPct || 0)));
            p.heal(heal);
            p.inventory.splice(index, 1);
            this.audio.play('drink');
            this.log(`Выпито зелье (+${heal} HP)`);
        } else if (item.itemType === 'mana_potion') {
            p.restoreMana(item.mana);
            p.inventory.splice(index, 1);
            this.audio.play('drink');
            this.log(`Восстановлено ${item.mana} маны`);
        } else if (item.itemType === 'scroll') {
            if (item.effect === 'cleanse') {
                let cleansed = 0;
                for (const slot in p.equipment) {
                    const it = p.equipment[slot];
                    if (it && it.curse) {
                        it.curse = null;
                        it.name = it.name.replace(' ☠', '');
                        const rar = BALANCE.loot.rarity.find(r => r.id === it.rarity);
                        it.color = rar ? rar.color : '#ddd';
                        cleansed++;
                    }
                }
                if (!cleansed) { this.log('Нечего очищать — на вас нет проклятых вещей'); return; }
                p.recalc();
                p.inventory.splice(index, 1);
                this.audio.play('levelup');
                this.log('<span style="color:#7cf">Проклятие снято с вашей экипировки!</span>');
            } else {
                p.inventory.splice(index, 1);
                this.castSpell(true);
                this.log(`Использован свиток: ${item.name}`);
            }
        }
        this.updateUI();
    }

    equipItem(index) {
        const p = this.player, item = p.inventory[index], slot = item.itemType;
        const old = p.equipment[slot];
        if (old && old.curse) {
            this.audio.play('curse');
            this.log(`<span style="color:#d6407a">Проклятие не даёт снять «${old.name}»! Нужен Свиток Очищения.</span>`);
            return;
        }
        p.inventory.splice(index, 1);
        if (old && !old.fist) p.inventory.push(old);
        p.equipment[slot] = item;
        p.recalc();
        this.audio.play('pickup');
        this.log(`Экипировано: <span style="color:${item.color || '#fff'}">${item.name}</span>`);
        if (item.curse) {
            this.audio.play('curse');
            this.log('<span style="color:#d6407a">☠ Предмет проклят! Снять его можно только очищением.</span>');
        }
        this.updateUI();
    }

    dropItem(index) {
        const p = this.player, item = p.inventory[index];
        if (!item) return;
        p.inventory.splice(index, 1);
        const it = ItemGenerator.place(item, p.x + Math.cos(p.dir) * 0.9, p.y + Math.sin(p.dir) * 0.9);
        it.warned = true;
        if (!this.mapGen.isWalkable(this.map, it.x, it.y)) { it.x = p.x; it.y = p.y; }
        this.entities.push(it);
        this.updateInventory();
    }

    quickHeal() {
        const i = this.player.inventory.findIndex(it => it.itemType === 'potion');
        if (i >= 0) this.useItem(i); else this.log('Нет зелий лечения');
    }

    upgrade(stat) {
        if (this.player.upgrade(stat)) {
            this.audio.play('ui');
            this.updateUI();
            this.log(`Характеристика ${stat.toUpperCase()} увеличена!`);
        }
    }

    gameOver() {
        this.isGameOver = true;
        this.clearAutosave();
        this.audio.play('death');
        this.audio.stopAmbient();
        if (document.pointerLockElement) document.exitPointerLock();
        this.log(`<span style='color:red;font-weight:bold'>ВЫ ПОГИБЛИ на этаже ${this.floor}.</span>`);
        this.showGameOver();
    }

    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

Object.assign(Roguelike.prototype, UIMethods, RoomEventMethods, GodMethods, NpcMethods, UI2Methods, SaveMethods, BestiaryMethods, AllyMethods);
const game = new Roguelike();
