#ifndef REPORTER_H
#define REPORTER_H

#include "superblock.h"

/*
 * Prints the ValidationResult of the final iteration to terminal (with ANSI colors)
 * and writes the same output to report.txt.
 */
void report_results(const ValidationResult *result, const char *report_file);

/*
 * Writes the structured results of all fuzzing iterations to a JSON file (report.json).
 */
void report_results_json(const IterationResult *results, int count, const char *json_file);

#endif
