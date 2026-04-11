import { ruleToFilter, tryGetItem, type StockRule } from "./stock";

interface StockRow {
    ratio: number;
    label: string;
    have: number;
    need: number;
    pctDisplay: number;
}

function truncate(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    if (maxLen <= 3) return s.substring(0, maxLen);
    return s.substring(0, maxLen - 2) + "..";
}

function strRep(s: string, n: number): string {
    let r = "";
    for (let i = 0; i < n; i++) r += s;
    return r;
}

/** Build sorted rows (lowest fill ratio first). */
function buildRows(bridge: RsBridgePeripheral, rules: StockRule[]): StockRow[] {
    const rows: StockRow[] = [];
    for (const rule of rules) {
        if (rule.minCount <= 0) continue;
        const info = tryGetItem(bridge, ruleToFilter(rule));
        if (info === undefined) continue;
        const have = info.amount;
        const need = rule.minCount;
        const ratio = need > 0 ? have / need : 1;
        const label = info.displayName !== "" ? info.displayName : info.name;
        const pctDisplay = Math.floor(Math.min(1, ratio) * 100);
        rows.push({ ratio, label, have, need, pctDisplay });
    }
    rows.sort((a, b) => a.ratio - b.ratio);
    return rows;
}

export function drawMonitor(bridge: RsBridgePeripheral, monitor: ITerminal, rules: StockRule[]): void {
    const prev = term.redirect(monitor);
    const [w, h] = monitor.getSize();
    monitor.setBackgroundColor(colors.black);
    monitor.setTextColor(colors.white);
    monitor.clear();
    monitor.setCursorPos(1, 1);
    monitor.write("RS minimum stock");
    monitor.setCursorPos(1, 2);
    const [tw] = term.getSize();
    const line = strRep("-", Math.min(w, tw, 40));
    monitor.write(line);

    const headerRows = 2;
    const maxData = h - headerRows;
    if (maxData < 1) {
        term.redirect(prev);
        return;
    }

    const rows = buildRows(bridge, rules);
    const colAmt = 12;
    const colPct = 5;
    const nameW = Math.max(8, w - colAmt - colPct - 2);

    let y = headerRows + 1;
    for (let i = 0; i < rows.length && i < maxData; i++) {
        const r = rows[i];
        monitor.setCursorPos(1, y);
        if (r.ratio < 0.25) monitor.setTextColor(colors.red);
        else if (r.ratio < 1) monitor.setTextColor(colors.yellow);
        else monitor.setTextColor(colors.lime);
        const nameCol = truncate(r.label, nameW);
        const amtStr = `${r.have}/${r.need}`;
        const pctStr = `${r.pctDisplay}%`;
        const pad1 = Math.max(1, nameW - nameCol.length + 1);
        const pad2 = Math.max(1, colAmt - amtStr.length + 1);
        monitor.write(nameCol + strRep(" ", pad1) + amtStr + strRep(" ", pad2) + pctStr);
        y++;
    }
    monitor.setTextColor(colors.white);
    term.redirect(prev);
}
