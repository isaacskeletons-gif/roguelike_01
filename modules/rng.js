// modules/rng.js — генератор случайных чисел с сидом (одинаковый сид = одинаковые этажи)

class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() { // mulberry32
        this.s = (this.s + 0x6D2B79F5) >>> 0;
        let t = this.s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

function hashString(str) { // FNV-1a
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// Глобальный «генератор уровня». Game.generateLevel() сбрасывает его сидом этажа,
// поэтому карта, враги, лут, сундуки и ловушки одинаковы у всех, кто играет тот же сид.
const Rand = {
    r: new RNG((Date.now() ^ (Math.random() * 4294967296)) >>> 0),
    seed(n) { this.r = new RNG(n); },
    next() { return this.r.next(); },
    range(a, b) { return this.r.range(a, b); },
    int(a, b) { return this.r.int(a, b); },
    chance(p) { return this.r.chance(p); },
    pick(arr) { return this.r.pick(arr); },
    shuffle(arr) { return this.r.shuffle(arr); }
};
