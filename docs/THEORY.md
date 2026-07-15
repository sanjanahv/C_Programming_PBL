# 📚 THEORY.md — Complete Technical Reference

## littlefs Superblock Fuzzer & Vulnerability Detector

> This document explains *everything* about this project — from the ground up.
> No prior knowledge assumed. Start from section 1 if you are completely new.

---

## Table of Contents

1. [Why This Project Exists](#1-why-this-project-exists)
2. [Why C Programming?](#2-why-c-programming)
3. [What is a File System?](#3-what-is-a-file-system)
4. [What is littlefs?](#4-what-is-littlefs)
5. [What is a Superblock?](#5-what-is-a-superblock)
6. [Binary Images — What Are .bin Files?](#6-binary-images--what-are-bin-files)
7. [What is a Fuzzer?](#7-what-is-a-fuzzer)
8. [Project Architecture — How All Files Connect](#8-project-architecture--how-all-files-connect)
9. [Header Files (.h) — Why They Exist](#9-header-files-h--why-they-exist)
10. [The C Source Files — File by File](#10-the-c-source-files--file-by-file)
11. [The Three Mitigation Algorithms](#11-the-three-mitigation-algorithms)
12. [The Validation Engine](#12-the-validation-engine)
13. [CRC32 — How Data Integrity Works](#13-crc32--how-data-integrity-works)
14. [JSON Report Format](#14-json-report-format)
15. [The Web Dashboard](#15-the-web-dashboard)
16. [The Makefile — How Compilation Works](#16-the-makefile--how-compilation-works)
17. [Memory Layout — How Structs Map to Bytes](#17-memory-layout--how-structs-map-to-bytes)
18. [Glossary](#18-glossary)

---

## 1. Why This Project Exists

When a file system (software that manages files on storage like an SD card or flash chip) gets corrupted — due to power failures, hardware bugs, or malicious tampering — the device can become completely unusable. This is especially dangerous in **embedded systems**: tiny computers inside medical devices, routers, drones, and IoT sensors.

This project answers the question:

> **"If the most critical data structure in a flash file system gets corrupted, can a program detect it and automatically repair it?"**

We specifically target **littlefs**, a file system designed for microcontrollers with flash storage. We corrupt its most important structure (the superblock), measure the damage, automatically repair it using three algorithms, and visualize the entire process in an interactive dashboard.

This is used for:
- Academic research and demonstrations
- Understanding file system resilience
- Learning low-level C systems programming
- Sharing with professors, collaborators, or in project portfolios

---

## 2. Why C Programming?

### The Short Answer

C is the language of systems. It is the closest you can get to raw hardware without writing assembly. When you deal with binary files, memory layouts, and embedded firmware — C is the natural choice.

### The Detailed Reasons

**a) Direct memory control**
In C, you can define a struct that maps byte-for-byte onto a binary file. This is impossible in Python or JavaScript without external libraries. For example:

```c
typedef struct __attribute__((packed)) {
    char     magic[8];    // bytes 0-7
    uint32_t version;     // bytes 8-11
    uint32_t block_size;  // bytes 12-15
    ...
} lfs_superblock_t;
```

You can then do `fread(&sb, sizeof(sb), 1, file)` and C fills the struct directly from the binary file — zero parsing, zero overhead.

**b) `__attribute__((packed))`**
This tells the compiler NOT to add padding between struct fields. Without it, the compiler might insert empty bytes to align fields on word boundaries, causing the struct to no longer match the binary layout. This is a C-specific power that high-level languages abstract away.

**c) Fixed-width integer types**
C provides `uint32_t`, `uint8_t`, `int32_t` etc. via `<stdint.h>`. These guarantee exact bit widths — critical when reading binary files where every byte position matters.

**d) Speed and portability**
C compiles to native machine code. It runs on Windows, macOS, Linux, and even bare microcontrollers — the same C code. You can cross-compile this fuzzer to run *on* the embedded device itself.

**e) littlefs is written in C**
The actual littlefs source code is written in C. To understand, simulate, and interact with its binary format, the most natural tool is C.

---

## 3. What is a File System?

A **file system** is software that organizes how data is stored on a storage device. Without it, your storage is just a flat sequence of bytes with no concept of files or folders.

### Think of it like a library

Raw storage = a warehouse full of books thrown on the floor.
File system = a librarian who organizes them on shelves, keeps a catalogue, and knows where everything is.

### The file system's catalogue

Every file system keeps special metadata that describes itself:
- How many blocks are available
- What size each block is
- Where files are located
- Access permissions

### Flash-specific challenges

Regular hard drives can overwrite data in place. **Flash memory cannot.** A flash cell must be *erased* before it can be written. This makes file systems for flash much more complex — they must track wear, remap blocks, and handle sudden power-cuts gracefully.

littlefs was designed specifically to handle all of these challenges.

---

## 4. What is littlefs?

**littlefs** (little fail-safe file system) is an open-source file system created by ARM for microcontrollers. It is designed for:

- **Tiny flash chips** — works on chips as small as 256KB
- **Power-loss resilience** — if power cuts out mid-write, it never corrupts existing data
- **Wear leveling** — spreads writes evenly so no block burns out faster than others
- **Crash consistency** — uses copy-on-write (never modifies data in place)

### Where you find littlefs

- Raspberry Pi Pico
- Arduino (various boards)
- ESP32 / ESP8266
- STM32 microcontrollers
- Any device running Zephyr RTOS or Mbed OS

### How littlefs stores data

littlefs divides flash storage into fixed-size **blocks**. Each block is either:
- A **metadata pair** (holds file names, directory entries, commit logs)
- A **data block** (holds raw file contents)

The very first metadata block always contains the **superblock** — the master description of the entire file system.

---

## 5. What is a Superblock?

The superblock is the **most important data structure** in any file system. It contains the parameters needed to mount (start using) the file system. Without a valid superblock, the file system cannot be used at all.

### The littlefs superblock layout (exactly 32 bytes)

| Offset (bytes) | Field | Size | Description |
|----------------|-------|------|-------------|
| 0–7 | `magic` | 8 bytes | Must be the ASCII string `"littlefs"` |
| 8–11 | `version` | 4 bytes | File system version (must be `0x00020000` = v2.0) |
| 12–15 | `block_size` | 4 bytes | Size of each block in bytes (must be a power of 2) |
| 16–19 | `block_count` | 4 bytes | Total number of blocks on the device |
| 20–23 | `name_max` | 4 bytes | Maximum filename length in characters |
| 24–27 | `file_max` | 4 bytes | Maximum file size in bytes |
| 28–31 | `crc` | 4 bytes | CRC32 checksum of all 28 bytes above |

**Total: 32 bytes**

### Why every field matters

- **magic**: The file system driver checks this first. If it is not `"littlefs"`, the driver refuses to mount. Any corruption here = instant death.
- **version**: Ensures backward compatibility. Old drivers reading new formats (or vice versa) need to know what they are dealing with.
- **block_size**: Must be a power of 2 because binary addressing requires it. Invalid values cause the allocator to malfunction.
- **block_count**: Tells the driver how much storage exists. Too small = data loss. Too large = access beyond physical bounds = undefined behavior.
- **name_max**: Protects against buffer overflows when handling filenames.
- **file_max**: Prevents files from growing beyond what the system can handle.
- **crc**: A cryptographic fingerprint. If any of the 28 preceding bytes changes (even by 1 bit), the CRC changes completely. This detects tampering and corruption.

---

## 6. Binary Images — What Are .bin Files?

### What "binary" means

A `.bin` file contains raw bytes — exactly as they would appear in flash memory on a device. There is no formatting, no text encoding, no headers added by the operating system. It is a direct memory dump.

### Why we use .bin instead of text files

If we stored the superblock as text (like a JSON or XML file), we would add extra parsing complexity and our data would not match what the actual hardware stores. The goal is to simulate what happens when a *real embedded device* gets its flash memory corrupted.

### What is inside `image.bin` (our clean baseline)

When the fuzzer runs Phase 1, it calls `generate_image()` which fills a `lfs_superblock_t` struct with valid values and writes the exact bytes to disk:

```
Bytes 0-7:   6C 69 74 74 6C 65 66 73   ("littlefs" in ASCII)
Bytes 8-11:  00 00 02 00               (version 2.0, stored as little-endian)
Bytes 12-15: 00 10 00 00               (block_size = 4096)
Bytes 16-19: 00 02 00 00               (block_count = 512)
Bytes 20-23: FF 00 00 00               (name_max = 255)
Bytes 24-27: FF FF FF 7F               (file_max = 2147483647)
Bytes 28-31: XX XX XX XX               (CRC32 of bytes 0-27)
```

(Exact CRC value depends on the specific field values.)

### The iteration .bin files

`fuzzed_iter_1.bin` through `fuzzed_iter_8.bin` each contain 32 bytes representing the superblock state after fuzzing AND after auto-repair for that specific iteration. They can be inspected with any hex editor (like HxD on Windows, or `xxd fuzzed_iter_1.bin` on macOS/Linux).

---

## 7. What is a Fuzzer?

### The concept

**Fuzzing** (or fuzz testing) is a software testing technique where you deliberately feed random, malformed, or unexpected inputs to a program and observe what happens. The goal is to find bugs, crashes, or security vulnerabilities.

### Our specific fuzzing approach

We do **structured binary fuzzing**. Instead of random byte spraying, we know the exact layout of the superblock and we deliberately corrupt *specific, meaningful fields* to test whether our repair algorithms can fix them.

Each of the 8 iterations:
1. Starts with a clean, valid superblock (`image.bin`)
2. Randomly picks one of 6 fields to corrupt
3. Applies a *realistic* corruption (not random noise — each corruption simulates a specific type of failure)
4. Records the corrupted state
5. Runs the repair algorithms
6. Records the repaired state
7. Validates the repaired state and records whether it is safe

### The 6 corruption types

| Field | Corruption Applied | Simulates |
|-------|--------------------|-----------|
| `magic` | One random byte replaced with a random value | Flash cell bit flip, write interruption |
| `version` | Set to `0xDEADBEEF` | Firmware downgrade, wrong image flashed |
| `block_size` | Set to a non-power-of-2 value | Partial write failure |
| `block_count` | Set to `0` | Metadata region erasure |
| `name_max` | Set to `0` | Config block corruption |
| `crc` | Bitwise NOT of original CRC | Detects if CRC checking is working |

---

## 8. Project Architecture — How All Files Connect

```
main.c
  │
  ├── generator.h / generator.c     — Creates the clean baseline image.bin
  │
  ├── fuzzer.h / fuzzer.c           — Corrupts fields, runs repairs, captures telemetry
  │   ├── superblock.h              — Defines lfs_superblock_t, IterationResult, etc.
  │   ├── crc32.h / crc32.c        — CRC32 computation
  │   └── validator.h / validator.c — Post-repair validation
  │
  ├── reporter.h / reporter.c       — Writes report.txt and report.json
  │
  └── (output)
      ├── image.bin                 — Clean baseline
      ├── fuzzed_iter_1..8.bin      — Per-iteration binary states
      ├── report.txt                — Human-readable text summary
      └── report.json               — Machine-readable data for the dashboard

ui/
  ├── index.html                    — Dashboard structure (HTML)
  ├── style.css                     — Visual styling
  ├── app.js                        — Dashboard logic (JavaScript)
  └── theory.js                     — In-app theory explanations
```

### Data flow (runtime)

```
generate_image() → image.bin
                        ↓
                  fuzz_image() × 8 iterations
                        ↓
              [read image.bin]
              [corrupt one field]
              [repair_magic / repair_block_size / repair_crc]
              [validate_image()] 
              [write fuzzed_iter_N.bin]
              [record IterationResult]
                        ↓
              report_results_json() → report.json
                        ↓
              ui/index.html + app.js → visual dashboard
```

---

## 9. Header Files (.h) — Why They Exist

### The problem they solve

In C, every source file (`.c`) is compiled independently. If `fuzzer.c` calls a function defined in `validator.c`, the compiler compiling `fuzzer.c` has never seen `validator.c` and does not know the function exists. This causes a compilation error.

### The solution: header files

A header file is a *declaration file*. It tells the compiler:
> "Trust me, this function/type/struct exists. Here is its signature. You will find the actual implementation later."

When you `#include "validator.h"` in `fuzzer.c`, the compiler learns the signatures of functions in `validator.c` without needing to see their implementation.

### What goes in a `.h` file vs a `.c` file

| Header file (`.h`) | Source file (`.c`) |
|--------------------|--------------------|
| Struct definitions | Function implementations |
| Function declarations (prototypes) | Variable storage |
| `#define` constants | Actual logic |
| `typedef` type aliases | `#include` of its own header |

### Include guards

Every `.h` file in this project has:

```c
#ifndef SUPERBLOCK_H
#define SUPERBLOCK_H
// ... contents ...
#endif // SUPERBLOCK_H
```

This is an **include guard**. It prevents the same header from being included twice in the same compilation unit, which would cause "duplicate definition" errors. Without this, if both `fuzzer.c` and `validator.c` include `superblock.h`, and both are eventually compiled together, the types would be defined twice.

### This project's header files

| Header | Declares |
|--------|----------|
| `superblock.h` | `lfs_superblock_t`, `ValidationResult`, `IterationResult`, `Severity` enum |
| `fuzzer.h` | `fuzz_image()` function, `FUZZ_ITERATIONS` constant |
| `validator.h` | `validate_image()` function |
| `reporter.h` | `report_results()`, `report_results_json()` |
| `generator.h` | `generate_image()` function |
| `crc32.h` | `crc32()` function |

---

## 10. The C Source Files — File by File

### `main.c` — The Orchestrator

`main.c` is the entry point. The OS calls `main()` when the program starts. It orchestrates the five phases:

1. **PHASE 1**: Calls `generate_image()` to create `image.bin`
2. **PHASE 2**: Calls `validate_image()` to confirm the baseline is clean
3. **PHASE 3**: Calls `fuzz_image()` which runs all 8 iterations
4. **PHASE 4**: Validates the final fuzzed image
5. **PHASE 5**: Calls `report_results()` and `report_results_json()` to write outputs

It owns the `IterationResult results[8]` array — this is where all telemetry data lives.

---

### `generator.c` — The Image Factory

Creates a valid, correct superblock and writes it to `image.bin`.

```c
int generate_image(lfs_superblock_t *sb, const char *filename) {
    memcpy(sb->magic, "littlefs", 8);
    sb->version     = 0x00020000;
    sb->block_size  = 4096;
    sb->block_count = 512;
    sb->name_max    = 255;
    sb->file_max    = 2147483647;
    sb->crc         = crc32((uint8_t *)sb, sizeof(*sb) - sizeof(uint32_t));
    // write to file...
}
```

Key point: the CRC is computed over the first 28 bytes (all fields except the CRC field itself). If CRC were included in its own checksum, you would have a circular dependency.

---

### `fuzzer.c` — The Corruption Engine

This is the heart of the project. Three internal helper functions plus the main `fuzz_image()` loop.

**Internal repair functions:**
- `repair_magic(sb)` — restores magic to `"littlefs"` if corrupted
- `repair_block_size(sb)` — snaps block size up to the next valid power of 2
- `repair_crc(sb)` — recomputes and corrects the CRC

**`capture_state(state, sb)`** — copies current superblock field values into a snapshot struct. Called three times per iteration: before fuzzing, after fuzzing, after repair.

**`fuzz_image()` loop** — 8 iterations, each:
1. Reads clean `image.bin` fresh (so each iteration starts from the same baseline)
2. Picks a random target field (0–5)
3. Corrupts it in a controlled, realistic way
4. Captures the fuzzed state
5. Runs all three repair algorithms
6. Captures the repaired state
7. Writes a `.bin` file for that iteration
8. Runs `validate_image()` to score the result

---

### `validator.c` — The Safety Checker

Reads any `.bin` file and checks all 6 rules:

| Check | Rule | Severity if violated |
|-------|------|---------------------|
| Magic | Must equal `"littlefs"` exactly | CRITICAL |
| Version | Must equal `0x00020000` | WARNING |
| block_size | Must be a power of 2 | CRITICAL |
| block_size | Must be in range [128, 65536] | WARNING |
| block_count | Must be in range [2, 65536] | CRITICAL |
| name_max | Must not be 0 | WARNING |
| CRC | Computed must match stored | CRITICAL |

Severity levels:
- **CRITICAL** → "UNSAFE - DO NOT FLASH" verdict
- **WARNING** → "CAUTION" verdict
- **INFO** → "SAFE" verdict (no blockers found)

---

### `reporter.c` — The Output Generator

Two functions:

**`report_results()`** — writes `report.txt` with ANSI colored terminal output and a plain text file version.

**`report_results_json()`** — writes `report.json`, a structured JSON file containing all 8 iterations' full telemetry: before/fuzzed/repaired states, which repairs were applied, and the validation result for each iteration.

Critical implementation detail: when writing magic bytes that may contain non-printable characters (because the fuzzer corrupted them), we cannot use raw bytes in JSON strings. JSON only allows printable ASCII characters and specific escape sequences. We convert each non-printable byte to `\u00XX` format:

```c
dst += sprintf(dst, "\\u00%02x", c);
```

This is why the browser can parse the JSON without errors.

---

### `crc32.c` — The Integrity Calculator

Implements the standard CRC-32 algorithm. CRC (Cyclic Redundancy Check) is a mathematical fingerprint of a sequence of bytes. The same bytes always produce the same CRC. Even a single bit flip produces a completely different CRC.

The implementation uses a lookup table for speed — precomputing all 256 possible byte values' contributions to the CRC. This avoids doing division for every byte.

---

## 11. The Three Mitigation Algorithms

These are the "self-healing" algorithms that make this project interesting.

### Mitigation 1 — Magic Byte Healing

```c
static int repair_magic(lfs_superblock_t *sb) {
    if (memcmp(sb->magic, "littlefs", 8) != 0) {
        memcpy(sb->magic, "littlefs", 8);
        return 1; // repaired
    }
    return 0;
}
```

**Why this works**: The magic field has one correct value. If it is anything else, replace it. No ambiguity.

**Real-world applicability**: This works if we *know* the image should be a littlefs image. In production, you would add a secondary verification step (e.g., check a backup superblock copy) before applying this mitigation.

---

### Mitigation 2 — Block Size Snap-to-Power-of-2

```c
static int repair_block_size(lfs_superblock_t *sb) {
    uint32_t n = sb->block_size;
    if (n == 0 || (n & (n - 1)) != 0) {
        uint32_t valid = 512;
        while (valid < n) valid <<= 1;
        sb->block_size = valid;
        return 1;
    }
    return 0;
}
```

**The bit trick**: `n & (n - 1)` equals 0 *only if* n is a power of 2. This is because powers of 2 in binary look like `1000...0`. Subtracting 1 gives `0111...1`. ANDing these gives 0. Any non-power has multiple bits set, so the AND is non-zero.

**The repair**: We start at 512 (minimum sane block size) and double until we exceed the corrupted value. This finds the next valid power of 2 that is ≥ the corrupted value.

**Why 512?**: Block sizes below 128 are too small to be useful, but we use 512 as a conservative minimum to avoid edge cases near the boundary.

---

### Mitigation 3 — CRC Recomputation

```c
static int repair_crc(lfs_superblock_t *sb) {
    size_t   data_len  = sizeof(lfs_superblock_t) - sizeof(uint32_t);
    uint32_t fresh_crc = crc32((uint8_t *)sb, data_len);
    if (fresh_crc != sb->crc) {
        sb->crc = fresh_crc;
        return 1;
    }
    return 0;
}
```

**Always runs last**: CRC repair must run after magic and block_size repairs, because those repairs change the bytes over which the CRC is computed. If CRC ran first, then magic was repaired, the CRC would immediately be wrong again.

**Limitation**: If the magic, version, or other fields were corrupted in ways we could not detect (for example, version changed from `0x00020000` to `0x00020001` — a valid-looking version), we would compute a CRC over the *still-corrupted* fields, producing a "correct" CRC for corrupted data. This is why CRC alone does not guarantee correctness — it only guarantees that what we have is internally consistent.

---

## 12. The Validation Engine

The validator makes a **pass/fail decision** on any binary image. It is entirely stateless — it reads the file, checks rules, returns results. It does not modify anything.

### Why independent validation matters

After repair, we need an independent judge. The fuzzer repairs and the validator validates — they are separate concerns implemented in separate files. This is **separation of concerns**, a core software engineering principle.

### Verdict logic

```
if critical_count > 0  →  "UNSAFE - DO NOT FLASH"
else if warning_count > 0  →  "CAUTION"
else  →  "SAFE"
```

A "SAFE" verdict means the image *passes all checks we know about*. It does not guarantee the image is 100% correct (there could be corruption in data blocks we are not checking), but it is safe to attempt mounting.

---

## 13. CRC32 — How Data Integrity Works

### The concept

CRC-32 produces a 32-bit (4-byte) checksum from an arbitrary byte sequence. It is used everywhere: ZIP files, Ethernet frames, USB protocol, HDMI, and file systems.

### Why CRC instead of a simple sum?

A simple byte sum (add all bytes together) is weak: transposing two bytes (swapping their order) gives the same sum. CRC uses polynomial division over GF(2) (Galois Field of 2 elements, i.e., binary math with no carries), which detects:
- Single-bit errors: 100% detection
- Two-bit errors: 100% detection  
- Burst errors up to 32 bits: 100% detection
- Random 33-bit errors: 99.99999977% detection

### The implementation

```c
uint32_t crc32(const uint8_t *data, size_t length) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < length; i++) {
        uint8_t byte = data[i];
        crc = (crc >> 8) ^ crc_table[(crc ^ byte) & 0xFF];
    }
    return crc ^ 0xFFFFFFFF;
}
```

The `0xFFFFFFFF` initialization and final XOR are standard CRC-32 refinements that improve detection of leading zeros and certain patterns.

### In this project

CRC is computed over the first 28 bytes of the superblock (all fields except the CRC field itself). The CRC covers:
- `magic[8]` — 8 bytes
- `version` — 4 bytes
- `block_size` — 4 bytes
- `block_count` — 4 bytes
- `name_max` — 4 bytes
- `file_max` — 4 bytes

Total: 28 bytes → produces a 4-byte CRC stored in `sb.crc`.

---

## 14. JSON Report Format

`report.json` is a structured file that the web dashboard reads. It contains the complete telemetry of every fuzzing iteration.

### Top-level structure

```json
{
  "total_iterations": 8,
  "iterations": [
    { ... iteration 1 ... },
    { ... iteration 2 ... },
    ...
  ]
}
```

### Per-iteration structure

```json
{
  "iteration": 1,
  "corrupted_field": 0,
  "corrupted_field_name": "magic",
  "state_before": {
    "magic": "littlefs",
    "version": 131072,
    "block_size": 4096,
    "block_count": 512,
    "name_max": 255,
    "file_max": 2147483647,
    "crc": "0xABCD1234"
  },
  "state_fuzzed": { ... },
  "state_repaired": { ... },
  "repair_magic_applied": 1,
  "repair_block_size_applied": 0,
  "repair_crc_applied": 1,
  "validation": {
    "count": 0,
    "critical_count": 0,
    "warning_count": 0,
    "verdict": "SAFE",
    "violations": []
  }
}
```

### Why JSON and not CSV or plain text?

JSON is natively parseable by JavaScript (the dashboard language) without any external libraries. `JSON.parse(text)` turns the entire report into a JavaScript object in one line. CSV would require manual field splitting; plain text would require regex parsing.

### The escape challenge

When the fuzzer corrupts the `magic` field, the corrupted bytes may be control characters (e.g., byte value 0x1B = ESC, 0x00 = null). These characters are **not valid inside JSON strings**. The solution is to encode them as Unicode escapes:

```
byte 0xEF  →  \u00ef  (in the JSON string)
```

JavaScript's JSON parser understands `\u00ef` and converts it to the correct character when reading.

---

## 15. The Web Dashboard

The dashboard is a **static web app** — it runs entirely in the browser with no server needed. It consists of four files:

### `index.html`

Defines the structure:
- Header with project title and load button
- Timeline stepper (8 clickable iteration dots)
- Three-column comparison table (Before / Fuzzed / Repaired)
- Telemetry log (what repairs were applied, validation verdict)
- Theory tab (in-app explanations)

### `style.css`

Implements the visual design:
- Premium light-mode color palette
- Glassmorphism card effects
- Highlighted diff columns (yellow = changed, green = repaired)
- Smooth CSS transitions on hover and selection
- Responsive grid layout

### `app.js`

The JavaScript controller:
- Listens for the "Load report.json" button click
- Reads the file via the `FileReader` API (browser built-in)
- Calls `JSON.parse()` on the content
- Populates all iteration dots
- On clicking a dot, updates all three columns of the comparison table
- Applies CSS classes to highlight changed vs. unchanged fields
- Shows telemetry details (which repairs ran, validation violations, verdict badge)

### `theory.js`

Injects formatted HTML into the Theory tab explaining:
- What a superblock is
- What each field does
- How each mitigation works
- Why the project uses C

---

## 16. The Makefile — How Compilation Works

### What a Makefile is

A `Makefile` is a build automation script. Instead of manually typing the compile command every time, you type `make` and it figures out what needs to be rebuilt.

### Our Makefile

```makefile
CC      = gcc
CFLAGS  = -Wall -Wextra -std=c99 -g
TARGET  = fuzzer.exe
SRCS    = main.c crc32.c generator.c fuzzer.c validator.c reporter.c
```

| Variable | Meaning |
|----------|---------|
| `CC` | The compiler to use (`gcc`) |
| `CFLAGS` | Compiler flags: show all warnings, use C99 standard, include debug info |
| `TARGET` | Output binary name |
| `SRCS` | All source files to compile |

**`-std=c99`**: Uses the C99 standard. This allows `//` single-line comments, `for (int i = 0; ...)` loop variable declarations, and fixed-width integer types. Our structs and loops depend on these.

**`-Wall -Wextra`**: "All warnings" and "extra warnings". These catch common mistakes like unused variables, missing returns, and type mismatches. Good code should compile with zero warnings.

**`-g`**: Includes debug symbols. If the program crashes, a debugger (like `gdb`) can tell you exactly which line caused the crash.

### How compilation actually works

When you run `make`:

1. `gcc` reads all six `.c` files
2. For each `.c` file, it reads the `#include`d headers to understand types and function signatures
3. It compiles each `.c` file to machine code
4. It links them all together into a single executable (`fuzzer.exe`)

All six source files are compiled as a single unit (no separate object files) for simplicity. Larger projects use separate compilation to speed up builds.

---

## 17. Memory Layout — How Structs Map to Bytes

This is the deepest C concept in the project. Understanding this is what separates C from higher-level languages.

### The struct definition

```c
typedef struct __attribute__((packed)) {
    char     magic[8];       // 8 bytes
    uint32_t version;        // 4 bytes
    uint32_t block_size;     // 4 bytes
    uint32_t block_count;    // 4 bytes
    uint32_t name_max;       // 4 bytes
    uint32_t file_max;       // 4 bytes
    uint32_t crc;            // 4 bytes
} lfs_superblock_t;          // Total: 32 bytes
```

### How this maps to the file

When you do `fwrite(&sb, sizeof(sb), 1, file)`, C writes exactly 32 bytes to the file in the exact order the fields appear in the struct. When you do `fread(&sb, sizeof(sb), 1, file)`, C reads 32 bytes and fills each field in order.

**Without `__attribute__((packed))`**, the compiler might add padding:

```
magic[8]      → bytes 0-7     (8 bytes)
[padding]     → bytes 8-11    (4 bytes added by compiler!)
version       → bytes 12-15   (4 bytes)
...
```

With `__attribute__((packed))`, no padding is added:
```
magic[8]      → bytes 0-7     (8 bytes)
version       → bytes 8-11    (4 bytes, immediately after)
block_size    → bytes 12-15   (4 bytes)
...
```

### Endianness

All multi-byte integers in this project are stored in **little-endian** order (least significant byte first), which is the native byte order on x86/x86-64 processors (Windows/macOS/Linux PCs). The same byte order is used on ARM Cortex-M processors (most microcontrollers where littlefs runs). This means the binary files are compatible across these platforms without any byte-swapping.

### Reading binary files with a hex editor

If you open `image.bin` in a hex editor (like HxD), you see:

```
Offset  00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
000000  6C 69 74 74 6C 65 66 73 00 00 02 00 00 10 00 00
000010  00 02 00 00 FF 00 00 00 FF FF FF 7F XX XX XX XX
```

- `6C 69 74 74 6C 65 66 73` = `l i t t l e f s` (ASCII)
- `00 00 02 00` = version 0x00020000 (little-endian: `00` is byte 8, `02` is byte 10)
- `00 10 00 00` = block_size 0x00001000 = 4096
- `00 02 00 00` = block_count 0x00000200 = 512
- `FF 00 00 00` = name_max = 255
- `FF FF FF 7F` = file_max = 0x7FFFFFFF = 2147483647

---

## 18. Glossary

| Term | Definition |
|------|-----------|
| **Binary file** | A file containing raw bytes, not human-readable text |
| **Block** | Fixed-size unit of storage in a flash file system |
| **Block size** | The size in bytes of each block (must be a power of 2 in littlefs) |
| **CRC (Cyclic Redundancy Check)** | A mathematical fingerprint for detecting data corruption |
| **Endianness** | The order in which multi-byte integers are stored in memory |
| **Embedded system** | A small computer built into a device (e.g., a microwave, router, drone) |
| **Flash memory** | Non-volatile storage that cannot be overwritten in place (must erase first) |
| **Fuzzing** | Deliberately corrupting inputs to test a system's resilience |
| **Header file (.h)** | A C file containing declarations (not implementations) shared across source files |
| **Include guard** | `#ifndef/#define/#endif` pattern that prevents duplicate header inclusion |
| **Iteration** | One complete cycle of: corrupt → repair → validate |
| **littlefs** | A fail-safe file system designed for microcontrollers with flash storage |
| **Mitigation** | An automatic repair algorithm that corrects a known type of corruption |
| **Packed struct** | A C struct with no compiler-inserted padding between fields |
| **Superblock** | The master metadata structure of a file system — describes all parameters |
| **Telemetry** | Recorded measurements and data from each fuzzing iteration |
| **Verdict** | The final safety assessment: SAFE / CAUTION / UNSAFE - DO NOT FLASH |
| **Wear leveling** | Spreading writes across flash cells to prevent premature burnout |

---

*Document written for the littlefs Superblock Fuzzer project.*
*This project is for educational and research purposes.*
