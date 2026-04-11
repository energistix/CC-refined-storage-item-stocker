import * as event from "./event";
import { craftableToRule, findRuleIndex, saveRules, type StockRule } from "./stock";

const HELP_BROWSE =
    "Up/Down select  Enter=set min  Backspace=del search char  Paste ok";
const HELP_EDIT = "Enter=save  0 or empty=remove rule  Q=cancel";

export class TerminalStockerUi {
    search = "";
    private sel = 0;
    private scroll = 0;
    mode: "browse" | "edit" = "browse";
    editBuffer = "";
    private editing: RsBridgeItemInfo | null = null;

    constructor(
        private readonly rules: StockRule[],
        private readonly rulesPath: string,
        private readonly onSaved: () => void,
    ) {}

    private filtered(craftables: RsBridgeItemInfo[]): RsBridgeItemInfo[] {
        const q = this.search.toLowerCase();
        if (q === "") return craftables;
        const out: RsBridgeItemInfo[] = [];
        for (let i = 0; i < craftables.length; i++) {
            const c = craftables[i];
            const dn = (c.displayName ?? "").toLowerCase();
            const n = (c.name ?? "").toLowerCase();
            if (dn.indexOf(q) !== -1 || n.indexOf(q) !== -1) out.push(c);
        }
        return out;
    }

    private clampSel(maxIdx: number): void {
        if (this.sel > maxIdx) this.sel = maxIdx;
        if (this.sel < 0) this.sel = 0;
    }

    private commitEdit(): void {
        if (this.editing == null) {
            this.mode = "browse";
            return;
        }
        const item = this.editing;
        const raw = this.editBuffer.trim();
        if (raw === "" || raw === "0") {
            const idx = findRuleIndex(this.rules, item);
            if (idx >= 0) this.rules.splice(idx, 1);
        } else {
            const minCount = parseInt(raw, 10);
            if (isNaN(minCount) || minCount <= 0) {
                const idx = findRuleIndex(this.rules, item);
                if (idx >= 0) this.rules.splice(idx, 1);
            } else {
                const idx = findRuleIndex(this.rules, item);
                const rule = craftableToRule(item, minCount);
                if (idx >= 0) this.rules[idx] = rule;
                else this.rules.push(rule);
            }
        }
        saveRules(this.rules, this.rulesPath);
        this.onSaved();
        this.mode = "browse";
        this.editing = null;
        this.editBuffer = "";
    }

    private cancelEdit(): void {
        this.mode = "browse";
        this.editing = null;
        this.editBuffer = "";
    }

    private openEdit(list: RsBridgeItemInfo[]): void {
        if (list.length === 0) return;
        this.clampSel(Math.max(0, list.length - 1));
        const item = list[this.sel];
        this.editing = item;
        this.mode = "edit";
        const idx = findRuleIndex(this.rules, item);
        if (idx >= 0) this.editBuffer = `${this.rules[idx].minCount}`;
        else this.editBuffer = "";
    }

    draw(craftables: RsBridgeItemInfo[]): void {
        const [w, h] = term.getSize();
        term.setBackgroundColor(colors.black);
        term.setTextColor(colors.white);
        term.clear();
        if (this.mode === "browse") {
            this.drawBrowse(w, h, craftables);
        } else {
            this.drawEdit(w, h);
        }
    }

    private drawBrowse(w: number, h: number, craftables: RsBridgeItemInfo[]): void {
        const list = this.filtered(craftables);
        this.clampSel(Math.max(0, list.length - 1));
        const headerLines = 3;
        const footerLines = 2;
        const bodyH = Math.max(1, h - headerLines - footerLines);
        if (this.sel < this.scroll) this.scroll = this.sel;
        if (this.sel >= this.scroll + bodyH) this.scroll = this.sel - bodyH + 1;

        term.setCursorPos(1, 1);
        term.write("Craftable items (RS)");
        term.setCursorPos(1, 2);
        term.write(`Search: ${this.search}_`);
        term.setCursorPos(1, 3);
        term.write(strRep("-", Math.min(w, 40)));

        for (let r = 0; r < bodyH; r++) {
            const idx = this.scroll + r;
            term.setCursorPos(1, headerLines + 1 + r);
            if (idx >= list.length) {
                term.clearLine();
                continue;
            }
            const item = list[idx];
            const cur = findRuleIndex(this.rules, item);
            const minStr = cur >= 0 ? ` [min ${this.rules[cur].minCount}]` : "";
            const prefix = idx === this.sel ? ">" : " ";
            const name =
                item.displayName != null && item.displayName !== "" ? item.displayName : (item.name ?? "?");
            const line = `${prefix} ${name}${minStr}`;
            term.write(truncateLine(line, w));
        }
        term.setCursorPos(1, h - 1);
        term.write(truncateLine(HELP_BROWSE, w));
        term.setCursorPos(1, h);
        term.write(`${list.length} match(es)`);
    }

    private drawEdit(w: number, h: number): void {
        const item = this.editing;
        term.setCursorPos(1, 1);
        term.write("Minimum stock target");
        term.setCursorPos(1, 2);
        const title =
            item != null
                ? item.displayName != null && item.displayName !== ""
                    ? item.displayName
                    : (item.name ?? "?")
                : "?";
        term.write(truncateLine(title, w));
        term.setCursorPos(1, 4);
        term.write("Amount in system (0 or blank removes):");
        term.setCursorPos(1, 5);
        term.write(this.editBuffer + "_");
        term.setCursorPos(1, h);
        term.write(truncateLine(HELP_EDIT, w));
    }

    /** Handle keyboard/paste; returns false if caller should stop (terminate handled elsewhere). */
    handle(ev: event.IEvent | null, craftables: RsBridgeItemInfo[]): boolean {
        if (ev == null) return true;
        if (ev instanceof event.TerminateEvent) return false;
        const list = this.filtered(craftables);

        if (this.mode === "browse") {
            if (ev instanceof event.CharEvent) {
                const ch = ev.character;
                const code = ch.length > 0 ? ch.charCodeAt(0) : 0;
                if (code >= 32 && code !== 127) {
                    this.search += ch;
                    this.sel = 0;
                    this.scroll = 0;
                }
            } else if (ev instanceof event.KeyEvent && !ev.isUp) {
                if (ev.key === keys.up) {
                    this.sel = Math.max(0, this.sel - 1);
                } else if (ev.key === keys.down) {
                    const maxSel = list.length > 0 ? list.length - 1 : 0;
                    this.sel = Math.min(maxSel, this.sel + 1);
                } else if (ev.key === keys.enter) {
                    if (list.length > 0) this.openEdit(list);
                } else if (ev.key === keys.backspace) {
                    if (this.search.length > 0) {
                        this.search = this.search.substring(0, this.search.length - 1);
                        this.sel = 0;
                        this.scroll = 0;
                    }
                } else if (ev.key === keys.pageUp) {
                    this.sel = Math.max(0, this.sel - 5);
                } else if (ev.key === keys.pageDown) {
                    this.sel = Math.min(Math.max(0, list.length - 1), this.sel + 5);
                }
            } else if (ev instanceof event.PasteEvent) {
                const t = ev.text;
                for (let i = 0; i < t.length; i++) {
                    const c = t.substring(i, i + 1);
                    const code = c.length > 0 ? c.charCodeAt(0) : 0;
                    if (code === 10 || code === 13) break;
                    if (code >= 32 && code !== 127) this.search += c;
                }
                this.sel = 0;
                this.scroll = 0;
            }
        } else {
            if (ev instanceof event.CharEvent) {
                const ch = ev.character;
                if (ch === "q" || ch === "Q") {
                    this.cancelEdit();
                } else if (ch >= "0" && ch <= "9") {
                    this.editBuffer += ch;
                }
            } else if (ev instanceof event.KeyEvent && !ev.isUp) {
                if (ev.key === keys.enter) {
                    this.commitEdit();
                } else if (ev.key === keys.backspace) {
                    if (this.editBuffer.length > 0) {
                        this.editBuffer = this.editBuffer.substring(0, this.editBuffer.length - 1);
                    }
                }
            } else if (ev instanceof event.PasteEvent) {
                const t = ev.text;
                for (let i = 0; i < t.length; i++) {
                    const c = t.substring(i, i + 1);
                    if (c >= "0" && c <= "9") this.editBuffer += c;
                }
            }
        }
        return true;
    }
}

function strRep(s: string, n: number): string {
    let r = "";
    for (let i = 0; i < n; i++) r += s;
    return r;
}

function truncateLine(s: string, w: number): string {
    if (s.length <= w) return s;
    if (w <= 3) return s.substring(0, w);
    return s.substring(0, w - 2) + "..";
}
