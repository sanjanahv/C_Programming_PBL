#ifndef VALIDATOR_H
#define VALIDATOR_H

#include "superblock.h"

/*
 * Reads the image at `filename` into a superblock struct, then:
 *   1. Checks magic string
 *   2. Checks version field
 *   3. Checks block_size is power of 2 and in valid range
 *   4. Checks block_count is in valid range
 *   5. Checks name_max > 0
 *   6. Recomputes CRC32 and compares against stored crc
 *
 * Fills `result` with all violations found and sets verdict.
 * Returns 0 on success, -1 if file cannot be read.
 */
int validate_image(const char *filename, ValidationResult *result);

#endif
