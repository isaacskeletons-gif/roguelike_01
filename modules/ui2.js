// modules/ui2.js — окна NPC (торговец, кузнец): товары, продажа, разговор, задания, улучшение и ковка.
// Подмешивается в класс Roguelike и переопределяет старые окна торговца из ui.js.

const UI2Methods = {

    openTraderModal() { this.openNpc('trader'); },
    openSmithModal() { this.openNpc('smith'); },

    openNpc(id) {
        this.pauseForModal();
        this.currentNpc = id;
        this.npcMsg = '';
        this.renderNpc();
        this.$('trader-modal').classList.remove('hidden');
    },
    closeTrader() { this.setText('trader-msg', ''); this.closeAllModals(); },

    // Подпись цены с учётом симпатии
    priceTag(npcId, base) {
        const f = this.buyPrice(npcId, base);
        const color = f < base ? '#8e8' : f > base ? '#f88' : '#fff';
        return `<span style="color:${color}">${f} 💰</span>`;
    },

    renderNpc() {
        const id = this.currentNpc, npc = id === 'trader' ? this.trader : this.smith, p = this.player;
        if (!npc) return;
        const modal = this.$('trader-modal'), scroll = modal.scrollTop;
        const att = this.attitude(id), mul = this.priceMuls(id);
        const talks = this.npcTalks[id];
        const priceDelta = Math.round((mul.buy - 1) * 100);
        this.setText('npc-title', id === 'trader' ? '🧙‍♂️ ТОРГОВЕЦ' : '🔨 КУЗНЕЦ');

        let h = `<div class="npc-head">
            <div>Отношение: <b style="color:${att.color}">${att.name}</b> (${this.relations[id] || 0})
              · Цены: <b style="color:${priceDelta <= 0 ? '#8e8' : '#f88'}">${priceDelta > 0 ? '+' : ''}${priceDelta}%</b>
              · Выкуп ваших вещей: ×${mul.sell.toFixed(2)}</div>
            <div>💰 ${p.gold} · 💎 ${p.stones}</div></div>`;
        if (this.npcMsg) h += `<div class="npc-msg">${this.npcMsg}</div>`;

        // --- Разговор ---
        const gift = 25 + this.floor * 5;
        h += `<div class="npc-section"><h3>Разговор <small>(реплик осталось: ${talks})</small></h3><div class="npc-row">
            <button onclick="game.npcAct('talk','chat')">Поболтать</button>
            <button onclick="game.npcAct('talk','compliment')">Комплимент (ИНТ)</button>
            <button onclick="game.npcAct('talk','gift')">Подарок (${gift} 💰)</button>
            <button onclick="game.npcAct('talk','haggle')">Торговаться</button>
            <button class="sell" onclick="game.npcAct('talk','insult')">Оскорбить</button></div></div>`;

        // --- Задание ---
        const q = this.quest;
        h += `<div class="npc-section"><h3>Задание</h3>`;
        if (!q) h += `<button onclick="game.npcAct('quest-accept')">Взять задание</button>`;
        else {
            const prog = q.type === 'kill' ? `${q.progress}/${q.count}` : `${Math.min(p.stones, q.count)}/${q.count} 💎`;
            h += `<div>${q.text} — <b>${prog}</b> <small>(до этажа ${q.deadline}; награда ${q.reward.gold} 💰${q.reward.stones ? ` +${q.reward.stones} 💎` : ''}, симпатия +${q.sympathy})</small></div>`;
            if (q.npc === id && this.questReady()) h += `<button onclick="game.npcAct('quest-turn')">Сдать задание</button>`;
            else if (q.npc !== id) h += `<small>Заказчик — ${NPC_INFO[q.npc].name}</small>`;
        }
        h += '</div>';

        // --- Кузнец: улучшение, ковка, камни ---
        if (id === 'smith') {
            const gear = [];
            for (const slot of ['weapon', 'armor']) if (Forge.canUpgrade(p.equipment[slot])) gear.push({ ref: 'eq:' + slot, item: p.equipment[slot], eq: true });
            p.inventory.forEach((it, i) => { if (Forge.canUpgrade(it)) gear.push({ ref: 'inv:' + i, item: it, eq: false }); });
            h += `<div class="npc-section"><h3>Улучшение снаряжения</h3>`;
            if (!gear.length) h += '<small>Нечего улучшать</small>';
            for (const g of gear) {
                const it = g.item;
                h += `<div class="trader-item" title="${describeItem(it).replace(/"/g, '&quot;')}">
                    <span><b style="color:${it.color || '#eee'}">${it.name}</b>${g.eq ? ' <small>(надето)</small>' : ''}<br>
                    <small>Шанс ${Math.round(Forge.chance(it) * 100)}% · ${Forge.stonesNeed(it)} 💎 + ${this.buyPrice('smith', Forge.goldNeed(it))} 💰</small></span>
                    <button onclick="game.npcAct('upgrade','${g.ref}')">Улучшить</button></div>`;
            }
            h += '</div>';
            const craftGold = this.buyPrice('smith', 70 + this.floor * 20);
            h += `<div class="npc-section"><h3>Ковка нового</h3><small>Создаёт хорошую вещь по уровню этажа: 3 💎 + ${craftGold} 💰</small><div class="npc-row">
                <button onclick="game.npcAct('craft','weapon')">Выковать оружие</button>
                <button onclick="game.npcAct('craft','armor')">Выковать броню</button>
                <button onclick="game.npcAct('stone')">Купить камень (${this.buyPrice('smith', 35)} 💰)</button></div></div>`;
        }

        // --- Товары ---
        h += `<div class="npc-section"><h3>Товары</h3>`;
        if (!npc.items.length) h += '<small>Распродано</small>';
        npc.items.forEach((item, i) => {
            const extra = describeItem(item).split('\n').slice(1, 4).join(' • ');
            h += `<div class="trader-item" title="${describeItem(item).replace(/"/g, '&quot;')}">
                <span><b style="color:${item.color || '#eee'}">${item.icon || ''} ${item.name}</b> — ${this.priceTag(id, item.price)}<br><small>${extra}</small></span>
                <button onclick="game.npcAct('buy',${i})">Купить</button></div>`;
        });
        h += '</div>';

        // --- Продажа ---
        const sellable = p.inventory.map((it, i) => ({ it, i })).filter(o => o.it.itemType !== 'key');
        h += `<div class="npc-section"><h3>Продать</h3>`;
        if (!sellable.length) h += '<small>Инвентарь пуст</small>';
        for (const { it, i } of sellable) {
            h += `<div class="trader-item" title="${describeItem(it).replace(/"/g, '&quot;')}"><span><b style="color:${it.color || '#eee'}">${it.name}</b></span>
                <button class="sell" onclick="game.npcAct('sell',${i})">Продать за ${this.sellPriceTo(id, it)} 💰</button></div>`;
        }
        h += '</div>';

        this.$('npc-body').innerHTML = h;
        modal.scrollTop = scroll;
    },

    npcAct(kind, arg) {
        const id = this.currentNpc, p = this.player;
        let msg = '';
        if (kind === 'talk') msg = this.talkTo(id, arg);
        else if (kind === 'quest-accept') { this.acceptQuest(id); msg = 'Задание принято.'; }
        else if (kind === 'quest-turn') { msg = this.turnInQuest(id) ? 'Отличная работа! Вот награда.' : 'Задание ещё не выполнено.'; }
        else if (kind === 'buy') {
            const npc = id === 'trader' ? this.trader : this.smith, item = npc.items[arg];
            if (item) {
                const r = npc.buyItem(p, arg, this.buyPrice(id, item.price));
                msg = r.message;
                if (r.success) { this.audio.play('coin'); this.log(`<span style="color:green">${r.message}</span>`); }
            }
        } else if (kind === 'sell') {
            const it = p.inventory[arg];
            if (it && it.itemType !== 'key') {
                const price = this.sellPriceTo(id, it);
                p.inventory.splice(arg, 1);
                p.gold += price;
                this.audio.play('coin');
                msg = `Продано: ${it.name} за ${price} 💰`;
                this.log(`<span style="color:gold">${msg}</span>`);
            }
        } else if (kind === 'upgrade') {
            const [t, v] = arg.split(':');
            msg = this.smithUpgrade(t === 'eq' ? { slot: v } : { inv: +v });
        } else if (kind === 'craft') msg = this.smithCraft(arg);
        else if (kind === 'stone') msg = this.smithBuyStone();
        this.npcMsg = msg;
        this.renderNpc();
        this.updateUI();
    }
};
