/** Persistence + RS Bridge craftable discovery + restock tick. */

/** @noSelf */
declare function pcall<T>(fn: () => T): LuaMultiReturn<[true, T] | [false, unknown]>;

export const RULES_FILE = "stock_rules.txt";

/** Safe getItem for CC Lua (avoid try/catch — TSTL emits invalid break inside nested catch). */
export function tryGetItem(bridge: RsBridgePeripheral, filter: RsBridgeItemFilter): RsBridgeItemInfo | undefined {
    const [ok, res] = pcall(() => bridge.getItem(filter));
    if (!ok) return undefined;
    return res as RsBridgeItemInfo;
}

export interface StockRule {
    /** Prefer for getItem/craft when present. */
    fingerprint?: string;
    name: string;
    nbt?: string;
    minCount: number;
}

/** Convert sequential 1-based Lua list tables from mod APIs. */
export function luaSeqToArray<T>(t: LuaTable<number, T> | T[] | undefined | null): T[] {
    if (t == null) return [];
    const out: T[] = [];
    let i = 1;
    while (true) {
        const v = (t as LuaTable<number, T>)[i];
        if (v === undefined) break;
        out.push(v);
        i++;
    }
    return out;
}

export function ruleToFilter(rule: StockRule): RsBridgeItemFilter {
    if (rule.fingerprint != null && rule.fingerprint !== "") {
        return { fingerprint: rule.fingerprint };
    }
    const f: RsBridgeItemFilter = { name: rule.name };
    if (rule.nbt != null && rule.nbt !== "") {
        (f as { name: string; nbt?: string }).nbt = rule.nbt;
    }
    return f;
}

export function craftableToRule(item: RsBridgeItemInfo, minCount: number): StockRule {
    const r: StockRule = { name: item.name, minCount };
    if (item.fingerprint != null && item.fingerprint !== "") r.fingerprint = item.fingerprint;
    if (item.nbt != null && item.nbt !== "") r.nbt = item.nbt;
    return r;
}

export function ruleMatchesItem(rule: StockRule, item: RsBridgeItemInfo): boolean {
    if (rule.fingerprint != null && rule.fingerprint !== "" && item.fingerprint != null && item.fingerprint !== "") {
        return rule.fingerprint === item.fingerprint;
    }
    if ((rule.fingerprint != null && rule.fingerprint !== "") !== (item.fingerprint != null && item.fingerprint !== "")) {
        return false;
    }
    const rn = rule.nbt ?? "";
    const inbt = item.nbt ?? "";
    return rule.name === item.name && rn === inbt;
}

export function findRuleIndex(rules: StockRule[], item: RsBridgeItemInfo): number {
    for (let i = 0; i < rules.length; i++) {
        if (ruleMatchesItem(rules[i], item)) return i;
    }
    return -1;
}

export function loadRules(path: string = RULES_FILE): StockRule[] {
    if (!fs.exists(path)) return [];
    const [h] = fs.open(path, "r");
    if (h == null) return [];
    const content = h.readAll();
    h.close();
    if (content == null || content === "") return [];
    const [okUn, data] = pcall(() => textutils.unserialize(content));
    if (!okUn) return [];
    if (data == null) return [];
    const arr = luaSeqToArray<StockRule>(data as LuaTable<number, StockRule>);
    const cleaned: StockRule[] = [];
    for (const r of arr) {
        if (r != null && r.minCount > 0 && r.name != null && r.name !== "") cleaned.push(r);
    }
    return cleaned;
}

export function saveRules(rules: StockRule[], path: string = RULES_FILE): void {
    const [h] = fs.open(path, "w");
    if (h == null) return;
    h.write(textutils.serialize(rules));
    h.close();
}

function methodsInclude(methods: string[] | undefined, name: string): boolean {
    if (methods == null) return false;
    for (let i = 0; i < methods.length; i++) {
        if (methods[i] === name) return true;
    }
    return false;
}

/** Build craftables list; uses listCraftableItems when available. */
export function loadCraftables(bridge: RsBridgePeripheral, bridgeSide: string): RsBridgeItemInfo[] {
    const methods = peripheral.getMethods(bridgeSide);
    if (methodsInclude(methods, "listCraftableItems")) {
        return luaSeqToArray(bridge.listCraftableItems() as unknown as LuaTable<number, RsBridgeItemInfo>);
    }
    const items = luaSeqToArray(bridge.listItems() as unknown as LuaTable<number, RsBridgeItemInfo>);
    const out: RsBridgeItemInfo[] = [];
    for (const item of items) {
        const flt = item.fingerprint != null && item.fingerprint !== ""
            ? ({ fingerprint: item.fingerprint } as RsBridgeItemFilter)
            : ({ name: item.name, nbt: item.nbt } as RsBridgeItemFilter);
        if (bridge.isItemCraftable(flt)) out.push(item);
    }
    return out;
}

function craftFilterWithCount(rule: StockRule, need: number): RsBridgeItemFilter {
    if (rule.fingerprint != null && rule.fingerprint !== "") {
        return { fingerprint: rule.fingerprint, count: need };
    }
    if (rule.nbt != null && rule.nbt !== "") {
        return { name: rule.name, nbt: rule.nbt, count: need };
    }
    return { name: rule.name, count: need };
}

export function restockTick(bridge: RsBridgePeripheral, rules: StockRule[]): void {
    for (const rule of rules) {
        if (rule.minCount <= 0) continue;
        const filter = ruleToFilter(rule);
        const info = tryGetItem(bridge, filter);
        if (info === undefined) continue;
        const have = info.amount;
        if (have >= rule.minCount) continue;
        if (!bridge.isItemCraftable(filter)) continue;
        if (bridge.isItemCrafting(filter)) continue;
        const need = rule.minCount - have;
        pcall(() => bridge.craftItem(craftFilterWithCount(rule, need)));
    }
}
