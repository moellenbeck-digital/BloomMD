#!/usr/bin/env bash
#
# Runs a CI command with a bounded retry for network and package-source failures only (#141).
#
#   scripts/ci-retry-network.sh [--label NAME] [--attempts N] [--timeout SECONDS] [--pause SECONDS] [--lock-wait SECONDS] -- COMMAND...
#
# Why: installs that fetch from apt mirrors or the Playwright CDN sometimes hang until the whole
# step times out (about 10 minutes) instead of failing fast. Every attempt gets its own timeout,
# so a hung download is cut off and tried again.
#
# What this does not do: hide failures. Every failed attempt that gets retried is printed as a
# `::warning::` annotation, so a run that needed a retry is visible in the log and summary. After
# the last attempt the script exits with the command's own exit code. A failure that does not look
# like a network or package-source problem (a missing package, a bad argument, a code error) is
# not retried at all and fails at once.
#
# Hangs: the command writes to a log file, not to a pipe, and the wrapper only waits for the command
# itself. With `timeout ... | tee` a child that outlives the killed command (for example the
# root-owned apt-get behind sudo, which ignores the signal) keeps the pipe open, tee never sees the
# end of the output and the attempt timeout never takes effect: the step then runs into its own
# step timeout without a single annotation (runs 40512358219 and 42048082284, #307).
#
# apt/dpkg lock: cutting off an attempt does not stop the root-owned apt-get behind sudo. It keeps
# running, holds the dpkg lock, and a retry right after fails at once with "Unable to acquire the
# dpkg frontend lock". Runs 42172271748 and 42178351349 (#307): the holder was the apt-get of the
# first attempt itself, still running after 385 s, next to a packagekitd that started 5 s earlier.
# Waiting does not help against that, so with --lock-wait N the script
#   1. terminates the apt processes (never dpkg) that appeared during a failed attempt and are
#      still running (SIGTERM, after 5 s SIGKILL, with `sudo -n` when they belong to root), and
#      names them in a `::warning::`;
#   2. before every attempt waits at most N seconds until no apt/dpkg process is running (a fresh
#      runner can still be busy with unattended-upgrades, dpkg may be finishing), naming what it
#      waits for; after N seconds it says so and tries anyway.
# Default 0: neither terminates nor waits.
#
# Annotations: a failed attempt names the last apt or network error line of the output. A timeout
# lists the processes still running afterwards and the tail of /var/log/dpkg.log.
#
# Exit code: 0 on success, otherwise the exit code of the last attempt (124 after a timeout).

set -uo pipefail

label="command"
attempts=3
attempt_timeout=120
pause=15
lock_wait=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --label) label="${2:?--label needs a value}"; shift 2 ;;
    --attempts) attempts="${2:?--attempts needs a value}"; shift 2 ;;
    --timeout) attempt_timeout="${2:?--timeout needs a value}"; shift 2 ;;
    --pause) pause="${2:?--pause needs a value}"; shift 2 ;;
    --lock-wait) lock_wait="${2:?--lock-wait needs a value}"; shift 2 ;;
    --) shift; break ;;
    *) echo "::error::ci-retry-network: unknown option $1" >&2; exit 2 ;;
  esac
done

if [ "$#" -eq 0 ]; then
  echo "::error::ci-retry-network: no command given (use -- COMMAND...)" >&2
  exit 2
fi
case "$attempts$attempt_timeout$pause$lock_wait" in
  *[!0-9]*) echo "::error::ci-retry-network: --attempts, --timeout, --pause and --lock-wait must be whole numbers" >&2; exit 2 ;;
esac
if [ "$attempts" -lt 1 ] || [ "$attempt_timeout" -lt 1 ]; then
  echo "::error::ci-retry-network: --attempts and --timeout must be at least 1" >&2
  exit 2
fi

# Output that marks a transient network or package-source problem. Deliberately narrow:
# "Unable to locate package", unknown flags or compiler errors are real failures.
network_pattern='Temporary failure resolving|Could not resolve|Could not connect|Failed to fetch|Unable to fetch some archives|Connection (timed out|reset|refused|failed)|Network is unreachable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ESOCKETTIMEDOUT|socket hang up|getaddrinfo|Hash Sum mismatch|Mirror sync in progress|Release file .* is not valid yet|Download failed|Timeout was reached|Bad Gateway|Service Unavailable|Gateway Time-?out|HTTP/[0-9.]+ 5[0-9][0-9]|status code 5[0-9][0-9]|(error|Err:[0-9]+).*https?://.* 5[0-9][0-9]|Could not get lock|Unable to acquire the dpkg frontend lock|Unable to lock directory'
# Process names (/proc/PID/comm, 15 characters at most) that hold the apt/dpkg lock. Overridable
# for the tests.
apt_holders_pattern="${CI_RETRY_APT_HOLDERS:-^(apt|apt-get|apt-cache|aptitude|dpkg|dpkg-preconfigu|unattended-upgr|apt\.systemd\.dai|apt-daily|apt-daily-upgr|packagekitd|needrestart)$}"
clock_ticks="$(getconf CLK_TCK 2>/dev/null || echo 100)"

# Lines worth quoting in an annotation: apt's own E:/Err: lines first, otherwise the network match.
error_line_pattern='^(E|Err:[0-9]+|W): |^Err:[0-9]+ '

log="$(mktemp)"
tail_pid=""
cleanup() {
  [ -n "$tail_pid" ] && kill "$tail_pid" 2>/dev/null
  rm -f "$log"
}
trap cleanup EXIT

# One line for a `::warning::`/`::error::` annotation: the last apt error line of the output,
# else the last network match; newlines and percent signs are escaped for the workflow command.
last_error_line() {
  local line
  line="$(grep -E "$error_line_pattern" "$log" | tail -n 1)"
  [ -n "$line" ] || line="$(grep -Ei "$network_pattern" "$log" | tail -n 1)"
  [ -n "$line" ] || return 0
  line="${line:0:300}"
  line="${line//'%'/%25}"
  line="${line//$'\r'/}"
  printf ' [%s]' "$line"
}

# Running apt/dpkg processes, one line each: `pid comm age-in-seconds command line`. Reads /proc
# directly: ps and pgrep are not guaranteed, and root-owned processes are visible there.
apt_scan() {
  local dir comm stat rest uptime started cmd
  local -a fields
  read -r uptime _ </proc/uptime
  for dir in /proc/[0-9]*; do
    [ "${dir#/proc/}" = "$$" ] && continue
    read -r comm <"$dir/comm" 2>/dev/null || continue
    [[ "$comm" =~ $apt_holders_pattern ]] || continue
    stat="$(<"$dir/stat")" 2>/dev/null || continue
    rest="${stat##*) }"
    read -r -a fields <<<"$rest"
    [ "${fields[0]:-Z}" = "Z" ] && continue
    started="${fields[19]:-0}"
    cmd="$(tr '\0' ' ' <"$dir/cmdline" 2>/dev/null)"
    echo "${dir#/proc/} $comm $(( ${uptime%.*} - started / clock_ticks )) ${cmd:0:80}"
  done
}

# The same as `name(pid N, Ns: command line)`, space separated, empty if none.
apt_holders() {
  local pid comm age cmd out=""
  while read -r pid comm age cmd; do
    out="$out${out:+ }$comm(pid $pid, ${age}s: ${cmd% })"
  done < <(apt_scan)
  printf '%s' "$out"
}

# Process ids of the running apt/dpkg processes, one per line.
apt_pids() {
  local pid _rest
  while read -r pid _rest; do echo "$pid"; done < <(apt_scan)
}

signal_pid() {
  kill "-$1" "$2" 2>/dev/null && return 0
  command -v sudo >/dev/null 2>&1 && sudo -n kill "-$1" "$2" 2>/dev/null
}

# After a failed attempt: terminate the apt processes (not dpkg) that were not running before the
# attempt started (ids in $1, one per line). Returns after they are gone or SIGKILLed.
reap_apt_leftovers() {
  local before="$1" pid comm age cmd names="" pids=() waited
  while read -r pid comm age cmd; do
    case "$comm" in dpkg*) continue ;; esac
    grep -qx "$pid" <<<"$before" && continue
    names="$names${names:+ }$comm(pid $pid, ${age}s)"
    pids+=("$pid")
  done < <(apt_scan)
  [ "${#pids[@]}" -gt 0 ] || return 0
  echo "::warning title=$label::terminating apt processes left behind by the failed attempt: $names"
  for pid in "${pids[@]}"; do signal_pid TERM "$pid"; done
  for waited in 1 2 3 4 5; do
    sleep 1
    grep -qxFf <(apt_pids) <<<"$(printf '%s\n' "${pids[@]}")" || return 0
  done
  for pid in "${pids[@]}"; do signal_pid KILL "$pid"; done
}

# Before an attempt: wait for apt/dpkg to be idle, at most --lock-wait seconds.
wait_for_apt_idle() {
  [ "$lock_wait" -gt 0 ] || return 0
  local holders began="$SECONDS"
  holders="$(apt_holders)"
  [ -n "$holders" ] || return 0
  echo "::warning title=$label::waiting up to ${lock_wait}s for apt/dpkg to be idle; running: $holders"
  while [ $((SECONDS - began)) -lt "$lock_wait" ]; do
    sleep 1
    holders="$(apt_holders)"
    if [ -z "$holders" ]; then
      echo "::notice title=$label::apt/dpkg idle after $((SECONDS - began))s"
      return 0
    fi
  done
  echo "::warning title=$label::apt/dpkg still busy after ${lock_wait}s ($holders); trying anyway"
}

# After a timeout: what is still running and what dpkg logged last, as a collapsed log group.
hang_diagnostics() {
  echo "::group::[$label] state after the timeout"
  local pid comm age cmd wchan
  while read -r pid comm age cmd; do
    read -r wchan <"/proc/$pid/wchan" 2>/dev/null || wchan="?"
    echo "$comm pid $pid, running ${age}s, waiting in kernel function: $wchan, command: $cmd"
  done < <(apt_scan)
  if command -v ps >/dev/null 2>&1; then
    ps -eo pid,ppid,etimes,user:12,stat,args --sort=start_time 2>/dev/null | grep -Ei 'apt|dpkg|playwright|sudo|unattended|needrestart|PID' | grep -v 'grep -Ei' | cut -c1-220
  fi
  if [ -r /var/log/dpkg.log ]; then
    echo "--- /var/log/dpkg.log (last 15 lines)"
    tail -n 15 /var/log/dpkg.log
  fi
  echo "::endgroup::"
}

before=""
attempt=1
while true; do
  wait_for_apt_idle
  [ "$lock_wait" -gt 0 ] && before="$(apt_pids)"
  echo "[$label] attempt $attempt/$attempts (timeout ${attempt_timeout}s): $*"
  : >"$log"
  timeout -k 10 "$attempt_timeout" "$@" >"$log" 2>&1 </dev/null &
  command_pid=$!
  # Live output while the command runs; --pid ends the follower with the command, not with the
  # file's last writer.
  tail -n +1 -s 0.2 -f --pid="$command_pid" "$log" &
  tail_pid=$!
  wait "$command_pid"
  status=$?
  wait "$tail_pid" 2>/dev/null
  tail_pid=""

  if [ "$status" -eq 0 ]; then
    if [ "$attempt" -gt 1 ]; then
      echo "::warning title=$label::succeeded only on attempt $attempt/$attempts"
    fi
    exit 0
  fi

  evidence="$(last_error_line)"
  holders="$(apt_holders)"
  [ -z "$holders" ] || evidence="$evidence [still running: $holders]"
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    reason="no result within ${attempt_timeout}s (hung network or package source)"
    hang_diagnostics
  elif grep -Eiq "$network_pattern" "$log"; then
    reason="network or package-source error (exit code $status)"
  else
    echo "::error title=$label::failed with exit code $status; not a network or package-source error, not retried${evidence}"
    exit "$status"
  fi

  [ "$lock_wait" -gt 0 ] && reap_apt_leftovers "$before"

  if [ "$attempt" -ge "$attempts" ]; then
    echo "::error title=$label::attempt $attempt/$attempts failed ($reason); giving up${evidence}"
    exit "$status"
  fi

  echo "::warning title=$label::attempt $attempt/$attempts failed ($reason); retrying in ${pause}s${evidence}"
  sleep "$pause"
  attempt=$((attempt + 1))
done
