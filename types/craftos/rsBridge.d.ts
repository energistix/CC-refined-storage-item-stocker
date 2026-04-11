/** @noSelfInFile **/

/**
 * Advanced Peripherals unified ME/RS storage bridge (AP 0.8 / 0.7 on 1.21.1+).
 * @see https://docs.advanced-peripherals.de/latest/guides/storage_system_functions/
 * Item filters: https://docs.advancedperipherals.de/guides/filters
 */

/**
 * Item filter per AP filters guide. Generic APIs (`isCraftable`, `craftItem`, …) expect a real item id:
 * always pass `name` (registry id) and usually `type = "item"`. `fingerprint` / `nbt` narrow the match when set.
 */
type RsBridgeItemFilter =
    | {
          name: string;
          count?: number;
          nbt?: string;
          fingerprint?: string;
          type?: "item" | "fluid" | "chemical";
      }
    /** List-all style (e.g. every craftable item). */
    | { type: "item" | "fluid" | "chemical"; count?: number };

type RsBridgeFluidFilter =
    | { name: string; count?: number; nbt?: string; type?: "fluid" | "chemical" }
    | { fingerprint: string; count?: number }
    | { type: "fluid" | "chemical"; count?: number };

/** Item stack from storage queries (see AP Lua Objects / Item). */
interface RsBridgeItemInfo {
    name: string;
    fingerprint?: string;
    /** Prefer for grid stack size in getItems (may differ from `amount` in some builds). */
    count?: number;
    /** May be present; do not assume it equals stack size—use `count` when set. */
    amount?: number;
    displayName?: string;
    isCraftable?: boolean;
    nbt?: string;
    tags?: string[];
}

interface RsBridgeFluidInfo {
    name: string;
    fingerprint?: string;
    amount: number;
    displayName: string;
    isCraftable: boolean;
    nbt?: string;
    tags?: string[];
}

/** Opaque craft job object returned by craftItem (optional tracking). */
type ApCraftingJobHandle = LuaTable<string, unknown>;

interface ApPatternFilter {
    input?: RsBridgeItemFilter | RsBridgeFluidFilter;
    output?: RsBridgeItemFilter | RsBridgeFluidFilter;
}

/** Pattern entry from getPatterns (subset of fields). */
interface ApStoragePattern {
    primaryOutput?: RsBridgeItemInfo | RsBridgeFluidInfo;
    outputs?: (RsBridgeItemInfo | RsBridgeFluidInfo)[];
    inputs?: (RsBridgeItemInfo | RsBridgeFluidInfo)[];
    patternType?: string;
    id?: string;
}

declare class RsBridgePeripheral implements IPeripheral {
    isConnected(): boolean;
    isOnline(): boolean;

    getItem(filter: RsBridgeItemFilter): LuaMultiReturn<[RsBridgeItemInfo | null, string | undefined]>;
    getItems(filter: RsBridgeItemFilter): LuaMultiReturn<[LuaTable<number, RsBridgeItemInfo> | null, string | undefined]>;
    getCraftableItems(filter: RsBridgeItemFilter): LuaMultiReturn<[LuaTable<number, RsBridgeItemInfo> | null, string | undefined]>;

    getFluid(filter: RsBridgeFluidFilter): LuaMultiReturn<[RsBridgeFluidInfo | null, string | undefined]>;
    getFluids(filter: RsBridgeFluidFilter): LuaMultiReturn<[LuaTable<number, RsBridgeFluidInfo> | null, string | undefined]>;
    getCraftableFluids(filter: RsBridgeFluidFilter): LuaMultiReturn<[LuaTable<number, RsBridgeFluidInfo> | null, string | undefined]>;

    craftItem(filter: RsBridgeItemFilter): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;
    craftFluid(filter: RsBridgeFluidFilter): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;

    isCraftable(filter: RsBridgeItemFilter | RsBridgeFluidFilter): boolean | undefined;
    isCrafting(filter: RsBridgeItemFilter | RsBridgeFluidFilter): boolean | undefined;

    getCraftingTasks(): LuaTable<number, ApCraftingJobHandle>;
    getCraftingJob(id: number): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;
    cancelCraftingTasks(filter: RsBridgeItemFilter | RsBridgeFluidFilter): number;

    getPatterns(patternFilter?: ApPatternFilter): LuaMultiReturn<[LuaTable<number, ApStoragePattern> | null, string | undefined]>;

    importItem(filter: RsBridgeItemFilter, target: string): LuaMultiReturn<[LuaTable | null, string | undefined]>;
    exportItem(filter: RsBridgeItemFilter, target: string): LuaMultiReturn<[LuaTable | null, string | undefined]>;

    getStoredEnergy(): number;
    getEnergyCapacity(): number;
    getEnergyUsage(): number;

    getTotalExternItemStorage(): number;
    getTotalExternFluidStorage(): number;
    getTotalItemStorage(): number;
    getTotalFluidStorage(): number;
    getUsedItemStorage(): number;
    getUsedFluidStorage(): number;
    getAvailableItemStorage(): number;
    getAvailableFluidStorage(): number;
}
