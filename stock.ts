/** Persistence + AP unified storage bridge (RS/ME). */

import { pretty_print } from "cc.pretty";

/** @noSelf */
declare function pcall<T>(fn: () => T): LuaMultiReturn<[true, T] | [false, unknown]>;
/** @noSelf */
declare function pairs<K, V>(t: LuaTable<K, V>): LuaIterable<LuaMultiReturn<[K, V]>>;

export const RULES_FILE = "stock_rules.txt";

/** Full item listing (AP generic filter requires `type` and/or `name`; `{}` crashes). */
const ALL_ITEMS_FILTER: RsBridgeItemFilter = { type: "item" };

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

/** Normalize getItems / getCraftableItems first return value to an array. */
export function unwrapItemTable(
    first: LuaTable<number, RsBridgeItemInfo> | null | undefined,
): RsBridgeItemInfo[] {
    if (first == null) return [];
    const asTbl = first as unknown as LuaTable<number, RsBridgeItemInfo>;
    const seq = luaSeqToArray(asTbl);
    if (seq.length > 0) return seq;
    const out: RsBridgeItemInfo[] = [];
    for (const [, v] of pairs(asTbl as unknown as LuaTable<string | number, RsBridgeItemInfo>)) {
        if (v != null && (v as RsBridgeItemInfo).name != null && (v as RsBridgeItemInfo).name !== "") {
            out.push(v as RsBridgeItemInfo);
        }
    }
    return out;
}

/** All stacks matching filter; empty on nil (parse error). */
export function getItemsList(bridge: RsBridgePeripheral, filter: RsBridgeItemFilter): RsBridgeItemInfo[] {
    const [tbl] = bridge.getItems(filter);
    return unwrapItemTable(tbl);
}

/** Full storage snapshot; filter in Lua by rule (server-side filter unreliable). */
export function getAllStorageItemStacks(bridge: RsBridgePeripheral): RsBridgeItemInfo[] {
    return getItemsList(bridge, ALL_ITEMS_FILTER);
}

/**
 * Stack size for AP storage results: prefer `count` (stack quantity in grid).
 * Some objects also set `amount` to a different meaning (e.g. internal id), which must not be summed.
 */
export function stackQuantity(stack: RsBridgeItemInfo | undefined | null): number {
    if (stack == null) return 0;
    const c = stack.count;
    const a = stack.amount;
    let n: number | undefined;
    if (typeof c === "number" && c === c && c >= 0) n = c;
    else if (typeof a === "number" && a === a && a >= 0) n = a;
    return n != null ? Math.floor(n) : 0;
}

/**
 * Whether a stack from `getItems({})` counts toward this rule.
 * Storage rows may omit `fingerprint`; then we match name + nbt like the craftable rule.
 */
export function ruleMatchesStorageStack(rule: StockRule, stack: RsBridgeItemInfo): boolean {
    if (stack.name !== rule.name) return false;
    if (rule.fingerprint != null && rule.fingerprint !== "" && stack.fingerprint != null && stack.fingerprint !== "") {
        return rule.fingerprint === stack.fingerprint;
    }
    if (rule.fingerprint != null && rule.fingerprint !== "" && (stack.fingerprint == null || stack.fingerprint === "")) {
        const rn = rule.nbt ?? "";
        const sn = stack.nbt ?? "";
        return rn === sn;
    }
    const rn = rule.nbt ?? "";
    const sn = stack.nbt ?? "";
    return rn === sn;
}

export function totalAmountForRule(stacks: RsBridgeItemInfo[], rule: StockRule): number {
    let sum = 0;
    for (let i = 0; i < stacks.length; i++) {
        if (ruleMatchesStorageStack(rule, stacks[i])) sum += stackQuantity(stacks[i]);
    }
    return sum;
}

export function firstStorageStackForRule(stacks: RsBridgeItemInfo[], rule: StockRule): RsBridgeItemInfo | undefined {
    for (let i = 0; i < stacks.length; i++) {
        if (ruleMatchesStorageStack(rule, stacks[i])) return stacks[i];
    }
    return undefined;
}

/** Sum for one rule (fetches full storage each call — prefer `totalAmountForRule` + snapshot). */
export function tryGetTotalAmount(bridge: RsBridgePeripheral, rule: StockRule): number {
    return totalAmountForRule(getAllStorageItemStacks(bridge), rule);
}

export function tryGetFirstStack(bridge: RsBridgePeripheral, rule: StockRule): RsBridgeItemInfo | undefined {
    return firstStorageStackForRule(getAllStorageItemStacks(bridge), rule);
}

export interface StockRule {
    fingerprint?: string;
    name: string;
    nbt?: string;
    minCount: number;
}

/** Filter for isCraftable / isCrafting / craftItem — always includes registry `name` (AP generic filter requires it). */
export function ruleToFilter(rule: StockRule): RsBridgeItemFilter {
    // if (rule.fingerprint != null && rule.fingerprint !== "") {
    //     return { name: rule.name, type: "item", fingerprint: rule.fingerprint };
    // }
    if (rule.nbt != null && rule.nbt !== "") {
        return { name: rule.name, nbt: rule.nbt, type: "item" };
    }
    return { name: rule.name, type: "item" };
}

export function craftableToRule(item: RsBridgeItemInfo, minCount: number): StockRule {
    const r: StockRule = { name: item.name ?? "", minCount };
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

/** Craftable items from grid (empty filter = all craftables). */
export function loadCraftables(bridge: RsBridgePeripheral): RsBridgeItemInfo[] {
    const [tbl] = bridge.getCraftableItems(ALL_ITEMS_FILTER);
    return unwrapItemTable(tbl);
}

function craftFilterWithCount(rule: StockRule, need: number): RsBridgeItemFilter {
    if (rule.fingerprint != null && rule.fingerprint !== "") {
        return { name: rule.name, type: "item", fingerprint: rule.fingerprint, count: need };
    }
    if (rule.nbt != null && rule.nbt !== "") {
        return { name: rule.name, nbt: rule.nbt, type: "item", count: need };
    }
    return { name: rule.name, type: "item", count: need };
}

export function restockTick(bridge: RsBridgePeripheral, rules: StockRule[]): void {
    const stacks = getAllStorageItemStacks(bridge);
    for (const rule of rules) {
        if (rule.minCount <= 0) continue;
        const filter = ruleToFilter(rule);
        const have = totalAmountForRule(stacks, rule);
        if (have >= rule.minCount) continue;
        if (bridge.isCraftable({name: rule.name}) !== true) continue;
        if (bridge.isCrafting({name: rule.name}) === true) continue;
        const need = rule.minCount - have;
        pcall(() => bridge.craftItem({name: rule.name, count: need}));
    }
}
