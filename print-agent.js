/**
 * RMS UNIFIED SMART PRINT AGENT
 * Run this on the computer connected to your printers.
 * Usage: node print-agent.js
 * Requires: npm install axios
 */

const axios = require('axios');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// This profile is replaced automatically when the agent is downloaded from
// Settings > Printers & Routing. Environment variables remain available for
// manual deployments and temporary overrides.
const AGENT_PROFILE = Object.freeze({ websiteName: 'DEVFORGE RMS', shopName: 'Shop 1', shopId: 1, serverUrl: 'http://localhost:4000', printers: ['BIXOLON SRP-QE302'] });
const WEBSITE_NAME = process.env.WEBSITE_NAME || AGENT_PROFILE.websiteName;
const SHOP_NAME = process.env.SHOP_NAME || AGENT_PROFILE.shopName;
const ASSIGNED_PRINTERS = process.env.ASSIGNED_PRINTERS
    ? process.env.ASSIGNED_PRINTERS.split(',').map(name => name.trim()).filter(Boolean)
    : AGENT_PROFILE.printers;
const MAX_JOB_AGE_MS = 10 * 60 * 60 * 1000;

// --- CONFIGURATION ---
const CONFIG = {
    SHOP_ID: Number(process.env.SHOP_ID || AGENT_PROFILE.shopId),
    SERVER_URL: process.env.SERVER_URL || AGENT_PROFILE.serverUrl,
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS || 500),      // Fast polling keeps drawer pulses responsive
    BROWSER_PATH: process.env.PRINT_BROWSER_PATH || '',                // Optional explicit Chrome/Edge/Chromium path
    SUMATRA_PATH: process.env.SUMATRA_PATH || '',                      // Optional explicit SumatraPDF.exe path (Windows only)
    PRINT_TIMEOUT_MS: Number(process.env.PRINT_TIMEOUT_MS || 30000),
    CASH_DRAWER_PIN: Number(process.env.CASH_DRAWER_PIN || 0),          // 0 = drawer pin 2, 1 = drawer pin 5
};

let isPolling = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJobs() {
    if (isPolling) return;
    isPolling = true;

    try {
        console.log(`[${new Date().toLocaleTimeString()}] Polling for jobs...`);
        const res = await axios.get(`${CONFIG.SERVER_URL}/api/print-jobs/poll`, {
            params: {
                shop_id: CONFIG.SHOP_ID,
                printers: ASSIGNED_PRINTERS.join(',')
            }
        });

        const jobs = Array.isArray(res.data) ? res.data : [];
        if (jobs.length > 0) {
            console.log(`Claimed ${jobs.length} print job${jobs.length === 1 ? '' : 's'}.`);
            for (const job of jobs) {
                await processJob(job);
            }
        }
    } catch (err) {
        console.error("Polling Error:", err.message);
    } finally {
        isPolling = false;
    }
}

async function processJob(job) {
    let content;
    try {
        content = JSON.parse(job.content_json);
    } catch (error) {
        console.error(`Job #${job.id} has invalid print content: ${error.message}`);
        await confirmJob(job.id);
        return;
    }
    
    // The station_name now holds the ACTUAL system printer name (e.g. "EPSON-TM88")
    // as defined in your Settings > Printers & Routing dashboard.
    const printerName = typeof job.station_name === 'string' ? job.station_name.trim() : '';

    if (!printerName || printerName === 'null') {
        console.warn(`[SKIP] Job #${job.id} has no valid printer assigned.`);
        await confirmJob(job.id);
        return;
    }

    if (!ASSIGNED_PRINTERS.includes(printerName)) {
        console.warn(`[SKIP] Job #${job.id} targets unassigned printer "${printerName}".`);
        await failJob(job.id, `Printer "${printerName}" is not assigned to this print agent.`);
        return;
    }

    const createdAt = job.created_at || content.created_at;
    const createdAtMs = Date.parse(createdAt);
    if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > MAX_JOB_AGE_MS) {
        console.warn(`[REJECT] Job #${job.id} is older than 10 hours and will not be printed.`);
        await confirmJob(job.id);
        return;
    }

    const itemCount = Array.isArray(content.items) ? content.items.length : 0;
    const routeLabel = content.route_label || content.printer_label;
    const targetLabel = routeLabel && routeLabel !== printerName
        ? `${routeLabel} -> ${printerName}`
        : printerName;
    console.log(`Printing Job #${job.id} to printer: ${targetLabel}${itemCount ? ` (${itemCount} item lines)` : ''}`);

    if (content.type === 'CASH_DRAWER') {
        try {
            await openCashDrawer(printerName);
            console.log(`Cash drawer pulse sent through ${printerName}.`);
            await confirmJob(job.id);
        } catch (error) {
            console.error(`Cash Drawer Failed: ${error.message}`);
            await failJob(job.id, error.message);
        }
        return;
    }

    if (content.print_url || content.type === 'PRINT_URL') {
        try {
            await printUrlJob(job, content, printerName);
            console.log(`Print signal sent to ${printerName}.`);
            await confirmJob(job.id);
        } catch (error) {
            console.error(`URL Print Failed: ${error.message}`);
            console.info(`Check browser path, server URL, and printer "${printerName}".`);
            await failJob(job.id, error.message);
        }
        return;
    }

    // Generate a simple text format for thermal printers (80mm)
    let text = `--------------------------------\n`;
    text += `    ORDER #${content.sale_id}\n`;
    text += `    TYPE: ${content.order_type.toUpperCase()}\n`;
    if (content.table_number) text += `    TABLE: ${content.table_number}\n`;
    if (content.token_number) text += `    TOKEN: ${content.token_number}\n`;
    text += `--------------------------------\n`;
    text += `TIME: ${new Date(content.created_at).toLocaleString()}\n\n`;

    content.items.forEach(item => {
        text += `[ ] ${item.quantity} x ${item.name}\n`;
        if (item.variants && item.variants.length) {
            text += `    - ${item.variants.map(v => v.name || v).join(', ')}\n`;
        }
        if (item.special_instructions) {
            text += `    NOTE: ${item.special_instructions}\n`;
        }
        text += `\n`;
    });
    text += `--------------------------------\n\n\n\n\x1Bm`; // Feed 4 lines and Cut

    // Identify OS
    const isWindows = process.platform === "win32";
    const tempFile = path.join(__dirname, `job_${job.id}.txt`);
    
    try {
        fs.writeFileSync(tempFile, text);

        if (isWindows) {
            // Note: Thermal printers work best with raw text.
            // If this opens notepad, consider installing a raw-print CLI tool.
            await execFileAsync('notepad', ['/p', tempFile], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        } else {
            // Linux/Mac (CUPS)
            await execFileAsync('lp', ['-d', printerName, tempFile], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        }

        console.log(`Print signal sent to ${printerName}.`);
        await confirmJob(job.id);
    } catch (error) {
        console.error(`Print Failed on OS level: ${error.message}`);
        console.info(`Check if printer "${printerName}" is installed and online.`);
        await failJob(job.id, error.message);
    } finally {
        setTimeout(() => { if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile); }, 1000);
    }
}

async function openCashDrawer(printerName) {
    const pin = CONFIG.CASH_DRAWER_PIN === 1 ? 1 : 0;
    const pulse = Buffer.from([0x1b, 0x70, pin, 0x19, 0xfa]);

    if (process.platform === 'win32') {
        const printerBase64 = Buffer.from(printerName, 'utf8').toString('base64');
        const dataBase64 = pulse.toString('base64');
        const script = `$src='using System;using System.Runtime.InteropServices;public class RawPrinter{[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]public class DOCINFO{[MarshalAs(UnmanagedType.LPStr)]public string pDocName;[MarshalAs(UnmanagedType.LPStr)]public string pOutputFile;[MarshalAs(UnmanagedType.LPStr)]public string pDataType;}[DllImport("winspool.Drv",EntryPoint="OpenPrinterA",SetLastError=true,CharSet=CharSet.Ansi)]public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);[DllImport("winspool.Drv",SetLastError=true)]public static extern bool ClosePrinter(IntPtr h);[DllImport("winspool.Drv",SetLastError=true,CharSet=CharSet.Ansi)]public static extern bool StartDocPrinter(IntPtr h,int l,[In]DOCINFO d);[DllImport("winspool.Drv",SetLastError=true)]public static extern bool EndDocPrinter(IntPtr h);[DllImport("winspool.Drv",SetLastError=true)]public static extern bool StartPagePrinter(IntPtr h);[DllImport("winspool.Drv",SetLastError=true)]public static extern bool EndPagePrinter(IntPtr h);[DllImport("winspool.Drv",SetLastError=true)]public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);}';Add-Type -TypeDefinition $src;$n=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${printerBase64}'));$b=[Convert]::FromBase64String('${dataBase64}');$h=[IntPtr]::Zero;if(-not [RawPrinter]::OpenPrinter($n,[ref]$h,[IntPtr]::Zero)){throw 'Cannot open printer'};try{$d=New-Object RawPrinter+DOCINFO;$d.pDocName='RMS Cash Drawer';$d.pDataType='RAW';if(-not [RawPrinter]::StartDocPrinter($h,1,$d)){throw 'Cannot start raw print job'};try{[RawPrinter]::StartPagePrinter($h)|Out-Null;$p=[Runtime.InteropServices.Marshal]::AllocHGlobal($b.Length);try{[Runtime.InteropServices.Marshal]::Copy($b,0,$p,$b.Length);$w=0;if(-not [RawPrinter]::WritePrinter($h,$p,$b.Length,[ref]$w)-or $w-ne $b.Length){throw 'Drawer pulse was not fully written'}}finally{[Runtime.InteropServices.Marshal]::FreeHGlobal($p)};[RawPrinter]::EndPagePrinter($h)|Out-Null}finally{[RawPrinter]::EndDocPrinter($h)|Out-Null}}finally{[RawPrinter]::ClosePrinter($h)|Out-Null}`;
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-drawer-'));
    const pulseFile = path.join(tempDir, 'drawer.bin');
    try {
        fs.writeFileSync(pulseFile, pulse);
        await execFileAsync('lp', ['-d', printerName, '-o', 'raw', pulseFile], { timeout: CONFIG.PRINT_TIMEOUT_MS });
    } finally {
        try { if (fs.existsSync(pulseFile)) fs.unlinkSync(pulseFile); } catch (_) {}
        try { if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir); } catch (_) {}
    }
}

function resolvePrintUrl(printUrl) {
    if (!printUrl) throw new Error("Missing print_url in job content.");
    const url = new URL(printUrl, CONFIG.SERVER_URL);
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (systemTimeZone && !url.searchParams.has('timezone')) url.searchParams.set('timezone', systemTimeZone);
    return url.toString();
}

function commandExists(command) {
    try {
        const lookup = process.platform === 'win32' ? 'where' : 'which';
        const output = execFileSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return output.split(/\r?\n/).find(Boolean);
    } catch (e) {
        return null;
    }
}

function findBrowserExecutable() {
    if (CONFIG.BROWSER_PATH && fs.existsSync(CONFIG.BROWSER_PATH)) return CONFIG.BROWSER_PATH;

    if (process.platform === 'win32') {
        const candidates = [
            process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ].filter(Boolean);
        return candidates.find((candidate) => fs.existsSync(candidate)) || commandExists('chrome') || commandExists('msedge');
    }

    if (process.platform === 'darwin') {
        const candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ];
        return candidates.find((candidate) => fs.existsSync(candidate)) || commandExists('google-chrome') || commandExists('chromium');
    }

    return commandExists('google-chrome-stable')
        || commandExists('google-chrome')
        || commandExists('chromium-browser')
        || commandExists('chromium')
        || commandExists('microsoft-edge');
}

async function renderUrlToPdf(url, outputPdf) {
    const browser = findBrowserExecutable();
    if (!browser) {
        throw new Error("Chrome, Edge, or Chromium was not found. Set PRINT_BROWSER_PATH to your browser executable.");
    }

    await execFileAsync(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--print-to-pdf=${outputPdf}`,
        url,
    ], { timeout: CONFIG.PRINT_TIMEOUT_MS });

    const stat = fs.existsSync(outputPdf) ? fs.statSync(outputPdf) : null;
    if (!stat || stat.size === 0) throw new Error("Browser did not create a printable PDF.");
}

async function sendPdfToPrinter(pdfPath, printerName) {
    if (process.platform === 'win32') {
        let sumatra = null;
        
        // 1. Check config and common user-added env variables
        const possibleEnvVars = [
            CONFIG.SUMATRA_PATH,
            process.env.SumatraPDF,
            process.env.SUMATRAPDF
        ].filter(Boolean).map(p => p.replace(/(^"|"$)/g, ''));

        for (const p of possibleEnvVars) {
            if (fs.existsSync(p)) {
                if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SumatraPDF.exe'))) {
                    sumatra = path.join(p, 'SumatraPDF.exe'); break;
                } else if (fs.statSync(p).isFile()) {
                    sumatra = p; break;
                }
            } else if (fs.existsSync(p + '.exe')) {
                sumatra = p + '.exe'; break;
            }
        }

        // 2. Check if it's in the deep system PATH
        if (!sumatra) {
            sumatra = commandExists('SumatraPDF.exe') || commandExists('SumatraPDF');
        }
        
        // 3. Fallback to check default Windows installation directories
        if (!sumatra) {
            const defaultPaths = [
                process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'SumatraPDF', 'SumatraPDF.exe'),
                process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'SumatraPDF', 'SumatraPDF.exe'),
                process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'SumatraPDF', 'SumatraPDF.exe')
            ].filter(Boolean);
            sumatra = defaultPaths.find(p => fs.existsSync(p));
        }

        if (!sumatra) {
            throw new Error("Windows URL printing needs SumatraPDF in PATH for printer selection, or set SUMATRA_PATH config.");
        }
        await execFileAsync(sumatra, ['-print-settings', 'noscale', '-print-to', printerName, '-silent', pdfPath], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        return;
    }

    await execFileAsync('lp', ['-d', printerName, pdfPath], { timeout: CONFIG.PRINT_TIMEOUT_MS });
}

async function printUrlJob(job, content, printerName) {
    const url = resolvePrintUrl(content.print_url);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `rms-print-${job.id}-`));
    const pdfPath = path.join(tempDir, `job_${job.id}.pdf`);

    try {
        await renderUrlToPdf(url, pdfPath);
        await sendPdfToPrinter(pdfPath, printerName);
    } finally {
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch (e) {}
        }, 1000);
    }
}

async function postJobStatus(id, path, body, label, attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await axios.post(`${CONFIG.SERVER_URL}/api/print-jobs/${id}/${path}`, body);
            return true;
        } catch (err) {
            console.error(`${label} failed on attempt ${attempt}/${attempts}:`, err.message);
            if (attempt < attempts) await sleep(Math.min(1000 * attempt, 5000));
        }
    }
    return false;
}

function confirmJob(id) {
    return postJobStatus(id, 'confirm', {}, 'Confirming job on server');
}

function failJob(id, reason) {
    return postJobStatus(id, 'fail', { reason }, 'Releasing job for retry on server');
}

console.log("==========================================");
console.log("   RMS SMART PRINT AGENT IS RUNNING      ");
console.log("==========================================");
console.log(`Website: ${WEBSITE_NAME}`);
console.log(`Shop: ${SHOP_NAME}`);
console.log(`Shop ID: ${CONFIG.SHOP_ID}`);
console.log(`Server: ${CONFIG.SERVER_URL}`);
console.log(`Monitoring: ${CONFIG.SERVER_URL}`);
console.log(`Assigned printers: ${ASSIGNED_PRINTERS.join(', ')}`);
console.log('Maximum accepted job age: 10 hours');
console.log("Status: Active & Waiting for Orders...");
console.log("------------------------------------------");
console.log("Press Ctrl+C to stop.");

setInterval(pollJobs, CONFIG.POLL_INTERVAL_MS);
pollJobs();
