# 🛠️ littlefs Superblock Fuzzer & Visualizer

An educational C-based systems simulation and interactive web visualizer designed to test, analyze, and self-heal corruptions inside the **littlefs** superblock structure. 

This project demonstrates direct binary memory manipulation, CRC32 data integrity, structured fuzz testing, and fault-tolerant mitigation design in C, combined with a premium web dashboard for visual telemetry.

---

## 🎯 Key Features

1. **Structured C Fuzzer**: Emulates real-world flash storage degradation by targeting and corrupting specific fields of a 32-byte superblock binary (`image.bin`).
2. **Auto-Healing Mitigations**: Implements three self-healing routines in C:
   - *Magic Byte Healing*: Restores filesystem signatures.
   - *Power-of-2 Snapper*: Automatically snaps corrupted block sizes to the next valid power of 2 using fast bitwise operations.
   - *CRC-32 Correction*: Recalculates GF(2) checksums over repaired bytes.
3. **6-Rule Validator**: Performs independent safety audits on mutated images to make pass/fail verdicts (`SAFE`, `CAUTION`, `UNSAFE`).
4. **Interactive Hex Layout Simulator**: A mock hex editor built into the dashboard that maps the C struct directly to raw binary bytes to explain memory alignments.
5. **Avalanche Effect Simulator**: A live tab where you can type any text, flip a single bit, and visualize how roughly 50% of the CRC32 output bits flip to detect corruption.

---

## 📁 Repository Structure

```
📁 C_Programming_PBL/
├── 📄 main.c              # Main orchestrator (Phases 1-5)
├── 📄 superblock.h        # lfs_superblock_t struct & telemetry types
├── 📄 generator.c / .h    # Creates clean baseline binary images
├── 📄 fuzzer.c / .h       # Handles random corruption and self-healing
├── 📄 validator.c / .h    # Evaluates image safety (6 rules)
├── 📄 reporter.c / .h     # Serializes telemetry reports to text & JSON
├── 📄 crc32.c / .h        # Lookup-table accelerated CRC-32 checksums
├── 📄 Makefile            # Build automation
│
├── 📁 docs/               # In-Depth Guides & Materials
│   ├── 📄 THEORY.md           # 18-section exhaustive technical deep-dive
│   ├── 📄 EVALUATION_PREP.md  # Viva/Oral exam prep questions & demo script
│   └── 📄 HOW_TO_RUN_MACOS.md # macOS compilation & run setup guide
│
└── 📁 ui/                 # Visual Dashboard Frontend
    ├── 📄 index.html      # Main dashboard page
    ├── 📄 style.css       # Premium light-mode styling
    ├── 📄 app.js          # Handles JSON report parsing & steppers
    ├── 📄 layout.js       # Hex viewer mapping & struct details
    └── 📄 avalanche.js    # Interactive CRC32 bit-flip simulator
```

---

## 🚀 Quick Start Guide

### 🪟 Windows Setup (MinGW)

1. Open PowerShell inside the project directory.
2. Compile the fuzzer:
   ```powershell
   mingw32-make
   ```
3. Run the fuzzer:
   ```powershell
   .\fuzzer.exe
   ```
4. Open the dashboard by double-clicking `ui/index.html` or running:
   ```powershell
   Start-Process "ui/index.html"
   ```
5. Click **Load report.json** and select the newly generated `report.json` in the root folder.

### 🍎 macOS / Linux Setup

1. Open Terminal inside the project directory.
2. Open the `Makefile` and change the `TARGET` from `fuzzer.exe` to `fuzzer`, and update the `clean` rule to use `rm` (details in `docs/HOW_TO_RUN_MACOS.md`).
3. Compile:
   ```bash
   make
   ```
4. Run:
   ```bash
   ./fuzzer
   ```
5. Launch the dashboard:
   ```bash
   open ui/index.html
   ```
6. Click **Load report.json** and select the generated file.

---

## 🔬 Core Technical Concepts

### The 32-Byte Superblock Layout
littlefs requires a packed, 32-byte header block containing:
- `magic[8]` - filesystem signature (`"littlefs"`)
- `version` - format version (`0x00020000`)
- `block_size` - size of logical flash sectors (must be power of 2)
- `block_count` - total physical blocks
- `name_max` - maximum character length for path entries
- `file_max` - maximum file limits
- `crc` - CRC-32 checksum calculated over the first 28 bytes

### The Avalanche Effect
To prevent corrupted storage states from silently matching a checksum, the project relies on the **Avalanche Effect** of CRC-32. Even a single 1-bit flip in the superblock's 28-byte data field shifts roughly 50% (16 of 32 bits) of the output checksum, making silent failure statistically impossible.

---

## 🎓 Academic Presentations (Viva Prep)

If presenting this project to evaluators:
- Review `docs/THEORY.md` for a section-by-section breakdown of why C is used, packed alignment parameters, and GF(2) arithmetic.
- Review `docs/EVALUATION_PREP.md` for over 25 mock question-and-answer pairs, a demo script, and panic recovery strategies.

---
*Developed as a C Programming Problem-Based Learning (PBL) project.*
