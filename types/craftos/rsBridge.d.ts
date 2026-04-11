/** @noSelfInFile **/

/**
 * Advanced Peripherals RS/ME bridge — behavior from source, not web docs.
 *
 * **ItemFilter.parse** ([ItemFilter.java](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/util/inventory/ItemFilter.java)):
 * Used by `getItem`, `getItems`, `getCraftableItems`, `craftItem`, `importItem`, `exportItem` ([RSBridgePeripheral.java](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/addons/computercraft/peripheral/RSBridgePeripheral.java)).
 * Reads: `name` (id or `#tag`), `count`, `fingerprint`, `components` (SNBT string or table), `fromSlot`, `toSlot`.
 * Does **not** read `type` or legacy **`nbt`** (those keys are ignored).
 * Note: on stock AP, `craftItem` uses `toItemStack()` which applies the internal `components` map but not necessarily
 * Lua-parsed `componentsAsNbt`; variant output matching may still be limited in practice.
 * Empty table `{}` ⇒ match all items (same as omitted arg via `EmptyLuaTable`).
 *
 * **GenericFilter.parseGeneric** ([GenericFilter.java](AdvancedPeripherals/src/main/java/de/srendi/advancedperipherals/common/util/inventory/GenericFilter.java)):
 * Used by `isCraftable`, `isCrafting`, `cancelCraftingTasks`.
 * Requires **`type` or `name`** on the table; otherwise throws `LuaException("Generic filter requires either field \"type\" or \"name\"")`.
 * With `type: "item"` it delegates to `ItemFilter.parse` on the same table.
 */

/** Filter table for methods that use `ItemFilter.parse` only. */
type RsBridgeItemFilterParse =
    | Record<PropertyKey, never>
    | {
          name?: string;
          count?: number;
          fingerprint?: string;
          /** SNBT string or Lua table (AP parses both; table path is fragile). */
          components?: string | LuaTable<string, unknown>;
          fromSlot?: number;
          toSlot?: number;
      };

/** Optional fields shared with item parse tables on generic-filter methods. */
type RsBridgeGenericFilterExtras = {
    count?: number;
    fingerprint?: string;
    components?: string | LuaTable<string, unknown>;
    fromSlot?: number;
    toSlot?: number;
};

/**
 * Filter for `isCraftable` / `isCrafting` / `cancelCraftingTasks` (`GenericFilter.parseGeneric`).
 * Must include `type` or `name` (otherwise AP throws).
 */
type RsBridgeGenericFilter =
    | ({ type: "item" | "fluid" | "chemical" } & RsBridgeGenericFilterExtras & { name?: string })
    | ({ name: string } & RsBridgeGenericFilterExtras & { type?: "item" | "fluid" | "chemical" });

type RsBridgeFluidFilter =
    | { name: string; count?: number; nbt?: string; type?: "fluid" | "chemical" }
    | { fingerprint: string; count?: number }
    | { type: "fluid" | "chemical"; count?: number };

/** Item stack from RS/ME storage (LuaConverter.itemStackToObject + RS fields). */
interface RsBridgeItemInfo {
    name: string;
    fingerprint?: string;
    /** Prefer for grid stack size in getItems (may differ from `amount` in some builds). */
    count?: number;
    /** May be present; do not assume it equals stack size—use `count` when set. */
    amount?: number;
    displayName?: string;
    isCraftable?: boolean;
    /** Not set by modern AP item objects; use `components` + fingerprint for variants. */
    nbt?: string;
    /** Data component patch as Lua (from AP); round-trip via filter `components` if encoded as SNBT. */
    components?: LuaTable<string, unknown>;
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
    input?: RsBridgeItemFilterParse | RsBridgeFluidFilter;
    output?: RsBridgeItemFilterParse | RsBridgeFluidFilter;
}

/** Pattern entry from getPatterns (subset of fields). */
interface ApStoragePattern {
    primaryOutput?: RsBridgeItemInfo | RsBridgeFluidInfo;
    outputs?: (RsBridgeItemInfo | RsBridgeFluidInfo)[];
    inputs?: (RsBridgeItemInfo | RsBridgeFluidInfo)[];
    patternType?: string;
    id?: string;
}

/** @noSelf CC peripheral table: use dot calls (`bridge.getItems`), not colon (`bridge:getItems` passes self as 1st arg). */
declare class RsBridgePeripheral implements IPeripheral {
    isConnected(): boolean;
    isOnline(): boolean;

    getItem(filter: RsBridgeItemFilterParse): LuaMultiReturn<[RsBridgeItemInfo | null, string | undefined]>;
    getItems(filter: RsBridgeItemFilterParse): LuaMultiReturn<[LuaTable<number, RsBridgeItemInfo> | null, string | undefined]>;
    getCraftableItems(filter: RsBridgeItemFilterParse): LuaMultiReturn<[LuaTable<number, RsBridgeItemInfo> | null, string | undefined]>;

    getFluid(filter: RsBridgeFluidFilter): LuaMultiReturn<[RsBridgeFluidInfo | null, string | undefined]>;
    getFluids(filter: RsBridgeFluidFilter): LuaMultiReturn<[LuaTable<number, RsBridgeFluidInfo> | null, string | undefined]>;
    getCraftableFluids(filter: RsBridgeFluidFilter): LuaMultiReturn<[LuaTable<number, RsBridgeFluidInfo> | null, string | undefined]>;

    craftItem(filter: RsBridgeItemFilterParse): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;
    craftFluid(filter: RsBridgeFluidFilter): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;

    isCraftable(filter: RsBridgeGenericFilter | RsBridgeFluidFilter): boolean | undefined;
    isCrafting(filter: RsBridgeGenericFilter | RsBridgeFluidFilter): boolean | undefined;

    getCraftingTasks(): LuaTable<number, ApCraftingJobHandle>;
    getCraftingJob(id: number): LuaMultiReturn<[ApCraftingJobHandle | null, string | undefined]>;
    cancelCraftingTasks(filter: RsBridgeGenericFilter | RsBridgeFluidFilter): number;

    getPatterns(patternFilter?: ApPatternFilter): LuaMultiReturn<[LuaTable<number, ApStoragePattern> | null, string | undefined]>;

    importItem(filter: RsBridgeItemFilterParse, target: string): LuaMultiReturn<[LuaTable | null, string | undefined]>;
    exportItem(filter: RsBridgeItemFilterParse, target: string): LuaMultiReturn<[LuaTable | null, string | undefined]>;

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
