// modules/ui.js — интерфейс: лог, панели, инвентарь, окна (торговец, события, навыки), рекорды, меню.
// Подмешивается в класс Roguelike (см. конец game.js).

const UIMethods = {

    $(id) { return document.getElementById(id); },
    setText(id, v) { const el = document.getElementById(id); if (el) el.innerText = v; },

    log(msg) {
        const logEl = this.$('log');
        if (!logEl) return;
        const entry = document.createElement('div');
        entry.innerHTML = `> ${msg}`;
        logEl.insertBefore(entry, logEl.firstChild);
        while (logEl.children.length > 25) logEl.removeChild(logEl.lastChild);
    },

    // ---------- Панели ----------
    updateStats() {
        const p = this.player, b = p.bonus;
        const st = (base, bonus) => bonus ? `${base + bonus} (${base}${bonus > 0 ? '+' : '−'}${Math.abs(bonus)})` : `${base}`;
        this.setText('floor', this.floor);
        this.setText('biome-name', this.biome ? this.biome.name : '');
        this.setText('class-name', `${CLASSES[p.classId].icon} ${p.className}`);
        this.setText('level', p.level);
        this.setText('hp', Math.max(0, Math.ceil(p.hp)));
        this.setText('max-hp', p.maxHp);
        this.setText('mana', Math.floor(p.mana));
        this.setText('max-mana', p.maxMana);
        this.setText('xp', `${p.xp} / ${BALANCE.xpToNext(p.level)}`);
        this.setText('points', p.points);
        this.setText('skill-points', p.skillPoints);
        this.setText('gold', p.gold);
        this.setText('keys', p.keys);
        this.setText('stones', p.stones);
        const sp = SPELLS[p.currentSpell];
        this.setText('spell-label', `Заклинание: ${sp.name} (G) — ${p.spellCostFor(p.currentSpell)} маны`);
        this.setText('status-label', Status.text(p));
        const q = this.quest;
        this.setText('quest-label', q ? `📜 ${q.text}: ${q.type === 'kill' ? q.progress + '/' + q.count : Math.min(p.stones, q.count) + '/' + q.count} (до эт. ${q.deadline})` : '');
        this.setText('shield-label', p.shield > 0 ? `🛡 Щит феи: ${Math.ceil(p.shield)}` : '');
        this.renderGifts();
        this.renderArmy();
        this.setText('str', st(p.str, b.str || 0));
        this.setText('dex', st(p.dex, b.dex || 0));
        this.setText('int', st(p.int, b.int || 0));
        this.setText('armor', `${p.armorValue} (−${Math.round(p.armorValue / (p.armorValue + BALANCE.loot.armorK) * 100)}% урона)`);
        this.setText('seed-label', this.runSeed ? `Сид: ${this.runSeed}${this.isDaily ? ' (ежедневный)' : ''}` : '');
        const ab = ABILITIES[p.ability];
        this.setText('ability-label', `${ab.name} (R): ${p.abilityCooldown > 0 ? Math.ceil(p.abilityCooldown) + ' с' : 'готово'}`);
        const bl = { rage: 'Ярость +25% урона', haste: 'Спешка', regen: 'Регенерация' };
        this.setText('blessing-label', p.blessing ? `Благословение: ${bl[p.blessing]}` : '');

        const eq = (id, label, it) => {
            const el = this.$(id);
            if (!el) return;
            el.innerText = it ? `${label}: ${it.name}${it.itemType === 'weapon' ? ` (урон ${it.dmg})` : it.itemType === 'armor' ? ` (броня ${it.armor})` : ''}` : `${label}: —`;
            el.style.color = it && it.color ? it.color : '#ddd';
            el.title = it ? describeItem(it) : '';
        };
        eq('equip-weapon', 'Оружие', p.equipment.weapon);
        eq('equip-armor', 'Броня', p.equipment.armor);
        eq('equip-accessory', 'Аксессуар', p.equipment.accessory);
    },

    // Список благословений богов (перестраиваем, только если изменился)
    renderGifts() {
        const list = this.$('gifts-list');
        if (!list) return;
        const key = this.player.gifts.map(g => g.id + g.q).join(',');
        if (this._giftKey === key) return;
        this._giftKey = key;
        list.innerHTML = '';
        if (!this.player.gifts.length) { list.innerHTML = '<li class="inv-empty">Пока нет — ищите святилища, арены и побеждайте боссов</li>'; return; }
        const grouped = {};
        for (const g of this.player.gifts) (grouped[g.id] = grouped[g.id] || []).push(g);
        for (const id in grouped) {
            const b = BLESSING_BY_ID[id], god = GODS[b.god], arr = grouped[id];
            const li = document.createElement('li');
            li.className = 'gift';
            li.style.borderLeft = `4px solid ${god.color}`;
            li.title = arr.map(g => b.text(g.q)).join('\n');
            li.innerHTML = `<span style="color:${god.color}">${god.icon} ${b.name}${arr.length > 1 ? ' ×' + arr.length : ''}</span><small>${b.text(arr[0].q)}</small>`;
            list.appendChild(li);
        }
    },

    updateInventory() {
        const list = this.$('inventory-list');
        if (!list) return;
        list.innerHTML = '';
        this.player.inventory.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'inv-item';
            const full = describeItem(item);
            li.title = full;
            const label = ['weapon', 'armor', 'accessory'].includes(item.itemType) ? 'Надеть'
                        : (item.itemType === 'potion' || item.itemType === 'mana_potion') ? 'Пить'
                        : item.itemType === 'scroll' ? 'Читать' : '';
            const brief = full.split('\n').slice(1, 3).join(' • ');
            li.innerHTML = `<div class="inv-main"><span style="color:${item.color || '#eee'}">${item.name}</span><small>${brief}</small></div>
                            <div class="inv-btns">${label ? `<button onclick="game.useItem(${index})">${label}</button>` : ''}<button class="x" title="Выбросить" onclick="game.dropItem(${index})">✕</button></div>`;
            list.appendChild(li);
        });
        if (!this.player.inventory.length) list.innerHTML = '<li class="inv-empty">Пусто</li>';
    },

    updateUI() { this.updateStats(); this.updateInventory(); },

    updateViewUI() { this.setText('view-label', `Камера: ${VIEW_NAMES[this.renderer.viewMode]}`); },
    updateSoundUI() { this.setText('sound-btn', this.audio.enabled ? '🔊 Звук (N)' : '🔇 Звук (N)'); },

    // ---------- Меню ----------
    updateKeyUI() {
        for (const key in this.controls) {
            const btn = this.$(`bind-${key}`);
            if (btn) btn.innerText = this.controls[key].replace('Key', '');
        }
    },
    showSettings() { this.$('settings-menu').classList.remove('hidden'); },
    hideSettings() { this.$('settings-menu').classList.add('hidden'); },
    rebindKey(action) { this.rebinding = action; this.$(`bind-${action}`).innerText = '...Нажмите клавишу...'; },

    selectClass(id) {
        this.classId = id;
        document.querySelectorAll('.class-btn').forEach(b => b.classList.toggle('selected', b.dataset.cls === id));
        const c = CLASSES[id];
        this.setText('class-desc', `${c.desc}  [СИЛ ${c.str} · ЛОВ ${c.dex} · ИНТ ${c.int} · HP ${c.hp} · мана ${c.mana}]`);
    },

    renderMenuRecords() {
        const r = this.records, parts = [];
        if (r.best) parts.push(`🏆 Рекорд: ${r.best.score} очков (этаж ${r.best.floor}, ${r.best.cls}, сид «${r.best.seed}»)`);
        const d = r.daily && r.daily[this.todayKey()];
        parts.push(d ? `📅 Сегодняшний забег: ${d.score} очков (этаж ${d.floor})` : '📅 Ежедневный забег сегодня ещё не пройден');
        this.setText('record-line', parts.join('\n'));
    },

    // ---------- Рекорды ----------
    todayKey() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    loadRecords() { try { return JSON.parse(localStorage.getItem('rogue_records')) || {}; } catch (e) { return {}; } },
    saveRecords() { try { localStorage.setItem('rogue_records', JSON.stringify(this.records)); } catch (e) {} },
    computeScore() {
        const p = this.player;
        return this.floor * 120 + this.stats.kills * 6 + p.level * 25 + Math.floor(p.gold / 5);
    },
    submitRecord(final) {
        const score = this.computeScore(), r = this.records;
        let newBest = false;
        if (!r.best || score > r.best.score) { r.best = { score, floor: this.floor, seed: this.runSeed, cls: this.player.className }; newBest = true; }
        if (this.isDaily) {
            r.daily = r.daily || {};
            const k = this.todayKey();
            if (!r.daily[k] || score > r.daily[k].score) r.daily[k] = { score, floor: this.floor };
        }
        if (final) r.runs = (r.runs || 0) + 1;
        this.saveRecords();
        return { score, newBest };
    },

    showGameOver() {
        const res = this.submitRecord(true), p = this.player;
        this.setText('gameover-text',
            `Этаж: ${this.floor}   Уровень: ${p.level}   Убито: ${this.stats.kills}\n` +
            `Очки: ${res.score}${res.newBest ? '  🏆 НОВЫЙ РЕКОРД!' : ''}\n` +
            `Класс: ${p.className}   Сид: ${this.runSeed}${this.isDaily ? ' (ежедневный)' : ''}`);
        this.$('gameover-screen').classList.remove('hidden');
    },
    restartSameSeed() { try { localStorage.setItem('rogue_last_seed', this.runSeed); } catch (e) {} location.reload(); },
    restartNew() { try { localStorage.removeItem('rogue_last_seed'); } catch (e) {} location.reload(); },

    // ---------- Окна ----------
    pauseForModal() {
        this.paused = true;
        this.keys = {};
        this.touchMove = { x: 0, y: 0 };
        if (document.pointerLockElement) document.exitPointerLock();
    },
    closeAllModals() {
        for (const id of ['trader-modal', 'event-modal', 'skills-modal', 'pause-menu', 'bestiary-modal']) this.$(id).classList.add('hidden');
        document.body.classList.remove('drawer-open', 'drawer-left-open');
        this.paused = false;
    },
    isModalOpen() { return this.paused; },

    leaveDrawer() {
        const cl = document.body.classList;
        if (cl.contains('drawer-open') || cl.contains('drawer-left-open')) this.closeAllModals();
    },

    openPause() {
        this.leaveDrawer();
        if (this.paused || this.inMenu || this.isGameOver) return;
        this.pauseForModal();
        this.$('pause-menu').classList.remove('hidden');
    },

    showEventModal(title, text, options, extra = '', opts = {}) {
        this.pauseForModal();
        this.setText('event-title', title);
        this.setText('event-text', text);
        this.setText('event-extra', extra);
        const box = this.$('event-options');
        box.innerHTML = '';
        for (const o of options) {
            const b = document.createElement('button');
            b.className = 'menu-btn wide';
            b.textContent = o.label;
            b.disabled = !!o.disabled;
            if (o.color) { b.style.borderLeft = `8px solid ${o.color}`; b.style.textAlign = 'left'; }
            b.onclick = o.fn;
            box.appendChild(b);
        }
        if (!opts.noLeave) {
            const leave = document.createElement('button');
            leave.className = 'menu-btn wide secondary';
            leave.textContent = 'Уйти';
            leave.onclick = () => this.closeEventModal();
            box.appendChild(leave);
        }
        this.$('event-modal').classList.remove('hidden');
    },
    closeEventModal() { this.$('event-modal').classList.add('hidden'); this.paused = false; },

    // ---------- Дерево навыков ----------
    toggleSkills() {
        this.leaveDrawer();
        if (!this.$('skills-modal').classList.contains('hidden')) { this.closeAllModals(); return; }
        if (this.paused || this.inMenu || this.isGameOver) return;
        this.pauseForModal();
        this.renderSkills();
        this.$('skills-modal').classList.remove('hidden');
    },
    renderSkills() {
        const p = this.player, wrap = this.$('skills-tree');
        this.setText('skills-points', p.skillPoints);
        wrap.innerHTML = '';
        for (const bid in BRANCHES) {
            const col = document.createElement('div');
            col.className = 'skill-branch';
            col.innerHTML = `<h3>${BRANCHES[bid]}</h3>`;
            for (const sk of SKILLS.filter(s => s.branch === bid)) {
                const rank = p.skills[sk.id] || 0;
                const unlocked = !sk.req || (p.skills[sk.req] || 0) > 0;
                const node = document.createElement('div');
                node.className = 'skill-node' + (rank ? ' learned' : '') + (unlocked ? '' : ' locked');
                node.innerHTML = `<div class="skill-name">${sk.name} <span class="skill-rank">${rank}/${sk.max}</span></div>
                                  <div class="skill-desc">${sk.desc}${sk.req && !unlocked ? `<br><i>Требуется: ${SKILL_BY_ID[sk.req].name}</i>` : ''}</div>`;
                const btn = document.createElement('button');
                btn.textContent = rank >= sk.max ? 'Макс.' : 'Изучить';
                btn.disabled = !p.canLearn(sk.id);
                btn.onclick = () => this.learnSkill(sk.id);
                node.appendChild(btn);
                col.appendChild(node);
            }
            wrap.appendChild(col);
        }
    },
    learnSkill(id) {
        if (this.player.learn(id)) {
            this.audio.play('levelup');
            this.renderSkills();
            this.updateUI();
        }
    }
};
