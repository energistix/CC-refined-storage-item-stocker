/** @noSelfInFile **/

/** Item filter for RS Bridge methods (see Advanced Peripherals docs). */
type RsBridgeItemFilter =
    | { name: string; count?: number; nbt?: string }
    | { fingerprint: string; count?: number };

/** Fluid filter for craftFluid / fluid listings. */
type RsBridgeFluidFilter =
    | { name: string; count?: number; nbt?: string }
    | { fingerprint: string; count?: number };

interface RsBridgeItemInfo {
    name: string;
    fingerprint?: string;
    amount: number;
    displayName: string;
    isCraftable: boolean;
    nbt?: string;
    tags: string[];
}

interface RsBridgeFluidInfo {
    name: string;
    fingerprint?: string;
    amount: number;
    displayName: string;
    isCraftable: boolean;
    nbt?: string;
    tags: string[];
}

interface RsBridgePatternSlot {
    name?: string;
    fingerprint?: string;
    count?: number;
    amount?: number;
    nbt?: string;
    displayName?: string;
}

interface RsBridgePattern {
    inputs: RsBridgePatternSlot[];
    outputs: RsBridgePatternSlot[];
    byproducts: RsBridgePatternSlot[];
    processing: boolean;
}

/** Advanced Peripherals RS Bridge — Refined Storage integration. */
declare class RsBridgePeripheral implements IPeripheral {
    craftItem(item: RsBridgeItemFilter): boolean;
    craftFluid(fluid: RsBridgeFluidFilter, amount: number): boolean;
    getItem(item: RsBridgeItemFilter): RsBridgeItemInfo;
    importItem(item: RsBridgeItemFilter, direction: string): number;
    exportItem(item: RsBridgeItemFilter, direction: string): number;
    importItemFromPeripheral(item: RsBridgeItemFilter, container: string): number;
    exportItemToPeripheral(item: RsBridgeItemFilter, container: string): number;
    getMaxItemDiskStorage(): number;
    getMaxFluidDiskStorage(): number;
    getMaxItemExternalStorage(): number;
    getMaxFluidExternalStorage(): number;
    getEnergyStorage(): number;
    getMaxEnergyStorage(): number;
    getEnergyUsage(): number;
    getPattern(item: RsBridgeItemFilter): LuaMultiReturn<[RsBridgePattern | null, string | undefined]>;
    isItemCrafting(item: RsBridgeItemFilter): boolean;
    isItemCraftable(item: RsBridgeItemFilter): boolean;
    listCraftableItems(): RsBridgeItemInfo[];
    listCraftableFluids(): RsBridgeFluidInfo[];
    listItems(): RsBridgeItemInfo[];
    listFluids(): RsBridgeFluidInfo[];
}
