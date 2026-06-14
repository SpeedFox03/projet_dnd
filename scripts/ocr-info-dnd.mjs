/**
 * OCR scanned PDFs from ./info_dnd into ./info_dnd_ocr.
 *
 * The generated .ocr.txt files intentionally keep pdf-parse page markers:
 *   -- 42 of 321 --
 * so scripts/build-info-dnd.mjs can reuse the same page lookup helpers.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INFO_DIR = path.join(ROOT, 'info_dnd');
const OCR_DIR = path.join(ROOT, 'info_dnd_ocr');
const TEMP_DIR = path.join(OCR_DIR, '.tmp');
const SAMPLE_DIR = path.join(OCR_DIR, '_samples');
const OCR_STREAM_SCRIPT = path.join(__dirname, 'ocr-image-stream.ps1');

const DEFAULT_WIDTH = 1800;
const DEFAULT_MIN_CHARS_PER_PAGE = 40;

const options = parseArgs(process.argv.slice(2));

await main();

async function main() {
  await mkdir(OCR_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const pdfFiles = (await readdir(INFO_DIR))
    .filter((file) => file.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b, 'fr'));

  const selected = selectFiles(pdfFiles, options.fileFilters);
  if (!selected.length) {
    console.log('No PDF matched the requested filter.');
    return;
  }

  const targets = [];
  for (const file of selected) {
    const abs = path.join(INFO_DIR, file);
    const info = await readPdfInfo(abs);
    const pageSelection = options.pageSpec ? parsePageSpec(options.pageSpec, info.total) : allPages(info.total);
    const sampleOnly = Boolean(options.pageSpec) && !options.writeCache;
    const outPath = sampleOnly ? sampleOcrPath(file, options.pageSpec) : ocrPath(file);

    if (!sampleOnly && existsSync(outPath) && !options.force) {
      console.log(`Skip OCR cache exists: ${file}`);
      continue;
    }

    let shouldOcr = options.all || Boolean(options.pageSpec) || options.fileFilters.length > 0;
    let sampleStats = null;
    if (!shouldOcr) {
      sampleStats = await measureNativeText(abs, info.total);
      shouldOcr = sampleStats.charsPerPage < options.minCharsPerPage;
    }

    if (!shouldOcr) {
      const ratio = sampleStats ? `${sampleStats.charsPerPage.toFixed(1)} chars/page` : 'text found';
      console.log(`Skip text PDF: ${file} (${ratio})`);
      continue;
    }

    targets.push({ file, abs, total: info.total, pages: pageSelection, outPath, sampleOnly, sampleStats });
  }

  if (!targets.length) {
    console.log('No OCR target found.');
    return;
  }

  console.log(`OCR targets: ${targets.length}`);
  for (const target of targets) {
    console.log(`- ${target.file} (${target.pages.length}/${target.total ?? '?'} pages)`);
  }

  if (options.dryRun) return;

  const worker = createOcrWorker(options.language);
  try {
    for (const target of targets) {
      await ocrPdf(target, worker);
    }
  } finally {
    await worker.close();
    await rm(TEMP_DIR, { recursive: true, force: true });
  }
}

async function readPdfInfo(file) {
  const data = await readFile(file);
  const parser = new PDFParse({ data });
  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    return { total: info.total ?? 0 };
  } finally {
    await parser.destroy();
  }
}

async function measureNativeText(file, total) {
  const pages = samplePages(total);
  if (!pages.length) return { chars: 0, pages: 0, charsPerPage: 0 };
  const data = await readFile(file);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ partial: pages });
    const chars = meaningfulTextLength(result.text ?? '');
    return { chars, pages: pages.length, charsPerPage: chars / pages.length };
  } catch {
    return { chars: 0, pages: pages.length, charsPerPage: 0 };
  } finally {
    await parser.destroy();
  }
}

async function ocrPdf(target, worker) {
  const outputDir = path.dirname(target.outPath);
  await mkdir(outputDir, { recursive: true });

  const partialPath = `${target.outPath}.partial`;
  await rm(partialPath, { force: true });
  await writeFile(partialPath, '', 'utf8');

  const label = target.sampleOnly ? 'sample' : 'cache';
  console.log(`OCR ${label}: ${target.file}`);

  const data = await readFile(target.abs);
  const parser = new PDFParse({ data });
  try {
    let done = 0;
    for (const pageNumber of target.pages) {
      done += 1;
      const imagePath = await renderPage(parser, target.file, pageNumber);
      const result = await worker.recognize(imagePath);
      await rm(imagePath, { force: true });

      if (result.error) {
        console.warn(`  page ${pageNumber}: ${result.error}`);
      }

      const text = normalizeOcrText(result.text);
      await appendFile(
        partialPath,
        `-- ${pageNumber} of ${target.total || target.pages.length} --\n${text}\n\n`,
        'utf8',
      );

      const chars = meaningfulTextLength(text);
      console.log(`  ${done}/${target.pages.length} page ${pageNumber}: ${chars} chars`);
    }
  } finally {
    await parser.destroy();
  }

  await rm(target.outPath, { force: true });
  await rename(partialPath, target.outPath);
  console.log(`Wrote ${path.relative(ROOT, target.outPath)}`);
}

async function renderPage(parser, file, pageNumber) {
  const safeName = slugify(path.basename(file, '.pdf'));
  const imagePath = path.join(TEMP_DIR, `${safeName}-p${String(pageNumber).padStart(4, '0')}.png`);
  const result = await parser.getScreenshot({
    partial: [pageNumber],
    desiredWidth: options.width,
    imageDataUrl: false,
    imageBuffer: true,
  });
  const page = result.pages?.[0];
  if (!page?.data) throw new Error(`Unable to render page ${pageNumber} from ${file}`);
  await writeFile(imagePath, page.data);
  return imagePath;
}

function createOcrWorker(language) {
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    OCR_STREAM_SCRIPT,
    '-Language',
    language,
  ], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.warn(text);
  });

  const queue = [];
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const pending = queue.shift();
    if (!pending) return;
    try {
      pending.resolve(JSON.parse(line));
    } catch (error) {
      pending.reject(new Error(`Invalid OCR JSON: ${line}\n${error.message}`));
    }
  });

  child.on('exit', (code) => {
    const error = new Error(`OCR worker exited with code ${code}`);
    while (queue.length) queue.shift().reject(error);
  });

  return {
    recognize(imagePath) {
      if (!child.stdin.writable) throw new Error('OCR worker stdin is closed');
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
        child.stdin.write(`${imagePath}\n`, 'utf8', (error) => {
          if (error) {
            const pending = queue.pop();
            if (pending) pending.reject(error);
            reject(error);
          }
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.stdin.end();
      });
    },
  };
}

function parseArgs(args) {
  const parsed = {
    all: false,
    dryRun: false,
    fileFilters: [],
    force: false,
    language: 'fr-FR',
    minCharsPerPage: DEFAULT_MIN_CHARS_PER_PAGE,
    pageSpec: '',
    width: DEFAULT_WIDTH,
    writeCache: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all') parsed.all = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--write-cache') parsed.writeCache = true;
    else if (arg.startsWith('--width=')) parsed.width = Number(arg.slice('--width='.length));
    else if (arg === '--width') parsed.width = Number(args[++i]);
    else if (arg.startsWith('--pages=')) parsed.pageSpec = arg.slice('--pages='.length);
    else if (arg === '--pages') parsed.pageSpec = args[++i] ?? '';
    else if (arg.startsWith('--file=')) parsed.fileFilters.push(arg.slice('--file='.length));
    else if (arg === '--file') parsed.fileFilters.push(args[++i] ?? '');
    else if (arg.startsWith('--language=')) parsed.language = arg.slice('--language='.length);
    else if (arg === '--language') parsed.language = args[++i] ?? parsed.language;
    else if (arg.startsWith('--min-chars=')) parsed.minCharsPerPage = Number(arg.slice('--min-chars='.length));
    else if (arg === '--min-chars') parsed.minCharsPerPage = Number(args[++i]);
    else if (!arg.startsWith('--')) parsed.fileFilters.push(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.width) || parsed.width < 300 || parsed.width > 6000) {
    throw new Error('--width must be between 300 and 6000');
  }
  if (!Number.isFinite(parsed.minCharsPerPage) || parsed.minCharsPerPage < 0) {
    throw new Error('--min-chars must be a positive number');
  }

  parsed.fileFilters = parsed.fileFilters.map((x) => x.trim()).filter(Boolean);
  return parsed;
}

function selectFiles(files, filters) {
  if (!filters.length) return files;
  const normalizedFilters = filters.map(normalizeName);
  return files.filter((file) => {
    const normalizedFile = normalizeName(file);
    return normalizedFilters.some((filter) => normalizedFile.includes(filter));
  });
}

function parsePageSpec(spec, total) {
  const pages = new Set();
  for (const part of String(spec).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) {
        if (page >= 1 && (!total || page <= total)) pages.add(page);
      }
      continue;
    }
    const page = Number(trimmed);
    if (Number.isInteger(page) && page >= 1 && (!total || page <= total)) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function allPages(total) {
  return Array.from({ length: total ?? 0 }, (_, index) => index + 1);
}

function samplePages(total) {
  if (!total) return [];
  const candidates = [
    1, 2, 3, 4, 5,
    Math.floor(total * 0.25),
    Math.floor(total * 0.5),
    Math.floor(total * 0.75),
    total - 2,
    total - 1,
    total,
  ];
  return [...new Set(candidates.filter((page) => page >= 1 && page <= total))].sort((a, b) => a - b);
}

function ocrPath(file) {
  return path.join(OCR_DIR, `${path.basename(file, '.pdf')}.ocr.txt`);
}

function sampleOcrPath(file, pageSpec) {
  return path.join(SAMPLE_DIR, `${path.basename(file, '.pdf')}.pages-${slugify(pageSpec)}.ocr.txt`);
}

function normalizeOcrText(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function meaningfulTextLength(text) {
  return String(text ?? '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '')
    .replace(/\s+/g, '')
    .length;
}

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugify(name) {
  return normalizeName(name) || 'ocr';
}
