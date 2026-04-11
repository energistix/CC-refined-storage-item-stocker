import {
    firstStorageStackForRule,
    getAllStorageItemStacks,
    isCraftStartFailed,
    ruleToGenericCraftingProbe,
    totalAmountForRule,
    type StockRule,
} from "./stock";

interface StockRow {
    rule: StockRule;
    ratio: number;
    label: string;
    have: number;
    need: number;
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

function stripMonitorBrackets(s: string): string {
    return s.split("[").join("").split("]").join("");
}

function rowTextColor(bridge: RsBridgePeripheral, r: StockRow): Color {
    if (r.have >= r.need) return colors.green;
    const probe = ruleToGenericCraftingProbe(r.rule);
    if (bridge.isCrafting(probe) === true) return colors.orange;
    if (isCraftStartFailed(r.rule)) return colors.red;
    return colors.yellow;
}

/** Build sorted rows; one storage snapshot, client-side match per rule. */
function buildRows(bridge: RsBridgePeripheral, rules: StockRule[]): StockRow[] {
    const stacks = getAllStorageItemStacks(bridge);
    const rows: StockRow[] = [];
    for (const rule of rules) {
        if (rule.minCount <= 0) continue;
        const have = totalAmountForRule(stacks, rule);
        const first = firstStorageStackForRule(stacks, rule);
        const need = rule.minCount;
        const ratio = need > 0 ? have / need : 1;
        const rawLabel =
            first != null && first.displayName != null && first.displayName !== ""
                ? first.displayName
                : first != null && first.name != null && first.name !== ""
                  ? first.name
                  : rule.name;
        rows.push({ rule, ratio, label: stripMonitorBrackets(rawLabel), have, need });
    }
    const shortageFirst = settings.get("rs_stocker.monitor_shortage_first", true);
    const asc = shortageFirst !== false;
    rows.sort((a, b) => {
        const dr = asc ? Math.min(a.ratio, 1) - Math.min(b.ratio, 1) : Math.min(b.ratio, 1) - Math.min(a.ratio, 1);
        if (dr !== 0) return dr;
        if (b.need !== a.need) return b.need - a.need;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    return rows;
}

function writePaddedLine(monitor: ITerminal, y: number, w: number, text: string): void {
    const line = text.length <= w ? text + strRep(" ", w - text.length) : text.substring(0, w);
    monitor.setCursorPos(1, y);
    monitor.write(line);
}

export function drawMonitor(bridge: RsBridgePeripheral, monitor: ITerminal, rules: StockRule[]): void {
    const prev = term.redirect(monitor);
    const [w, h] = monitor.getSize();
    const rows = buildRows(bridge, rules);
    const maxData = Math.max(0, h - 2);
    let dataIdx = 0;

    for (let y = 1; y <= h; y++) {
        monitor.setBackgroundColor(colors.black);
        if (y <= 2) {
            monitor.setTextColor(colors.white);
            const text = y === 1 ? "RS minimum stock" : strRep("-", Math.min(w, 40));
            writePaddedLine(monitor, y, w, text);
        } else if (dataIdx < rows.length && dataIdx < maxData) {
            const r = rows[dataIdx];
            monitor.setTextColor(rowTextColor(bridge, r));
            const amtStr = `${r.have}/${r.need}`;
            const nameMax = Math.max(1, w - amtStr.length - 1);
            let nameCol = truncate(r.label, nameMax);
            let gap = w - nameCol.length - amtStr.length;
            if (gap < 1) {
                const nm = Math.max(1, w - amtStr.length - 1);
                nameCol = truncate(r.label, nm);
                gap = w - nameCol.length - amtStr.length;
            }
            writePaddedLine(monitor, y, w, nameCol + strRep(" ", gap) + amtStr);
            dataIdx++;
        } else {
            monitor.setTextColor(colors.white);
            writePaddedLine(monitor, y, w, "");
        }
    }

    term.redirect(prev);
}
