# 🎓 University Project: Advanced Coding Tools and Methodologies

### **Course: Advanced Coding Tools and Methodologies
**Developers:** Saeid Soleimani & Hanxiang Gao

**Institution:** Politecnico di Milano

**Project Objective:** To design and implement a low-latency, real-time Digital Signal Processing (DSP) engine capable of algorithmic sound synthesis via a web-based interface.

---

# ACTAM PRO | Audio Suite

**ACTAM PRO** is a real-time, hybrid web-to-Python audio synthesizer, sequencer, and performance suite. Developed as an academic project in Music and Acoustic Engineering, this system demonstrates low-latency audio processing, physical modeling concepts, and advanced musical user interfaces.

---

## 🏗️ System Architecture

The project is built on a decoupled **Client-Server Architecture**, separating the visual interface and sequence logic from the heavy digital signal processing (DSP) and audio rendering.

### 1. Frontend (The Controller)
* **Tech Stack:** Vanilla HTML, CSS, and JavaScript.
* **Role:** Acts as the central nervous system. It handles user input (mouse, QWERTY keyboard, virtual fretboard/keybed), manages the internal sequencer state, and calculates musical theory logic (scales, voicings). 
* **Zero-Audio Policy:** The browser performs absolutely no audio synthesis, ensuring UI thread operations never cause audio dropouts.

### 2. Backend (The Audio Engine)
* **Tech Stack:** Python 3, `sounddevice`, `numpy`, `scipy`, `mido`.
* **Role:** A high-performance audio engine that listens for control messages. It utilizes precomputed waveforms (additive synthesis, super-saw, physical modeling) mapped to MIDI notes to ensure zero-latency playback. It streams the mixed audio buffer directly to the system's DAC via `sounddevice`.

### 3. Communication Layer
* **Protocol:** WebSockets (`websockets` library in Python, native `WebSocket` API in JS).
* **Payloads:** JSON-formatted messages (`note_on`, `chord_off`, `param`, `start_recording`, etc.) are transmitted instantly between the frontend controller and the backend engine.

---

## ✨ Core Features

### 🥁 1. Advanced Drum Machine (New)
A comprehensive 16-step rhythmic sequencer built into the UI.
* **Pattern Management:** Dual pattern slots (A/B) for live variation, custom preset saving, and 10 factory groove presets (Rock, DnB, Lo-Fi, Bossa, etc.).
* **Groove Controls:** Real-time **Swing** calculation and a **Humanize** function that introduces slight, randomized micro-delays and velocity variations to simulate a live drummer.
* **Live Fills:** Dynamic auto-fill generation triggered at the end of a musical phrase.

### 🎹 2. Smart Chord Pads & Voicing Algorithm (New)
An interactive chord performance system mapped to hardware keys (1-7).
* **Music Theory Engine:** Users select a root note and a scale (Major, Harmonic Minor, Dorian, Pentatonic, etc.), and the system automatically generates diatonic chord mapped to the pads.
* **Intelligent Guitar Voicings:** When the "Guitar" instrument is active, the engine mathematically translates abstract chords into authentic, physically playable guitar fingerings across the virtual fretboard, rather than playing impossible block chords.

### 🔴 3. Recording Engine (New)
Session capture handled directly by the Python backend.
* **WAV Export:** Captures the raw `numpy` float32 output buffer frame-by-frame and writes it to a high-quality `.wav` file.
* **MIDI Export:** Tracks performance events (`note_on`, `note_off`) with precise performance-counter timestamps, compiling them into a `.mid` file via the `mido` library.

### 🎸 4. Hybrid Instrument Synthesis
The engine uses precomputation to load instruments into memory during startup:
* **Grand Piano:** Additive synthesis approach.
* **Strings:** Super-saw generation with detuned oscillators.
* **Guitar:** Physical modeling approach mimicking plucked string tension.
* **Drums:** Sample/Synthesized percussion hits mapped to specific MIDI notes.

### 🎛️ 5. Master Effects Rack
A global DSP effects chain applied to the final mix:
* **Live XY Expression Pad:** Modulates expression (volume) and tremolo depth via 2D canvas tracking.
* **Tremolo:** LFO-based amplitude modulation with adjustable rate and depth.
* **Delay:** Feedback loop with adjustable time, feedback ratio, and wet mix.
* **Reverb:** Spatial simulation applied to the master bus.

---

## 🚀 Installation & Boot Process

The boot sequence has been optimized for a seamless user experience. 

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt

2. **Launch the Suite:**
   ```bash
   python start.py

Boot Sequence Flow:

start.py immediately opens index.html in the default browser, presenting a dynamic "Loading Audio Engine" screen.

The Python backend (main.py) begins generating and precomputing instrument arrays (Piano, Strings, Guitar, Drums).

The JavaScript WebSocket client continuously polls the background port (8765).

Once the audio engine is fully loaded and opens the port, the UI receives the handshake, the loading screen slides away, and the system is ready for real-time performance.

Developed for research and presentation in Music and Acoustic Engineering.
