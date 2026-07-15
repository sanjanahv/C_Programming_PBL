CC      = gcc
CFLAGS  = -Wall -Wextra -std=c99 -g
TARGET  = fuzzer.exe
SRCS    = main.c crc32.c generator.c fuzzer.c validator.c reporter.c

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRCS)

clean:
	if exist $(TARGET) del /q $(TARGET)
	if exist image.bin del /q image.bin
	if exist fuzzed_image.bin del /q fuzzed_image.bin
	if exist fuzzed_iter_*.bin del /q fuzzed_iter_*.bin
	if exist report.txt del /q report.txt
	if exist report.json del /q report.json
	if exist ui\report.json del /q ui\report.json

run: all
	./$(TARGET)
