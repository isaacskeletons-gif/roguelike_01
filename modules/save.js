// modules/save.js — сохранение забега: автосохранение на устройстве и файл «сохранение.json».
// Сохраняются: этаж, сид, класс, характеристики, уровень, навыки, благословения, золото, камни,
// надетые вещи и инвентарь, отношения с NPC и задание. Этаж при загрузке создаётся заново по сиду
// (враги и сундуки этажа могут быть другими — главное, что прогресс героя сохранён).

const SAVE_VERSION = 1;
const SAVE_KEY = 'rogue_autosave';

const SaveMethods = {

    serializeRun() {
        const p = this.player;
        return {
            game: 'dungeon-roguelike', version: SAVE_VERSION, savedAt: new Date().toISOString(),
            runSeed: this.runSeed, isDaily: !!this.isDaily, floor: this.floor,
            stats: this.stats, relations: this.relations, quest: this.quest, army: this.serializeArmy(),
            player: {
                classId: p.classId, str: p.str, dex: p.dex, int: p.int,
                baseMaxHp: p.baseMaxHp, baseMaxMana: p.baseMaxMana,
                level: p.level, xp: p.xp, points: p.points, skillPoints: p.skillPoints,
                skills: p.skills, gold: p.gold, stones: p.stones, gifts: p.gifts, spellIndex: p.spellIndex,
                rebirthUsed: p.rebirthUsed, hp: p.hp, mana: p.mana,
                equipment: p.equipment, inventory: p.inventory
            }
        };
    },

    // Проверка и восстановление. Возвращает текст ошибки или null
    restoreRun(d) {
        try {
            if (!d || d.game !== 'dungeon-roguelike' || d.version !== SAVE_VERSION) return 'Это не файл сохранения этой игры';
            const pd = d.player;
            if (!pd || !CLASSES[pd.classId] || !(d.floor >= 1) || typeof d.runSeed !== 'string' || !Array.isArray(pd.inventory)) return 'Файл повреждён';

            const p = new Player(pd.classId);
            for (const k of ['str', 'dex', 'int', 'baseMaxHp', 'baseMaxMana', 'level', 'xp', 'points', 'skillPoints', 'gold', 'stones', 'spellIndex']) {
                if (Number.isFinite(pd[k])) p[k] = pd[k];
            }
            p.skills = pd.skills && typeof pd.skills === 'object' ? pd.skills : {};
            p.gifts = Array.isArray(pd.gifts) ? pd.gifts.filter(g => BLESSING_BY_ID[g.id]) : [];
            p.rebirthUsed = !!pd.rebirthUsed;
            p.equipment = { weapon: pd.equipment && pd.equipment.weapon || { ...CLASSES[pd.classId].weapon }, armor: pd.equipment && pd.equipment.armor || null, accessory: pd.equipment && pd.equipment.accessory || null };
            p.inventory = pd.inventory;
            p.recalc();
            p.hp = Math.max(1, Math.min(p.maxHp, Number.isFinite(pd.hp) ? pd.hp : p.maxHp));
            p.mana = Math.max(0, Math.min(p.maxMana, Number.isFinite(pd.mana) ? pd.mana : p.maxMana));

            this.audio.init();
            this.classId = pd.classId;
            this.player = p;
            this.runSeed = d.runSeed;
            this.isDaily = !!d.isDaily;
            this.floor = Math.floor(d.floor);
            this.stats = d.stats && Number.isFinite(d.stats.kills) ? d.stats : { kills: 0 };
            this.relations = Object.assign({ trader: 0, smith: 0 }, d.relations || {});
            this.quest = d.quest || null;
            this.isGameOver = false;
            this.inMenu = false;
            this.$('main-menu').classList.add('hidden');
            this.$('gameover-screen').classList.add('hidden');
            this.restoreArmy(d.army || null);          // мертвецы и феи (старые сохранения без армии тоже грузятся)
            this.closeAllModals();
            this.generateLevel();
            this.updateUI();
            this.log(`<span style="color:#9cf">Сохранение загружено: этаж ${this.floor}, ${p.className}, уровень ${p.level}.</span>`);
            return null;
        } catch (e) {
            console.error(e);
            return 'Не удалось прочитать сохранение';
        }
    },

    // ---------- На этом устройстве ----------
    autosave() {
        if (this.inMenu || this.isGameOver) return;
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serializeRun())); } catch (e) {}
    },
    clearAutosave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
    readAutosave() {
        try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
    },
    continueRun() {
        const err = this.restoreRun(this.readAutosave());
        if (err) this.setText('record-line', err);
    },
    updateContinueButton() {
        const d = this.readAutosave(), btn = this.$('continue-btn');
        if (!btn) return;
        const ok = d && d.game === 'dungeon-roguelike' && d.player && CLASSES[d.player.classId];
        btn.classList.toggle('hidden', !ok);
        if (ok) btn.innerText = `▶ ПРОДОЛЖИТЬ — этаж ${d.floor}, ${CLASSES[d.player.classId].name}, ур. ${d.player.level}`;
    },

    // ---------- Файл «сохранение.json» (переносится между устройствами) ----------
    saveToFile() {
        if (this.inMenu) return;
        const text = JSON.stringify(this.serializeRun(), null, 2);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'сохранение.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        this.log('<span style="color:#9cf">💾 Сохранение скачано: сохранение.json</span>');
        this.renderer.showBanner('Сохранено в файл', '#9cf', 1.6);
    },
    openLoadDialog() {
        const input = this.$('load-file');
        if (input) { input.value = ''; input.click(); }
    },
    onLoadFile(input) {
        const f = input.files && input.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            let data = null;
            try { data = JSON.parse(rd.result); } catch (e) {}
            const err = this.restoreRun(data);
            if (err) { this.log(`<span style="color:#f55">${err}</span>`); this.setText('record-line', err); }
        };
        rd.readAsText(f);
    }
};
