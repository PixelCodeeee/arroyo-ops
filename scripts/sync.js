const fs = require('fs');
const path = require('path');

const manifestsDir = path.join(__dirname, '..', 'manifests');
const stablePath = path.join(manifestsDir, 'stable.json');
const canaryPath = path.join(manifestsDir, 'canary.json');

function loadManifest(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`Manifest not found at ${filePath}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveManifest(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Usage: node sync.js <component> <commit> <built_at> [api_contract]
 * component: "frontend" | "backend"
 * commit: string
 * built_at: ISO date string
 * api_contract: optional string representing a new contract version.
 */
function sync() {
    const [, , component, commit, built_at, newApiContract] = process.argv;

    if (!component || !commit || !built_at) {
        console.error("Usage: node sync.js <frontend|backend> <commit> <built_at> [api_contract]");
        process.exit(1);
    }

    if (component !== 'frontend' && component !== 'backend') {
        console.error("Invalid component. Must be 'frontend' or 'backend'.");
        process.exit(1);
    }

    const stable = loadManifest(stablePath);
    const canary = loadManifest(canaryPath);

    const otherComponent = component === 'frontend' ? 'backend' : 'frontend';

    console.log(`\n=== Canary Sync Triggered ===`);
    console.log(`Updating ${component} (Commit: ${commit})`);

    // Determine current effective API contract.
    // If a new one is provided via argument, we assume this deployment introduces it.
    let currentContract = newApiContract || canary.api_contract || stable.api_contract;

    if (newApiContract && newApiContract !== canary.api_contract) {
        console.log(`⚠️ New API Contract introduced: ${newApiContract}`);
        // Reset the OTHER component because it doesn't support the new contract yet.
        canary.api_contract = newApiContract;
        canary[otherComponent] = {
            commit: null,
            built_at: null,
            status: 'missing'
        };
    } else {
        // Contract didn't change (or none provided), meaning independent update.
        // If the other component is missing in canary, we sync it from stable.
        if (canary[otherComponent].status === 'missing' || !canary[otherComponent].commit) {
            console.log(`Independent update detected. Syncing ${otherComponent} from stable to complete pair.`);
            canary[otherComponent] = { ...stable[otherComponent], status: 'synced_from_stable' };
        }
    }

    // Update the component that triggered the pipeline
    canary[component] = {
        commit,
        built_at,
        status: 'ready'
    };

    // Safety Contract Validation Check:
    if (canary.frontend.status === 'missing' || canary.backend.status === 'missing') {
        console.error(`\n🚨 DEPLOYMENT BLOCKED 🚨`);
        console.error(`Mismatched API Contract! The deployment demands both frontend and backend to comply with contract '${canary.api_contract}'.`);
        console.error(`Status: Frontend [${canary.frontend.status}], Backend [${canary.backend.status}]`);
        // We still save the manifest so the other repo can fulfill it later, but we exit with a non-zero code to fail CI.
        saveManifest(canaryPath, canary);
        process.exit(1);
    }

    saveManifest(canaryPath, canary);

    console.log(`\n✅ Canary is theoretically synced and ready for traffic shifting.`);
    console.log(`Contract: ${canary.api_contract}`);
    console.log(`Frontend: ${canary.frontend.commit} (${canary.frontend.status})`);
    console.log(`Backend : ${canary.backend.commit} (${canary.backend.status})`);
    process.exit(0);
}

sync();
