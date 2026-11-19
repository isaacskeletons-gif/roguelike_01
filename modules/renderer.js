// modules/renderer.js
// Три камеры: 'fps' (от первого лица), 'tps' (от третьего), 'top' (сверху).
// Текстуры пола/потолка/стен зависят от биома (biomes.js). Карта и миникарта рисуются
// инкрементально по мере исследования (туман войны).

const VIEW_MODES = ['fps', 'tps', 'top'];
const VIEW_NAMES = { fps: 'от первого лица', tps: 'от третьего лица', top: 'сверху' };

class Renderer {
    constructor(canvas, minimapCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = canvas.width;
        this.H = canvas.height;
        this.minimapCanvas = minimapCanvas;
        this.minimapCtx = minimapCanvas.getContext('2d');
        this.miniScale = Math.floor(minimapCanvas.width / MAP_SIZE);

        this.viewMode = 'fps';

        // Рэйкастер
        this.fov = 1.0;
        this.k = Math.tan(this.fov / 2);
        this.rayCount = 320;
        this.colW = this.W / this.rayCount;
        this.wallUnit = (this.W / 2) / this.k * 0.8;
        this.zBuffer = new Float32Array(this.rayCount);
        this.maxSteps = 48;

        // Буфер пола/потолка (половинное разрешение, растягивается ×2)
        this.fw = this.rayCount;
        this.fh = Math.floor(this.H / 2);
        this.floorCanvas = document.createElement('canvas');
        this.floorCanvas.width = this.fw; this.floorCanvas.height = this.fh;
        this.floorCtx = this.floorCanvas.getContext('2d');
        this.floorImg = this.floorCtx.createImageData(this.fw, this.fh);
        this.floor32 = new Uint32Array(this.floorImg.data.buffer);
        this.rowDist = new Float32Array(this.fh);
        this.rowFog = new Float32Array(this.fh);
        this.rowHorizon = -1;
        this.colRdx = new Float32Array(this.fw);
        this.colRdy = new Float32Array(this.fw);

        this.biome = BIOMES[0];
        this.tex = BiomeTextures.get(this.biome);

        this.explored = new Uint8Array(MAP_SIZE * MAP_SIZE);
        this.mapCanvas = null;
        this.miniStatic = null;
        this.tileTop = 32;
        this.topCam = { x: 0, y: 0, tile: this.tileTop };

        this.heroSprite = SpriteFactory.hero();
        this.drawList = [];
        this.damageNumbers = [];
        this.effects = [];
        this.banner = null;
        this.hint = '';
        this.hud = false;          // HUD на холсте (включается на телефоне)
        this.extras = { allies: [], fairies: [] };
        this.canRaise = false;
        this.floorNum = 1;
        this.time = 0;
    }

    // ---------- Вид ----------
    setView(mode) { this.viewMode = mode; }
    cycleView() {
        const i = VIEW_MODES.indexOf(this.viewMode);
        this.viewMode = VIEW_MODES[(i + 1) % VIEW_MODES.length];
        return this.viewMode;
    }

    // ---------- Уровень: текстуры биома и пустые (тёмные) карты ----------
    setLevel(map, biome) {
        this.biome = biome;
        this.tex = BiomeTextures.get(biome);
        this.explored.fill(0);
        this.effects.length = 0;
        const mk = size => {
            const c = document.createElement('canvas');
            c.width = c.height = MAP_SIZE * size;
            const g = c.getContext('2d');
            g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
            g.imageSmoothingEnabled = false;
            return c;
        };
        this.mapCanvas = mk(this.tileTop);
        this.miniStatic = mk(this.miniScale);
    }

    isExplored(x, y) { return this.explored[y * MAP_SIZE + x] === 1; }

    reveal(map, x, y) {
        const i = y * MAP_SIZE + x;
        if (this.explored[i]) return;
        this.explored[i] = 1;
        this.paintTile(map, x, y);
    }

    // Перерисовать клетку (дверь открылась, решётка опустилась...)
    updateTile(map, x, y) { if (this.explored[y * MAP_SIZE + x]) this.paintTile(map, x, y); }

    paintTile(map, x, y) {
        this.drawTileTo(this.mapCanvas.getContext('2d'), map[y][x], x, y, this.tileTop, false);
        this.drawTileTo(this.miniStatic.getContext('2d'), map[y][x], x, y, this.miniScale, true);
    }

    drawTileTo(g, tile, x, y, size, simple) {
        const px = x * size, py = y * size;
        const t = tile === TILE_SECRET ? TILE_WALL : tile;      // тайник выглядит как стена
        const walls = this.tex.walls;
        if (simple) {
            g.fillStyle = t === TILE_WALL ? '#6a6a6a' : t === TILE_DOOR ? '#a06a2a' : t === TILE_LOCKED ? '#ffd23a'
                        : t === TILE_BARS ? '#8888aa' : t === TILE_OPEN ? '#3a2a18' : '#262626';
            g.fillRect(px, py, size, size);
            return;
        }
        if (t === TILE_FLOOR || t === TILE_OPEN) {
            g.drawImage(this.tex.floorCanvas, 0, 0, 64, 64, px, py, size, size);
            if (t === TILE_OPEN) { g.strokeStyle = '#6b4423'; g.lineWidth = 3; g.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3); }
        } else {
            g.drawImage(walls[t] || walls[TILE_WALL], 0, 0, 64, 64, px, py, size, size);
            if (t === TILE_WALL) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px, py + size - 4, size, 4); }
        }
    }

    // ---------- Эффекты и баннеры ----------
    addEffect(kind, x, y, dur = 0.5, size = 1) {
        this.effects.push({ kind, x, y, birth: this.time, dur, size });
    }

    showBanner(text, color = '#fff', dur = 2.6) {
        this.banner = { text, color, until: this.time + dur, dur };
    }

    // ---------- Главный вызов ----------
    render(player, map, entities, projectiles, exit, time, extras) {
        this.extras = extras || { allies: [], fairies: [] };      // союзники и феи
        this.time = time / 1000;
        this.playerLevel = player.level;
        const ctx = this.ctx;
        if (!map.length || !this.mapCanvas) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, this.W, this.H);
            return;
        }
        if (this.viewMode === 'top') this.renderTopDown(player, map, entities, projectiles, exit);
        else this.render3D(player, map, entities, projectiles, exit);

        if (player.damageFlash > 0) {
            ctx.fillStyle = `rgba(255,0,0,${player.damageFlash * 0.3})`;
            ctx.fillRect(0, 0, this.W, this.H);
        }
        if (player.invuln > 0) { ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.fillRect(0, 0, this.W, this.H); }
        this.renderDamageNumbers(ctx);
        this.renderBanner(ctx);
        if (this.hud) this.drawHUD(ctx, player);
        if (this.hint) {
            ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(this.hint, this.W / 2, this.H - 24);
            ctx.fillStyle = '#ffe9a0'; ctx.fillText(this.hint, this.W / 2, this.H - 24);
        }
    }

    // Полоски HP/маны/опыта и строка статуса прямо на экране — чтобы на телефоне не открывать панель
    drawHUD(ctx, p) {
        const bw = Math.min(300, this.W * 0.46), x = (this.W - bw) / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 3, 5, bw + 6, 52);
        ctx.fillStyle = '#2a0f0f'; ctx.fillRect(x, 8, bw, 15);
        ctx.fillStyle = '#d33'; ctx.fillRect(x, 8, bw * Math.max(0, Math.min(1, p.hp / p.maxHp)), 15);
        if (p.shield > 0) { ctx.fillStyle = 'rgba(130,200,255,0.9)'; ctx.fillRect(x, 8, bw * Math.min(1, p.shield / p.maxHp), 5); }
        ctx.fillStyle = '#0f1630'; ctx.fillRect(x, 26, bw, 9);
        ctx.fillStyle = '#38f'; ctx.fillRect(x, 26, bw * Math.max(0, Math.min(1, p.mana / p.maxMana)), 9);
        ctx.fillStyle = '#332b0a'; ctx.fillRect(x, 38, bw, 4);
        ctx.fillStyle = '#fc3'; ctx.fillRect(x, 38, bw * Math.min(1, p.xp / BALANCE.xpToNext(p.level)), 4);
        ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.fillText(`HP ${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`, this.W / 2, 20);
        ctx.font = '12px Arial';
        const st = Status.icons(p);
        if (st) ctx.fillText(st, this.W / 2 + bw / 2 + 22, 20);
        ctx.fillText(`Этаж ${this.floorNum} · Ур.${p.level} · 💰${p.gold}${p.keys ? ' · 🗝' + p.keys : ''}${p.points + p.skillPoints > 0 ? ' · ⬆' : ''}`, this.W / 2, 53);
    }

    renderBanner(ctx) {
        const b = this.banner;
        if (!b) return;
        const left = b.until - this.time;
        if (left <= 0) { this.banner = null; return; }
        ctx.globalAlpha = Math.max(0, Math.min(1, left * 2, (b.dur - left) * 4 + 0.2));
        ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(b.text, this.W / 2, 110);
        ctx.fillStyle = b.color; ctx.fillText(b.text, this.W / 2, 110);
        ctx.globalAlpha = 1;
    }

    // ---------- 3D (fps / tps) ----------
    isWall(map, x, y) {
        const row = map[Math.floor(y)];
        const t = row ? row[Math.floor(x)] : TILE_WALL;
        return !tilePassable(t);
    }

    getCamera(player, map, tps) {
        const cam = { x: player.x, y: player.y, dir: player.dir, horizon: this.H / 2, camDist: 0 };
        if (!tps) return cam;
        const back = 2.1, side = 0.55;
        const bx = -Math.cos(player.dir) * back + Math.cos(player.dir + Math.PI / 2) * side;
        const by = -Math.sin(player.dir) * back + Math.sin(player.dir + Math.PI / 2) * side;
        let t = 1;
        for (let s = 0.05; s <= 1.0001; s += 0.05) {
            if (this.isWall(map, player.x + bx * s, player.y + by * s)) { t = Math.max(0.12, s - 0.1); break; }
        }
        cam.x = player.x + bx * t;
        cam.y = player.y + by * t;
        cam.camDist = back * t;
        cam.horizon = this.H / 2 - 40;
        return cam;
    }

    render3D(player, map, entities, projectiles, exit) {
        const tps = this.viewMode === 'tps';
        const cam = this.getCamera(player, map, tps);
        this.drawFloorCeiling(cam);
        this.castWalls(cam, map);
        this.drawSprites(cam, player, entities, projectiles, exit, tps);
        if (!tps) this.drawWeapon(this.ctx, player);
    }

    // Текстурированные пол и потолок: «floor casting» в буфер 320x240 и растяжение ×2
    drawFloorCeiling(cam) {
        const fw = this.fw, fh = this.fh, horizon = cam.horizon;
        if (this.rowHorizon !== horizon) {
            for (let y = 0; y < fh; y++) {
                const dy = Math.abs(y * 2 + 1 - horizon);
                const d = this.wallUnit / (2 * Math.max(1, dy));
                this.rowDist[y] = d;
                this.rowFog[y] = Math.min(0.92, d / 9);
            }
            this.rowHorizon = horizon;
        }
        const dirX = Math.cos(cam.dir), dirY = Math.sin(cam.dir);
        const planeX = -dirY * this.k, planeY = dirX * this.k;
        for (let x = 0; x < fw; x++) {
            const cx = 2 * (x + 0.5) / fw - 1;
            this.colRdx[x] = dirX + planeX * cx;
            this.colRdy[x] = dirY + planeY * cx;
        }
        const buf = this.floor32, fog = this.tex.fog, floorTex = this.tex.floor, ceilTex = this.tex.ceil;
        const rdx = this.colRdx, rdy = this.colRdy;
        for (let y = 0; y < fh; y++) {
            const d = this.rowDist[y], f = this.rowFog[y], inv = 1 - f;
            const tex = (y * 2 + 1) > horizon ? floorTex : ceilTex;
            const fr = fog[0] * f, fg = fog[1] * f, fb = fog[2] * f;
            const row = y * fw;
            for (let x = 0; x < fw; x++) {
                const tx = ((cam.x + d * rdx[x]) * 64) & 63, ty = ((cam.y + d * rdy[x]) * 64) & 63;
                const i = ((ty << 6) | tx) << 2;
                buf[row + x] = 0xFF000000 | (((tex[i + 2] * inv + fb) | 0) << 16) | (((tex[i + 1] * inv + fg) | 0) << 8) | ((tex[i] * inv + fr) | 0);
            }
        }
        this.floorCtx.putImageData(this.floorImg, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.floorCanvas, 0, 0, this.W, this.H);
    }

    // DDA-рэйкастинг: проходим по клеткам сетки, текстура — срезом в 1 px
    castWalls(cam, map) {
        const ctx = this.ctx, n = this.rayCount, colW = this.colW;
        const dirX = Math.cos(cam.dir), dirY = Math.sin(cam.dir);
        const planeX = -dirY * this.k, planeY = dirX * this.k;
        const walls = this.tex.walls, fogStyles = this.tex.fogStyles;
        ctx.imageSmoothingEnabled = false;

        for (let i = 0; i < n; i++) {
            const camX = 2 * (i + 0.5) / n - 1;
            const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
            let mapX = Math.floor(cam.x), mapY = Math.floor(cam.y);
            const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
            const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
            let stepX, stepY, sdx, sdy;
            if (rdx < 0) { stepX = -1; sdx = (cam.x - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - cam.x) * ddx; }
            if (rdy < 0) { stepY = -1; sdy = (cam.y - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - cam.y) * ddy; }

            let side = 0, hit = false, guard = 0, tile = TILE_WALL;
            while (!hit && guard++ < this.maxSteps) {
                if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
                else           { sdy += ddy; mapY += stepY; side = 1; }
                const row = map[mapY];
                tile = row ? row[mapX] : TILE_WALL;
                if (tile === undefined) tile = TILE_WALL;
                if (!tilePassable(tile)) hit = true;
            }

            let perp = side === 0 ? sdx - ddx : sdy - ddy;
            if (perp < 0.05) perp = 0.05;
            this.zBuffer[i] = perp;

            let wallX = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx;
            wallX -= Math.floor(wallX);
            let texX = Math.floor(wallX * 64);
            if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = 63 - texX;

            const lineH = this.wallUnit / perp;
            const top = cam.horizon - lineH / 2;
            ctx.drawImage(walls[tile] || walls[TILE_WALL], texX, 0, 1, 64, i * colW, top, colW, lineH);

            const shade = Math.min(0.9, perp / 9 + (side ? 0.18 : 0));
            ctx.fillStyle = fogStyles[Math.round(shade * 32)];
            ctx.fillRect(i * colW, top, colW, lineH);
        }
    }

    // ---------- Спрайты ----------
    drawSprites(cam, player, entities, projectiles, exit, tps) {
        const ctx = this.ctx, list = this.drawList;
        list.length = 0;
        const dirX = Math.cos(cam.dir), dirY = Math.sin(cam.dir);
        const planeX = -dirY * this.k, planeY = dirX * this.k;
        const invDet = 1 / (planeX * dirY - dirX * planeY);
        const t = this.time;
        const icon = k => SpriteFactory.icon(k);

        const add = (obj, spr, h, lift, extra) => {
            const sx = obj.x - cam.x, sy = obj.y - cam.y;
            const tx = invDet * (dirY * sx - dirX * sy);
            const depth = invDet * (-planeY * sx + planeX * sy);
            if (depth < 0.15 || depth > 16) return;
            if (Math.abs(tx / depth) > 1.5) return;
            list.push({ obj, spr, h, lift, depth, screenX: this.W / 2 * (1 + tx / depth), extra });
        };

        for (const e of entities) {
            switch (e.type) {
                case 'enemy':
                    if (!e.alive && e.corpse <= 0) break;
                    add(e, e.sprite, e.scale, e.moving ? 0 : 0.02 * Math.sin(t * 3 + e.phase), (!e.alive && e.raisable) ? { squash: 0.45 } : null); break;
                case 'trader': case 'smith': add(e, e.sprite, 0.75, 0, null); break;
                case 'shrine': add(e, icon(e.used ? 'altar_used' : 'shrine_' + e.god), 0.7, 0, null); break;
                case 'item': add(e, icon(SpriteFactory.itemIconKind(e)), 0.24, 0.1 + 0.04 * Math.sin(t * 3 + e.x * 3), null); break;
                case 'chest': add(e, icon(e.opened ? 'chest_open' : 'chest'), 0.4, 0, null); break;
                case 'altar': add(e, icon(e.used ? 'altar_used' : 'altar'), 0.7, 0, null); break;
                case 'trap':
                    if (e.revealed) add(e, icon(e.armed ? (e.kind === 'alarm' ? 'alarm' : 'spikes') : 'spikes_off'), 0.3, 0, { noShadow: true });
                    break;
            }
        }
        add(exit, icon('portal'), 0.85 + 0.05 * Math.sin(t * 4), 0, { noShadow: true });
        for (const p of projectiles) add(p, icon(p.icon || (p.owner === 'player' ? 'fireball' : 'orb')), 0.22, 0.35, { noShadow: true });
        for (const a of this.extras.allies) add(a, a.sprite, a.scale, a.moving ? 0 : 0.02 * Math.sin(t * 3 + a.phase), null);
        for (const f of this.extras.fairies) add(f, icon(FAIRY_ROLES[f.role].icon), 0.2, 0.5 + 0.06 * Math.sin(t * 4 + f.phase), { noShadow: true });
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i], life = 1 - (t - fx.birth) / fx.dur;
            if (life <= 0) { this.effects.splice(i, 1); continue; }
            add(fx, icon(fx.kind), fx.size * (0.4 + (1 - life) * 1.1), 0.25, { noShadow: true, alpha: life });
        }
        if (tps && cam.camDist > 0.6) {
            const bob = player.moving ? Math.abs(Math.sin(player.walkBob)) * 0.03 : 0;
            add(player, this.heroSprite, 0.7 * (1 + player.swingAnim * 0.08), bob, { hero: true });
        }

        list.sort((a, b) => b.depth - a.depth);
        ctx.imageSmoothingEnabled = false;
        for (const s of list) this.drawBillboard(ctx, cam, s, player);
    }

    // Кадр анимации: у ходящих врагов/героя 4 кадра шага, у остальных один
    pickImage(spr, e) {
        const flashing = e.flash > 0;
        const set = flashing ? spr.flashFrames : spr.frames;
        if (!set) return flashing && spr.flash ? spr.flash : spr.canvas;
        let idx = 0;
        if (e.moving) idx = Math.floor((e.type === 'enemy' || e.type === 'ally') ? e.anim : (e.walkBob || 0) * 1.3) & 3;
        return set[idx];
    }

    drawBillboard(ctx, cam, s, player) {
        const wallH = this.wallUnit / s.depth;
        const size = wallH * s.h;
        const floorY = cam.horizon + wallH / 2;
        const bottom = floorY - wallH * s.lift;
        const squash = (s.extra && s.extra.squash) || 1, drawH = size * squash;
        const dx = s.screenX - size / 2, dy = bottom - drawH;
        const n = this.rayCount, colW = this.colW;

        const midCol = Math.max(0, Math.min(n - 1, Math.floor(s.screenX / colW)));
        const midVisible = s.depth < this.zBuffer[midCol];

        if (midVisible && !(s.extra && s.extra.noShadow)) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(s.screenX, floorY, size * 0.28, size * 0.06, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const e = s.obj;
        const dead = e.type === 'enemy' && !e.alive;
        const img = this.pickImage(s.spr, e);
        let alpha = s.spr.ghostly ? 0.7 : 1;
        if (dead) alpha *= e.raisable ? Math.min(1, e.corpse) * 0.9 : Math.max(0, e.corpse / 0.4);
        if (s.extra && s.extra.alpha !== undefined) alpha *= s.extra.alpha;
        ctx.globalAlpha = alpha;

        // Рисуем только столбцы, не закрытые стеной (по z-буферу), «пробегами»
        const c0 = Math.max(0, Math.floor(dx / colW)), c1 = Math.min(n - 1, Math.floor((dx + size) / colW));
        let run = -1;
        for (let c = c0; c <= c1 + 1; c++) {
            const vis = c <= c1 && s.depth < this.zBuffer[c];
            if (vis && run < 0) run = c;
            else if (!vis && run >= 0) {
                const px0 = Math.max(run * colW, dx), px1 = Math.min(c * colW, dx + size);
                if (px1 > px0) {
                    ctx.drawImage(img, (px0 - dx) / size * SPRITE_N, 0, (px1 - px0) / size * SPRITE_N, SPRITE_N,
                                  px0, dy, px1 - px0, drawH);
                }
                run = -1;
            }
        }
        ctx.globalAlpha = 1;

        if (!midVisible) return;
        if (dead && e.raisable && this.canRaise && s.depth < 9) {          // подсказка: тело можно поднять
            ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText('☠ T', s.screenX, dy - 6); ctx.fillStyle = '#9fe8b4'; ctx.fillText('☠ T', s.screenX, dy - 6);
        }
        if (e.type === 'ally' && s.depth < 13) {
            let ty = dy - 4;
            this.drawHPBar(ctx, e, dx + size * 0.15, ty - 6, size * 0.7); ty -= 14;
            this.drawAllyTag(ctx, e, s.screenX, ty, Math.max(11, Math.min(18, Math.round(size * 0.16))));
        }
        if (e.type === 'enemy' && e.alive && s.depth < 13) {
            let ty = dy - 4;
            if (e.hp < e.maxHp || e.boss) { this.drawHPBar(ctx, e, dx + size * 0.15, ty - 6, size * 0.7); ty -= 14; }
            this.drawTags(ctx, e, s.screenX, ty, Math.max(11, Math.min(18, Math.round(size * 0.16))));
        }
        if (s.extra && s.extra.hero && player.swingAnim > 0) {
            ctx.strokeStyle = `rgba(255,255,255,${player.swingAnim})`;
            ctx.lineWidth = Math.max(3, size * 0.05);
            ctx.beginPath();
            ctx.arc(s.screenX + size * 0.15, bottom - size * 0.55, size * 0.55, -1.4, -0.2 + (1 - player.swingAnim) * 0.8);
            ctx.stroke();
        }
    }

    // Метка союзника: уровень (бирюзовый) и значок нежити/командования
    drawAllyTag(ctx, a, cx, ty, fs) {
        ctx.textAlign = 'center'; ctx.font = `bold ${fs}px Arial`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const txt = `${a.commandT > 0 ? '⚔ ' : '💀 '}Ур.${a.level}`;
        ctx.strokeText(txt, cx, ty); ctx.fillStyle = '#7fe8ff'; ctx.fillText(txt, cx, ty);
    }

    // Цвет метки уровня: зелёный — слабее вас, жёлтый — равный, красный — сильнее
    levelColor(e) {
        const d = e.level - this.playerLevel;
        return d <= -2 ? '#6ee86e' : d <= 1 ? '#ffd84a' : '#ff5a5a';
    }

    // Уровень, значки свойств/состояний и «!» при замахе. ty — нижняя точка, возвращает новую верхнюю
    drawTags(ctx, e, cx, ty, fs) {
        ctx.textAlign = 'center';
        ctx.font = `bold ${fs}px Arial`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const txt = `Ур.${e.level}`;
        ctx.strokeText(txt, cx, ty);
        ctx.fillStyle = this.levelColor(e);
        ctx.fillText(txt, cx, ty);
        ty -= fs + 2;
        const icons = e.traits.map(k => TRAITS[k].icon).join('') + Status.icons(e);
        if (icons) { ctx.font = `${fs}px Arial`; ctx.fillStyle = '#fff'; ctx.fillText(icons, cx, ty); ty -= fs + 2; }
        if (e.windup > 0) { ctx.fillStyle = '#f33'; ctx.font = `bold ${Math.round(fs * 1.5)}px Arial`; ctx.fillText('!', cx, ty); ty -= fs + 2; }
        return ty;
    }

    drawHPBar(ctx, enemy, x, y, w) {
        const h = 5, p = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = '#222'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = p > 0.5 ? '#4c4' : p > 0.25 ? '#ec3' : '#e33';
        ctx.fillRect(x, y, w * p, h);
        ctx.strokeStyle = enemy.elite || enemy.boss ? '#fc3' : '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    }

    // Оружие в руке (вид от первого лица): вид зависит от типа, свечение — от редкости
    drawWeapon(ctx, player) {
        const w = player.weapon, t = this.time;
        const bob = player.moving ? Math.sin(player.walkBob) * 8 : 0;
        const sw = Math.sin(player.swingAnim * Math.PI);          // 0..1..0 за время удара
        const idle = Math.sin(t * 1.8) * 2;
        const kind = w.fist ? 'fist' : /^Топор/.test(w.name) ? 'axe' : /^Кинжал/.test(w.name) ? 'dagger'
                   : /^Посох/.test(w.name) ? 'staff' : 'sword';

        ctx.save();
        ctx.translate(470 - sw * 110, 490 - bob + idle + sw * 30);
        ctx.rotate(0.28 - sw * 1.15);
        if (w.color && w.rarity && w.rarity !== 'common') { ctx.shadowColor = w.color; ctx.shadowBlur = 14; }

        const metal = (x0, x1) => {
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, '#8d97a6'); g.addColorStop(0.45, '#eef3fa'); g.addColorStop(1, '#78818f');
            return g;
        };
        const wood = (x0, x1) => {
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, '#4a2e17'); g.addColorStop(0.5, '#8a5a30'); g.addColorStop(1, '#4a2e17');
            return g;
        };

        if (kind === 'fist') {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#e0ac69';
            ctx.beginPath(); ctx.arc(0, -60, 44, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#c98f50';
            for (let i = -2; i <= 1; i++) ctx.fillRect(i * 17 + 4, -88, 3, 22);
        } else if (kind === 'sword' || kind === 'dagger') {
            const len = kind === 'sword' ? 230 : 130, wd = kind === 'sword' ? 15 : 11;
            ctx.fillStyle = metal(-wd, wd);
            ctx.beginPath(); ctx.moveTo(-wd, 0); ctx.lineTo(-wd, -len + 26); ctx.lineTo(0, -len); ctx.lineTo(wd, -len + 26); ctx.lineTo(wd, 0); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-2, -len + 34, 4, len - 40);       // долы
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#d9a400'; ctx.fillRect(-wd - 22, -2, (wd + 22) * 2, 12);          // гарда
            ctx.fillStyle = '#ffd34a'; ctx.fillRect(-wd - 22, -2, (wd + 22) * 2, 3);
            ctx.fillStyle = wood(-7, 7); ctx.fillRect(-7, 10, 14, 64);                          // рукоять
            ctx.fillStyle = '#2a1a0c'; for (let y = 18; y < 70; y += 11) ctx.fillRect(-7, y, 14, 2);
            ctx.fillStyle = '#d9a400'; ctx.beginPath(); ctx.arc(0, 78, 9, 0, Math.PI * 2); ctx.fill();
        } else if (kind === 'axe') {
            ctx.shadowBlur = 0;
            ctx.fillStyle = wood(-7, 7); ctx.fillRect(-7, -190, 14, 270);
            if (w.rarity && w.rarity !== 'common') { ctx.shadowColor = w.color; ctx.shadowBlur = 14; }
            ctx.fillStyle = metal(0, 80);
            ctx.beginPath(); ctx.moveTo(7, -196); ctx.lineTo(84, -226); ctx.quadraticCurveTo(104, -150, 84, -86); ctx.lineTo(7, -120); ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#555'; ctx.fillRect(-9, -200, 18, 14); ctx.fillRect(-9, -128, 18, 14);
        } else if (kind === 'staff') {
            ctx.shadowBlur = 0;
            ctx.fillStyle = wood(-6, 6); ctx.fillRect(-6, -210, 12, 290);
            const orb = ctx.createRadialGradient(0, -232, 2, 0, -232, 26);
            orb.addColorStop(0, '#ffffff'); orb.addColorStop(0.4, w.color || '#8cf'); orb.addColorStop(1, 'rgba(80,140,255,0)');
            ctx.fillStyle = orb; ctx.beginPath(); ctx.arc(0, -232, 26 + Math.sin(t * 4) * 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#c9a63a'; ctx.fillRect(-10, -214, 20, 8);
        }
        ctx.restore();
    }

    // ---------- Вид сверху ----------
    renderTopDown(player, map, entities, projectiles, exit) {
        const ctx = this.ctx, W = this.W, H = this.H, T = this.tileTop, t = this.time;
        const mapPx = MAP_SIZE * T;
        const camX = Math.max(0, Math.min(mapPx - W, player.x * T - W / 2));
        const camY = Math.max(0, Math.min(mapPx - H, player.y * T - H / 2));
        this.topCam.x = camX; this.topCam.y = camY; this.topCam.tile = T;
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const vw = Math.min(W, mapPx), vh = Math.min(H, mapPx);
        ctx.drawImage(this.mapCanvas, camX, camY, vw, vh, 0, 0, vw, vh);

        const list = this.drawList;
        list.length = 0;
        const ex = (x, y) => this.isExplored(Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(x))), Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(y))));
        const add = (obj, spr, size, extra) => {
            const x = obj.x * T - camX, y = obj.y * T - camY;
            if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
            if (!ex(obj.x, obj.y) && !(extra && extra.always)) return;
            list.push({ obj, spr, size, x, y, extra });
        };
        const icon = k => SpriteFactory.icon(k);
        add(exit, icon('portal'), T * (1.2 + 0.1 * Math.sin(t * 4)), { flat: true });
        for (const e of entities) {
            switch (e.type) {
                case 'enemy': if (e.alive || e.corpse > 0) add(e, e.sprite, T * 1.5 * e.scale / 0.7 * 0.8, null); break;
                case 'trader': case 'smith': add(e, e.sprite, T * 1.3, null); break;
                case 'shrine': add(e, icon(e.used ? 'altar_used' : 'shrine_' + e.god), T * 1.3, null); break;
                case 'item': add(e, icon(SpriteFactory.itemIconKind(e)), T * 0.7, { flat: true }); break;
                case 'chest': add(e, icon(e.opened ? 'chest_open' : 'chest'), T * 0.95, { flat: true }); break;
                case 'altar': add(e, icon(e.used ? 'altar_used' : 'altar'), T * 1.3, null); break;
                case 'trap': if (e.revealed) add(e, icon(e.armed ? (e.kind === 'alarm' ? 'alarm' : 'spikes') : 'spikes_off'), T * 0.9, { flat: true }); break;
            }
        }
        for (const p of projectiles) add(p, icon(p.icon || (p.owner === 'player' ? 'fireball' : 'orb')), T * 0.6, { flat: true, always: true });
        for (const a of this.extras.allies) add(a, a.sprite, T * 1.5 * a.scale / 0.7 * 0.8, { always: true });
        for (const f of this.extras.fairies) add(f, icon(FAIRY_ROLES[f.role].icon), T * 0.7, { flat: true, always: true });
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i], life = 1 - (t - fx.birth) / fx.dur;
            if (life <= 0) { this.effects.splice(i, 1); continue; }
            add(fx, icon(fx.kind), T * fx.size * 2.2 * (0.3 + (1 - life)), { flat: true, always: true, alpha: life });
        }
        list.sort((a, b) => a.y - b.y);

        for (const s of list) {
            const e = s.obj;
            const dead = e.type === 'enemy' && !e.alive;
            const img = this.pickImage(s.spr, e);
            const flat = s.extra && s.extra.flat;
            const feetY = flat ? s.y + s.size * 0.5 : s.y + s.size * 0.4;
            if (!flat) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath(); ctx.ellipse(s.x, feetY - 2, s.size * 0.3, s.size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
            }
            const sq = dead && e.raisable ? 0.5 : 1;
            let a = (s.spr.ghostly ? 0.7 : 1) * (dead ? (e.raisable ? Math.min(1, e.corpse) * 0.9 : Math.max(0, e.corpse / 0.4)) : 1);
            if (s.extra && s.extra.alpha !== undefined) a *= s.extra.alpha;
            ctx.globalAlpha = a;
            ctx.drawImage(img, s.x - s.size / 2, feetY - s.size * sq, s.size, s.size * sq);
            ctx.globalAlpha = 1;
            if (dead && e.raisable && this.canRaise) { ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fe8b4'; ctx.fillText('☠ T', s.x, feetY - s.size * sq - 4); }
            if (e.type === 'ally') {
                let ty = feetY - s.size - 4;
                this.drawHPBar(ctx, e, s.x - s.size * 0.35, ty - 6, s.size * 0.7); ty -= 14;
                this.drawAllyTag(ctx, e, s.x, ty, 12);
            }
            if (e.type === 'enemy' && e.alive) {
                let ty = feetY - s.size - 4;
                if (e.hp < e.maxHp || e.boss) { this.drawHPBar(ctx, e, s.x - s.size * 0.35, ty - 6, s.size * 0.7); ty -= 14; }
                this.drawTags(ctx, e, s.x, ty, 12);
            }
        }

        // «Свет факела»
        const px = player.x * T - camX, py = player.y * T - camY;
        const fog = ctx.createRadialGradient(px, py, T * 3, px, py, T * 8.5);
        fog.addColorStop(0, 'rgba(0,0,0,0)'); fog.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(255,240,180,0.08)';
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.arc(px, py, T * 4, player.dir - 0.5, player.dir + 0.5); ctx.closePath(); ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(px, py + T * 0.5, T * 0.4, T * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        const hs = T * 1.5, hb = player.moving ? Math.abs(Math.sin(player.walkBob)) * 2 : 0;
        const hero = this.heroSprite;
        const hImg = player.moving ? hero.frames[Math.floor(player.walkBob * 1.3) & 3] : hero.canvas;
        ctx.drawImage(hImg, px - hs / 2, py + T * 0.55 - hs - hb, hs, hs);
        ctx.strokeStyle = 'rgba(120,255,120,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(player.dir) * T * 0.9, py + Math.sin(player.dir) * T * 0.9);
        ctx.lineTo(px + Math.cos(player.dir) * T * 1.5, py + Math.sin(player.dir) * T * 1.5);
        ctx.stroke();
        if (player.swingAnim > 0) {
            ctx.strokeStyle = `rgba(255,255,255,${player.swingAnim})`; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(px, py, T * 1.3, player.dir - 0.85, player.dir + 0.85); ctx.stroke();
        }
    }

    // ---------- Миникарта (только исследованное) ----------
    renderMinimap(player, entities, exit) {
        if (!this.miniStatic) return;
        const ctx = this.minimapCtx, s = this.miniScale;
        ctx.drawImage(this.miniStatic, 0, 0);
        if (this.isExplored(Math.floor(exit.x), Math.floor(exit.y))) { ctx.fillStyle = '#f0f'; ctx.fillRect(exit.x * s - 3, exit.y * s - 3, 6, 6); }
        for (const e of entities) {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (e.type === 'enemy' && e.alive && d < 7) { ctx.fillStyle = e.elite || e.boss ? '#fc3' : '#f55'; ctx.fillRect(e.x * s - 2, e.y * s - 2, 4, 4); }
            else if ((e.type === 'trader' || e.type === 'smith') && this.isExplored(Math.floor(e.x), Math.floor(e.y))) { ctx.fillStyle = '#f80'; ctx.fillRect(e.x * s - 2, e.y * s - 2, 5, 5); }
            else if (((e.type === 'chest' && !e.opened) || ((e.type === 'altar' || e.type === 'shrine') && !e.used)) && this.isExplored(Math.floor(e.x), Math.floor(e.y))) { ctx.fillStyle = '#4df'; ctx.fillRect(e.x * s - 2, e.y * s - 2, 4, 4); }
        }
        ctx.fillStyle = '#7fe0a0';
        for (const a of this.extras.allies) ctx.fillRect(a.x * s - 2, a.y * s - 2, 4, 4);
        for (const f of this.extras.fairies) { ctx.fillStyle = FAIRY_ROLES[f.role].color; ctx.fillRect(f.x * s - 1, f.y * s - 1, 3, 3); }
        ctx.fillStyle = '#0f0';
        ctx.beginPath(); ctx.arc(player.x * s, player.y * s, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0f0'; ctx.beginPath();
        ctx.moveTo(player.x * s, player.y * s);
        ctx.lineTo(player.x * s + Math.cos(player.dir) * 8, player.y * s + Math.sin(player.dir) * 8);
        ctx.stroke();
    }

    // ---------- Числа урона ----------
    addDamageNumber(x, y, damage, isCrit = false, color = null) {
        this.damageNumbers.push({ x: x + (Math.random() - 0.5) * 50, y, damage, isCrit, color, life: 1, offsetY: 0 });
    }

    renderDamageNumbers(ctx) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            dn.life -= 0.02; dn.offsetY -= 1;
            if (dn.life <= 0) { this.damageNumbers.splice(i, 1); continue; }
            ctx.globalAlpha = dn.life;
            ctx.fillStyle = dn.color || (dn.isCrit ? '#ff0' : '#fff');
            ctx.font = dn.isCrit ? 'bold 24px Arial' : '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(dn.damage, dn.x, dn.y + dn.offsetY);
            ctx.globalAlpha = 1;
        }
    }
}
