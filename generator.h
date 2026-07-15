#ifndef GENERATOR_H
#define GENERATOR_H

#include "superblock.h"

/*
 * Fills `sb` with a valid baseline superblock and writes it to `filename`.
 * CRC32 is computed over all fields except `crc` itself.
 * Returns 0 on success, -1 on file error.
 */
int generate_image(lfs_superblock_t *sb, const char *filename);

#endif
