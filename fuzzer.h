#ifndef FUZZER_H
#define FUZZER_H

#include "superblock.h"

#define FUZZ_ITERATIONS 8

/*
 * Reads the clean baseline image, runs FUZZ_ITERATIONS rounds of:
 *   1. Corruption of a random field
 *   2. Mitigation/Repair repairs
 *   3. Validation of the post-mitigation image
 *   4. Logging all details into the iterations telemetry array
 *   5. Writing the resulting image to iter-specific files: "fuzzed_iter_N.bin"
 *
 * Saves the last iteration to dst_file (fuzzed_image.bin).
 */
void fuzz_image(const char *src_file, const char *dst_file, IterationResult *results);

#endif
