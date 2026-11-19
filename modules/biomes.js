// modules/biomes.js — биомы: цвета, текстуры стен/пола/потолка (всё процедурно)

const BIOMES = [
    { id: 'catacombs', name: 'Катакомбы',        kind: 'brick', wall: [25, 10, 42],  floor: [28, 8, 21],   ceil: [250, 10, 9],  fog: [16, 14, 20], hum: 55 },
    { id: 'caves',     name: 'Грибные пещеры',   kind: 'moss',  wall: [100, 28, 30], floor: [90, 24, 17],  ceil: [120, 20, 7],  fog: [8, 20, 12],  hum: 48 },
    { id: 'crypt',     name: 'Склеп',            kind: 'bone',  wall: [265, 14, 38], floor: [260, 12, 19], ceil: [270, 15, 8],  fog: [20, 12, 28], hum: 62 },
    { id: 'inferno',   name: 'Огненные недра',   kind: 'lava',  wall: [8, 30, 26],   floor: [10, 38, 15],  ceil: [5, 30, 7],    fog: [34, 8, 4],   hum: 42 },
    { id: 'ice',       name: 'Ледяной чертог',   kind: 'ice',   wall: [200, 38, 50], floor: [205, 32, 28], ceil: [215, 30, 11], fog: [10, 22, 36], hum: 70 }
];

function biomeForFloor(floor) { return BIOMES[Math.floor((floor - 1) / 3) % BIOMES.length]; }

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const f = n => {
        const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

class BiomeTextures {
    static get(biome) {
        if (!BiomeTextures.cache) BiomeTextures.cache = {};
        return BiomeTextures.cache[biome.id] || (BiomeTextures.cache[biome.id] = BiomeTextures.build(biome));
    }

    static canvas() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        return c;
    }

    static build(b) {
        let seed = 9001 + b.id.length * 131;
        const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        const t = { walls: {}, fog: b.fog, fogStyles: [] };
        t.walls[TILE_WALL] = BiomeTextures.brick(b, rnd, false);
        t.walls[TILE_SECRET] = BiomeTextures.brick(b, rnd, true);
        t.walls[TILE_DOOR] = BiomeTextures.door(false);
        t.walls[TILE_LOCKED] = BiomeTextures.door(true);
        t.walls[TILE_BARS] = BiomeTextures.bars();
        t.floor = BiomeTextures.floorData(b, rnd, false);
        t.ceil = BiomeTextures.floorData(b, rnd, true);
        t.floorCanvas = BiomeTextures.dataToCanvas(t.floor);   // для вида сверху
        for (let i = 0; i <= 32; i++) t.fogStyles.push(`rgba(${b.fog[0]},${b.fog[1]},${b.fog[2]},${(i / 32).toFixed(3)})`);
        return t;
    }

    static dataToCanvas(data) {
        const c = BiomeTextures.canvas();
        const g = c.getContext('2d');
        const img = g.createImageData(64, 64);
        img.data.set(data);
        g.putImageData(img, 0, 0);
        return c;
    }

    static brick(b, rnd, cracked) {
        const c = BiomeTextures.canvas(), g = c.getContext('2d');
        const [h, s, l] = b.wall;
        g.fillStyle = `hsl(${h},${s}%,${Math.max(4, l - 28)}%)`;
        g.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 4; row++) {
            const off = row % 2 ? 16 : 0;
            for (let bx = -1; bx < 2; bx++) {
                const x = bx * 32 + off, y = row * 16;
                g.fillStyle = `hsl(${h + rnd() * 8 - 4},${s + rnd() * 10 - 5}%,${l + rnd() * 14 - 7}%)`;
                g.fillRect(x + 1, y + 1, 30, 14);
                g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(x + 1, y + 1, 30, 2);
                g.fillStyle = 'rgba(0,0,0,0.26)';       g.fillRect(x + 1, y + 13, 30, 2);
                if (b.kind === 'moss' && rnd() < 0.55) { g.fillStyle = 'rgba(70,150,55,0.45)'; g.fillRect(x + 1, y + 9 + rnd() * 3, 12 + rnd() * 16, 5); }
                if (b.kind === 'ice') { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 3 + rnd() * 10, y + 3, 2, 8); }
                if (b.kind === 'bone' && rnd() < 0.4) { g.fillStyle = '#d8cfb4'; g.fillRect(x + 4 + rnd() * 18, y + 5 + rnd() * 4, 5, 2); g.fillRect(x + 3 + rnd() * 18, y + 4 + rnd() * 6, 2, 2); }
            }
        }
        if (b.kind === 'lava') {
            g.strokeStyle = 'rgba(255,110,30,0.85)'; g.lineWidth = 1;
            for (let i = 0; i < 7; i++) {
                let x = rnd() * 64, y = rnd() * 64;
                g.beginPath(); g.moveTo(x, y);
                for (let k = 0; k < 3; k++) { x += rnd() * 10 - 5; y += rnd() * 10; g.lineTo(x, y); }
                g.stroke();
            }
        }
        for (let i = 0; i < 220; i++) {
            g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.07)';
            g.fillRect((rnd() * 64) | 0, (rnd() * 64) | 0, 1, 1);
        }
        if (cracked) {   // тайник: еле заметная трещина (подсказка внимательным игрокам)
            g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(30, 0); g.lineTo(26, 14); g.lineTo(34, 26); g.lineTo(28, 40); g.lineTo(33, 52); g.lineTo(31, 64); g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.12)';
            g.beginPath(); g.moveTo(31, 0); g.lineTo(27, 14); g.lineTo(35, 26); g.stroke();
        }
        return c;
    }

    static door(locked) {
        const c = BiomeTextures.canvas(), g = c.getContext('2d');
        g.fillStyle = '#5a3a1e'; g.fillRect(0, 0, 64, 64);
        for (let x = 0; x < 64; x += 8) {
            g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 1, 64);
            g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 1, 0, 1, 64);
        }
        g.fillStyle = '#2a2a30'; g.fillRect(0, 9, 64, 6); g.fillRect(0, 49, 64, 6);
        g.fillStyle = '#777';
        for (let x = 6; x < 64; x += 14) { g.fillRect(x, 11, 2, 2); g.fillRect(x, 51, 2, 2); }
        g.fillStyle = '#1b1208'; g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
        if (locked) {
            g.fillStyle = '#d9a400'; g.fillRect(24, 30, 16, 14);
            g.strokeStyle = '#d9a400'; g.lineWidth = 3;
            g.beginPath(); g.arc(32, 30, 6, Math.PI, 0); g.stroke();
            g.fillStyle = '#3a2800'; g.fillRect(31, 35, 2, 5);
        } else {
            g.fillStyle = '#d9a400'; g.beginPath(); g.arc(50, 34, 3, 0, Math.PI * 2); g.fill();
        }
        return c;
    }

    static bars() {
        const c = BiomeTextures.canvas(), g = c.getContext('2d');
        g.fillStyle = '#08080a'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#6a6a74';
        for (let x = 4; x < 64; x += 10) { g.fillRect(x, 0, 4, 64); g.fillStyle = '#9a9aa6'; g.fillRect(x, 0, 1, 64); g.fillStyle = '#6a6a74'; }
        g.fillRect(0, 14, 64, 4); g.fillRect(0, 46, 64, 4);
        return c;
    }

    // Пиксельные данные 64x64 RGBA (для быстрого «floor casting» без canvas)
    static floorData(b, rnd, ceiling) {
        const [h, s, l] = ceiling ? b.ceil : b.floor;
        const [r0, g0, b0] = hslToRgb(h, s, l);
        const data = new Uint8ClampedArray(64 * 64 * 4);
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
                let k = 1 + (rnd() - 0.5) * 0.18;
                if (!ceiling) {
                    if (((x >> 5) + (y >> 5)) & 1) k *= 1.1;
                    if ((x & 31) === 0 || (y & 31) === 0) k *= 0.6;
                } else if (((x >> 4) + (y >> 4)) & 1) k *= 0.85;
                let r = r0 * k, g = g0 * k, bl = b0 * k;
                if (!ceiling) {
                    if (b.kind === 'lava' && rnd() < 0.03) { r = 255; g = 110; bl = 20; }
                    if (b.kind === 'moss' && rnd() < 0.05) { r *= 0.6; g *= 1.5; bl *= 0.6; }
                    if (b.kind === 'ice' && rnd() < 0.04) { r += 50; g += 55; bl += 60; }
                    if (b.kind === 'bone' && rnd() < 0.03) { r += 40; g += 38; bl += 28; }
                }
                const i = (y * 64 + x) * 4;
                data[i] = r; data[i + 1] = g; data[i + 2] = bl; data[i + 3] = 255;
            }
        }
        return data;
    }
}
