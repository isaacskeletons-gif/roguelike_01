// modules/npcs.js — NPC: кузнец, отношения (симпатия), цены, диалоги, задания.
// Подмешивается в класс Roguelike (см. конец game.js).

// Базовая доля цены при продаже игроком и подпись NPC
const NPC_INFO = {
    trader: { name: 'Торговец', sell: 0.5,  lines: ['Редкие товары — только у меня!', 'Золото любишь? Я тоже.', 'Зачарованное — не дёшево.'] },
    smith:  { name: 'Кузнец',   sell: 0.75, lines: ['Сталь не терпит спешки.', 'Принёс камни? Давай сюда.', 'Хороший клинок — половина победы.'] }
};

// Кузнец: продаёт снаряжение (дешевле, чем торговец), улучшает и куёт
class Smith {
    constructor(x, y, floor) {
        this.x = x; this.y = y;
        this.type = 'smith';
        this.npcId = 'smith';
        this.name = 'Кузнец';
        this.sprite = SpriteFactory.smith();
        this.items = this.generateStock(floor);
    }
    generateStock(floor) {
        const stock = [];
        for (let i = 0; i < 3; i++) {
            let it = null;
            for (let k = 0; k < 6; k++) {                       // кузнец не продаёт проклятое
                it = (i % 2 === 0 ? ItemGenerator.generateWeapon : ItemGenerator.generateArmor).call(ItemGenerator, floor + 1, 0.15);
                if (!it.curse) break;
            }
            if (it && !it.curse) stock.push({ ...it, price: Math.round(it.value * 1.1), icon: i % 2 === 0 ? '⚔️' : '🛡️' });
        }
        return stock;
    }
    buyItem(player, index, price) {
        const item = this.items[index];
        if (!item) return { success: false, message: 'Предмет не найден' };
        if (player.gold < price) return { success: false, message: 'Недостаточно золота!' };
        if (player.inventory.length >= BALANCE.player.maxInventory) return { success: false, message: 'Инвентарь полон!' };
        player.gold -= price;
        const it = { ...item }; delete it.price; delete it.icon;
        player.inventory.push(it);
        this.items.splice(index, 1);
        return { success: true, message: `Куплено: ${item.name}` };
    }
}

// Улучшение снаряжения камнями: чем выше уровень +N, тем дороже и рискованнее
const Forge = {
    maxPlus: 10,
    canUpgrade(item) { return item && (item.itemType === 'weapon' || item.itemType === 'armor') && !item.fist && (item.plus || 0) < Forge.maxPlus; },
    stonesNeed(item) { return 1 + Math.floor((item.plus || 0) / 2); },
    goldNeed(item) { return Math.round((item.value || 30) * 0.25 * (1 + (item.plus || 0) * 0.4)); },
    chance(item) { return Math.max(0.25, 0.95 - (item.plus || 0) * 0.1); },
    apply(item) {
        item.plus = (item.plus || 0) + 1;
        if (item.itemType === 'weapon') item.dmg += Math.max(1, Math.round(item.dmg * 0.10));
        else item.armor += Math.max(1, Math.round(item.armor * 0.10));
        item.value = (item.value || 30) + 25;
        item.name = item.name.replace(/ \+\d+$/, '') + ` +${item.plus}`;
    }
};

const Quests = {
    make(npcId, floor) {
        const kill = Math.random() < 0.6;
        if (kill) {
            const pool = ENEMY_TYPES.filter(t => !t.boss && !t.special && !t.minion && t.minFloor <= floor && (!t.maxFloor || t.maxFloor >= floor));
            const t = pool[Math.floor(Math.random() * pool.length)];
            const n = 3 + Math.floor(floor / 2);
            return { npc: npcId, type: 'kill', target: t.name, count: n, progress: 0, deadline: floor + 2,
                     text: `Убейте ${n}× ${t.name}`, reward: { gold: 40 + floor * 15, stones: 1 + (floor > 6 ? 1 : 0) }, sympathy: 15 };
        }
        const n = 2 + Math.floor(floor / 4);
        return { npc: npcId, type: 'stones', target: 'Камень улучшения', count: n, progress: 0, deadline: floor + 2,
                 text: `Принесите ${n} камней улучшения`, reward: { gold: 30 + floor * 12, stones: 0 }, sympathy: 15 };
    }
};

const NpcMethods = {

    attitude(npcId) {
        const s = this.relations[npcId] || 0;
        if (s <= -60) return { name: 'Ненавидит', color: '#f44' };
        if (s <= -20) return { name: 'Враждебен', color: '#f93' };
        if (s < 20)   return { name: 'Равнодушен', color: '#ccc' };
        if (s < 60)   return { name: 'Дружелюбен', color: '#8e8' };
        return { name: 'Доверяет', color: '#5f5' };
    },

    // Симпатия 100 → −25% к покупке и +25% к продаже; ссора −100 → +50% к покупке и −50% к продаже
    priceMuls(npcId) {
        const s = this.relations[npcId] || 0;
        const hag = (this.haggle && this.haggle[npcId]) || 1;
        const buy = s >= 0 ? 1 - s * 0.0025 : 1 + (-s) * 0.005;
        const sell = s >= 0 ? 1 + s * 0.0025 : 1 - (-s) * 0.005;
        return { buy: buy * hag, sell };
    },
    buyPrice(npcId, base) { return Math.max(1, Math.round(base * this.priceMuls(npcId).buy)); },
    sellPriceTo(npcId, item) {
        return Math.max(1, Math.round((item.value || 10) * NPC_INFO[npcId].sell * this.priceMuls(npcId).sell));
    },

    // Разговор: до 3 реплик с каждым NPC на этаж
    talkTo(npcId, action) {
        const p = this.player;
        if (this.npcTalks[npcId] <= 0) return 'Хватит болтать, у меня работа.';
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        let d = 0, text = '';
        if (action === 'chat') { d = 3; text = NPC_INFO[npcId].lines[Math.floor(Math.random() * NPC_INFO[npcId].lines.length)]; }
        else if (action === 'compliment') {
            if (Math.random() < clamp(0.3 + p.tInt * 0.04, 0.2, 0.9)) { d = 6; text = 'Ха! Приятно слышать.'; }
            else text = 'Хм... странный ты.';
        } else if (action === 'gift') {
            const cost = 25 + this.floor * 5;
            if (p.gold < cost) return `Нужно ${cost} 💰 на подарок.`;
            p.gold -= cost; d = 10; text = 'Подарок? Не откажусь, спасибо!';
        } else if (action === 'haggle') {
            if (Math.random() < clamp(0.25 + (p.tInt + p.tDex) * 0.02, 0.2, 0.8)) { this.haggle[npcId] = 0.9; text = 'Ладно, скину десять процентов.'; }
            else { d = -8; text = 'Не наглей!'; }
        } else if (action === 'insult') { d = -15; text = 'Вон отсюда с такими словами!'; }
        this.npcTalks[npcId]--;
        const before = this.relations[npcId] || 0;
        this.relations[npcId] = clamp(before + d, -100, 100);
        if (d) this.log(`${NPC_INFO[npcId].name}: отношение ${d > 0 ? '+' : ''}${d} (${this.attitude(npcId).name})`);
        this.updateStats();
        return text;
    },

    // ---------- Задания ----------
    acceptQuest(npcId) {
        if (this.quest) return;
        this.quest = Quests.make(npcId, this.floor);
        this.log(`<span style="color:#fd3">Задание: ${this.quest.text} (до этажа ${this.quest.deadline})</span>`);
        this.updateStats();
    },
    questKill(e) {
        const q = this.quest;
        if (q && q.type === 'kill' && e.typeName0 === q.target && q.progress < q.count) {
            q.progress++;
            if (q.progress === q.count) this.log('<span style="color:#fd3">Задание выполнено! Вернитесь к заказчику.</span>');
        }
    },
    questReady() {
        const q = this.quest, p = this.player;
        if (!q) return false;
        return q.type === 'kill' ? q.progress >= q.count : p.stones >= q.count;
    },
    turnInQuest(npcId) {
        const q = this.quest, p = this.player;
        if (!q || q.npc !== npcId || !this.questReady()) return false;
        if (q.type === 'stones') p.stones -= q.count;
        p.gold += q.reward.gold; p.stones += q.reward.stones;
        const prev = this.relations[npcId] || 0;
        this.relations[npcId] = Math.min(100, prev + q.sympathy);
        this.log(`<span style="color:#7f7">Задание сдано! +${q.reward.gold} 💰${q.reward.stones ? ` +${q.reward.stones} 💎` : ''}, симпатия +${q.sympathy}</span>`);
        this.audio.play('levelup');
        this.quest = null;
        this.updateUI();
        return true;
    },
    checkQuestExpiry() {
        const q = this.quest;
        if (q && this.floor > q.deadline) {
            this.relations[q.npc] = Math.max(-100, (this.relations[q.npc] || 0) - 5);
            this.log('<span style="color:#f93">Задание просрочено: заказчик недоволен.</span>');
            this.quest = null;
        }
    },

    // ---------- Кузнец ----------
    smithRef(ref) { return ref.slot ? this.player.equipment[ref.slot] : this.player.inventory[ref.inv]; },

    smithUpgrade(ref) {
        const p = this.player, item = this.smithRef(ref);
        if (!Forge.canUpgrade(item)) return 'Это нельзя улучшить';
        const stones = Forge.stonesNeed(item), gold = this.buyPrice('smith', Forge.goldNeed(item));
        if (p.stones < stones) return `Нужно камней: ${stones} 💎`;
        if (p.gold < gold) return `Нужно золота: ${gold} 💰`;
        p.stones -= stones; p.gold -= gold;
        if (Math.random() < Forge.chance(item)) {
            Forge.apply(item);
            if (ref.slot) p.recalc();
            this.audio.play('levelup');
            this.log(`<span style="color:#7cf">Улучшено: ${item.name}</span>`);
            return `Успех! ${item.name}`;
        }
        this.audio.play('locked');
        this.log('<span style="color:#f93">Улучшение не удалось — камни и золото потеряны.</span>');
        return 'Неудача: материалы потеряны';
    },

    smithCraft(kind) {
        const p = this.player, gold = this.buyPrice('smith', 70 + this.floor * 20), stones = 3;
        if (p.stones < stones) return `Нужно камней: ${stones} 💎`;
        if (p.gold < gold) return `Нужно золота: ${gold} 💰`;
        if (p.inventory.length >= BALANCE.player.maxInventory) return 'Инвентарь полон!';
        let it = null;
        for (let k = 0; k < 8; k++) {
            it = kind === 'weapon' ? ItemGenerator.generateWeapon(this.floor + 1, 0.8) : ItemGenerator.generateArmor(this.floor + 1, 0.8);
            if (!it.curse) break;
        }
        if (it.curse) return 'Не удалось выковать, попробуйте ещё раз';
        p.stones -= stones; p.gold -= gold;
        p.inventory.push(it);
        this.audio.play('pickup');
        this.log(`<span style="color:${it.color}">Выковано: ${it.name}</span>`);
        return `Выковано: ${it.name}`;
    },

    smithBuyStone() {
        const p = this.player, price = this.buyPrice('smith', 35);
        if (p.gold < price) return `Нужно золота: ${price} 💰`;
        p.gold -= price; p.stones++;
        this.audio.play('coin');
        return 'Куплен камень улучшения';
    }
};
