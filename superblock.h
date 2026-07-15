#ifndef SUPERBLOCK_H
#define SUPERBLOCK_H

#include <stdint.h>

// ─── littlefs superblock (must match binary layout exactly) ───
typedef struct __attribute__((packed)) {
    char     magic[8];       // "littlefs"
    uint32_t version;        // 0x00020000
    uint32_t block_size;     // must be power of 2 (e.g. 4096)
    uint32_t block_count;    // valid range: 2 – 65536
    uint32_t name_max;       // max filename length (e.g. 255)
    uint32_t file_max;       // max file size    (e.g. 2147483647)
    uint32_t crc;            // CRC32 over all fields above
} lfs_superblock_t;

// ─── Severity levels ───
typedef enum {
    INFO     = 0,
    WARNING  = 1,
    CRITICAL = 2
} Severity;

// ─── One detected problem ───
typedef struct {
    char     field[32];
    Severity severity;
    char     message[128];
} ViolationEntry;

// ─── Full validation result ───
#define MAX_VIOLATIONS 16

typedef struct {
    ViolationEntry violations[MAX_VIOLATIONS];
    int            count;
    int            critical_count;
    int            warning_count;
    int            info_count;
    char           verdict[64];   // "SAFE" / "CAUTION" / "UNSAFE - DO NOT FLASH"
} ValidationResult;

// ─── Superblock fields state snapshot ───
typedef struct {
    char     magic[9];        // null-terminated for safe printing
    uint32_t version;
    uint32_t block_size;
    uint32_t block_count;
    uint32_t name_max;
    uint32_t file_max;
    uint32_t crc;
} lfs_superblock_state_t;

// ─── Telemetry for one fuzz iteration ───
typedef struct {
    int                    iteration;
    int                    corrupted_field; // 0 = magic, 1 = version, 2 = block_size, 3 = block_count, 4 = name_max, 5 = crc
    char                   corrupted_field_name[32];
    
    lfs_superblock_state_t state_before;
    lfs_superblock_state_t state_fuzzed;
    lfs_superblock_state_t state_repaired;

    int                    repair_magic_applied;
    int                    repair_block_size_applied;
    int                    repair_crc_applied;

    ValidationResult       validation;
} IterationResult;

#endif // SUPERBLOCK_H
