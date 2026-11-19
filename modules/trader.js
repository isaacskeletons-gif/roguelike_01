// modules/trader.js
class Trader {
    constructor(x, y, floor = 3) {
        this.x = x; this.y = y;
        this.type = 'trader';
        this.name = "Торговец";
        this.npcId = 'trader';
        this.sprite = SpriteFactory.trader();
        this.items = this.generateStock(floor);
    }

    generateStock(floor) {
        const stock = [];
        const small = 30 + floor * 3, big = 55 + floor * 5;
        const priced = (item, price, icon) => ({ ...item, price: Math.round(price), icon });

        stock.push(priced({ name: "Зелье Лечения", itemType: 'potion', heal: small }, 20 + floor * 2, '🧪'));
        stock.push(priced({ name: "Большое Зелье", itemType: 'potion', heal: big }, 40 + floor * 4, '🧪'));
        stock.push(priced({ name: "Зелье Маны", itemType: 'mana_potion', mana: 30 }, 20 + floor * 2, '🔷'));
        stock.push(priced(ItemGenerator.generateScroll('cleanse'), 55 + floor * 3, '✨'));
        if (Rand.chance(0.6)) stock.push(priced(ItemGenerator.generateScroll('fireball'), 35 + floor * 2, '📜'));

        for (const [gen, icon] of [[ItemGenerator.generateWeapon, '⚔️'], [ItemGenerator.generateArmor, '🛡️'], [ItemGenerator.generateAccessory, '💍']]) {
            if (Rand.chance(0.7)) {
                const it = gen.call(ItemGenerator, floor + 1, 0.6);
                if (!it.curse) stock.push(priced(it, it.value * 1.6, icon));   // торговец проклятое не продаёт
            }
        }
        return stock;
    }

    buyItem(player, index, price) {
        const item = this.items[index];
        if (!item) return { success: false, message: "Предмет не найден" };
        if (price === undefined) price = item.price;
        if (player.gold < price) return { success: false, message: "Недостаточно золота!" };
        if (player.inventory.length >= BALANCE.player.maxInventory) return { success: false, message: "Инвентарь полон!" };

        player.gold -= price;
        const newItem = { ...item };
        delete newItem.price;
        delete newItem.icon;
        player.inventory.push(newItem);
        this.items.splice(index, 1);
        return { success: true, message: `Куплено: ${item.name}`, item: newItem };
    }
}
