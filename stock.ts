/**
 * Persistence + RS bridge integration aligned with vendored Advanced Peripherals sources.
 *
 * - `ItemFilter.parse` ([ItemFilter.java](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/util/inventory/ItemFilter.java)):
 *   `getItems`, `getCraftableItems`, `craftItem` — empty `{}` lists all; ignores `type` and `nbt`.
 * - `GenericFilter.parseGeneric` ([GenericFilter.java](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/util/inventory/GenericFilter.java)):
 *   `isCraftable`, `isCrafting` — table must have `type` or `name` or Lua throws.
 */

import { pretty_print } from "cc.pretty";

/** @noSelf */
declare function pcall<T>(fn: () => T): LuaMultiReturn<[true, T] | [false, unknown]>;
/** @noSelf */
declare function pairs<K, V>(t: LuaTable<K, V>): LuaIterable<LuaMultiReturn<[K, V]>>;

export const RULES_FILE = "stock_rules.txt";

/** Match all items — `ItemFilter.parse` empty table ([RSBridgePeripheral.getItems](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/addons/computercraft/peripheral/RSBridgePeripheral.java)). */
const ALL_ITEMS_FILTER: RsBridgeItemFilterParse = {};

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
export function getItemsList(bridge: RsBridgePeripheral, filter: RsBridgeItemFilterParse): RsBridgeItemInfo[] {
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
 * Prefer fingerprint; fall back to legacy `nbt` strings on old saved rules (AP Lua objects use `components`, not `nbt`).
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
    /** Legacy persisted field; RS bridge `ItemFilter` does not read `nbt` — matching only client-side / old saves. */
    nbt?: string;
    /** Legacy persisted field; not sent on filters (generic parse + component tables are fragile). */
    components?: LuaTable<string, unknown>;
    minCount: number;
}

function ruleNameOrFallback(rule: StockRule): string {
    return rule.name != null && rule.name !== "" ? rule.name : "minecraft:stone";
}

/**
 * `GenericFilter.parseGeneric` — must include `type` or `name`.
 * Omit `fingerprint`: when set, `ItemFilter.test` matches fingerprint only and can disagree with pattern-output checks.
 */
export function ruleToGenericCraftingProbe(rule: StockRule): RsBridgeGenericFilter {
    return { name: ruleNameOrFallback(rule), type: "item" };
}

/**
 * `ItemFilter.parse` for `craftItem` — `name`, `count`, optional `fingerprint`. No `nbt` / `type` (ignored by parse).
 * Official AP builds the requested stack from `ItemFilter.toItemStack()`; parsed Lua `components` affect `test()` but
 * may not be applied there, so variant crafts can be unreliable—fingerprint + base `name` is the practical option.
 */
export function ruleToCraftItemFilter(rule: StockRule, need: number): RsBridgeItemFilterParse {
    const f: RsBridgeItemFilterParse = { name: ruleNameOrFallback(rule), count: need };
    if (rule.fingerprint != null && rule.fingerprint !== "") {
        (f as { name: string; count: number; fingerprint: string }).fingerprint = rule.fingerprint;
    }
    return f;
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

/** Stable key for per-rule UI / craft-failure tracking. */
export function stockRuleKey(rule: StockRule): string {
    const fp = rule.fingerprint ?? "";
    const nb = rule.nbt ?? "";
    return `${rule.name}\0${fp}\0${nb}`;
}

const craftStartFailed: Record<string, true> = {};

export function isCraftStartFailed(rule: StockRule): boolean {
    return craftStartFailed[stockRuleKey(rule)] === true;
}

export function restockTick(bridge: RsBridgePeripheral, rules: StockRule[]): void {
    const stacks = getAllStorageItemStacks(bridge);
    for (const rule of rules) {
        if (rule.minCount <= 0) continue;
        const key = stockRuleKey(rule);
        const have = totalAmountForRule(stacks, rule);
        if (have >= rule.minCount) {
            delete craftStartFailed[key];
            continue;
        }
        const probe = ruleToGenericCraftingProbe(rule);
        if (bridge.isCraftable(probe) === false) continue;
        if (bridge.isCrafting(probe) === true) continue;
        const needAmt = rule.minCount - have;
        const filter = ruleToCraftItemFilter(rule, needAmt);
        let job: ApCraftingJobHandle | null = null;
        const [okCraft, thrown] = pcall(() => {
            const [j, msg] = bridge.craftItem(filter);
            job = j;
            if (j == null && msg != null && msg !== "") {
                pretty_print(msg);
            }
        });
        if (!okCraft) {
            pretty_print(thrown);
            craftStartFailed[key] = true;
        } else if (job == null) {
            craftStartFailed[key] = true;
        } else {
            delete craftStartFailed[key];
        }
    }
}
