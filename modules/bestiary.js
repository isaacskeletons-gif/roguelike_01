// modules/bestiary.js — бестиарий: что вы видели, сколько убили, свойства и слабости. Хранится между забегами.

const BESTIARY_INFO = {
    'Слизень':          { info: 'Медлительная слизь. Нападает толпой на первых этажах.', weak: 'Мало здоровья — хватает пары ударов. Боится любого огня.' },
    'Гоблин':           { info: 'Быстрый и юркий. Ударом может вызвать кровотечение.', weak: 'Хрупкий: убивайте первым ударом, не давайте окружить.' },
    'Орк':              { info: 'Крепкий боец ближнего боя. Бьёт сильно, но с замахом.', weak: 'Уворачивайтесь от замаха («!» над головой) и бейте в ответ.' },
    'Послушник':        { info: 'Стреляет магией издалека и держит дистанцию.', weak: 'Прячьтесь за углами и сближайтесь рывком; слабый в ближнем бою.' },
    'Призрак':          { info: 'Проходит сквозь стены и приближается незаметно.', weak: 'Злой дух: Мария наносит ему больше урона («Святой свет»).' },
    'Каменный голем':   { info: 'Медленный великан с огромным запасом здоровья.', weak: 'Очень медлителен — можно кружить вокруг него и бить с отходом.' },
    'Тёмный маг':       { info: 'Колдует отравленные снаряды. Яд тикает несколько секунд.', weak: 'Мало здоровья; «Очищение» Марии снимает яд.' },
    'Банши':            { info: 'Проходит сквозь стены. Касание может заморозить.', weak: 'Злой дух: уязвима к «Святому свету». Берегитесь замедления.' },
    'Лавовый слизень':  { info: 'Жгучая слизь. Попадание поджигает вас.', weak: 'Ледяная стрела (Афорис) и заморозка очень эффективны.' },
    'Демон':            { info: 'Босс 5-го этажа. Быстрый, бьёт сильно и редко.', weak: 'Злой дух: уязвим к «Святому свету». Бейте между замахами.' },
    'Лич':              { info: 'Босс 10-го этажа. Стреляет магией и призывает слизней.', weak: 'Злой дух. Убивайте призванных слизней, прячьтесь за стенами от снарядов.' },
    'Страж':            { info: 'Босс 15-го этажа. Бронированный, получает меньше урона.', weak: 'Броня снижает урон на 30%: берите яд и горение — они обходят защиту.' },
    'Мимик':            { info: 'Сундук, который оживает при открытии.', weak: 'Сразу бейте после открытия: первый удар у него с замахом.' },
    'Разбойник':        { info: 'Грабители. Наносят кровотечение. Встречаются в комнатах-засадах.', weak: 'Можно откупиться, запугать или уговорить — а можно драться: они щедро роняют золото.' }
};

const TRAIT_INFO = {
    explosive: 'Взрывной: взрывается после смерти — отбегите.',
    regen: 'Регенерирующий: восстанавливает здоровье, если его не бить.',
    summoner: 'Призывающий: вызывает слизней — убейте его первым.',
    swift: 'Быстрый: догоняет вас; не убегайте — деритесь у стены.',
    armored: 'Бронированный: получает на 30% меньше урона.'
};

const BestiaryMethods = {
    loadBestiary() { try { return JSON.parse(localStorage.getItem('rogue_bestiary')) || {}; } catch (e) { return {}; } },
    saveBestiary() { try { localStorage.setItem('rogue_bestiary', JSON.stringify(this.bestiary)); } catch (e) {} },

    entry(name) { return this.bestiary[name] || (this.bestiary[name] = { seen: 0, kills: 0, traits: [] }); },

    noteSeen(e) {
        const b = this.entry(e.typeName0), first = b.seen === 0;
        b.seen++;
        for (const t of e.traits) if (!b.traits.includes(t)) b.traits.push(t);
        if (first) {
            this.log(`<span style="color:#9cf">📖 Бестиарий: новая запись — ${e.typeName0} (B)</span>`);
            this.saveBestiary();
        }
    },
    noteKill(e) { this.entry(e.typeName0).kills++; this.saveBestiary(); },

    toggleBestiary() {
        this.leaveDrawer();
        if (!this.$('bestiary-modal').classList.contains('hidden')) { this.closeAllModals(); return; }
        if (this.paused || this.inMenu || this.isGameOver) return;
        this.pauseForModal();
        this.renderBestiary();
        this.$('bestiary-modal').classList.remove('hidden');
    },

    renderBestiary() {
        const list = this.$('bestiary-list');
        list.innerHTML = '';
        if (!this._bestThumbs) this._bestThumbs = {};
        const types = ENEMY_TYPES.filter(t => !t.minion);
        let seenCount = 0;
        for (const t of types) {
            const b = this.bestiary[t.name], row = document.createElement('div');
            row.className = 'best-row' + (b && b.seen ? '' : ' unknown');
            if (!b || !b.seen) { row.innerHTML = '<div class="best-thumb">?</div><div><b>???</b><br><small>Вы ещё не встречали этого врага</small></div>'; list.appendChild(row); continue; }
            seenCount++;
            const info = BESTIARY_INFO[t.name] || { info: '', weak: '' };
            const ai = { chase: 'преследует', ranged: 'стреляет издалека', ghost: 'проходит сквозь стены' }[t.ai] || '';
            const traits = b.traits.map(k => TRAIT_INFO[k]).filter(Boolean).map(x => `<li>${x}</li>`).join('');
            const thumb = document.createElement('canvas');
            thumb.width = thumb.height = 64; thumb.className = 'best-thumb';
            const key = t.name;
            if (!this._bestThumbs[key]) this._bestThumbs[key] = SpriteFactory.monster(t.body, t.hue, 4321, {});
            const tx = thumb.getContext('2d');
            tx.imageSmoothingEnabled = false;
            tx.drawImage(this._bestThumbs[key].canvas, 0, 0, 64, 64);
            const body = document.createElement('div');
            body.innerHTML = `<b>${t.name}${t.boss ? ' 👑' : ''}</b> <small>— видели ${b.seen}, убито ${b.kills}</small><br>
                <small>HP ${t.hp} · урон ${t.dmg} · скорость ${t.speed} · ${ai}</small><br>
                <small>${info.info}</small><br><small style="color:#8e8">Слабость: ${info.weak}</small>
                ${traits ? `<ul class="best-traits">${traits}</ul>` : ''}`;
            row.appendChild(thumb); row.appendChild(body);
            list.appendChild(row);
        }
        this.setText('bestiary-count', `${seenCount} / ${types.length}`);
    }
};
