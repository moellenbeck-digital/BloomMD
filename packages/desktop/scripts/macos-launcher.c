// A native main executable is required for a hardened, notarized wrapper bundle.
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  (void)argc;
  char executable[PATH_MAX], resolved[PATH_MAX];
  uint32_t size = sizeof(executable);
  if (_NSGetExecutablePath(executable, &size) || !realpath(executable, resolved)) {
    perror("BloomMD: cannot resolve launcher");
    return 1;
  }
  if (strncmp(resolved, "/Volumes/", 9) == 0) {
    execl("/usr/bin/osascript", "osascript", "-e",
      "display dialog \"Bitte ziehe BloomMD zuerst in den Programme-Ordner und starte die App danach erneut. / Please drag BloomMD to Applications before opening it.\" buttons {\"OK\"} default button \"OK\" with title \"BloomMD installieren / Install BloomMD\"",
      (char *)NULL);
    perror("BloomMD: cannot display installation instructions");
    return 64;
  }
  char *separator = strrchr(resolved, '/');
  if (!separator) return 1;
  separator[1] = '\0';
  if (strlcat(resolved, "launcher-electrobun", sizeof(resolved)) >= sizeof(resolved)) return 1;
  argv[0] = resolved;
  execv(resolved, argv);
  perror("BloomMD: cannot start launcher");
  return 1;
}
