// modules/map.js — комнаты + коридоры, двери, запертые двери с ключом, тайные комнаты, поиск пути

const MAP_SIZE = 32;

// Типы клеток
const TILE_FLOOR = 0;
const TILE_WALL = 1;
const TILE_DOOR = 2;      // закрытая дверь — открывается касанием
const TILE_LOCKED = 3;    // заперта, нужен ключ
const TILE_SECRET = 4;    // выглядит как трещина в стене, открывается поиском (E)
const TILE_OPEN = 6;      // открытая дверь/проход
const TILE_BARS = 7;      // решётка (арена запечатана)

const tilePassable = t => t === TILE_FLOOR || t === TILE_OPEN;     // для игрока
const tileSolid = t => !tilePassable(t);                           // для обзора и снарядов
const tileEnemyPassable = t => t === TILE_FLOOR || t === TILE_OPEN || t === TILE_DOOR;

class MapGenerator {
    constructor() { this.map = []; this.rooms = []; }

    // Возвращает { map, rooms, start, exit, keyRoom, lockedDoor }
    generateLevel(floor) {
        const rooms = this.placeRooms(floor);
        return this.build(floor, rooms.length >= 4 ? rooms : this.fixedRooms());
    }

    mkRoom(id, x, y, w, h, role = 'normal') {
        return { id, x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), role, event: null, mouths: [] };
    }

    fixedRooms() {
        return [this.mkRoom(0, 3, 3, 7, 6), this.mkRoom(1, 20, 3, 8, 6), this.mkRoom(2, 3, 20, 8, 7),
                this.mkRoom(3, 20, 20, 8, 7), this.mkRoom(4, 12, 12, 7, 6)];
    }

    placeRooms(floor) {
        const N = MAP_SIZE, rooms = [];
        const target = Math.min(10, 6 + Math.floor(floor / 2) + Rand.int(0, 2));
        for (let tries = 0; tries < 250 && rooms.length < target; tries++) {
            const w = Rand.int(4, 8), h = Rand.int(4, 7);
            const x = Rand.int(2, N - w - 3), y = Rand.int(2, N - h - 3);
            if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
            rooms.push(this.mkRoom(rooms.length, x, y, w, h));
        }
        return rooms;
    }

    build(floor, rooms) {
        const N = MAP_SIZE;
        const map = Array.from({ length: N }, () => Array(N).fill(TILE_WALL));
        this.map = map; this.rooms = rooms;

        for (const r of rooms) this.carve(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1);

        // Соединяем каждую комнату с ближайшей из предыдущих (гарантирует связность) + пара петель
        for (let i = 1; i < rooms.length; i++) {
            let best = 0, bd = 1e9;
            for (let j = 0; j < i; j++) {
                const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
                if (d < bd) { bd = d; best = j; }
            }
            this.corridor(rooms[i], rooms[best]);
        }
        const loops = Rand.int(1, 2);
        for (let k = 0; k < loops; k++) {
            const a = Rand.int(0, rooms.length - 1), b = Rand.int(0, rooms.length - 1);
            if (a !== b) this.corridor(rooms[a], rooms[b]);
        }

        for (const r of rooms) r.mouths = this.findMouths(r);

        // Старт и выход
        const start = rooms[0];
        start.role = 'start';
        const dist = this.bfs(start.cx, start.cy);
        const byDist = rooms.slice(1).sort((a, b) => dist[b.cy][b.cx] - dist[a.cy][a.cx]);

        let exitRoom = byDist[0], lockedDoor = null, keyRoom = null;
        if (floor >= 2 && Rand.chance(0.6)) {
            // Запираем «тупиковую» комнату: у неё один вход, который не является проходом в другое место
            for (const r of byDist) {
                const m = this.spurMouth(r);
                if (m && rooms.some(o => o !== start && o !== r)) { exitRoom = r; lockedDoor = m; break; }
            }
        }
        exitRoom.role = 'exit';

        // Обычные двери в узких входах комнат
        for (const r of rooms) {
            for (const m of r.mouths) {
                if (lockedDoor && m.x === lockedDoor.x && m.y === lockedDoor.y) continue;
                if (this.isChokepoint(r, m) && Rand.chance(0.55)) map[m.y][m.x] = TILE_DOOR;
            }
        }
        if (lockedDoor) {
            map[lockedDoor.y][lockedDoor.x] = TILE_LOCKED;
            keyRoom = Rand.pick(rooms.filter(r => r.role === 'normal')).id;
        }

        // Тайные комнаты
        const secrets = [];
        const wantSecrets = (floor >= 4 ? 2 : 1);
        for (let s = 0; s < wantSecrets; s++) {
            if (Rand.chance(0.65)) {
                const sec = this.placeSecret(rooms.filter(r => r.role !== 'secret'), rooms.length);
                if (sec) { rooms.push(sec); secrets.push(sec); }
            }
        }

        return {
            map, rooms,
            start: { x: start.cx + 0.5, y: start.cy + 0.5 },
            exit: { x: exitRoom.cx + 0.5, y: exitRoom.cy + 0.5 },
            keyRoom, lockedDoor
        };
    }

    carve(x0, y0, x1, y1) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.map[y][x] = TILE_FLOOR;
    }

    corridor(a, b) {
        const horizFirst = Rand.chance(0.5);
        let x = a.cx, y = a.cy;
        const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); this.map[y][x] = TILE_FLOOR; } };
        const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); this.map[y][x] = TILE_FLOOR; } };
        if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    }

    // Клетки сразу за периметром комнаты, где начинается проход
    findMouths(r) {
        const out = [], map = this.map;
        const add = (x, y) => { if (map[y] && map[y][x] === TILE_FLOOR) out.push({ x, y }); };
        for (let x = r.x; x < r.x + r.w; x++) { add(x, r.y - 1); add(x, r.y + r.h); }
        for (let y = r.y; y < r.y + r.h; y++) { add(r.x - 1, y); add(r.x + r.w, y); }
        return out;
    }

    // Направление «наружу» для клетки-входа
    outward(r, m) {
        if (m.y === r.y - 1) return [0, -1];
        if (m.y === r.y + r.h) return [0, 1];
        if (m.x === r.x - 1) return [-1, 0];
        return [1, 0];
    }

    isChokepoint(r, m) {
        const [dx, dy] = this.outward(r, m);
        const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;   // перпендикуляр
        return this.map[m.y + py][m.x + px] === TILE_WALL && this.map[m.y - py][m.x - px] === TILE_WALL;
    }

    // Единственный вход, за которым нет продолжения коридора «в сторону» — можно безопасно запереть
    spurMouth(r) {
        if (r.mouths.length !== 1) return null;
        const m = r.mouths[0];
        const [dx, dy] = this.outward(r, m);
        let others = 0;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (ax === -dx && ay === -dy) continue;            // сторона комнаты
            const t = this.map[m.y + ay] && this.map[m.y + ay][m.x + ax];
            if (t === TILE_FLOOR || t === TILE_OPEN) others++;
        }
        return others === 1 ? m : null;
    }

    placeSecret(hosts, id) {
        const N = MAP_SIZE, map = this.map;
        for (let attempt = 0; attempt < 40; attempt++) {
            const r = Rand.pick(hosts);
            const side = Rand.int(0, 3);
            const [ox, oy] = [[0, -1], [0, 1], [-1, 0], [1, 0]][side];
            let gx, gy;
            if (oy !== 0) { gx = Rand.int(r.x + 1, r.x + r.w - 2); gy = oy < 0 ? r.y - 1 : r.y + r.h; }
            else          { gy = Rand.int(r.y + 1, r.y + r.h - 2); gx = ox < 0 ? r.x - 1 : r.x + r.w; }
            const cx = gx + ox * 2, cy = gy + oy * 2;          // центр тайной комнаты 3x3
            if (cx - 2 < 1 || cy - 2 < 1 || cx + 2 > N - 2 || cy + 2 > N - 2) continue;
            let free = true;
            for (let y = cy - 2; y <= cy + 2 && free; y++)
                for (let x = cx - 2; x <= cx + 2; x++) if (map[y][x] !== TILE_WALL) { free = false; break; }
            if (!free || map[gy][gx] !== TILE_WALL) continue;
            this.carve(cx - 1, cy - 1, cx + 1, cy + 1);
            map[gy][gx] = TILE_SECRET;
            const room = this.mkRoom(id, cx - 1, cy - 1, 3, 3, 'secret');
            room.mouths = [{ x: gx, y: gy }];
            room.event = 'secret';
            return room;
        }
        return null;
    }

    // Расстояния по проходимым клеткам (двери считаются проходимыми)
    bfs(sx, sy) {
        const N = MAP_SIZE, d = Array.from({ length: N }, () => Array(N).fill(-1));
        const q = [[sx, sy]];
        d[sy][sx] = 0;
        for (let i = 0; i < q.length; i++) {
            const [x, y] = q[i];
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (this.map[ny] && d[ny][nx] === -1 && tileEnemyPassable(this.map[ny][nx])) {
                    d[ny][nx] = d[y][x] + 1;
                    q.push([nx, ny]);
                }
            }
        }
        return d;
    }

    roomCells(r) {
        const out = [];
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
        return out;
    }

    roomAt(rooms, x, y) {
        const tx = Math.floor(x), ty = Math.floor(y);
        return rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) || null;
    }

    tileAt(map, x, y) {
        const row = map[Math.floor(y)];
        const t = row ? row[Math.floor(x)] : undefined;
        return t === undefined ? TILE_WALL : t;
    }

    // stop — не проверять последние stop клеток (нужно, чтобы «видеть» саму стену)
    hasLineOfSight(map, x1, y1, x2, y2, stop = 0) {
        const dist = Math.hypot(x2 - x1, y2 - y1) - stop;
        if (dist <= 0) return true;
        const steps = Math.ceil(dist * 6);
        for (let i = 1; i < steps; i++) {
            const cx = x1 + (x2 - x1) * (i / steps), cy = y1 + (y2 - y1) * (i / steps);
            if (tileSolid(this.tileAt(map, cx, cy))) return false;
        }
        return true;
    }

    isWalkable(map, x, y) { return tilePassable(this.tileAt(map, x, y)); }
}

// Поле расстояний (BFS) от игрока: враги идут «вниз по градиенту» и обходят стены и углы
class Pathfinder {
    constructor() {
        this.dist = new Int16Array(MAP_SIZE * MAP_SIZE);
        this.queue = new Int16Array(MAP_SIZE * MAP_SIZE);
        this.valid = false;
    }

    compute(map, tx, ty) {
        const N = MAP_SIZE, dist = this.dist, q = this.queue;
        dist.fill(-1);
        tx = Math.max(0, Math.min(N - 1, tx)); ty = Math.max(0, Math.min(N - 1, ty));
        let head = 0, tail = 0;
        dist[ty * N + tx] = 0; q[tail++] = ty * N + tx;
        while (head < tail) {
            const i = q[head++], x = i % N, y = (i / N) | 0, d = dist[i] + 1;
            if (x > 0     && dist[i - 1] < 0 && tileEnemyPassable(map[y][x - 1])) { dist[i - 1] = d; q[tail++] = i - 1; }
            if (x < N - 1 && dist[i + 1] < 0 && tileEnemyPassable(map[y][x + 1])) { dist[i + 1] = d; q[tail++] = i + 1; }
            if (y > 0     && dist[i - N] < 0 && tileEnemyPassable(map[y - 1][x])) { dist[i - N] = d; q[tail++] = i - N; }
            if (y < N - 1 && dist[i + N] < 0 && tileEnemyPassable(map[y + 1][x])) { dist[i + N] = d; q[tail++] = i + N; }
        }
        this.valid = true;
    }

    // Центр соседней клетки с меньшим расстоянием до игрока (учитывает диагонали без срезания углов)
    next(map, x, y) {
        const N = MAP_SIZE, cx = Math.floor(x), cy = Math.floor(y);
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) return null;
        const cur = this.dist[cy * N + cx];
        if (cur <= 0) return null;                    // рядом с целью или клетка недостижима
        let best = cur, bx = -1, by = -1;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                const d = this.dist[ny * N + nx];
                if (d < 0 || d >= best) continue;
                if (dx && dy && (this.dist[cy * N + nx] < 0 || this.dist[ny * N + cx] < 0)) continue;
                best = d; bx = nx; by = ny;
            }
        }
        return bx < 0 ? null : { x: bx + 0.5, y: by + 0.5 };
    }
}
