import * as event from "./event";
import { drawMonitor } from "./monitorUi";
import {
    loadCraftables,
    loadRules,
    restockTick,
    RULES_FILE,
} from "./stock";
import { TerminalStockerUi } from "./terminalUi";

const SET_MON = "rs_stocker.monitor_side";
const SET_INTERVAL = "rs_stocker.refresh_seconds";
const SET_SHORTAGE_FIRST = "rs_stocker.monitor_shortage_first";

settings.define(SET_MON, { description: "Monitor peripheral side", default: "top", type: "string" });
settings.define(SET_INTERVAL, { description: "Restock and UI refresh interval (seconds)", default: 3, type: "number" });
settings.define(SET_SHORTAGE_FIRST, {
    description: "Monitor: true = lowest fill ratio at top (need stock most). false = reverse order.",
    default: true,
    type: "boolean",
});

function readInterval(): number {
    const v = settings.get(SET_INTERVAL, 3);
    const n = typeof v === "number" ? v : parseInt(`${v}`, 10);
    if (isNaN(n) || n < 1) return 3;
    return n;
}

function main(): void {
    const found = peripheral.find("rs_bridge");
    const bridgeRaw = found[0];
    if (bridgeRaw == null) {
        print("No rsBridge peripheral found. Attach an Advanced Peripherals RS Bridge.");
        return;
    }
    const bridge = bridgeRaw as RsBridgePeripheral;

    if (!bridge.isConnected()) {
        print("RS bridge is not connected to a storage grid.");
    } else if (!bridge.isOnline()) {
        print("Storage grid is offline; stocking paused until online.");
    }

    const monSide = settings.get(SET_MON, "top") as string;
    const monWrap = peripheral.wrap(monSide);
    const monitor = monWrap != null ? (monWrap as MonitorPeripheral) : null;
    if (monitor == null) {
        print(`No monitor on "${monSide}". Set ${SET_MON} or place a monitor.`);
    }

    const tickSec = readInterval();
    const rules = loadRules(RULES_FILE);
    let craftables = loadCraftables(bridge);

    const redrawMonitor = () => {
        if (monitor != null) drawMonitor(bridge, monitor, rules);
    };

    const ui = new TerminalStockerUi(rules, RULES_FILE, redrawMonitor);

    print("RS stocker running. Timer refreshes craft list, restocks, and updates screens.");
    ui.draw(craftables);
    redrawMonitor();

    let timer = os.startTimer(tickSec);

    while (true) {
        const ev = event.pullEventRaw();
        if (ev instanceof event.TerminateEvent) break;
        if (ev == null) continue;

        if (ev instanceof event.TimerEvent && ev.id === timer) {
            if (bridge.isConnected() && bridge.isOnline()) {
                restockTick(bridge, rules);
            }
            craftables = loadCraftables(bridge);
            redrawMonitor();
            ui.draw(craftables);
            timer = os.startTimer(tickSec);
            continue;
        }

        const cont = ui.handle(ev, craftables);
        if (!cont) break;
        ui.draw(craftables);
    }
}

main();
