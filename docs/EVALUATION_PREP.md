# 🎓 EVALUATION PREP GUIDE — littlefs Superblock Fuzzer
## "What to say when the evaluator asks..."

> Read this before your viva/demo. This covers every likely question
> with clear, confident answers you can actually say out loud.

---

## 🎯 How to Do the Live Demo (in order)

When asked to show the project running, follow this exact sequence:

### Step 1 — Open terminal / command prompt in the project folder
```
cd path\to\fscrash-project\fscrash-project
```

### Step 2 — Compile it
```
mingw32-make
```
Say: *"This compiles all six C source files into a single executable using GCC."*

### Step 3 — Run it
```
.\fuzzer.exe
```
Say: *"The fuzzer now runs 8 iterations. Each iteration corrupts one field of the superblock, runs our repair algorithms, and validates the result."*

### Step 4 — Show the output files
```
dir *.bin
dir *.json
```
Say: *"These binary files are the raw superblock images. The JSON report contains the full telemetry from all 8 iterations."*

### Step 5 — Open the dashboard
Open `ui\index.html` in the browser. Click **Load report.json** and select the generated `report.json`.

Say: *"This dashboard visualizes every iteration — showing the before, fuzzed, and repaired state of each superblock field side by side."*

---

## ❓ Expected Evaluator Questions & Model Answers

---

### BASICS

**Q: What is this project about?**

> "This project simulates corruption of a flash file system's most critical data structure — the superblock — and tests whether automated mitigation algorithms can detect and repair the damage. We specifically target littlefs, a file system designed for embedded microcontrollers. We corrupt fields in the superblock, apply three self-healing algorithms, validate the result, and display everything in an interactive web dashboard."

---

**Q: Why did you choose C for this project?**

> "C gives us direct control over memory layout. We define a struct that maps byte-for-byte onto the binary file — so when we do `fread(&sb, sizeof(sb), 1, file)`, C fills the struct directly from the binary without any parsing. That is impossible cleanly in Python or Java. Also, littlefs itself is written in C, so using C lets us work with the same binary format the real file system uses. C also compiles to native machine code, which means it can actually run on the embedded devices where littlefs is deployed."

---

**Q: What is a superblock?**

> "The superblock is the master metadata structure of a file system. It contains everything the file system driver needs to mount and use the storage — things like block size, number of blocks, version, and filesystem identity. Without a valid superblock, the entire storage device becomes unusable. That's why it's the most critical target for fuzzing — if the superblock is corrupted, nothing else can work."

---

**Q: What does your superblock struct look like? Explain each field.**

Open `superblock.h` and point to it:

> "Our struct has 7 fields totaling exactly 32 bytes:
> - `magic[8]` — the ASCII string 'littlefs'. The driver checks this first; if it doesn't match, it refuses to mount.
> - `version` — the file system format version. We expect `0x00020000` meaning version 2.0.
> - `block_size` — size of each flash block in bytes. Must be a power of 2 because binary memory addressing requires it.
> - `block_count` — total number of blocks. If this is 0 or too large, the allocator crashes or accesses memory it shouldn't.
> - `name_max` — maximum filename length. Protects against buffer overflows.
> - `file_max` — maximum file size.
> - `crc` — a CRC32 checksum over all the preceding 28 bytes. Any single-bit corruption changes this."

---

**Q: What is `__attribute__((packed))` and why do you use it?**

> "By default, the C compiler adds padding bytes between struct fields to align them on word boundaries — for example, it might add 3 bytes after an 8-byte array to make the next field start at a 4-byte boundary. If that happens, our struct is no longer 32 bytes and no longer matches the binary file layout. `__attribute__((packed))` tells the compiler: do not add any padding. Every field sits directly after the previous one, exactly matching the real binary format."

---

### HEADER FILES

**Q: Why do you have `.h` files? What's the difference from `.c` files?**

> "Header files contain declarations — they tell the compiler that a function or type exists, without providing the actual implementation. When `fuzzer.c` calls `validate_image()` which is implemented in `validator.c`, the compiler compiling `fuzzer.c` needs to know the function signature. Including `validator.h` provides that. Source files contain the actual implementations. Separating them allows multiple `.c` files to share type definitions and function signatures without duplicating code."

---

**Q: What is an include guard? Why is it needed?**

> "An include guard is the pattern `#ifndef HEADER_H / #define HEADER_H / ... / #endif` at the top and bottom of every header file. If two different `.c` files both include the same header, and those files are eventually compiled together, without the guard the types and structs would be defined twice — causing 'duplicate definition' errors. The guard ensures the contents are only processed once per compilation unit, no matter how many times the file is included."

---

### FUZZING

**Q: What exactly does your fuzzer do?**

> "For each of 8 iterations, the fuzzer:
> 1. Reads the clean baseline image into a struct
> 2. Randomly picks one of 6 fields to corrupt
> 3. Applies a realistic, targeted corruption — for example, corrupting the magic field simulates a flash bit flip; setting block_size to a non-power-of-2 simulates a partial write failure
> 4. Captures a snapshot of the struct after corruption
> 5. Runs three repair algorithms
> 6. Captures the struct again after repair
> 7. Writes the result to a binary file
> 8. Runs the validator to check if the image is now safe"

---

**Q: How does your fuzzer pick which field to corrupt?**

> "We use `rand() % 6` to pick a random integer from 0 to 5, where each number maps to one field: 0 = magic, 1 = version, 2 = block_size, 3 = block_count, 4 = name_max, 5 = CRC. We seed the random number generator with `srand(time(NULL))` so each run gives different results."

---

**Q: Why do you start each iteration from the same clean image, not from the previous iteration's result?**

> "Because we want each iteration to be an independent experiment. If we fuzzed the result of the previous iteration, we'd be stacking corruptions, which would make it impossible to isolate and measure the effect of each individual mitigation algorithm. Starting fresh each time gives us clean, comparable data."

---

### MITIGATION ALGORITHMS

**Q: Explain your three mitigation algorithms.**

> "**Mitigation 1 — Magic Byte Healing**: We compare the magic field against the expected string 'littlefs'. If they don't match, we restore it. This works because there is exactly one correct value.
>
> **Mitigation 2 — Block Size Snap-to-Power-of-2**: We check if block_size is a power of 2 using the bit trick `n & (n-1) == 0`. If it fails, we start at 512 and keep doubling until we find the next valid power of 2 that's at or above the corrupted value.
>
> **Mitigation 3 — CRC Recomputation**: We recompute the CRC over the first 28 bytes and replace the stored CRC if they differ. This always runs last because the previous two repairs change bytes, which would invalidate a freshly computed CRC."

---

**Q: Explain the power-of-2 bit trick.**

Point to `validator.c` or `fuzzer.c`:
```c
(n != 0) && ((n & (n - 1)) == 0)
```
> "Powers of 2 in binary have exactly one 1-bit: 4 = 100, 8 = 1000, 16 = 10000. Subtracting 1 flips that bit and makes all lower bits 1: 4-1=3 = 011. ANDing them gives 0. For any non-power-of-2, multiple bits are set, so the AND is non-zero. This is a classic bit manipulation trick — much faster than computing log2 or doing division."

---

**Q: Why must CRC repair run last?**

> "The CRC is computed over all the preceding fields. If magic or block_size were corrupted and we repair them, those bytes change — and the correct CRC changes with them. If we repaired CRC first, then repaired magic, the CRC would immediately be wrong again because it was computed over the corrupted magic bytes. So we always repair the data fields first, then recompute the CRC at the end."

---

### VALIDATION

**Q: What does your validator check?**

> "Six checks: magic must equal 'littlefs'; version should be 0x00020000; block_size must be a power of 2 and in the range 128 to 65536; block_count must be between 2 and 65536; name_max must not be zero; and the stored CRC must match a freshly computed CRC over the first 28 bytes. Each violation is classified as CRITICAL, WARNING, or INFO."

---

**Q: What's the difference between CRITICAL and WARNING in your validator?**

> "CRITICAL violations mean the image cannot safely be used — the verdict is 'UNSAFE - DO NOT FLASH'. For example, a wrong magic byte or a failed CRC check are CRITICALs. WARNING violations mean the image might work but there could be compatibility or safety issues — like an unexpected version number. If there are only WARNINGs, the verdict is 'CAUTION'. If there are no violations at all, it's 'SAFE'."

---

### CRC32

**Q: What is CRC and why do you use it?**

> "CRC stands for Cyclic Redundancy Check. It's a mathematical function that takes any sequence of bytes and produces a fixed 32-bit fingerprint. The same bytes always give the same CRC. Even a single bit flip changes the CRC completely. We use it because it detects corruption — if the stored CRC doesn't match a freshly computed CRC, we know the data was changed. We chose CRC-32 specifically because it's the same algorithm littlefs uses in its real implementation."

---

**Q: Why do you compute CRC over 28 bytes and not all 32?**

> "The 32nd through 29th bytes are the CRC field itself. If you included the CRC in its own checksum, you'd have a circular dependency — the CRC depends on all bytes including itself, which is mathematically undefined. So we compute it over the first 28 bytes only, then store the result in the 4-byte CRC field."

---

### BINARY FILES

**Q: What are the .bin files? Why binary and not text?**

> "The `.bin` files are raw memory dumps — exactly the bytes you would find in flash memory on a physical embedded device. We use binary because that's the actual format. If we used text or JSON to store the superblock, we'd be adding layers of encoding that don't exist in real hardware. The goal is to simulate real flash corruption, so we work with the real binary format. You can open any `.bin` file in a hex editor and see the exact bytes."

---

**Q: How big is each .bin file and why?**

> "Exactly 32 bytes — the size of the `lfs_superblock_t` struct. Our struct is `__attribute__((packed))` so it has no padding. `sizeof(lfs_superblock_t)` = 8 + 4 + 4 + 4 + 4 + 4 + 4 = 32 bytes."

---

### JSON & DASHBOARD

**Q: Why generate a JSON report?**

> "JSON is natively parseable by JavaScript with a single `JSON.parse()` call — no libraries needed. The web dashboard reads this file, and using JSON means we don't need a server or backend. The dashboard is a completely static web page that runs entirely in the browser. JSON also has a clean hierarchical structure that maps naturally onto our iteration data."

---

**Q: How does the browser load a local file?**

> "We use the HTML `<input type='file'>` element and the browser's `FileReader` API. The user clicks the button, selects the file, and JavaScript reads it as text. This approach works without any server because the user is explicitly choosing the file — it doesn't trigger browser security restrictions on accessing arbitrary local files."

---

**Q: The dashboard starts blank — why?**

> "By design. The user must run the fuzzer themselves and load the resulting report. This makes the demo interactive and demonstrates that the fuzzer is actually running and generating data in real time — not showing hardcoded fake results. It's an intentional workflow: compile → run fuzzer → load report → explore."

---

### MAKEFILE

**Q: Explain your Makefile.**

> "The Makefile automates compilation. `CC=gcc` sets the compiler. `CFLAGS` sets compiler flags: `-Wall -Wextra` enables all warnings so we catch bugs early; `-std=c99` uses the C99 standard which allows `//` comments and loop variable declarations; `-g` includes debug symbols. The `all` target compiles all six `.c` files into `fuzzer.exe`. The `clean` target deletes all generated files so you can do a fresh build."

---

**Q: What is `-std=c99` and why do you need it?**

> "C99 is a version of the C standard from 1999. It introduced several features we use: `//` single-line comments, the ability to declare variables in the middle of a function (not just at the top), and the `<stdint.h>` header that provides fixed-width types like `uint32_t`. Without `-std=c99`, some compilers default to C89 which would reject our code."

---

### ARCHITECTURE

**Q: Walk me through the architecture — how do all the files connect?**

> "There are 6 source files. `main.c` is the entry point — it calls all the other modules in sequence. `generator.c` creates the clean baseline binary. `fuzzer.c` corrupts and repairs the superblock across 8 iterations — it uses `crc32.c` for CRC computation and calls `validator.c` after each repair. `validator.c` checks a binary against all 6 rules. `reporter.c` writes the results to `report.txt` and `report.json`. All shared types — the superblock struct, the result structs, the severity enum — are defined in `superblock.h` which everyone includes."

---

**Q: Why separate the code into so many files instead of one big file?**

> "Separation of concerns. Each file has one job: generator creates data, fuzzer corrupts and repairs, validator checks, reporter writes output. This makes the code easier to understand, maintain, and test. It also means if the validator logic needs to change, we only touch `validator.c` — nothing else changes. In larger real-world projects, separate files also speed up compilation because you only recompile the file that changed."

---

## 🔍 If They Ask You to Point to Specific Code

### "Show me where the CRC is computed"
→ Open `crc32.c` → show the `crc32()` function.
→ Then open `generator.c` → show `sb->crc = crc32((uint8_t *)sb, sizeof(*sb) - sizeof(uint32_t));`

### "Show me the fuzzing logic"
→ Open `fuzzer.c` → scroll to the `switch(target)` block (around line 90)

### "Show me the power-of-2 check"
→ Open `validator.c` → show `is_power_of_2()` function at the top.
→ Then in `fuzzer.c` → show `repair_block_size()` using the same trick.

### "Show me the struct"
→ Open `superblock.h` → show `lfs_superblock_t` at the top (lines 7–15).

### "Show me the validation rules"
→ Open `validator.c` → walk through the 6 `if` blocks (lines 37–87).

### "Show me the JSON output"
→ Open `reporter.c` → show `report_results_json()` starting around line 154.

---

## 💡 Key Numbers to Remember

| Thing | Value |
|-------|-------|
| Superblock size | 32 bytes |
| Fields in superblock | 7 |
| CRC computed over | 28 bytes (all fields except CRC itself) |
| Number of fuzz iterations | 8 |
| Number of mitigation algorithms | 3 |
| Number of validation checks | 6 (magic, version, block_size power-of-2, block_size range, block_count, CRC) |
| Minimum block size | 128 bytes |
| Maximum block size | 65536 bytes (64 KB) |
| Block count range | 2 to 65536 |
| Expected version | 0x00020000 |
| Magic string | "littlefs" (8 bytes, no null terminator in struct) |

---

## 🚨 What to Do If Something Goes Wrong in the Demo

| Problem | What to say & do |
|---------|-----------------|
| `mingw32-make` not found | "Let me verify the PATH. `mingw32-make` requires MinGW to be installed." Open Programs and check |
| `fuzzer.exe` crashes | "There may be a file permission issue. Let me run from the correct directory." Navigate to the project root |
| Dashboard shows "Failed to parse JSON" | "The report.json from a previous version had encoding issues. Let me regenerate it." Delete old report.json, re-run fuzzer.exe, reload |
| Dashboard is blank after loading | "The file dialog may have selected the wrong file. The report must be the one generated by the fuzzer, not the sample output." |
| They ask something you don't know | "That's a great question. My understanding is X, but let me verify that against the source code." Then open the relevant file. This is always acceptable! |

---

## 🗣️ Opening Statement (say this when asked "tell us about your project")

> "This is a C programming project that simulates corruption of a littlefs superblock — the master data structure of a file system designed for embedded microcontrollers. We wrote a fuzzer that deliberately corrupts specific fields of the superblock binary, then applies three automated mitigation algorithms to detect and repair the corruption, and finally validates whether the repaired image is safe. The entire pipeline — from binary generation to repair to validation to reporting — runs as a native C executable. We also built a web dashboard that visualizes each iteration's data, showing the before, fuzzed, and repaired states side by side. The project demonstrates concepts in systems programming, binary data manipulation, file system internals, and fault tolerance."

---

*Good luck! You built something real — own it.*
