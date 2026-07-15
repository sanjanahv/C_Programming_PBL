# 🍎 How to Run on macOS — littlefs Superblock Fuzzer

This guide walks you through everything you need to compile and run the fuzzer on a Mac from absolute scratch — no prior experience required.

---

## Prerequisites

### 1. Install Xcode Command Line Tools (gives you `gcc` / `clang` + `make`)

Open Terminal and run:

```bash
xcode-select --install
```

A pop-up will appear → click **Install** → wait for it to finish (takes a few minutes). This gives you the C compiler and `make`.

> **Verify it worked:**
> ```bash
> gcc --version
> make --version
> ```
> Both should print version info.

---

### 2. Fix the Makefile for macOS

The `Makefile` was written for Windows CMD (`del` command). On macOS you need `rm`. Make these edits:

Open `Makefile` in any text editor and:

**Change the TARGET line** (macOS has no `.exe`):
```makefile
TARGET = fuzzer
```

**Replace the `clean:` block** with:
```makefile
clean:
	rm -f $(TARGET) image.bin fuzzed_image.bin fuzzed_iter_*.bin
	rm -f report.txt report.json ui/report.json
```

> Tip: You can do this quickly in Terminal with `nano Makefile`

---

## Running the Fuzzer (Step by Step)

### Step 1 — Open Terminal

Press `Cmd + Space`, type **Terminal**, press Enter.

### Step 2 — Navigate to the project folder

```bash
cd ~/Desktop/fscrash-project/fscrash-project
```

(Or drag the folder from Finder into Terminal after typing `cd ` — it auto-fills the path.)

### Step 3 — Compile the project

```bash
make
```

You should see:
```
gcc -Wall -Wextra -std=c99 -g -o fuzzer main.c crc32.c generator.c fuzzer.c validator.c reporter.c
```

If there are no errors, a file called `fuzzer` appears in the folder. You are ready.

### Step 4 — Run the fuzzer

```bash
./fuzzer
```

Expected output (abbreviated):
```
===========================================
  littlefs Image Fuzzer & Vulnerability Detector
===========================================

[ PHASE 1 ] Generating valid image.bin ...
[ PHASE 2 ] Validating clean image.bin ...
[ PHASE 3 ] Fuzzing image → fuzzed_image.bin ...
  [FUZZ] magic corrupted
  [MITIGATION] Magic corrupted → restored to 'littlefs'
  ...
[ PHASE 5 ] Generating text and JSON reports ...
  JSON report written to report.json
  JSON report written to ui/report.json
```

Generated output files:

| File | Description |
|------|-------------|
| `image.bin` | Clean, valid baseline superblock image |
| `fuzzed_iter_1.bin` → `fuzzed_iter_8.bin` | Each iteration's fuzzed+repaired binary |
| `fuzzed_image.bin` | Final iteration's image |
| `report.txt` | Plain text summary |
| `report.json` | Machine-readable data for the dashboard |
| `ui/report.json` | Copy of report inside the dashboard folder |

### Step 5 — Open the Dashboard

```bash
open ui/index.html
```

This opens the interactive web dashboard in your default browser.

### Step 6 — Load the report

In the dashboard, click the **"Load report.json"** button and select:
```
~/Desktop/fscrash-project/fscrash-project/report.json
```

All 8 fuzzing iterations will appear with full before/after comparisons.

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `command not found: make` | Xcode tools not installed | `xcode-select --install` |
| `command not found: gcc` | Same as above | `xcode-select --install` |
| `Error 1` in `make clean` | Windows `del` syntax in Makefile | Edit `clean:` block to use `rm -f` |
| `./fuzzer: Permission denied` | Executable bit not set | `chmod +x fuzzer` then retry |
| Browser blocks file loading | Local file security restriction | Use `open ui/index.html` or try Firefox |

---

## Clean and Start Fresh

```bash
make clean && make && ./fuzzer
```

---

## Sharing the Project

1. Run `make clean` to remove generated files
2. Right-click the project folder → **Compress**
3. Share the `.zip`

Your friends on **Windows** run `mingw32-make` instead of `make` and `.\fuzzer.exe` instead of `./fuzzer`.
