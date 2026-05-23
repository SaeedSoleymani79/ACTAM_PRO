// --- WEBSOCKET CLIENT CLASS ---
class AudioClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.dot = document.getElementById('wsDot');
        this.connect();
    }
    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.addEventListener('open', () => { if (this.dot) this.dot.className = 'ws-dot ok'; });
        this.ws.addEventListener('close', () => {
            if (this.dot) this.dot.className = 'ws-dot err';
            setTimeout(() => this.connect(), 2500);
        });
        this.ws.addEventListener('error', () => {});
    }
    send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }
}

// --- SEQUENCER CLASS ---
class Sequencer {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.seqInterval = null;
        this.currentStep = 0;
        this.isPlaying = false;
        this.isRecording = false;
        this.clickEnabled = true; 
        
        this.initDOM();
    }
    
    initDOM() {
        this.bpmInput = document.getElementById('bpmInput');
        this.timeSignature = document.getElementById('timeSignature');
        this.visualizer = document.getElementById('seqVisualizer');
        this.btnPlay = document.getElementById('btnPlay');
        this.btnRec = document.getElementById('btnRec');
        this.btnClick = document.getElementById('btnClick');
        this.updateVisualizer();
    }
    
    playClick(isAccent) {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isAccent ? 1200 : 800, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.1);
    }
    
    updateVisualizer() {
        const beats = parseInt(this.timeSignature.value.split('/')[0]);
        this.visualizer.innerHTML = '';
        for (let i = 0; i < beats; i++) {
            const dot = document.createElement('div');
            dot.className = 'beat-dot';
            dot.id = 'beat-' + i;
            this.visualizer.appendChild(dot);
        }
    }
    
    toggleClick() {
        this.clickEnabled = !this.clickEnabled;
        if (this.btnClick) {
            this.btnClick.classList.toggle('active-click', this.clickEnabled);
        }
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.btnPlay.classList.add('active-play');
            this.btnPlay.textContent = '⏹';
            this.currentStep = 0;
            this.scheduleNextBeat();
        } else {
            this.btnPlay.classList.remove('active-play');
            this.btnPlay.textContent = '▶';
            clearTimeout(this.seqInterval);
            document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active', 'active-accent'));
        }
    }
    
    toggleRecord() {
        this.isRecording = !this.isRecording;
        this.btnRec.classList.toggle('active-rec', this.isRecording);
    }
    
    scheduleNextBeat() {
        if (!this.isPlaying) return;
        const bpm = parseInt(this.bpmInput.value) || 120;
        const beats = parseInt(this.timeSignature.value.split('/')[0]);
        const msPerBeat = (60 / bpm) * 1000;

        document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active', 'active-accent'));
        const activeDot = document.getElementById('beat-' + this.currentStep);
        if (activeDot) activeDot.classList.add(this.currentStep === 0 ? 'active-accent' : 'active');

        if (this.clickEnabled) this.playClick(this.currentStep === 0);
        
        this.currentStep = (this.currentStep + 1) % beats;
        this.seqInterval = setTimeout(() => this.scheduleNextBeat(), msPerBeat);
    }
}

// --- MAIN APPLICATION CONTROLLER ---
class AppController {
    constructor() {
        this.client = new AudioClient('ws://localhost:8765');
        this.sequencer = new Sequencer();
        this.isPlayable = false;
        this.activeVst = 'piano';
        
        this.activeSet = new Set();
        this.heldKeys = new Set();
        this.octaveShift = 0;
        this.playedNotes = new Map(); 
        
        // Chord Mode State
        this.keyboardChordMode = false;
        this.activeChords = new Map();
        
        this.initSplash();
        this.initKeyboard();
        this.initFretboard(); 
        this.initChordPads();
        this.initEventListeners();
        
        window.enterInstrument = this.enterInstrument.bind(this);
        window.goMenu = this.goMenu.bind(this);
        window.togglePlay = () => this.sequencer.togglePlay();
        window.updateSequencer = () => this.sequencer.updateVisualizer();
        window.toggleFX = this.toggleFX.bind(this);
        window.changeOctave = this.changeOctave.bind(this);
        window.toggleClick = () => this.sequencer.toggleClick();
        
        window.quitApp = () => {
            this.client.send({ type: 'quit' });
            document.body.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
                    <h1 style="color:#ff5555; font-size:48px; letter-spacing:4px;">🔌 SYSTEM OFFLINE</h1>
                    <p style="color:#888; font-size:18px;">The audio server has been successfully shut down.</p>
                </div>
            `;
        };
        
        window.toggleRecord = () => {
            this.sequencer.toggleRecord();
            const subEl = document.getElementById('lcdSub');
            const formatSelect = document.getElementById('recFormat');
            const format = formatSelect ? formatSelect.value : 'wav';
            
            if (this.sequencer.isRecording) {
                this.client.send({ type: 'start_recording', format: format });
                if (subEl) { subEl.textContent = `• REC ${format.toUpperCase()} •`; subEl.style.color = '#ff4455'; }
            } else {
                this.client.send({ type: 'stop_recording' });
                this.updateDisplay(); 
                if (subEl) subEl.style.color = ''; 
            }
        };
    }

    // --- GUITAR UI METHODS ---
    initFretboard() {
        const fretboard = document.getElementById('fretboard');
        if (!fretboard) return;
        
        const strings = [64, 59, 55, 50, 45, 40]; // High E to Low E
        const numFrets = 15; 
        const singleMarkers = [3, 5, 7, 9, 15]; 

        strings.forEach((openMidi, stringIdx) => {
            const stringEl = document.createElement('div');
            stringEl.className = 'guitar-string';
            stringEl.style.setProperty('--string-thickness', (1 + (stringIdx * 0.4)) + 'px');

            for (let fret = 0; fret <= numFrets; fret++) {
                const fretEl = document.createElement('div');
                fretEl.className = `fret fret-${fret}`;
                
                if (fret > 0) {
                    if (singleMarkers.includes(fret) && stringIdx === 2) {
                        const marker = document.createElement('div');
                        marker.className = 'fret-marker';
                        marker.style.top = '100%'; 
                        fretEl.appendChild(marker);
                    }
                    if (fret === 12 && (stringIdx === 1 || stringIdx === 3)) {
                        const marker = document.createElement('div');
                        marker.className = 'fret-marker';
                        marker.style.top = '100%';
                        fretEl.appendChild(marker);
                    }
                }

                const currentMidi = openMidi + fret;
                const dot = document.createElement('div');
                dot.className = 'note-dot';
                dot.dataset.midi = currentMidi;
                dot.dataset.string = stringIdx; // Essential for realistic chords
                dot.dataset.fret = fret;        // Essential for realistic chords
                fretEl.appendChild(dot);
                
                fretEl.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const baseMidiToPlay = currentMidi - (this.octaveShift * 12);
                    this.noteOn(baseMidiToPlay);
                    this.playedNotes.set('fret_' + currentMidi, currentMidi); 
                });

                stringEl.appendChild(fretEl);
            }
            fretboard.appendChild(stringEl);
        });
    }

    updateFretboard(actualMidi, isOn) {
        const dots = document.querySelectorAll(`.note-dot[data-midi="${actualMidi}"]`);
        dots.forEach(dot => {
            if (isOn) dot.classList.add('active');
            else dot.classList.remove('active');
        });
    }

    // --- CHORD PADS & GUITAR VOICING LOGIC ---
    initChordPads() {
        this.chordTypes = {
            'Maj': [0, 4, 7], 'Min': [0, 3, 7], 'Dim': [0, 3, 6],
            'Aug': [0, 4, 8], 'Sus4': [0, 5, 7], 'Sus2': [0, 2, 7]
        };
        this.noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

        // Diatonic Scale Formulas
        this.scaleFormulas = {
            'Major': [
                { int: 0, type: 'Maj', num: 'I' }, { int: 2, type: 'Min', num: 'ii' },
                { int: 4, type: 'Min', num: 'iii' }, { int: 5, type: 'Maj', num: 'IV' },
                { int: 7, type: 'Maj', num: 'V' }, { int: 9, type: 'Min', num: 'vi' },
                { int: 11, type: 'Dim', num: 'vii°' }
            ],
            'Minor': [
                { int: 0, type: 'Min', num: 'i' }, { int: 2, type: 'Dim', num: 'ii°' },
                { int: 3, type: 'Maj', num: 'III' }, { int: 5, type: 'Min', num: 'iv' },
                { int: 7, type: 'Min', num: 'v' }, { int: 8, type: 'Maj', num: 'VI' },
                { int: 10, type: 'Maj', num: 'VII' }
            ],
            'HarmonicMinor': [
                { int: 0, type: 'Min', num: 'i' }, { int: 2, type: 'Dim', num: 'ii°' },
                { int: 3, type: 'Aug', num: 'III+' }, { int: 5, type: 'Min', num: 'iv' },
                { int: 7, type: 'Maj', num: 'V' }, { int: 8, type: 'Maj', num: 'VI' },
                { int: 11, type: 'Dim', num: 'vii°' }
            ],
            'PhrygianDom': [
                { int: 0, type: 'Maj', num: 'I' }, { int: 1, type: 'Maj', num: 'II' },
                { int: 4, type: 'Dim', num: 'iii°' }, { int: 5, type: 'Min', num: 'iv' },
                { int: 7, type: 'Dim', num: 'v°' }, { int: 8, type: 'Aug', num: 'VI+' },
                { int: 10, type: 'Min', num: 'vii' }
            ],
            'Dorian': [
                { int: 0, type: 'Min', num: 'i' }, { int: 2, type: 'Min', num: 'ii' },
                { int: 3, type: 'Maj', num: 'III' }, { int: 5, type: 'Maj', num: 'IV' },
                { int: 7, type: 'Min', num: 'v' }, { int: 9, type: 'Dim', num: 'vi°' },
                { int: 10, type: 'Maj', num: 'VII' }
            ],
            'Mixolydian': [
                { int: 0, type: 'Maj', num: 'I' }, { int: 2, type: 'Min', num: 'ii' },
                { int: 4, type: 'Dim', num: 'iii°' }, { int: 5, type: 'Maj', num: 'IV' },
                { int: 7, type: 'Min', num: 'v' }, { int: 9, type: 'Min', num: 'vi' },
                { int: 10, type: 'Maj', num: 'VII' }
            ],
            'Mixolydian': [
                { int: 0, type: 'Maj', num: 'I' }, { int: 2, type: 'Min', num: 'ii' },
                { int: 4, type: 'Dim', num: 'iii°' }, { int: 5, type: 'Maj', num: 'IV' },
                { int: 7, type: 'Min', num: 'v' }, { int: 9, type: 'Min', num: 'vi' },
                { int: 10, type: 'Maj', num: 'VII' }
            ],
            // --- NEW PENTATONIC SCALES ---
            'MajPentatonic': [
                { int: 0, type: 'Maj', num: 'I' },      // Root
                { int: 2, type: 'Min', num: 'ii' },     // 2nd
                { int: 4, type: 'Min', num: 'iii' },    // 3rd
                { int: 7, type: 'Maj', num: 'V' },      // 5th
                { int: 9, type: 'Min', num: 'vi' },     // 6th
                { int: 0, type: 'Sus2', num: 'Isus2' }, // Bonus Pad 6: Open floating sound
                { int: 7, type: 'Sus4', num: 'Vsus4' }  // Bonus Pad 7: Great for resolving to I
            ],
            'MinPentatonic': [
                { int: 0, type: 'Min', num: 'i' },      // Root
                { int: 3, type: 'Maj', num: 'III' },    // Flat 3rd
                { int: 5, type: 'Min', num: 'iv' },     // 4th
                { int: 7, type: 'Min', num: 'v' },      // 5th
                { int: 10, type: 'Maj', num: 'VII' },   // Flat 7th
                { int: 0, type: 'Sus4', num: 'isus4' }, // Bonus Pad 6: Very common in rock/blues
                { int: 5, type: 'Sus2', num: 'ivsus2' } // Bonus Pad 7: Adds color to the 4-chord
            ]
        };

        this.padConfigs = Array(7).fill().map(() => ({ rootIdx: 0, type: 'Maj', octave: 3, numeral: '' }));

        // Init Global Selectors
        const globRoot = document.getElementById('globalKeyRoot');
        const globScale = document.getElementById('globalKeyScale');
        if (globRoot && globScale) {
            this.noteNames.forEach((n, idx) => {
                let opt = document.createElement('option');
                opt.value = idx; opt.textContent = n;
                globRoot.appendChild(opt);
            });
            globRoot.addEventListener('change', () => this.applyGlobalKey());
            globScale.addEventListener('change', () => this.applyGlobalKey());
        }

        this.renderChordPads();
        this.applyGlobalKey(); // Auto-calculate C Major on startup
    }

    applyGlobalKey() {
        const rootStr = document.getElementById('globalKeyRoot');
        const scaleStr = document.getElementById('globalKeyScale');
        if (!rootStr || !scaleStr) return;

        const globalRoot = parseInt(rootStr.value);
        const formula = this.scaleFormulas[scaleStr.value];

        formula.forEach((degree, i) => {
            this.padConfigs[i].rootIdx = (globalRoot + degree.int) % 12;
            this.padConfigs[i].type = degree.type;
            this.padConfigs[i].numeral = degree.num;

            // Update DOM dynamically without rebuilding
            const rootSel = document.getElementById(`pad-root-${i}`);
            const typeSel = document.getElementById(`pad-type-${i}`);
            const numeralLabel = document.getElementById(`pad-num-${i}`);
            
            if(rootSel) rootSel.value = this.padConfigs[i].rootIdx;
            if(typeSel) typeSel.value = this.padConfigs[i].type;
            if(numeralLabel) numeralLabel.textContent = degree.num;
            
            this.updatePadLabel(i);
        });
    }

    renderChordPads() {
        const container = document.getElementById('chordPadsContainer');
        if (!container) return;
        container.innerHTML = '';

        this.padConfigs.forEach((config, i) => {
            const padWrap = document.createElement('div');
            padWrap.className = 'chord-pad-wrap';

            // Controls
            const controls = document.createElement('div');
            controls.className = 'chord-controls';

            const rootSel = document.createElement('select');
            rootSel.id = `pad-root-${i}`;
            this.noteNames.forEach((n, idx) => {
                let opt = document.createElement('option');
                opt.value = idx; opt.textContent = n;
                rootSel.appendChild(opt);
            });
            rootSel.onchange = (e) => { 
                this.padConfigs[i].rootIdx = parseInt(e.target.value); 
                this.padConfigs[i].numeral = '*'; // Custom override
                document.getElementById(`pad-num-${i}`).textContent = '*';
                this.updatePadLabel(i); 
            };

            const typeSel = document.createElement('select');
            typeSel.id = `pad-type-${i}`;
            Object.keys(this.chordTypes).forEach(t => {
                let opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                typeSel.appendChild(opt);
            });
            typeSel.onchange = (e) => { 
                this.padConfigs[i].type = e.target.value; 
                this.padConfigs[i].numeral = '*'; // Custom override
                document.getElementById(`pad-num-${i}`).textContent = '*';
                this.updatePadLabel(i); 
            };

            controls.appendChild(rootSel); controls.appendChild(typeSel);

            // Base Pad
            const padBtn = document.createElement('div');
            padBtn.className = 'chord-pad';
            padBtn.id = `chord-pad-${i}`;

            // Badges & Labels
            const hotkey = document.createElement('span');
            hotkey.className = 'hotkey-badge';
            hotkey.textContent = i + 1; // 1 through 7

            const label = document.createElement('span');
            label.className = 'pad-label-main';
            label.id = `pad-label-${i}`;

            const numeral = document.createElement('span');
            numeral.className = 'roman-numeral';
            numeral.id = `pad-num-${i}`;

            padBtn.appendChild(hotkey);
            padBtn.appendChild(label);
            padBtn.appendChild(numeral);

            padWrap.appendChild(controls); 
            padWrap.appendChild(padBtn);
            container.appendChild(padWrap);

            // Events
            padBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerChord(i, true); });
            padBtn.addEventListener('mouseup', (e) => { e.preventDefault(); this.triggerChord(i, false); });
            padBtn.addEventListener('mouseleave', () => { if (padBtn.classList.contains('active')) this.triggerChord(i, false); });
        });
    }

    updatePadLabel(index) {
        const conf = this.padConfigs[index];
        const el = document.getElementById(`pad-label-${index}`);
        if(el) el.textContent = `${this.noteNames[conf.rootIdx]} ${conf.type}`;
    }

    // Mathematically calculates authentic Guitar fingerings!
    getGuitarVoicing(rootMidi, chordType) {
        const rootPc = rootMidi % 12;
        const fretE = (rootPc - 4 + 12) % 12; // 6th string root (E=40)
        const fretA = (rootPc - 9 + 12) % 12; // 5th string root (A=45)

        // Authentic Open Chords (Low E to High E)
        const openChords = {
            '0-Maj': [-1,3,2,0,1,0], '2-Maj': [-1,-1,0,2,3,2], '4-Maj': [0,2,2,1,0,0], '7-Maj': [3,2,0,0,0,3], '9-Maj': [-1,0,2,2,2,0],
            '2-Min': [-1,-1,0,2,3,1], '4-Min': [0,2,2,0,0,0], '9-Min': [-1,0,2,2,1,0],
            '0-Sus2': [-1,3,0,0,3,3], '2-Sus2': [-1,-1,0,2,3,0], '9-Sus2': [-1,0,2,2,0,0],
            '2-Sus4': [-1,-1,0,2,3,3], '9-Sus4': [-1,0,2,2,3,0]
        };

        const key = `${rootPc}-${chordType}`;
        if (openChords[key]) return openChords[key];

        // Barre shapes depending on lowest possible fret position
        if (fretE <= fretA && fretE < 12) {
            const f = fretE; // E-Shape
            switch (chordType) {
                case 'Maj': return [f, f+2, f+2, f+1, f, f];
                case 'Min': return [f, f+2, f+2, f, f, f];
                case 'Dim': return [f, f, f+2, f, f, f];
                case 'Aug': return [f, f+3, f+2, f+1, f, f];
                case 'Sus4': return [f, f+2, f+2, f+2, f, f];
                case 'Sus2': return [f, f+2, f+4, f+1, f, f];
                default: return [f, f+2, f+2, f+1, f, f];
            }
        } else {
            const f = fretA; // A-Shape
            switch (chordType) {
                case 'Maj': return [-1, f, f+2, f+2, f+2, f];
                case 'Min': return [-1, f, f+2, f+2, f+1, f];
                case 'Dim': return [-1, f, f+1, f+2, f+1, -1];
                case 'Aug': return [-1, f, f+3, f+2, f+2, f];
                case 'Sus4': return [-1, f, f+2, f+2, f+3, f];
                case 'Sus2': return [-1, f, f+2, f+2, f, f];
                default: return [-1, f, f+2, f+2, f+2, f];
            }
        }
    }

    getChordNotes(baseMidi, chordType) {
        if (this.activeVst === 'guitar') {
            const stringsArr = this.getGuitarVoicing(baseMidi, chordType);
            const openStringsLowToHigh = [40, 45, 50, 55, 59, 64];
            let notes = [], fretPositions = [];
            
            stringsArr.forEach((fret, i) => {
                if (fret !== -1) {
                    let actualMidi = openStringsLowToHigh[i] + fret;
                    notes.push({ id: actualMidi, freq: this.midiToFreq(actualMidi) });
                    let uiStringIdx = 5 - i; // Map Low-to-High to UI's High-to-Low grid
                    fretPositions.push({ string: uiStringIdx, fret: fret });
                }
            });
            return { notes, fretPositions, isGuitar: true };
        } else {
            const intervals = this.chordTypes[chordType];
            let notes = intervals.map(interval => {
                let id = baseMidi + interval;
                return { id: id, freq: this.midiToFreq(id) };
            });
            return { notes, isGuitar: false };
        }
    }

    updateChordUI(chordData, isOn) {
        // Universal: Highlight virtual piano keys
        chordData.notes.forEach(n => {
            const screenMidi = n.id - (this.octaveShift * 12);
            if(this.keyElems[screenMidi]) {
                if (isOn) this.keyElems[screenMidi].classList.add('active');
                else this.keyElems[screenMidi].classList.remove('active');
            }
        });

        // Guitar only: Precisely highlight realistic fingerings!
        if (this.activeVst === 'guitar' && chordData.isGuitar) {
            chordData.fretPositions.forEach(pos => {
                const dot = document.querySelector(`.note-dot[data-string="${pos.string}"][data-fret="${pos.fret}"]`);
                if (dot) {
                    if (isOn) dot.classList.add('active');
                    else dot.classList.remove('active');
                }
            });
        }
    }

    playChordFromRoot(baseMidi, isDown) {
        if (isDown) {
            if (this.activeChords.has(baseMidi)) return;
            
            // Try to find if user configured a pad for this root
            let rootPc = baseMidi % 12;
            let padConf = this.padConfigs.find(p => p.rootIdx === rootPc);
            let chordType = padConf ? padConf.type : 'Maj'; 

            let chordData = this.getChordNotes(baseMidi, chordType);
            this.activeChords.set(baseMidi, chordData);

            chordData.notes.forEach(n => this.activeSet.add(n.id));
            this.client.send({ type: 'chord_on', vst: this.activeVst, notes: chordData.notes });

            if (this.keyElems[baseMidi]) this.keyElems[baseMidi].classList.add('active');
            this.updateChordUI(chordData, true);
            this.updateDisplay();

        } else {
            if (!this.activeChords.has(baseMidi)) return;
            let chordData = this.activeChords.get(baseMidi);
            
            chordData.notes.forEach(n => this.activeSet.delete(n.id));
            this.client.send({ type: 'chord_off', notes: chordData.notes.map(n=>n.id) });

            if (this.keyElems[baseMidi]) this.keyElems[baseMidi].classList.remove('active');
            this.updateChordUI(chordData, false);
            this.activeChords.delete(baseMidi);
            this.updateDisplay();
        }
    }

    triggerChord(index, isDown) {
        if (!this.isPlayable || this.activeVst === 'drums') return;
        const conf = this.padConfigs[index];
        const baseMidi = 48 + conf.rootIdx + ((conf.octave - 3) * 12) + (this.octaveShift * 12);
        const padBtn = document.getElementById(`chord-pad-${index}`);
        const chordKey = 'pad_' + index;

        if (isDown) {
            if (this.activeChords.has(chordKey)) return;
            let chordData = this.getChordNotes(baseMidi, conf.type);
            this.activeChords.set(chordKey, chordData);

            chordData.notes.forEach(n => this.activeSet.add(n.id));
            this.client.send({ type: 'chord_on', vst: this.activeVst, notes: chordData.notes });

            this.updateChordUI(chordData, true);
            if (padBtn) padBtn.classList.add('active');
            this.updateDisplay();
        } else {
            if (!this.activeChords.has(chordKey)) return;
            let chordData = this.activeChords.get(chordKey);

            chordData.notes.forEach(n => this.activeSet.delete(n.id));
            this.client.send({ type: 'chord_off', notes: chordData.notes.map(n=>n.id) });

            this.updateChordUI(chordData, false);
            if (padBtn) padBtn.classList.remove('active');
            this.activeChords.delete(chordKey);
            this.updateDisplay();
        }
    }

    // --- SETUP / INITIALIZATION ---
    initSplash() {
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
        resize(); window.addEventListener('resize', resize);
        
        const DOTS = Array.from({ length: 90 }, () => ({
            x: Math.random() * innerWidth, y: Math.random() * innerHeight,
            r: Math.random() * 1.6 + 0.4, vy: -(Math.random() * 0.4 + 0.1),
            vx: (Math.random() - 0.5) * 0.2, a: Math.random() * 0.5 + 0.1,
            hue: Math.random() > 0.7 ? 340 : 220
        }));
        
        let raf;
        const loop = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            DOTS.forEach(d => {
                d.x = (d.x + d.vx + canvas.width) % canvas.width;
                d.y = (d.y + d.vy + canvas.height) % canvas.height;
                ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${d.hue},80%,70%,${d.a})`; ctx.fill();
            });
            raf = requestAnimationFrame(loop);
        };
        loop();

        const letters = document.querySelectorAll('.splash-logo span');
        letters.forEach((l, i) => setTimeout(() => l.classList.add('vis'), 500 + i * 130));
        setTimeout(() => document.querySelector('.splash-sub').classList.add('vis'), 1400);
        setTimeout(() => {
            document.getElementById('splash').classList.add('out');
            document.getElementById('menu').classList.remove('out');
            cancelAnimationFrame(raf);
        }, 3200);
    }

    initKeyboard() {
        this.LAYOUT = [
            { type:'white', note:'C3',  midi:48, kbd:'Z' }, { type:'black', note:'C#3', midi:49, kbd:'S' },
            { type:'white', note:'D3',  midi:50, kbd:'X' }, { type:'black', note:'D#3', midi:51, kbd:'D' },
            { type:'white', note:'E3',  midi:52, kbd:'C' }, { type:'white', note:'F3',  midi:53, kbd:'V' },
            { type:'black', note:'F#3', midi:54, kbd:'G' }, { type:'white', note:'G3',  midi:55, kbd:'B' },
            { type:'black', note:'G#3', midi:56, kbd:'H' }, { type:'white', note:'A3',  midi:57, kbd:'N' },
            { type:'black', note:'A#3', midi:58, kbd:'J' }, { type:'white', note:'B3',  midi:59, kbd:'M' },
            { type:'white', note:'C4',  midi:60, kbd:'Q' }, { type:'black', note:'C#4', midi:61, kbd:'2' },
            { type:'white', note:'D4',  midi:62, kbd:'W' }, { type:'black', note:'D#4', midi:63, kbd:'3' },
            { type:'white', note:'E4',  midi:64, kbd:'E' }, { type:'white', note:'F4',  midi:65, kbd:'R' },
            { type:'black', note:'F#4', midi:66, kbd:'5' }, { type:'white', note:'G4',  midi:67, kbd:'T' },
            { type:'black', note:'G#4', midi:68, kbd:'6' }, { type:'white', note:'A4',  midi:69, kbd:'Y' },
            { type:'black', note:'A#4', midi:70, kbd:'7' }, { type:'white', note:'B4',  midi:71, kbd:'U' },
            { type:'white', note:'C5',  midi:72, kbd:'I' }, { type:'black', note:'C#5', midi:73, kbd:'9' },
            { type:'white', note:'D5',  midi:74, kbd:'O' }, { type:'black', note:'D#5', midi:75, kbd:'0' },
            { type:'white', note:'E5',  midi:76, kbd:'P' }
        ];
        this.kbdMap = {};
        this.keyElems = {};
        this.drumMap = {};
        
        this.LAYOUT.forEach(d => { this.kbdMap[d.kbd.toLowerCase()] = d; });
        
        const bed = document.getElementById('keyBed');
        this.LAYOUT.filter(d => d.type === 'white').forEach(def => {
            const el = document.createElement('div'); el.className = 'wk'; el.dataset.midi = def.midi;
            const kh = document.createElement('span'); kh.className = 'kb-hint'; kh.textContent = def.kbd;
            el.appendChild(kh); bed.appendChild(el); this.keyElems[def.midi] = el;
        });
        
        requestAnimationFrame(() => {
            this.LAYOUT.filter(d => d.type === 'black').forEach(def => {
                const leftEl = this.keyElems[def.midi - 1]; if (!leftEl) return;
                const leftPos = leftEl.getBoundingClientRect().right - bed.getBoundingClientRect().left - 12 + 2;
                const el = document.createElement('div'); el.className = 'bk'; el.dataset.midi = def.midi; el.style.left = leftPos + 'px';
                const kh = document.createElement('span'); kh.className = 'kb-hint'; kh.textContent = def.kbd;
                el.appendChild(kh); bed.appendChild(el); this.keyElems[def.midi] = el;
            });
        });

        document.querySelectorAll('.drum-pad').forEach(pad => {
            const note = parseInt(pad.getAttribute('data-note'));
            const key = pad.getAttribute('data-key').toLowerCase();
            this.drumMap[key] = note;
            pad.addEventListener('mousedown', () => this.hitDrum(note, pad));
        });
    }

    initEventListeners() {
        const chordToggle = document.getElementById('chordModeToggle');
        if (chordToggle) {
            chordToggle.addEventListener('change', (e) => {
                this.keyboardChordMode = e.target.checked;
                this.releaseAllNotes();
            });
        }

        document.addEventListener('keydown', e => {
            if (!this.isPlayable) return;
            const key = e.key.toLowerCase();
            if (e.repeat || this.heldKeys.has(key)) return;
            this.heldKeys.add(key);
            
            // NEW: Hardware 1-7 triggers Smart Pads!
            if (['1','2','3','4','5','6','7'].includes(key) && this.activeVst !== 'drums') {
                e.preventDefault();
                this.triggerChord(parseInt(key) - 1, true);
                return;
            }
            
            if (this.activeVst === 'drums') {
                if (this.drumMap[key]) {
                    e.preventDefault();
                    this.hitDrum(this.drumMap[key], document.querySelector(`.drum-pad[data-key="${key}"]`));
                }
            } else {
                if (this.kbdMap[key]) this.noteOn(this.kbdMap[key].midi);
            }
        });

        document.addEventListener('keyup', e => {
            const key = e.key.toLowerCase(); this.heldKeys.delete(key);
            
            // NEW: Release 1-7 Smart Pads!
            if (['1','2','3','4','5','6','7'].includes(key) && this.activeVst !== 'drums') {
                this.triggerChord(parseInt(key) - 1, false);
                return;
            }

            if (this.activeVst !== 'drums' && this.kbdMap[key]) this.noteOff(this.kbdMap[key].midi);
        });

        const bed = document.getElementById('keyBed');
        bed.addEventListener('mousedown', e => {
            const el = e.target.closest('[data-midi]');
            if (el) this.noteOn(+el.dataset.midi);
        });
        document.addEventListener('mouseup', () => {
            if(this.activeVst !== 'drums') this.releaseAllNotes();
        });

        this.pitchBend = 0;
        this.handle = document.getElementById('pitchHandle');
        document.addEventListener('keydown', e => {
            if (!this.isPlayable || this.activeVst === 'drums') return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.pitchBend = Math.max(-2, Math.min(2, this.pitchBend + (e.key === 'ArrowUp' ? 0.5 : -0.5)));
                if (this.handle) this.handle.style.top = (37 - (this.pitchBend / 2) * 32) + 'px';
                this.client.send({ type:'param', name:'pitch_bend', val:this.pitchBend });
            }
        });
        document.addEventListener('keyup', e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                this.pitchBend = 0;
                if (this.handle) this.handle.style.top = '37px';
                this.client.send({ type:'param', name:'pitch_bend', val:0 });
            }
        });

        this.tuneVal = 0;
        const tuneKnob = document.getElementById('tuneKnob');
        if (tuneKnob) {
            tuneKnob.addEventListener('wheel', e => {
                e.preventDefault(); 
                this.tuneVal = Math.max(-2, Math.min(2, this.tuneVal - (e.deltaY > 0 ? 0.1 : -0.1)));
                this.tuneVal = Math.round(this.tuneVal * 10) / 10; 
                tuneKnob.style.setProperty('--angle', (this.tuneVal * 45) + 'deg');
                this.client.send({ type:'param', name:'tune', val:this.tuneVal });
            }, { passive:false });
        }
        
        this.fxState = { tremolo:false, delay:false, reverb:false };
        
        document.querySelectorAll('.knob[data-param]').forEach(knob => {
            const min = parseFloat(knob.dataset.min);
            const max = parseFloat(knob.dataset.max); 
            let val = parseFloat(knob.dataset.val), startY = 0, startV = val, active = false;
            
            const setAngle = v => knob.style.setProperty('--angle', (((v - min) / (max - min)) * 270 - 135) + 'deg');
            setAngle(val); 
            
            knob.addEventListener('mousedown', e => { 
                if (!knob.closest('.module').classList.contains('active')) return; 
                active = true; startY = e.clientY; startV = val; e.preventDefault(); 
            });
            
            document.addEventListener('mousemove', e => { 
                if (!active) return; 
                val = Math.max(min, Math.min(max, startV + (startY - e.clientY) / 150 * (max - min))); 
                setAngle(val); 
                this.client.send({ type:'param', name: knob.dataset.param, val }); 
            });
            
            document.addEventListener('mouseup', () => active = false);
        });
    }

    changeOctave(dir) {
        if (this.activeVst === 'drums') return;
        this.octaveShift = Math.max(-2, Math.min(2, this.octaveShift + dir));
        
        const display = document.getElementById('octaveDisplay');
        if (display) {
            display.textContent = 'OCT: ' + (this.octaveShift > 0 ? '+' : '') + this.octaveShift;
        }
    }

    midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    noteOn(baseMidi) {
        if (!this.isPlayable) return;

        // --- INTERCEPT: KBD CHORD MODE ---
        if (this.keyboardChordMode && this.activeVst !== 'drums') {
            this.playChordFromRoot(baseMidi, true);
            return;
        }
        
        let actualMidi = this.activeVst === 'drums' ? baseMidi : baseMidi + (this.octaveShift * 12);
        if (this.activeSet.has(actualMidi)) return;
        
        this.activeSet.add(actualMidi);
        this.playedNotes.set(baseMidi, actualMidi); 
        if (this.keyElems[baseMidi]) this.keyElems[baseMidi].classList.add('active');
        
        const freq = this.midiToFreq(actualMidi);
        this.client.send({ type: 'note_on', id: actualMidi, freq: freq, vst: this.activeVst });
        
        if (this.activeVst === 'guitar') this.updateFretboard(actualMidi, true);
        this.updateDisplay();
    }

    noteOff(baseMidi) {
        // ALWAYS check active chords first, in case user switched the chord-mode mid-press
        if (this.activeChords.has(baseMidi)) {
            this.playChordFromRoot(baseMidi, false);
            return;
        }

        const actualMidi = this.playedNotes.get(baseMidi);
        if (actualMidi === undefined) return;
        
        this.playedNotes.delete(baseMidi);
        this.activeSet.delete(actualMidi);
        if (this.keyElems[baseMidi]) this.keyElems[baseMidi].classList.remove('active');
        
        this.client.send({ type: 'note_off', id: actualMidi });
        
        if (this.activeVst === 'guitar') this.updateFretboard(actualMidi, false);
        this.updateDisplay();
    }

    releaseAllNotes() { 
        // 1. Release Single Notes
        [...this.playedNotes.keys()].forEach(baseMidi => {
            if (typeof baseMidi === 'string' && baseMidi.startsWith('fret_')) {
                const actualMidi = this.playedNotes.get(baseMidi);
                this.playedNotes.delete(baseMidi);
                this.activeSet.delete(actualMidi);
                this.client.send({ type: 'note_off', id: actualMidi });
                if (this.activeVst === 'guitar') this.updateFretboard(actualMidi, false);
            } else {
                this.noteOff(baseMidi);
            }
        }); 

        // 2. Release Any Stuck Smart Chords
        if (this.activeSet.size > 0) {
            const remaining = [...this.activeSet];
            this.client.send({ type: 'chord_off', notes: remaining });
            remaining.forEach(midi => {
                const keyEl = document.querySelector(`[data-midi="${midi - (this.octaveShift * 12)}"]`);
                if(keyEl && !keyEl.classList.contains('drum-pad')) keyEl.classList.remove('active');
                if (this.activeVst === 'guitar') {
                    const dots = document.querySelectorAll(`.note-dot[data-midi="${midi}"]`);
                    dots.forEach(d => d.classList.remove('active'));
                }
            });
            this.activeSet.clear();
            this.activeChords.clear();
            this.updateDisplay();
        }
    }

    hitDrum(midiNote, padElement) {
        if(!this.isPlayable) return;
        this.client.send({ type: 'note_on', id: midiNote, freq: 0, vst: 'drums' });
        if (padElement) {
            padElement.classList.add('active');
            setTimeout(() => padElement.classList.remove('active'), 80);
        }
    }

    updateDisplay() {
        if (this.activeVst === 'drums') return;
        const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        let info = { lcd: this.activeVst.toUpperCase(), sub: 'READY', isChord:false };
        
        const midis = [...this.activeSet];
        if (midis.length === 1) {
            info = { lcd: NOTE_NAMES[midis[0] % 12] + Math.floor(midis[0]/12 - 1), sub: 'Single Note', isChord:false };
        } else if (midis.length > 1) {
            const pcs = [...new Set(midis.map(m => m % 12))].sort((a,b) => a-b);
            info = { lcd: pcs.map(p => NOTE_NAMES[p]).join(' '), sub: pcs.length + ' notes', isChord: true };
        }

        const lcdEl = document.getElementById('lcd');
        const subEl = document.getElementById('lcdSub');
        if(lcdEl) lcdEl.textContent = info.lcd;
        if(subEl) subEl.textContent = info.sub;
        if(lcdEl) lcdEl.className = 'lcd' + (info.isChord ? ' chord' : '');
    }

    goMenu() {
        this.releaseAllNotes();
        document.getElementById('menu').classList.remove('out');
        document.body.classList.add('locked');
        this.isPlayable = false;
        if(this.sequencer.isPlaying) this.sequencer.togglePlay();
    }

    enterInstrument(vst) {
        this.activeVst = vst;
        document.getElementById('menu').classList.add('out');
        document.body.classList.remove('locked');
        this.client.send({ type: 'switch', vst: vst });
        this.isPlayable = true;

        if (vst === 'drums') {
            document.getElementById('melodic-ui').style.display = 'none';
            document.getElementById('drum-ui').style.display = 'flex';
            document.getElementById('lcd').textContent = 'DRUMS';
            document.getElementById('lcdSub').textContent = 'Percussion';
        } else {
            document.getElementById('melodic-ui').style.display = 'flex';
            document.getElementById('drum-ui').style.display = 'none';
            
            const guitarUI = document.getElementById('guitar-ui');
            if (guitarUI) guitarUI.style.display = (vst === 'guitar') ? 'flex' : 'none';
            
            this.updateDisplay();
        }
    }

    toggleFX(name) {
        this.fxState[name] = !this.fxState[name];
        document.getElementById('led-' + name).classList.toggle('on', this.fxState[name]);
        document.getElementById('mod-' + name).classList.toggle('active', this.fxState[name]);
        this.client.send({ type:'param', name: name + '_on', val: this.fxState[name] });
    }
}

// Bootstrap Application
window.addEventListener('DOMContentLoaded', () => {
    window.actamApp = new AppController();
});