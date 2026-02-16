/**
     * Simulates a key down and subsequent key up event for a given key.
     * @param {string} key - The key to simulate (e.g., 'o').
     * @param {string} code - The corresponding code for the key (e.g., 'KeyO').
     * @param {number} delay - The time in milliseconds between keydown and keyup.
     */
function simulateKeyPress(options) {
    options = options || {};

    var key = options.key || 'Enter';
    var code = options.code || key;
    var keyCode = options.keyCode || 13;
    var delay = options.delay || 80;
    var target = options.target || document;

    if (!target || typeof target.dispatchEvent !== 'function') {
        console.error('Invalid target for simulateKey');
        return;
    }

    function createEvent(type) {
        var evt = new KeyboardEvent(type, {
            key: key,
            code: code,
            bubbles: true,
            cancelable: true
        });

        Object.defineProperty(evt, 'keyCode', { get: function () { return keyCode; } });
        Object.defineProperty(evt, 'which', { get: function () { return keyCode; } });

        return evt;
    }

    target.dispatchEvent(createEvent('keydown'));

    setTimeout(function () {
        target.dispatchEvent(createEvent('keyup'));
    }, delay);
}


// note that we can only call java stuff if thread not running..
const cheerpjWebRoot = '/app' + location.pathname.replace(/\/$/, '');

const emptyIcon = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

let lib = null, launcherUtil = null;
let state = {
    games: [],
    currentGame: null,
    editedGameId: null,
    uploadedJars: 0,
};
let defaultSettings = {};

async function main() {
    document.getElementById("loading").innerHTML = '<div class="spinner"></div>Loading ...';
    await cheerpjInit({
        enableDebug: false
    });

    lib = await cheerpjRunLibrary(cheerpjWebRoot + "/freej2me-web.jar");

    document.getElementById("loading").innerHTML = '<div class="spinner"></div>Loading...';

    launcherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;

    await launcherUtil.resetTmpDir();

    const Config = await lib.org.recompile.freej2me.Config;
    await javaToKv(Config.DEFAULT_SETTINGS, defaultSettings);

    await reloadUI();

    document.getElementById("loading").style.display = "none";
    document.getElementById("main").style.display = "";

    document.getElementById("clear-current").onclick = setupAddMode;

    document.getElementById("import-data-btn").addEventListener("click", () => {
        document.getElementById("import-data-file").click();
    });

    document.getElementById("import-data-file").onchange = doImportData;
    document.getElementById("export-data-btn").onclick = doExportData;

}

async function maybeReadCheerpJFileText(path) {
    const blob = await cjFileBlob(path);
    if (blob) {
        return await blob.text();
    }
}

async function getDataUrlFromBlob(blob) {
    const reader = new FileReader();

    const promise = new Promise((r) => {
        reader.onload = function () {
            r(reader.result);
        };
    });

    reader.readAsDataURL(blob);
    return await promise;
}

function readToKv(txt, kv) {
    for (const line of txt.trim().split("\n")) {
        const parts = line.split(/\s*:\s*/);
        if (parts.length == 2) {
            kv[parts[0]] = parts[1];
        }
    }
}

async function javaToKv(hashMap, kv) {
    const es = await hashMap.entrySet();
    const esi = await es.iterator();

    while (await esi.hasNext()) {
        const entry = await esi.next();
        const key = await entry.getKey();
        const value = await entry.getValue();

        kv[key] = value;
    }
}

async function kvToJava(kv) {
    const HashMap = await lib.java.util.HashMap;
    const ret = await new HashMap();

    for (const k of Object.keys(kv)) {
        await ret.put(k, kv[k]);
    }

    return ret;
}

async function loadGames() {
    const apps = [];

    let installedAppsBlob = await cjFileBlob("/files/apps.list");
    if (!installedAppsBlob) {
        const res = await fetch("init.zip");
        const ab = await res.arrayBuffer();
        await launcherUtil.importData(new Int8Array(ab));

        installedAppsBlob = await cjFileBlob("/files/apps.list");
    }

    if (installedAppsBlob) {
        const installedIds = (await installedAppsBlob.text()).trim().split("\n");

        for (const appId of installedIds) {
            if (!appId) continue;
            const napp = {
                appId,
                name: appId,
                icon: emptyIcon,
                settings: { ...defaultSettings },
                appProperties: {},
                systemProperties: {},
            };

            const name = await maybeReadCheerpJFileText("/files/" + appId + "/name");
            if (name) napp.name = name;

            const iconBlob = await cjFileBlob("/files/" + appId + "/icon");
            if (iconBlob) {
                const dataUrl = await getDataUrlFromBlob(iconBlob);
                if (dataUrl) {
                    napp.icon = dataUrl;
                }
            }

            for (const [fname, keyName] of [
                ["/files/" + appId + "/config/settings.conf", "settings"],
                ["/files/" + appId + "/config/appproperties.conf", "appProperties"],
                ["/files/" + appId + "/config/systemproperties.conf", "systemProperties"],
            ]) {
                const content = await maybeReadCheerpJFileText(fname);
                if (content) {
                    readToKv(content, napp[keyName]);
                }
            }

            apps.push(napp);
        }
    }

    return apps;
}

function fillGamesList(games) {
    const container = document.getElementById("game-list");
    container.innerHTML = "";

    if (games.length === 0) {
        container.innerHTML = "<p style='padding: 15px; text-align: center;'>No games installed.</p>";
        return;
    }

    for (const game of games) {
        const item = document.createElement("div");
        item.className = "game-item";

        const link = document.createElement("a");
        link.href = "run.html?app=" + game.appId;
        link.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') {
                link.href = "run.html?app=" + game.appId + "&mobile=1";
            }
        });

        const icon = document.createElement("img");
        icon.className = "icon";
        icon.src = game.icon;
        link.appendChild(icon);

        const info = document.createElement("div");
        info.className = "game-info";
        info.textContent = game.name;
        link.appendChild(info);

        item.appendChild(link);

        const manageButton = document.createElement("button");
        manageButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
</svg>`;
        manageButton.className = "btn-manage";
        manageButton.onclick = () => openEditGame(game);
        item.appendChild(manageButton);

        container.appendChild(item);
    }
}

function setupAddMode() {
    if (!confirmDiscard()) {
        return;
    }
    state.currentGame = {
        icon: emptyIcon,
        settings: { ...defaultSettings },
        appProperties: {},
        systemProperties: {},
    };

    document.getElementById("add-edit-text").textContent = "Add new game";
    document.getElementById("manage-controls-after-save").style.display = "none";

    document.getElementById("file-input-step").style.display = "";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("add-manage-step").style.display = "none";

    const gameFileInput = document.getElementById("game-file-input");
    gameFileInput.disabled = false;
    gameFileInput.value = null;

    gameFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            gameFileInput.disabled = true;
            document.getElementById("file-input-step").style.display = "none";
            document.getElementById("file-input-loading").style.display = "";

            const reader = new FileReader();
            reader.onload = async () => {
                const arrayBuffer = reader.result;
                await processGameFile(arrayBuffer, file.name);
            };
            reader.readAsArrayBuffer(file);
        }
    };
}

async function processGameFile(fileBuffer, fileName) {
    const MIDletLoader = await lib.org.recompile.mobile.MIDletLoader;
    const File = await lib.java.io.File;

    const jarFile = await new File(
        "/files/_tmp/" + state.uploadedJars++ + ".jar"
    );

    await launcherUtil.copyJar(new Int8Array(fileBuffer), jarFile);
    state.currentGame.jarFile = jarFile;

    const AnalyserUtil = await lib.pl.zb3.freej2me.launcher.AnalyserUtil;
    const analysisResult = await AnalyserUtil.analyseFile(jarFile, fileName);
    fillGuessedSettings(analysisResult, state.currentGame);

    if (state.lastLoader) {
        await state.lastLoader.close();
    }
    const loader = await MIDletLoader.getMIDletLoader(jarFile);
    state.lastLoader = loader;

    if (!(await loader.getAppId())) {
        document.getElementById("file-input-step").style.display = "none";
        document.getElementById("file-input-loading").style.display = "none";
        document.getElementById("file-input-jad-step").style.display = "";
        document.getElementById("upload-descriptor-file-input").value = null;

        document.getElementById("upload-descriptor-file-input").onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById("file-input-jad-step").style.display = "none";
                document.getElementById("file-input-loading").style.display = "";

                const reader = new FileReader();
                reader.onload = async () => {
                    const arrayBuffer = reader.result;
                    await launcherUtil.augementLoaderWithJAD(
                        loader,
                        new Int8Array(arrayBuffer)
                    );

                    if (await loader.getAppId()) {
                        await setupNewGameManage(loader);
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        };

        document.getElementById('continue-without-jad').onclick = async () => {
            await continueWithoutJAD(loader, fileName);
        };
    } else {
        await setupNewGameManage(loader);
    }
}

function fillGuessedSettings(analysisResult, app) {
    if (analysisResult.screenWidth !== -1) {
        app.settings.width = analysisResult.screenWidth + '';
        app.settings.height = analysisResult.screenHeight + '';
    }

    if (analysisResult.phoneType) {
        app.settings.phone = analysisResult.phoneType;
    }
}

async function continueWithoutJAD(loader, origName) {
    await launcherUtil.ensureAppId(loader, origName);
    loader.name = await loader.getAppId();
    await setupNewGameManage(loader);
}

async function setupNewGameManage(loader) {
    state.currentGame.appId = await loader.getAppId();
    state.currentGame.name = loader.name || state.currentGame.appId;
    const iconBytes = await loader.getIconBytes();
    state.currentGame.icon = iconBytes
        ? await getDataUrlFromBlob(new Blob([iconBytes]))
        : emptyIcon;

    await javaToKv(loader.properties, state.currentGame.appProperties);

    await setupAddManageGame(state.currentGame, true);
}

async function setupAddManageGame(app, isAdding) {
    document.getElementById("file-input-step").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("add-manage-step").style.display = "";

    document.querySelector(".preview-icon").src = app.icon || emptyIcon;
    document.querySelector(".preview-name").textContent = app.name;

    const manageControls = document.getElementById("manage-controls-after-save");
    manageControls.style.display = isAdding ? "none" : "";

    if (!isAdding) {
        document.getElementById("uninstall-btn").disabled = false;
        document.getElementById("uninstall-btn").onclick = (e) => {
            if (!confirm("Do you want to uninstall " + app.name + "?")) {
                return;
            }
            document.getElementById("uninstall-btn").disabled = true;
            doUninstallGame(app.appId);
        };

        document.getElementById("wipe-data-btn").disabled = false;
        document.getElementById("wipe-data-btn").onclick = (e) => {
            if (!confirm("Do you want wipe " + app.name + "'s saved data?")) {
                return;
            }
            document.getElementById("wipe-data-btn").disabled = true;
            doWipeData(app.appId);
        };
    }

    document.getElementById("phoneType").value = app.settings.phone || "Standard";

    const screenSize = document.getElementById("screenSize");
    const sizeStr = `${app.settings.width}x${app.settings.height}`;
    if ([...screenSize.options].some((opt) => opt.value === sizeStr)) {
        screenSize.value = sizeStr;
    } else {
        screenSize.value = "custom";
    }
    document.getElementById("customWidth").value = app.settings.width;
    document.getElementById("customHeight").value = app.settings.height;
    screenSize.onchange = adjustScreenSizeInput;
    adjustScreenSizeInput();

    document.getElementById("fontSize").value = app.settings.fontSize || "0";
    document.getElementById("dgFormat").value = app.settings.dgFormat || "444";

    document.querySelector('input[name="enableSound"]').checked = app.settings.sound === "on";
    document.querySelector('input[name="forceFullscreen"]').checked = app.settings.forceFullscreen === "on";
    document.querySelector('input[name="textureDisableFilter"]').checked = app.settings.textureDisableFilter === "on";

    document.getElementById("add-save-button").disabled = false;
    document.getElementById("add-save-button").textContent = isAdding ? "Add game" : "Save Changes";
    document.getElementById("add-save-button").onclick = doAddSaveGame;
}

function adjustScreenSizeInput() {
    document.getElementById("edit-custom-size-inputs").style.display =
        document.getElementById("screenSize").value === "custom" ? "flex" : "none";
}

async function doAddSaveGame() {
    document.getElementById("add-save-button").disabled = true;

    readUI(state.currentGame);

    const jsettings = await kvToJava(state.currentGame.settings);
    const jappProps = await kvToJava(state.currentGame.appProperties);
    const jsysProps = await kvToJava(state.currentGame.systemProperties);

    if (state.currentGame.jarFile) {
        await launcherUtil.initApp(
            state.currentGame.jarFile,
            state.lastLoader,
            jsettings,
            jappProps,
            jsysProps
        );
    } else {
        await launcherUtil.saveApp(
            state.currentGame.appId,
            jsettings,
            jappProps,
            jsysProps
        );
    }

    await reloadUI();
}

function readUI(targetGameObj) {
    targetGameObj.settings.phone = document.getElementById("phoneType").value;

    const screenSize = document.getElementById("screenSize").value;
    if (screenSize === "custom") {
        targetGameObj.settings.width = document.getElementById("customWidth").value;
        targetGameObj.settings.height = document.getElementById("customHeight").value;
    } else {
        const [width, height] = screenSize.split("x");
        targetGameObj.settings.width = width;
        targetGameObj.settings.height = height;
    }

    targetGameObj.settings.fontSize = document.getElementById("fontSize").value;
    targetGameObj.settings.dgFormat = document.getElementById("dgFormat").value;

    targetGameObj.settings.sound = document.querySelector('input[name="enableSound"]').checked ? "on" : "off";
    targetGameObj.settings.forceFullscreen = document.querySelector('input[name="forceFullscreen"]').checked ? "on" : "off";
    targetGameObj.settings.textureDisableFilter = document.querySelector('input[name="textureDisableFilter"]').checked ? "on" : "off";

    // Clear old properties before reading new ones
    targetGameObj.appProperties = {};
    targetGameObj.systemProperties = {};
}

function openEditGame(gameObj) {
    if (!confirmDiscard()) {
        return;
    }
    state.currentGame = JSON.parse(JSON.stringify(gameObj)); // Deep copy to avoid modifying original object
    document.getElementById("add-edit-text").textContent = "Edit game";

    setupAddManageGame(state.currentGame, false);

    if (window.uiNavigate) {
        window.uiNavigate('addEdit');
    }
}

function confirmDiscard() {
    if (state.currentGame != null && (state.currentGame.jarFile || state.currentGame.appId)) {
        // This logic is now handled by the back button's confirm dialog.
        // Returning true allows the operation to proceed.
    }
    return true;
}

async function reloadUI() {
    state.currentGame = null;

    state.games = await loadGames();
    fillGamesList(state.games);
    setupAddMode();

    if (window.uiNavigate) {
        window.uiNavigate('main');
    }
}

async function doUninstallGame(appId) {
    await launcherUtil.uninstallApp(appId);
    await reloadUI();
}

async function doWipeData(appId) {
    await launcherUtil.wipeAppData(appId);
    alert('Game data wiped.');
    document.getElementById("wipe-data-btn").disabled = false;
}

function doImportData(e) {
    if (e.target.files.length > 0) {
        document.getElementById("import-data-btn").disabled = true;

        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const arrayBuffer = reader.result;
                await launcherUtil.importData(new Int8Array(arrayBuffer));
                await reloadUI();
                alert('Data imported successfully!');
            } catch (error) {
                console.error("Error importing data:", error);
                alert('Error importing data.');
            }
        };
        reader.onloadend = () => {
            document.getElementById("import-data-btn").disabled = false;
            e.target.value = null; // Reset file input
        };
        reader.readAsArrayBuffer(file);
    }
}

async function doExportData() {
    try {
        const exportedData = await launcherUtil.exportData();
        const blob = new Blob([exportedData.buffer], { type: "application/zip" });

        const objectURL = URL.createObjectURL(blob);
        const downloadLink = document.getElementById("export-data-link");

        downloadLink.href = objectURL;
        downloadLink.click();
        setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    } catch (error) {
        console.error("Error exporting data:", error);
        alert("Error exporting data");
    }
}

main();


// window.addEventListener('back', (event) => {
//     event.preventDefault();
//     simulateKeyPress({
//         key: 'w',
//         code: 'KeyW',
//         keyCode: 87,
//         target: document.body
//     }); // Handle SoftRight
// });



