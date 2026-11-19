// modules/audio.js — звук через WebAudio, без единого файла: всё синтезируется на лету.
// Звук включается после первого клика (требование браузеров). Клавиша N — вкл/выкл.

class AudioFX {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.noiseBuf = null;
        this.ambient = null;
        this.volume = 0.5;
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('rogue_sound')); } catch (e) {}
        this.enabled = saved !== false;
        this.lastPlay = {};
    }

    init() {
        try {
            if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
            const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.enabled ? this.volume : 0;
            this.master.connect(this.ctx.destination);
            const len = this.ctx.sampleRate;
            this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { this.ctx = null; }
    }

    toggle() {
        this.enabled = !this.enabled;
        try { localStorage.setItem('rogue_sound', JSON.stringify(this.enabled)); } catch (e) {}
        if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
        return this.enabled;
    }

    tone(freq, dur, o = {}) {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime + (o.delay || 0);
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
        const v = (o.vol === undefined ? 0.2 : o.vol);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(t0); osc.stop(t0 + dur + 0.05);
    }

    noise(dur, o = {}) {
        if (!this.ctx || !this.noiseBuf) return;
        const t0 = this.ctx.currentTime + (o.delay || 0);
        const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
        const f = this.ctx.createBiquadFilter();
        f.type = o.type || 'lowpass';
        f.frequency.setValueAtTime(o.freq || 1000, t0);
        if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.slide), t0 + dur);
        f.Q.value = o.q || 1;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(o.vol === undefined ? 0.25 : o.vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    }

    // vol — громкость (0..1), используйте меньше для далёких источников
    play(name, vol = 1) {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        if (this.lastPlay[name] && now - this.lastPlay[name] < 0.04) return;   // защита от «каши»
        this.lastPlay[name] = now;
        const v = x => x * vol;
        switch (name) {
            case 'swing':   this.noise(0.12, { type: 'highpass', freq: 800, slide: 3000, vol: v(0.12) }); break;
            case 'hit':     this.tone(220, 0.1, { type: 'sawtooth', slide: 70, vol: v(0.22) }); this.noise(0.08, { freq: 1800, vol: v(0.2) }); break;
            case 'crit':    this.tone(260, 0.14, { type: 'sawtooth', slide: 60, vol: v(0.26) }); this.tone(1200, 0.18, { type: 'triangle', slide: 1800, vol: v(0.14), delay: 0.02 }); this.noise(0.1, { freq: 2600, vol: v(0.2) }); break;
            case 'kill':    this.tone(300, 0.25, { type: 'square', slide: 60, vol: v(0.16) }); break;
            case 'hurt':    this.tone(150, 0.18, { type: 'square', slide: 50, vol: v(0.28) }); this.noise(0.12, { freq: 500, vol: v(0.2) }); break;
            case 'dodge':   this.noise(0.14, { type: 'bandpass', freq: 1500, slide: 4000, vol: v(0.12) }); break;
            case 'pickup':  this.tone(660, 0.08, { type: 'sine', vol: v(0.2) }); this.tone(990, 0.12, { type: 'sine', vol: v(0.2), delay: 0.07 }); break;
            case 'coin':    this.tone(1320, 0.06, { type: 'square', vol: v(0.1) }); this.tone(1760, 0.1, { type: 'square', vol: v(0.1), delay: 0.05 }); break;
            case 'door':    this.noise(0.25, { freq: 400, slide: 150, vol: v(0.25) }); this.tone(90, 0.25, { type: 'sawtooth', slide: 60, vol: v(0.1) }); break;
            case 'locked':  this.tone(120, 0.06, { type: 'square', vol: v(0.2) }); this.tone(100, 0.08, { type: 'square', vol: v(0.2), delay: 0.1 }); break;
            case 'unlock':  this.tone(500, 0.06, { type: 'square', vol: v(0.15) }); this.tone(800, 0.1, { type: 'square', vol: v(0.15), delay: 0.08 }); this.noise(0.2, { freq: 500, slide: 200, vol: v(0.2), delay: 0.12 }); break;
            case 'spell':   this.noise(0.3, { type: 'bandpass', freq: 600, slide: 2400, q: 2, vol: v(0.2) }); this.tone(300, 0.3, { type: 'sine', slide: 900, vol: v(0.15) }); break;
            case 'boom':    this.noise(0.55, { freq: 900, slide: 80, vol: v(0.5) }); this.tone(90, 0.45, { type: 'sawtooth', slide: 28, vol: v(0.3) }); break;
            case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: v(0.2), delay: i * 0.09 })); break;
            case 'descend': this.tone(500, 0.5, { type: 'sine', slide: 120, vol: v(0.2) }); this.noise(0.5, { freq: 1200, slide: 100, vol: v(0.12) }); break;
            case 'altar':   [196, 247, 294].forEach(f => this.tone(f, 0.9, { type: 'sine', vol: v(0.13) })); break;
            case 'curse':   this.tone(110, 0.8, { type: 'sawtooth', slide: 55, vol: v(0.2) }); this.tone(116, 0.8, { type: 'sawtooth', slide: 58, vol: v(0.2) }); break;
            case 'trap':    this.tone(90, 0.05, { type: 'square', vol: v(0.3) }); this.noise(0.2, { type: 'highpass', freq: 1800, vol: v(0.3) }); break;
            case 'alarm':   for (let i = 0; i < 4; i++) this.tone(i % 2 ? 700 : 900, 0.12, { type: 'square', vol: v(0.15), delay: i * 0.14 }); break;
            case 'step':    this.noise(0.05, { freq: 300, vol: v(0.07) }); break;
            case 'ui':      this.tone(800, 0.04, { type: 'square', vol: v(0.08) }); break;
            case 'drink':   for (let i = 0; i < 3; i++) this.tone(300 + i * 90, 0.07, { type: 'sine', vol: v(0.15), delay: i * 0.07 }); break;
            case 'summon':  this.tone(200, 0.5, { type: 'sine', slide: 400, vol: v(0.18) }); this.tone(206, 0.5, { type: 'sine', slide: 410, vol: v(0.18) }); break;
            case 'dash':    this.noise(0.2, { type: 'bandpass', freq: 500, slide: 3000, vol: v(0.2) }); break;
            case 'nova':    this.noise(0.45, { type: 'bandpass', freq: 3000, slide: 300, q: 3, vol: v(0.25) }); this.tone(900, 0.4, { type: 'triangle', slide: 200, vol: v(0.15) }); break;
            case 'mimic':   this.tone(180, 0.2, { type: 'sawtooth', slide: 400, vol: v(0.25) }); this.noise(0.25, { freq: 700, vol: v(0.25) }); break;
            case 'death':   this.tone(400, 1.2, { type: 'sawtooth', slide: 40, vol: v(0.25) }); this.noise(1.0, { freq: 800, slide: 60, vol: v(0.2) }); break;
            case 'arena':   this.tone(110, 0.6, { type: 'sawtooth', vol: v(0.2) }); this.tone(165, 0.6, { type: 'sawtooth', vol: v(0.15) }); this.noise(0.5, { freq: 300, vol: v(0.2) }); break;
        }
    }

    // Тихий «гул» подземелья: два расстроенных осциллятора + медленная модуляция. Тон зависит от биома.
    startAmbient(biome) {
        this.stopAmbient();
        if (!this.ctx) return;
        const c = this.ctx, f = biome.hum || 55;
        const g = c.createGain(); g.gain.value = 0.05;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
        const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
        o1.type = 'sawtooth'; o1.frequency.value = f;
        o2.type = 'sawtooth'; o2.frequency.value = f * 1.5 + 0.7;
        lfo.frequency.value = 0.12; lg.gain.value = 80;
        lfo.connect(lg); lg.connect(lp.frequency);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
        o1.start(); o2.start(); lfo.start();
        this.ambient = { stop: () => { try { o1.stop(); o2.stop(); lfo.stop(); } catch (e) {} } };
    }

    stopAmbient() { if (this.ambient) { this.ambient.stop(); this.ambient = null; } }
}
