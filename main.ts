// Token Launch Radar — entrypoint for make.fun's token-radar-01 bounty.
//
// What a run does, in order:
//   1. Loads the sealed DefiLlama snapshot (default /input/snapshot.json; override with
//      --input <file|directory>).
//   2. Scores every pre-token protocol with the model in lib/model.ts and sanity-checks
//      the resulting board; a board the gate refuses aborts the run.
//   3. Emits board.json (the ranked rows) and data.js (the same data as a script the
//      static dashboard reads) into the output directory.
//   4. Copies dashboard/ and screenshots/ from this repository into the output.
//   5. Writes dossier.json last, through the vendored make.fun library, because the
//      scorer rebuilds it from the finished output and compares bytes.
//
// The output directory is /output in the grader's container; elsewhere it comes from
// --output, falling back to the MAKEFUN_OUTPUT_DIR environment variable:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Caps from the competition's gate: the dossier text cap shapes the summary's bytes,
// the screenshot and dashboard caps refuse the run's output when exceeded.
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASH_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

const repoDir = fileURLToPath(new URL('.', import.meta.url));

function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** Reads `--name value` or `--name=value` from the command line, else the fallback. */
function option(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const spaced = args.indexOf(`--${name}`);
  if (spaced !== -1 && args[spaced + 1] !== undefined) return args[spaced + 1]!;
  const joined = args.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** Copies the regular, non-hidden files of one directory; returns the names copied. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const done: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    done.push(name);
  }
  return done;
}

// --- Locate and load the snapshot -------------------------------------------------

const inputGiven = option('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const outDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`, 1);

// --- Emit the board, the dashboard data, and the static assets ---------------------

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

copyDir(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyDir(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  fail(`screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
}
for (const name of shotNames) {
  if (!SHOT_NAME_OK.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  }
}

// --- The dossier closes the run ------------------------------------------------------

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_CAP, screenshots: SHOT_CAPS, dashboard: DASH_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
    `${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shotNames.length} images) ` +
    `and ${join(outDir, 'dossier.json')}\n`,
);
