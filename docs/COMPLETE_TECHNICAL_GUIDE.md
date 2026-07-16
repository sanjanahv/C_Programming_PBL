# 📖 COMPLETE TECHNICAL GUIDE
## littlefs Superblock Fuzzer — Everything You Must Know

> This document is your single source of truth before any evaluation.
> It covers terminal commands, file interconnections, frontend-backend flow,
> and 50+ viva questions with complete answers.

---

# PART 1 — HOW TO RUN IN TERMINAL (Step by Step)

## Windows (Command Prompt or PowerShell)

### Step 1 — Navigate to the project folder
```
cd C:\Users\sanjana\Desktop\fscrash-project\fscrash-project
```
Or just open the folder in File Explorer, hold Shift, right-click → "Open PowerShell window here"

### Step 2 — Clean any old build (optional but good practice)
```
mingw32-make clean
```
This deletes old `.exe`, `.bin`, `.json`, `.txt` files so you start fresh.

### Step 3 — Compile the project
```
mingw32-make
```
What happens:
- GCC reads all 6 `.c` files
- Checks all `#include` headers
- Compiles everything into one executable: `fuzzer.exe`
- If there are no errors, you will see no red text

### Step 4 — Run the fuzzer
```
.\fuzzer.exe
```
What you will see:
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
```

### Step 5 — View the text report quickly
```
type report.txt
```

### Step 6 — Open the dashboard
```
start ui\index.html
```
In the browser, click "Load report.json" → select the `report.json` in the root folder.

---

## macOS / Linux

```bash
# Navigate to project
cd ~/Desktop/fscrash-project/fscrash-project

# IMPORTANT: Edit Makefile first
# Change:  TARGET = fuzzer.exe   →   TARGET = fuzzer
# Change clean block to use rm -f instead of del

# Compile
make

# Run
./fuzzer

# View text report
cat report.txt

# Open dashboard
open ui/index.html
```

---

## What each output file contains

| File | When created | Contents |
|------|-------------|----------|
| `image.bin` | Phase 1 | 32 bytes — the clean, valid baseline superblock |
| `fuzzed_iter_1.bin` to `fuzzed_iter_8.bin` | Phase 3 | Per-iteration binary after fuzz + repair |
| `fuzzed_image.bin` | Phase 3 end | Final iteration's binary |
| `report.txt` | Phase 5 | Human-readable verdict and violation list |
| `report.json` | Phase 5 | Machine-readable full telemetry (loaded by dashboard) |
| `ui/report.json` | Phase 5 | Copy of report.json for the dashboard folder |

---

# PART 2 — HOW ALL FILES ARE INTERCONNECTED

## The Compilation Chain

```
main.c
  ├── #include "superblock.h"   ← ALL shared types live here
  ├── #include "generator.h"   ← declares generate_image()
  ├── #include "fuzzer.h"      ← declares fuzz_image()
  ├── #include "validator.h"   ← declares validate_image()
  └── #include "reporter.h"    ← declares report_results(), report_results_json()

generator.c
  ├── #include "generator.h"
  └── #include "crc32.h"       ← needs CRC to write valid checksum

fuzzer.c
  ├── #include "fuzzer.h"
  ├── #include "crc32.h"       ← needs CRC for repair_crc()
  └── #include "validator.h"   ← calls validate_image() after each repair

validator.c
  ├── #include "validator.h"
  └── #include "crc32.h"       ← recomputes CRC to compare against stored

reporter.c
  └── #include "reporter.h"    ← reads IterationResult[], writes files

crc32.c
  └── #include "crc32.h"       ← standalone math, no dependencies
```

## Data Flow at Runtime

```
main() starts
   │
   ├─→ generate_image("image.bin")
   │     └─ Creates lfs_superblock_t in memory
   │     └─ Computes CRC over first 28 bytes
   │     └─ Writes 32 raw bytes to image.bin
   │
   ├─→ validate_image("image.bin", &clean_result)
   │     └─ fread() 32 bytes from image.bin into struct
   │     └─ Checks 6 rules → verdict: SAFE
   │
   ├─→ fuzz_image("image.bin", "fuzzed_image.bin", results[8])
   │     └─ Loop 8 times:
   │          ├─ fread() clean image fresh each time
   │          ├─ rand() picks field 0-5 to corrupt
   │          ├─ Applies corruption
   │          ├─ capture_state() → results[i].state_fuzzed
   │          ├─ repair_magic()      → fixes if magic wrong
   │          ├─ repair_block_size() → fixes if not power of 2
   │          ├─ repair_crc()        → recomputes checksum LAST
   │          ├─ capture_state() → results[i].state_repaired
   │          ├─ fwrite() to fuzzed_iter_N.bin
   │          └─ validate_image(fuzzed_iter_N.bin) → records verdict
   │
   ├─→ validate_image("fuzzed_image.bin", &fuzz_result)
   │
   └─→ report_results_json(results, 8, "report.json")
         └─ Writes all 8 IterationResult structs as JSON
         └─ Writes again to ui/report.json
```

---

# PART 3 — HOW FRONTEND RENDERS THE BACKEND OUTPUT

## The Bridge: report.json

The C program and the web dashboard never "talk" to each other directly. They communicate through **a file** — `report.json`. This is called **file-based inter-process communication**.

```
C Program (backend)          report.json          Browser Dashboard (frontend)
     │                           │                          │
     │  writes ───────────────→  │  ←──── reads via         │
     │  JSON telemetry           │        FileReader API     │
     │                           │                          │
```

## Step-by-step: What happens when you click "Load report.json"

```
1. User clicks "Load report.json" button
      │
      ↓
2. HTML <input type="file"> opens OS file picker
      │
      ↓
3. User selects report.json from disk
      │
      ↓
4. Browser's FileReader API reads the file as text
   (app.js)  reader.readAsText(file)
      │
      ↓
5. reader.onload fires with the raw JSON string
      │
      ↓
6. JSON.parse(ev.target.result)
   Converts the text string into a JavaScript object
   e.g: data.iterations[0].state_before.magic = "littlefs"
      │
      ↓
7. loadReport(data) is called
      │
      ↓
8. renderStepper() creates the 8 numbered timeline dots
      │
      ↓
9. selectIteration(1) is called for the first iteration
      │
      ├─→ Updates verdict badge (SAFE / CAUTION / UNSAFE)
      ├─→ Updates telemetry log (which repairs fired)
      ├─→ Updates violation list
      └─→ renderSuperblockColumn() × 3
              Reads: state_before, state_fuzzed, state_repaired
              Compares field values
              Adds CSS class "mutated" or "repaired-field"
              Browser renders highlighted cells
```

## What each UI file is responsible for

| File | Responsibility |
|------|---------------|
| `index.html` | Page structure, tab panels, hex grid HTML, buttons |
| `style.css` | All visual styling, colors, animations, layouts |
| `app.js` | Loads JSON, manages tab state, renders iteration data |
| `layout.js` | Hex editor field highlighting and detail card updates |
| `avalanche.js` | Implements full CRC-32 in JavaScript, manages bit flip logic |
| `theory.js` | Injects formatted explanation HTML into the Theory tab |

## Why no server is needed

The dashboard is a **static web app**. No Node.js, no Flask, no PHP. The browser itself:
- Reads the local HTML/CSS/JS files
- Uses the native `FileReader` API (built into every browser) to read report.json
- Computes CRC-32 itself in `avalanche.js` using the same algorithm as the C code

This is why you just double-click `index.html` — no server required.

---

# PART 4 — COMPLETE VIVA Q&A (50+ Questions)

---

## 🔵 SECTION A — Pure C Language Concepts

**Q: What is the difference between signed int and unsigned int?**

> A `signed int` can hold both negative and positive values. On a 32-bit system, range is −2,147,483,648 to +2,147,483,647. It uses 1 bit for the sign (0 = positive, 1 = negative) leaving 31 bits for the value.
>
> An `unsigned int` has no sign bit — all 32 bits store the value. Range is 0 to 4,294,967,295. We use `uint32_t` in our superblock struct specifically because block sizes, CRC values, and counts are always non-negative, and we need exactly 32 bits with no sign ambiguity.

---

**Q: What is `uint32_t`? Why not just use `int`?**

> `uint32_t` is a fixed-width type defined in `<stdint.h>`. It guarantees exactly 32 bits unsigned regardless of the platform. A plain `int` might be 16 bits on some older compilers/hardware. Since we are reading raw binary files where byte positions must match exactly, we cannot afford any size variation.

---

**Q: What is a struct in C? How is it different from a class?**

> A `struct` in C is a collection of variables of different types grouped under one name. Unlike a class in C++, a C struct has no methods, no access modifiers (public/private), and no constructors. It is purely a data container. Structs allow us to treat multiple related fields as a single unit — we can pass `&sb` to a function and it gets all 7 superblock fields at once.

---

**Q: What does `__attribute__((packed))` do?**

> By default, the C compiler inserts padding bytes between struct fields to align them on word boundaries (usually 4-byte or 8-byte boundaries). For example, after `char magic[8]`, the compiler might add 0 padding bytes since it's already 8 bytes. But for other field combinations, it could add 1–3 padding bytes.
>
> `__attribute__((packed))` tells GCC to remove all padding. Every field sits directly after the previous one. This ensures `sizeof(lfs_superblock_t) == 32`, and `fread(&sb, sizeof(sb), 1, f)` reads exactly the right bytes from the binary file.

---

**Q: What is the difference between `fread` and `scanf`?**

> `scanf` reads formatted text from stdin (keyboard). It parses characters and converts them — for example, reading "4096" as a string and converting it to an integer.
>
> `fread` reads raw binary data from a file directly into memory. No parsing, no conversion. It copies bytes byte-by-byte from the file into a buffer/struct. We use `fread` because our `.bin` file contains raw binary — not human-readable text.

---

**Q: What is the difference between `malloc` and a stack variable?**

> A stack variable like `lfs_superblock_t sb;` is allocated automatically when the function is called and freed when the function returns. Fast, but limited in size and lifetime.
>
> `malloc(size)` allocates memory on the heap at runtime. It persists until you call `free()`. We don't use `malloc` in this project because our superblock is a fixed 32 bytes — perfect for stack allocation.

---

**Q: What is a pointer? Give an example from your project.**

> A pointer is a variable that stores the memory address of another variable. In our project, `fread(&sb, sizeof(sb), 1, f)` — the `&sb` is a pointer (address of the struct). We also write `(uint8_t *)&sb` when passing to `crc32()`, which treats the struct as a flat array of bytes starting at that address.

---

**Q: What is `memcmp`? Where did you use it?**

> `memcmp(ptr1, ptr2, n)` compares `n` bytes of memory starting at `ptr1` and `ptr2`. Returns 0 if identical, non-zero if different.
>
> We use it in `repair_magic()`: `memcmp(sb->magic, "littlefs", 8)`. This compares 8 bytes of the magic field against the expected string. We cannot use `strcmp` here because the magic field is not null-terminated inside the struct — it's exactly 8 bytes, no null character.

---

**Q: Why do you use `memcpy` instead of `=` to copy the magic string?**

> The magic field is `char magic[8]` — an array. In C, you cannot assign arrays with `=`. `sb.magic = "littlefs"` is a compile error. `memcpy(sb->magic, "littlefs", 8)` copies 8 bytes from the string literal into the array — the correct approach.

---

**Q: What is `#define` and how do you use it in your project?**

> `#define` creates a compile-time constant or macro. Before compilation, the preprocessor replaces every occurrence of the macro name with its value.
>
> In our project: `#define FUZZ_ITERATIONS 8` in `fuzzer.h`. If we want to change to 16 iterations, we change one line instead of finding every `8` in the code.

---

**Q: What is the difference between `#include "file.h"` and `#include <file.h>`?**

> Angle brackets `<file.h>` tell the compiler to look in the system's standard library include directories (where `stdio.h`, `stdlib.h` etc. are stored).
>
> Quotes `"file.h"` tell the compiler to look in the current directory first, then fall back to system directories. We use quotes for our own headers (`"superblock.h"`, `"validator.h"`) and angle brackets for standard library headers.

---

**Q: What is an enum? Where do you use it?**

> An `enum` is a named set of integer constants. In `superblock.h`:
> ```c
> typedef enum { INFO = 0, WARNING = 1, CRITICAL = 2 } Severity;
> ```
> Instead of using magic numbers like `if (severity == 2)`, we write `if (severity == CRITICAL)` — much more readable and less error-prone.

---

**Q: What is `typedef`?**

> `typedef` creates an alias for an existing type. `typedef struct { ... } lfs_superblock_t` lets us write `lfs_superblock_t sb` instead of `struct lfs_superblock_t_struct sb`. It makes the code cleaner and hides the underlying type.

---

**Q: What is the difference between `char *` and `char[]`?**

> `char *str = "hello"` is a pointer to a string literal stored in read-only memory. You cannot modify the characters.
>
> `char arr[] = "hello"` allocates a modifiable array on the stack with a copy of the string. Our `magic[8]` is a `char` array — we can corrupt and restore it freely.

---

**Q: What is `static` in a function context?**

> When `static` is placed before a function (e.g., `static int repair_magic(...)`), it restricts the function's visibility to the file where it is defined. Other `.c` files cannot call it. We use `static` for the three repair functions in `fuzzer.c` because they are internal implementation details — only `fuzz_image()` should call them.

---

**Q: What is `void` as a return type?**

> `void` means the function returns nothing. `generate_image()` returns `int` (0 for success, -1 for failure). `capture_state()` returns `void` because it just copies data — there is nothing meaningful to return.

---

**Q: What is little-endian byte order? How does it affect your project?**

> Little-endian means multi-byte integers are stored with the least significant byte first in memory.
>
> For example, `block_size = 4096 = 0x00001000`. In little-endian, this is stored in memory as: `00 10 00 00` (lowest byte first). This is the native byte order on x86 Windows/Mac and ARM microcontrollers where littlefs runs — so our `.bin` files are directly compatible with real hardware without byte-swapping.

---

## 🟢 SECTION B — Project-Specific Technical Questions

**Q: Walk me through what happens when you run `.\fuzzer.exe`.**

> Five phases:
> 1. `generate_image()` creates a 32-byte valid superblock, computes CRC, writes `image.bin`
> 2. `validate_image("image.bin")` confirms the baseline is clean — verdict: SAFE
> 3. `fuzz_image()` runs 8 iterations: each reads `image.bin` fresh, corrupts one field, runs 3 repair algorithms, validates, writes a per-iteration `.bin` file, records telemetry into `results[]`
> 4. `validate_image("fuzzed_image.bin")` validates the final iteration's output
> 5. `report_results_json(results, 8, "report.json")` serializes all 8 `IterationResult` structs to JSON and writes the file twice (root + ui/)

---

**Q: Why does each iteration read `image.bin` fresh instead of using the previous iteration's result?**

> To ensure each iteration is an independent, isolated experiment. If we started from the previous iteration's (already corrupted and repaired) state, we would be stacking corruptions. The results would not be comparable. Starting from the same clean baseline lets us measure the effect of each individual corruption and repair cleanly.

---

**Q: What is the bit trick used for power-of-2 detection?**

> `(n != 0) && ((n & (n - 1)) == 0)`
>
> Powers of 2 in binary have exactly one 1-bit: 4 = `100`, 8 = `1000`, 16 = `10000`. Subtracting 1 flips that bit and fills lower bits with 1s: 4-1 = 3 = `011`. ANDing: `100 & 011 = 000`. For non-powers, multiple bits are set so the AND is non-zero. This is O(1) — no loops, no division.

---

**Q: Why must CRC repair always run last?**

> The CRC is computed over the first 28 bytes — all fields except CRC itself. If `repair_magic()` changes the magic bytes and then `repair_crc()` runs, the CRC is correctly computed over the repaired magic. If we ran `repair_crc()` first, then repaired magic, the CRC would be computed over the corrupted magic — immediately wrong. Order: magic repair → block_size repair → CRC repair.

---

**Q: What is the difference between CRITICAL, WARNING, and INFO in your validator?**

> - `CRITICAL` violations mean the image is structurally broken and cannot safely be used — verdict: "UNSAFE - DO NOT FLASH". Examples: wrong magic string, failed CRC, block_count out of range.
> - `WARNING` violations mean the image might work but has unexpected parameters — verdict: "CAUTION". Example: wrong version number.
> - `INFO` would be informational only — verdict remains "SAFE". Not currently triggered in our implementation.

---

**Q: Why is `crc` computed over 28 bytes and not 32?**

> The CRC field itself occupies bytes 28–31. Computing CRC over all 32 bytes would include the CRC field in its own checksum — a circular dependency. The correct checksum is computed over bytes 0–27 (all 7 fields minus CRC), then stored in bytes 28–31.

---

**Q: How does `report_results_json()` handle non-printable bytes in the magic field?**

> When the fuzzer corrupts the magic field, it may replace a byte with a control character like `0x1B` (ESC) or `0x00` (null). JSON strings cannot contain these directly. The reporter checks each byte: if it is a printable ASCII character (32 ≤ c < 127), it writes it directly. Otherwise, it writes `\u00XX` — the standard JSON unicode escape format. This ensures the browser's `JSON.parse()` can read the file without throwing a syntax error.

---

**Q: What does the `ValidationResult` struct contain?**

> ```c
> typedef struct {
>     ViolationEntry violations[16];
>     int count;
>     int critical_count;
>     int warning_count;
>     int info_count;
>     char verdict[64];
> } ValidationResult;
> ```
> It holds up to 16 individual violations (each with field name, severity, message), counts by severity, and the final verdict string.

---

**Q: What does `IterationResult` contain?**

> One per fuzzing iteration. Contains:
> - `iteration` number
> - `corrupted_field` (0–5) and name
> - `state_before`, `state_fuzzed`, `state_repaired` — three snapshots of all 7 superblock fields
> - `repair_magic_applied`, `repair_block_size_applied`, `repair_crc_applied` — flags (0 or 1)
> - `validation` — the full `ValidationResult` after repair

---

**Q: How does the dashboard know which field was changed?**

> In `app.js`, the `renderSuperblockColumn()` function compares field values between states. For the Fuzzed column, it compares each field against `state_before`. If `current[field] !== baseline[field]`, it adds the CSS class `"mutated"` to that row — turning it yellow. For the Repaired column, it checks if the fuzzed value was changed and if the repair further changed it — adding `"repaired-field"` class (green highlight).

---

## 🟡 SECTION C — C Data Types Deep Dive

**Q: How much memory does `lfs_superblock_t` occupy? Prove it.**

> ```
> char  magic[8]    =  8 bytes
> uint32_t version  =  4 bytes
> uint32_t block_size = 4 bytes
> uint32_t block_count = 4 bytes
> uint32_t name_max  = 4 bytes
> uint32_t file_max  = 4 bytes
> uint32_t crc       = 4 bytes
> Total = 8 + 4×6   = 32 bytes
> ```
> `sizeof(lfs_superblock_t) == 32` — you can print this to confirm.

---

**Q: What is the difference between `int`, `long`, and `long long`?**

> - `int`: typically 32 bits on modern systems (but not guaranteed by C standard)
> - `long`: at least 32 bits, often 64 bits on 64-bit Linux, 32 bits on Windows
> - `long long`: guaranteed at least 64 bits
>
> We avoid all of these and use `uint32_t` instead — it guarantees exactly 32 bits on every platform.

---

**Q: What is `size_t`?**

> `size_t` is an unsigned integer type used to represent the size of objects in memory. `sizeof()` returns `size_t`. It is 32-bit on 32-bit platforms and 64-bit on 64-bit platforms. We use it in `crc32(const uint8_t *data, size_t length)` because the length of data is always non-negative and its size depends on the platform.

---

**Q: What is `uint8_t` and why do you cast to it for CRC computation?**

> `uint8_t` is an unsigned 8-bit integer (0–255) — exactly one byte. When we compute CRC, we pass `(uint8_t *)&sb` — treating the struct as a flat array of individual bytes. This lets the CRC loop process one byte at a time using `data[i]`. Without the cast, the compiler would complain about type mismatch since `&sb` is a pointer to `lfs_superblock_t`, not `uint8_t`.

---

**Q: What is integer overflow? Does it affect your project?**

> Integer overflow occurs when a computation exceeds the maximum value a type can hold. For `uint32_t`, max is 4,294,967,295. If you add 1 to that, it wraps to 0 (unsigned overflow is well-defined in C as modular arithmetic).
>
> In our CRC table computation, we deliberately rely on unsigned 32-bit overflow wrapping to implement the polynomial arithmetic — this is intentional and correct.

---

**Q: What is the difference between `==` and `=` in C?**

> `=` is assignment: `sb.version = 4096` sets the value.
> `==` is comparison: `if (sb.version == 0x00020000)` checks equality.
>
> A common bug is writing `if (n = 0)` — this assigns 0 and the condition is always false. Our validator uses `==` for all comparisons.

---

## 🔴 SECTION D — File Systems & Embedded Context

**Q: What is a file system and why do embedded devices need one?**

> A file system is software that organizes how data is stored on storage media. Without it, storage is just a flat array of bytes with no concept of files or directories. Embedded devices need file systems to persistently save configuration, logs, sensor data, and firmware updates across reboots. Without persistence, every power cycle loses all data.

---

**Q: Why is littlefs specifically designed for flash memory?**

> Flash memory cannot be overwritten in place — it must be erased before writing. Erasure happens in large "blocks" (not individual bytes). littlefs handles this by:
> - Never overwriting data in place (copy-on-write)
> - Tracking which blocks are worn out (wear leveling)
> - Surviving power loss mid-write without corruption (journaling)
> - Working within tiny RAM budgets (no garbage collection pauses)

---

**Q: What would happen if the superblock is not recovered on a real device?**

> Without superblock recovery, the filesystem cannot be mounted. The device loses access to all stored data — configuration, calibration data, logs. In critical systems (medical devices, industrial sensors), this means the device is functionally bricked until manually reflashed. Our project's mitigation prevents this by healing the superblock in-place.

---

**Q: What is wear leveling?**

> Flash memory cells degrade with each write/erase cycle. Wear leveling distributes write operations evenly across all available blocks so no single block degrades faster than others. littlefs does this inherently through its copy-on-write design — it never writes to the same block repeatedly.

---

**Q: What is CRC-32 vs MD5 vs SHA-256? Why use CRC-32 here?**

> All three are checksums/hashes, but:
> - CRC-32: Fast, hardware-acceleratable, 4 bytes output. Designed for error detection, not security.
> - MD5: 16 bytes output. Cryptographic hash (now broken for security). Overkill for storage integrity.
> - SHA-256: 32 bytes output. Cryptographically secure. Far too expensive for embedded microcontrollers.
>
> CRC-32 is the right choice for file system integrity because: (1) speed matters on microcontrollers, (2) we're protecting against accidental corruption — not malicious attacks, (3) littlefs itself uses CRC-32 in its real implementation.

---

## 🟣 SECTION E — Dashboard & JavaScript Questions

**Q: How does the browser read a local file without a server?**

> Using the HTML File Input API combined with the FileReader API. The `<input type="file">` element lets the user explicitly select a file from disk. JavaScript's `FileReader.readAsText(file)` reads the file content. This is allowed because the user explicitly chose the file — there is no security bypass. No server needed.

---

**Q: How does JSON.parse work?**

> `JSON.parse(string)` is a built-in JavaScript function that converts a JSON-formatted string into a JavaScript object. For example, `JSON.parse('{"version": 131072}')` returns the JavaScript object `{version: 131072}`. We use it to convert the entire contents of `report.json` into a nested JavaScript object that the dashboard can then access field-by-field.

---

**Q: How is the CRC32 implemented in the JavaScript Avalanche simulator?**

> It uses the same IEEE 802.3 polynomial (0xEDB88320) as the C implementation. A 256-entry lookup table is precomputed at page load. For each input byte, the CRC is updated as `crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)`. The `>>>` operator is JavaScript's unsigned right shift — critical because JavaScript numbers are signed 64-bit floats internally, so we must use unsigned shift to avoid sign extension errors.

---

**Q: What does `>>> 0` do in JavaScript?**

> In JavaScript, bitwise operations return signed 32-bit integers. The `>>> 0` operation (unsigned right shift by 0 bits) converts any signed 32-bit integer to an unsigned 32-bit integer. We use `return (crc ^ 0xFFFFFFFF) >>> 0` to ensure the final CRC value is always a positive number matching what the C implementation produces.

---

## 🔵 SECTION F — Build System Questions

**Q: What does `make` do? How does it know what to compile?**

> `make` reads the `Makefile` in the current directory. It follows the rules defined there:
> - `CC = gcc` — use GCC compiler
> - `SRCS = main.c crc32.c ...` — these are the source files
> - `$(TARGET): $(SRCS)` — the target depends on all source files
> - `$(CC) $(CFLAGS) -o $(TARGET) $(SRCS)` — this is the actual compile command
>
> `make` also does dependency checking — if source files haven't changed since the last build, it skips recompilation.

---

**Q: What does `-Wall -Wextra` do in the compiler flags?**

> `-Wall` enables all common warnings: unused variables, missing return statements, implicit function declarations, etc.
> `-Wextra` enables additional warnings beyond `-Wall`.
>
> These don't stop compilation — they just print warnings. Good code should compile with zero warnings.

---

**Q: What does `-g` do in the compiler flags?**

> `-g` includes debug symbols in the compiled binary. This means if the program crashes, a debugger (like `gdb`) can show exactly which line of source code caused the crash, and the values of all variables at that point. Without `-g`, you'd only see a memory address — useless for debugging.

---

**Q: What is the difference between compiling and linking?**

> **Compiling** converts each `.c` file into machine code (object files `.o`).
> **Linking** combines all object files and resolves references between them — for example, `fuzzer.c` calls `validate_image()` defined in `validator.c`. The linker connects these. Our Makefile compiles and links in one step (no separate `.o` files), which is simpler for small projects.

---

# PART 5 — KEY NUMBERS TO NEVER FORGET

| Fact | Value |
|------|-------|
| Superblock size | 32 bytes |
| Fields in superblock | 7 |
| CRC computed over | 28 bytes (bytes 0–27) |
| CRC stored at | Bytes 28–31 |
| Fuzzing iterations | 8 |
| Possible corruption targets | 6 (magic, version, block_size, block_count, name_max, crc) |
| Mitigation algorithms | 3 (magic heal, block_size snap, CRC recompute) |
| Validation checks | 6 rules |
| Magic string | "littlefs" (8 bytes, no null terminator in struct) |
| Expected version | 0x00020000 |
| Default block_size | 4096 bytes |
| Default block_count | 512 blocks |
| Default name_max | 255 characters |
| Default file_max | 2,147,483,647 bytes (0x7FFFFFFF) |
| CRC polynomial | 0xEDB88320 (IEEE 802.3) |
| Probability of false CRC match | 1 in 4,294,967,296 |
| Avalanche effect target | ~50% of output bits change per 1-bit input change |

---

# PART 6 — THINGS YOU MUST NEVER SAY

❌ "We used the littlefs source code"
✅ "We used the littlefs binary format specification as a target"

❌ "The frontend calls the C program"
✅ "The frontend reads the JSON file that the C program generated"

❌ "The dashboard is a website"
✅ "The dashboard is a static web app — no server required"

❌ "CRC detects and fixes corruption"
✅ "CRC detects corruption. Our mitigations fix it."

❌ "We just used random corruption"
✅ "We used structured, field-targeted corruption to simulate realistic failure modes"

❌ "The struct is 32 bytes because we set it to 32"
✅ "The struct is 32 bytes because 8 + (6 × 4) = 32, and __attribute__((packed)) ensures no padding is added"

---

*This guide covers everything needed for a confident technical presentation.*
