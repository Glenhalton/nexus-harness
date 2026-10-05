// Generated from scripts/nexus-command.ts by scripts/package-npm-harness.ts.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
const HARNESS_PACKAGE = "@nexus-framework/harness";
const CLI_PACKAGE = "@nexus-framework/cli";
const NEXUS_OWNER_MARKER = `nexus-owner: ${HARNESS_PACKAGE}`;
const STUB_OWNER_FIELD = "nexusOwner";
const STUB_VERSION = "0.0.0-harness-stub";
const DELEGATION_ENV = "NEXUS_BIN_DELEGATED";
const MISSING_CLI_MESSAGE = `nexus: the NEXUS CLI came from ${HARNESS_PACKAGE}, which is no longer installed. Run "npm i -g ${CLI_PACKAGE}" (or reinstall ${HARNESS_PACKAGE}) to get it back.`;
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;
function comparePrerelease(left, right) {
  if (left === right) return 0;
  if (left === void 0) return 1;
  if (right === void 0) return -1;
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (x === void 0) return -1;
    if (y === void 0) return 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/u.test(x);
    const yNumeric = /^\d+$/u.test(y);
    if (xNumeric && yNumeric) return Number(x) > Number(y) ? 1 : -1;
    if (xNumeric) return -1;
    if (yNumeric) return 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
function compareVersions(left, right) {
  const a = SEMVER.exec(left.trim());
  const b = SEMVER.exec(right.trim());
  if (a === null || b === null) return a === null ? b === null ? 0 : -1 : 1;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return comparePrerelease(a[4], b[4]);
}
function pickNewestCli(candidates) {
  let best;
  for (const candidate of candidates) {
    if (best === void 0 || compareVersions(candidate.version, best.version) > 0) best = candidate;
  }
  return best;
}
function readJsonObject(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function isHarnessStub(dir) {
  return readJsonObject(join(dir, "package.json"))?.[STUB_OWNER_FIELD] === HARNESS_PACKAGE;
}
function readNexusCli(root, source) {
  const manifest = readJsonObject(join(root, "package.json"));
  if (manifest === void 0 || manifest.name !== CLI_PACKAGE || manifest[STUB_OWNER_FIELD] !== void 0) return void 0;
  const { version, bin } = manifest;
  const script = typeof bin === "string" ? bin : bin !== null && typeof bin === "object" ? bin.nexus : void 0;
  if (typeof version !== "string" || typeof script !== "string") return void 0;
  const entry = resolve(root, script);
  return existsSync(entry) ? { root, version, entry, source } : void 0;
}
function safeRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
function harnessNodeModules(harnessRoot) {
  const scope = dirname(harnessRoot);
  const nodeModules = dirname(scope);
  return basename(scope) === "@nexus-framework" && basename(nodeModules) === "node_modules" ? nodeModules : void 0;
}
function findBundledCli(harnessRoot) {
  let dir = harnessRoot;
  for (; ; ) {
    if (basename(dir) !== "node_modules") {
      const cli = readNexusCli(join(dir, "node_modules", "@nexus-framework", "cli"), "bundled");
      if (cli !== void 0) return cli;
    }
    const parent = dirname(dir);
    if (parent === dir) return void 0;
    dir = parent;
  }
}
function findNexusClis(harnessRoot, platform = process.platform) {
  const candidates = [];
  const nodeModules = harnessNodeModules(harnessRoot);
  if (nodeModules !== void 0 && (platform === "win32" || basename(dirname(nodeModules)) === "lib")) {
    const standalone = readNexusCli(join(nodeModules, "@nexus-framework", "cli"), "standalone");
    if (standalone !== void 0) candidates.push(standalone);
  }
  const bundled = findBundledCli(harnessRoot);
  if (bundled !== void 0 && !candidates.some((entry) => safeRealpath(entry.root) === safeRealpath(bundled.root))) {
    candidates.push(bundled);
  }
  return candidates;
}
function selectNexusCli(harnessRoot, env = process.env) {
  const candidates = findNexusClis(harnessRoot);
  if (env[DELEGATION_ENV] !== void 0) return candidates.find((entry) => entry.source === "bundled") ?? candidates[0];
  return pickNewestCli(candidates);
}
function harnessVersionLine(cli, args) {
  if (cli.source !== "bundled" || args.length !== 1 || args[0] !== "--version" && args[0] !== "-v") return void 0;
  return `${cli.version} (via ${HARNESS_PACKAGE})`;
}
async function runNexus(harnessRoot) {
  const cli = selectNexusCli(harnessRoot);
  if (cli === void 0) {
    console.error(`nexus: ${CLI_PACKAGE} is missing from this ${HARNESS_PACKAGE} install. Run "npm i -g ${CLI_PACKAGE}" or reinstall ${HARNESS_PACKAGE}.`);
    process.exitCode = 1;
    return;
  }
  const versionLine = harnessVersionLine(cli, process.argv.slice(2));
  if (versionLine !== void 0) {
    console.log(versionLine);
    return;
  }
  process.env[DELEGATION_ENV] = cli.entry;
  process.argv[1] = cli.entry;
  await import(pathToFileURL(cli.entry).href);
}
function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
function isInside(path, dir) {
  const rel = relative(dir, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function npmGlobalLayout(harnessRoot, platform = process.platform) {
  const nodeModules = harnessNodeModules(harnessRoot);
  if (nodeModules === void 0 || basename(harnessRoot) !== "harness") return void 0;
  const windows = platform === "win32";
  if (!windows && basename(dirname(nodeModules)) !== "lib") return void 0;
  const binDir = windows ? dirname(nodeModules) : join(dirname(dirname(nodeModules)), "bin");
  const launcher = join(binDir, windows ? "nexus-code.cmd" : "nexus-code");
  if (!exists(launcher)) return void 0;
  if (!windows && !isInside(safeRealpath(launcher), safeRealpath(harnessRoot))) return void 0;
  return { nodeModules, binDir, windows };
}
function stubManifest(harnessVersion) {
  return `${JSON.stringify({
    name: CLI_PACKAGE,
    version: STUB_VERSION,
    description: `Placeholder written by ${HARNESS_PACKAGE} ${harnessVersion} so "nexus" works without ${CLI_PACKAGE}. Installing ${CLI_PACKAGE} replaces it.`,
    private: true,
    type: "module",
    bin: { nexus: "bin/nexus.js" },
    [STUB_OWNER_FIELD]: HARNESS_PACKAGE
  }, null, 2)}
`;
}
const STUB_BIN_SOURCE = `#!/usr/bin/env node
// ${NEXUS_OWNER_MARKER}
// Placeholder: "npm i -g ${CLI_PACKAGE}" replaces this package.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'harness', 'bin', 'nexus.js');
if (existsSync(entry)) {
  await import(pathToFileURL(entry).href);
} else {
  console.error(${JSON.stringify(MISSING_CLI_MESSAGE)});
  process.exitCode = 1;
}
`;
function cmdShimFiles(target) {
  const winTarget = target.split("/").join("\\");
  const cmd = `@ECHO off\r
GOTO start\r
:find_dp0\r
SET dp0=%~dp0\r
EXIT /b\r
:start\r
SETLOCAL\r
CALL :find_dp0\r
\r
IF EXIST "%dp0%\\node.exe" (\r
  SET "_prog=%dp0%\\node.exe"\r
) ELSE (\r
  SET "_prog=node"\r
  SET PATHEXT=%PATHEXT:;.JS;=;%\r
)\r
\r
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${winTarget}" %*\r
`;
  const sh = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
    *CYGWIN*|*MINGW*|*MSYS*)
        if command -v cygpath > /dev/null 2>&1; then
            basedir=\`cygpath -w "$basedir"\`
        fi
    ;;
esac

if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/${target}" "$@"
else
  exec node  "$basedir/${target}" "$@"
fi
`;
  const ps1 = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  # Fix case when both the Windows and Linux builds of Node
  # are installed in the same directory
  $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe") {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "$basedir/node$exe"  "$basedir/${target}" $args
  } else {
    & "$basedir/node$exe"  "$basedir/${target}" $args
  }
  $ret=$LASTEXITCODE
} else {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "node$exe"  "$basedir/${target}" $args
  } else {
    & "node$exe"  "$basedir/${target}" $args
  }
  $ret=$LASTEXITCODE
}
exit $ret
`;
  return { "": sh, ".cmd": cmd, ".ps1": ps1 };
}
function readCmdShimTarget(path, content) {
  const pattern = path.endsWith(".cmd") ? /"%(?:~dp0|dp0%)\\([^"]+?)"\s+%[*]/u : path.endsWith(".ps1") ? /"[$]basedir[/]([^"]+?)"\s+[$]args/u : /"[$]basedir[/]([^"]+?)"\s+"[$]@"/u;
  return pattern.exec(content)?.[1];
}
function binTargetsDir(path, dir, windows) {
  try {
    if (!windows) {
      const stat = lstatSync(path);
      return stat.isSymbolicLink() && isInside(resolve(dirname(path), readlinkSync(path)), dir);
    }
    const target = readCmdShimTarget(path, readFileSync(path, "utf8"));
    return target !== void 0 && isInside(resolve(dirname(path), target.replace(/\\/gu, "/")), dir);
  } catch {
    return false;
  }
}
function writeIfChanged(path, content, mode) {
  let current;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = void 0;
  }
  if (current === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  if (mode !== void 0) chmodSync(path, mode);
  return true;
}
function ensureNpmStub(layout, harnessVersion) {
  const stubDir = join(layout.nodeModules, "@nexus-framework", "cli");
  const command = join(layout.binDir, "nexus");
  if (exists(stubDir) && !isHarnessStub(stubDir)) {
    return { status: readNexusCli(stubDir, "standalone") === void 0 ? "foreign" : "cli-installed", path: stubDir };
  }
  const bins = layout.windows ? [command, `${command}.cmd`, `${command}.ps1`] : [command];
  if (bins.some((bin) => exists(bin) && !binTargetsDir(bin, stubDir, layout.windows))) return { status: "foreign", path: command };
  const entry = join(stubDir, "bin", "nexus.js");
  let wrote = writeIfChanged(join(stubDir, "package.json"), stubManifest(harnessVersion));
  wrote = writeIfChanged(entry, STUB_BIN_SOURCE, 493) || wrote;
  const target = relative(layout.binDir, entry).split(sep).join("/");
  if (layout.windows) {
    for (const [suffix, content] of Object.entries(cmdShimFiles(target))) {
      wrote = writeIfChanged(`${command}${suffix}`, content, 493) || wrote;
    }
  } else if (!exists(command) || readlinkSync(command) !== target) {
    rmSync(command, { force: true });
    mkdirSync(layout.binDir, { recursive: true });
    symlinkSync(target, command);
    wrote = true;
  }
  return { status: wrote ? "created" : "unchanged", path: command };
}
function quoteSh(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function plainShimFiles(entry) {
  const message = MISSING_CLI_MESSAGE;
  return {
    "": `#!/bin/sh
# ${NEXUS_OWNER_MARKER}
entry=${quoteSh(entry)}
if [ -f "$entry" ]; then
  exec node "$entry" "$@"
fi
echo ${quoteSh(message)} >&2
exit 1
`,
    ".cmd": `@ECHO off\r
REM ${NEXUS_OWNER_MARKER}\r
IF NOT EXIST "${entry}" GOTO missing\r
node "${entry}" %*\r
EXIT /b %ERRORLEVEL%\r
:missing\r
ECHO ${message.replaceAll('"', "")} 1>&2\r
EXIT /b 1\r
`,
    ".ps1": `# ${NEXUS_OWNER_MARKER}
$entry = '${entry.replaceAll("'", "''")}'
if (Test-Path $entry) {
  & node $entry $args
  exit $LASTEXITCODE
}
[Console]::Error.WriteLine('${message.replaceAll("'", "''")}')
exit 1
`
  };
}
function isHarnessShim(path) {
  try {
    return readFileSync(path, "utf8").split("\n", 4).some((line) => line.includes(NEXUS_OWNER_MARKER));
  } catch {
    return false;
  }
}
const WINDOWS_COMMAND_SUFFIXES = [".cmd", ".exe", ".bat", ".ps1", ""];
function findOnPath(name, pathEnv, windows) {
  const found = [];
  for (const dir of pathEnv.split(windows ? ";" : delimiter)) {
    if (dir === "") continue;
    for (const suffix of windows ? WINDOWS_COMMAND_SUFFIXES : [""]) {
      const candidate = join(dir, `${name}${suffix}`);
      if (existsSync(candidate)) found.push(candidate);
    }
  }
  return found;
}
function findHarnessBinDir(harnessRoot, pathEnv, windows) {
  const realRoot = safeRealpath(harnessRoot);
  for (const launcher of findOnPath("nexus-code", pathEnv, windows)) {
    const dir = dirname(launcher);
    if (basename(dir) === ".bin") continue;
    if (isInside(safeRealpath(launcher), realRoot)) return dir;
    try {
      const content = readFileSync(launcher, "utf8").replaceAll("\\", "/");
      if (content.includes(`${HARNESS_PACKAGE}/bin/nexus-harness.js`)) return dir;
    } catch {
    }
  }
  return void 0;
}
function ensurePlainShim(harnessRoot, pathEnv, windows) {
  const binDir = findHarnessBinDir(harnessRoot, pathEnv, windows);
  if (binDir === void 0) return { status: "unsupported" };
  const command = join(binDir, "nexus");
  const others = findOnPath("nexus", pathEnv, windows).filter((path) => !(dirname(path) === binDir && isHarnessShim(path)));
  if (others.length > 0) return { status: "foreign", path: others[0] ?? command };
  const files = plainShimFiles(join(harnessRoot, "bin", "nexus.js"));
  let wrote = false;
  for (const suffix of windows ? ["", ".cmd", ".ps1"] : [""]) {
    wrote = writeIfChanged(`${command}${suffix}`, files[suffix], 493) || wrote;
  }
  return { status: wrote ? "created" : "unchanged", path: command };
}
function ensureNexusCommand(options) {
  const platform = options.platform ?? process.platform;
  const layout = npmGlobalLayout(options.harnessRoot, platform);
  if (layout !== void 0) {
    const manifest = readJsonObject(join(options.harnessRoot, "package.json"));
    return ensureNpmStub(layout, typeof manifest?.version === "string" ? manifest.version : "unknown");
  }
  const pathEnv = options.pathEnv ?? process.env.PATH ?? process.env.Path ?? "";
  return ensurePlainShim(options.harnessRoot, pathEnv, platform === "win32");
}
export {
  CLI_PACKAGE,
  DELEGATION_ENV,
  HARNESS_PACKAGE,
  MISSING_CLI_MESSAGE,
  NEXUS_OWNER_MARKER,
  STUB_BIN_SOURCE,
  STUB_OWNER_FIELD,
  STUB_VERSION,
  cmdShimFiles,
  compareVersions,
  ensureNexusCommand,
  findNexusClis,
  harnessVersionLine,
  isHarnessShim,
  isHarnessStub,
  npmGlobalLayout,
  pickNewestCli,
  plainShimFiles,
  readCmdShimTarget,
  readNexusCli,
  runNexus,
  selectNexusCli,
  stubManifest
};
