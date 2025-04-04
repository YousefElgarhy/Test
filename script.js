"use strict";

// --- Constants & Globals ---
const CUBE_SIZE = 1; // Visual size of one small cube piece
const SPACING = 0.05; // Visual spacing between pieces
const SHUFFLE_MOVES_FACTOR = 10; // Moves per dimension for shuffle (e.g., 3x3 -> 30 moves)
const VIBRATION_DURATION = 35; // ms for vibration feedback
const COIN_REWARD_ON_SOLVE = 100; // Coins awarded for solving a shuffled cube manually
const COLORS = { // Standard Rubik's colors
    white: 0xffffff, yellow: 0xffff00, blue: 0x0000ff,
    green: 0x00ff00, red: 0xff0000, orange: 0xffa500,
    black: 0x1a1a1a // Internal/non-visible face color
};
// Basic list of words to prevent in usernames (case-insensitive check)
const BANNED_WORDS = ['admin', 'mod', 'moderator', 'root', 'system', 'rubix', 'cube', 'fuck', 'shit', 'cunt', 'ass', 'bitch', 'nigger', 'bastard', 'pussy', 'dick'];
// Define available cubes in the store
const cubeStoreItems = [
    { id: '2x2', name: 'Pocket Cube', size: 2, price: 500, icon: 'fa-border-all' },
    { id: '3x3', name: 'Rubik\'s Cube', size: 3, price: 0, icon: 'fa-cube' }, // 3x3 is free/default
    { id: '4x4', name: 'Rubik\'s Revenge', size: 4, price: 1500, icon: 'fa-th-large' },
    // { id: '5x5', name: 'Professor\'s Cube', size: 5, price: 3000, icon: 'fa-square' } // Example for future expansion
];

// --- State Variables ---
// Three.js related
let scene, camera, renderer, controls, cubeGroup;
let cubies = []; // Array holding the individual cube piece meshes
let raycaster, mouse = new THREE.Vector2(); // For detecting clicks/drags

// Interaction state
let intersectedObject = null, startPoint = null, dragNormal = null;
let isDragging = false, isAnimating = false, isSequenceAnimating = false;
let stopSequenceRequested = false;
let lastScrambleSequence = []; // Stores the moves of the last shuffle

// Settings & Game State
let MOVE_DURATION = 200; // Default animation speed in ms
let vibrationEnabled = true;
let currentN = 3; // Default cube size (N x N x N)
let wasShuffledSinceLastSolve = false; // Tracks if cube was shuffled -> eligible for solve reward

// User Data (loaded from localStorage or defaults)
let userData = {
    username: null,
    coins: 0,
    purchasedCubes: ['3x3'], // User always owns 3x3
    currentCubeSize: 3
};

// Technical state
let gameListenersAdded = false; // Flag to prevent adding listeners multiple times
let animationFrameId = null; // ID for the main animation loop
let domElements = {}; // Cache for frequently accessed DOM elements

// --- Initialization ---

/**
 * Main entry point, called when the DOM is fully loaded.
 * Sets up the application flow: cache elements, load data, show username modal or setup game.
 */
function initializeApp() {
    console.log("DOM fully loaded. Initializing Rubix App...");
    try {
        // Attempt to cache all necessary DOM elements. Critical check inside.
        if (!cacheDOMElementsAndCheckCritical()) {
            displayInitializationError("Missing critical HTML elements. Rubix cannot start.");
            return; // Stop execution if critical elements are missing
        }
        console.log("DOM Element caching successful.");

        // Add core event listeners (buttons, modals, settings) that work before the game starts.
        addCoreEventListeners();
        console.log("Core event listeners added.");

        // Load saved settings (theme, speed, vibration) and user data (name, coins, etc.).
        loadSettings();
        console.log("Settings loaded.");
        loadUserData();
        console.log("User data loaded:", JSON.parse(JSON.stringify(userData))); // Log a copy

        // Determine the next step based on whether a username exists.
        if (!userData.username) {
            console.log("No username found. Showing username input modal.");
            showUsernameModal();
            // safelySetupGame() will be called after the user submits a valid username.
        } else {
            console.log(`Username '${userData.username}' found. Proceeding to game setup.`);
            document.body.classList.add('user-set'); // Show the main UI (header, cube area)
            updateUserUI(); // Display loaded username and coins
            safelySetupGame(); // Setup the 3D environment and cube
        }
    } catch (error) {
        console.error("Critical Error during Initialization:", error);
        displayInitializationError(`An unexpected error occurred: ${error.message}`); // Show a user-friendly error
    }
}

/**
 * Caches references to required DOM elements for faster access.
 * Checks if critical elements (needed for core functionality) exist.
 * @returns {boolean} True if all critical elements were found, false otherwise.
 */
function cacheDOMElementsAndCheckCritical() {
    console.log("Caching DOM Elements...");
    const ids = [
        // Controls & Header
        'solve-button', 'shuffle-button', 'stop-button', 'settings-button', 'store-button',
        'user-info', 'username-display', 'coin-balance-display', 'coin-count', 'logo-area', 'coin-animation-container',
        // Main Area
        'cube-container', 'description', 'welcome-username', 'current-cube-size-display',
        // Settings Panel
        'settings-panel', 'close-settings-button', 'animation-speed-slider', 'speed-value-display', 'vibration-toggle', 'reset-account-button',
        // Username Modal
        'username-modal', 'username-form', 'username-input', 'username-error', 'username-submit',
        // Store Modal
        'store-modal', 'store-items-container', 'store-feedback', 'close-store-button',
        // Solve Modal
        'solve-confirm-modal', 'solve-modal-title', 'solve-modal-text', 'modal-cancel-solve', 'modal-confirm-solve',
        // Reset Modal
        'reset-confirm-modal', 'reset-modal-title', 'reset-modal-text', 'modal-cancel-reset', 'modal-confirm-reset'
    ];
    // Define elements absolutely necessary for the app to function at all
    const criticalElements = ['cube-container', 'username-modal', 'store-modal', 'solve-confirm-modal', 'reset-confirm-modal', 'settings-panel'];
    let allCriticalFound = true;
    let missingCritical = [];

    ids.forEach(id => {
        const element = document.getElementById(id);
        domElements[id] = element; // Store with original ID
        // Optional: Store with camelCase key e.g., domElements[id.replace(/-./g, m => m[1].toUpperCase())] = element;

        // Check if a critical element is missing
        if (criticalElements.includes(id) && !element) {
            missingCritical.push(id);
            allCriticalFound = false;
            console.error(`Failed to cache CRITICAL element: #${id}`);
        } else if (!element) {
            console.warn(`Failed to cache non-critical element: #${id}`);
        }
    });

    // Cache NodeLists separately
    domElements.themeRadios = document.querySelectorAll('input[name="theme"]');
    if (!domElements.themeRadios || domElements.themeRadios.length === 0) {
         console.warn("Failed to cache non-critical elements: themeRadios");
    }

    if (!allCriticalFound) {
        console.error("Critical DOM elements missing:", missingCritical.join(', '));
    } else {
        console.log("DOM element caching complete. All critical elements found.");
    }
    return allCriticalFound;
}

/**
 * Displays a user-friendly error message, replacing the body content.
 * Used for critical initialization failures.
 * @param {string} message - The error message to display.
 */
function displayInitializationError(message = "Oops! Something went wrong while loading Rubix.") {
    console.error("Displaying Initialization Error:", message);
    // Attempt to stop any ongoing animation loops
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    try {
        const body = document.body;
        if (body) {
            // Basic inline styles to ensure visibility
            body.innerHTML = `
                <div style="position: fixed; inset: 0; background: #f0f0f0; display: flex; justify-content: center; align-items: center; text-align: center; font-family: sans-serif; color: #333; z-index: 9999; padding: 20px;">
                    <div>
                        <h1 style="color: #e74c3c; margin-bottom: 15px;">Initialization Error</h1>
                        <p style="font-size: 1.1em; margin-bottom: 20px;">${message}</p>
                        <p style="font-size: 0.9em; color: #666;">Please try refreshing the page. If the problem persists, check the browser's developer console (F12) for more details.</p>
                    </div>
                </div>`;
            body.style.display = 'flex'; // Ensure the error container is visible
            body.className = ''; // Remove potentially conflicting classes
            body.style.overflow = 'hidden';
        } else {
            // Fallback if body is somehow unavailable
            alert(message + " Critical error: document.body not found.");
        }
    } catch (e) {
        // Ultimate fallback
        alert(message + " An error occurred trying to display the error message.");
        console.error("Error displaying initialization error itself:", e);
    }
}

/**
 * Safely sets up the Three.js scene, camera, renderer, controls, and initial cube.
 * Handles potential errors during setup. Call this after user data is ready.
 */
function safelySetupGame() {
    console.log("Setting up Three.js game environment...");
    try {
        // Prerequisite checks
        if (!domElements.cubeContainer) throw new Error("Cube container DOM element not found!");
        if (typeof THREE === 'undefined') throw new Error("THREE.js library not loaded.");
        if (typeof THREE.OrbitControls === 'undefined') console.warn("THREE.OrbitControls not loaded. Camera controls may be limited.");

        // Clean up previous instance if exists (e.g., when changing cube size)
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (renderer) renderer.dispose(); // Dispose WebGL resources
        domElements.cubeContainer.innerHTML = ''; // Clear old canvas

        // --- Scene Setup ---
        scene = new THREE.Scene();
        currentN = userData.currentCubeSize; // Ensure N matches user's selected size

        // --- Camera Setup ---
        const containerWidth = domElements.cubeContainer.clientWidth;
        const containerHeight = domElements.cubeContainer.clientHeight;
        if (!containerWidth || !containerHeight || containerWidth <= 0 || containerHeight <= 0) {
             throw new Error(`Invalid container dimensions for Three.js: ${containerWidth}x${containerHeight}`);
        }
        const aspect = containerWidth / containerHeight;
        camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        const cameraDistance = 3 + currentN * 1.5; // Adjust initial distance based on N
        camera.position.set(cameraDistance, cameraDistance, cameraDistance * 1.2);
        camera.lookAt(0, 0, 0);

        // --- Renderer Setup ---
        if (!window.WebGLRenderingContext) throw new Error("WebGL is not supported by your browser.");
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Transparent background
        renderer.setSize(containerWidth, containerHeight);
        renderer.setClearColor(0x000000, 0);
        domElements.cubeContainer.appendChild(renderer.domElement);

        // --- Lighting ---
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        // --- Controls Setup ---
        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.1;
            controls.screenSpacePanning = false;
            controls.minDistance = 2 + currentN; // Adjust based on N
            controls.maxDistance = 10 + currentN * 3; // Adjust based on N
            controls.minPolarAngle = Math.PI / 6; // Limit looking from directly above/below
            controls.maxPolarAngle = Math.PI - (Math.PI / 6);
            controls.rotateSpeed = 0.8;
        } else {
            controls = null; // Ensure controls is explicitly null if library not loaded
        }

        // --- Raycaster for Interaction ---
        raycaster = new THREE.Raycaster();

        // --- Create the Cube Mesh ---
        createCube(currentN); // Generates the visual cube pieces
        lastScrambleSequence = []; // Reset scramble history for the new cube
        wasShuffledSinceLastSolve = false; // Reset solve tracking

        // --- Update UI & Add Listeners ---
        updateUserUI(); // Refresh username/coins (in case they changed)
        updateDescription(); // Update text with current cube size
        addGameEventListeners(); // Add pointer/touch listeners for the canvas

        // --- Start Animation Loop ---
        animate(); // Start rendering frames
        console.log(`Game setup complete for ${currentN}x${currentN}x${currentN} cube.`);

    } catch (error) {
        console.error("Error during setupGame:", error);
        displayInitializationError(`Failed to set up the 3D cube environment. Error: ${error.message}`);
        // Clean up potentially partially created scene elements to prevent leaks
        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
            try { renderer.domElement.parentNode.removeChild(renderer.domElement); } catch(e){}
        }
        if (renderer) try { renderer.dispose(); } catch(e){}
        scene = null; camera = null; renderer = null; controls = null; cubeGroup = null; cubies = [];
        gameListenersAdded = false; // Allow listeners to be added again on next attempt
    }
}

// --- User Data & UI ---

/**
 * Loads user data (username, coins, purchases, current size) from localStorage.
 * Sets defaults if no data found or if data is corrupted.
 */
function loadUserData() {
    let loadedSuccessfully = false;
    try {
        const dataString = localStorage.getItem('rubixUserData');
        if (dataString) {
            const parsedData = JSON.parse(dataString);
            // Validate and assign data carefully
            userData.username = (typeof parsedData.username === 'string' && parsedData.username.trim()) ? parsedData.username.trim() : null;
            userData.coins = Math.max(0, parseInt(parsedData.coins || 0, 10)) || 0; // Ensure non-negative integer
            userData.purchasedCubes = Array.isArray(parsedData.purchasedCubes) ? parsedData.purchasedCubes : ['3x3'];

            // Validate currentCubeSize: must be a number and exist in store items
            const validSizes = cubeStoreItems.map(item => item.size);
            let sizeCandidate = parseInt(parsedData.currentCubeSize, 10);
            userData.currentCubeSize = validSizes.includes(sizeCandidate) ? sizeCandidate : 3; // Default to 3x3 if invalid

            // Ensure 3x3 is always owned
            if (!userData.purchasedCubes.includes('3x3')) {
                userData.purchasedCubes.push('3x3');
            }

            // Ensure the currently selected cube size is actually owned. If not, default to 3x3.
            const currentCubeId = `${userData.currentCubeSize}x${userData.currentCubeSize}`;
            if (!userData.purchasedCubes.includes(currentCubeId)) {
                console.warn(`Current cube size (${currentCubeId}) not owned. Defaulting to 3x3.`);
                userData.currentCubeSize = 3;
            }
            loadedSuccessfully = true; // Mark as successful load
        }
    } catch (e) {
        console.error("Error loading user data from localStorage:", e);
        localStorage.removeItem('rubixUserData'); // Clear potentially corrupted data
    }

    // If loading failed or no data, set defaults
    if (!loadedSuccessfully) {
        userData = { username: null, coins: 0, purchasedCubes: ['3x3'], currentCubeSize: 3 };
    }
    // Final check: Ensure 3x3 is always present
    if (!userData.purchasedCubes.includes('3x3')) {
        userData.purchasedCubes.push('3x3');
    }
}

/**
 * Saves the current state of the `userData` object to localStorage.
 */
function saveUserData() {
    try {
        localStorage.setItem('rubixUserData', JSON.stringify(userData));
    } catch (e) {
        console.error("Error saving user data to localStorage:", e);
        // Optionally notify the user that progress might not be saved
        showStoreFeedback("Error: Could not save progress.", false); // Use store feedback area?
    }
}

/**
 * Updates the UI elements in the header (username, coin count).
 */
function updateUserUI() {
    if (domElements.username_display) {
        domElements.username_display.textContent = userData.username || "Guest";
    }
    if (domElements.coin_count) {
        // Animate coin count change? Maybe later.
        domElements.coin_count.textContent = userData.coins;
    }
    // Also update the welcome message in the description area
    if (domElements.welcome_username) {
        domElements.welcome_username.textContent = userData.username ? `${userData.username} ` : '';
    }
}

/**
 * Updates the description text below the cube container with current size etc.
 */
function updateDescription() {
    if (domElements.description && domElements.current_cube_size_display) {
        const cubeSizeName = `${currentN}x${currentN}x${currentN}`;
        domElements.current_cube_size_display.textContent = cubeSizeName;

        const welcomePart = `Welcome ${userData.username ? `<strong id="welcome-username">${userData.username}</strong> ` : ''}to <strong>Rubix</strong>!`;
        const currentPart = ` Current: <strong id="current-cube-size-display">${cubeSizeName}</strong>`;
        const instructionPart = `<br>Drag faces to rotate, or use the buttons.`;
        domElements.description.innerHTML = `<p>${welcomePart}${currentPart}${instructionPart}</p>`;
    }
}

/**
 * Shows the username input modal.
 */
function showUsernameModal() {
    if (domElements.username_modal) {
        domElements.username_modal.classList.add('active');
        if (domElements.username_input) {
            domElements.username_input.value = ''; // Clear previous input
            domElements.username_input.focus();
        }
        if (domElements.username_error) domElements.username_error.textContent = ''; // Clear error message
        if (domElements.username_submit) domElements.username_submit.disabled = true; // Disable submit initially
    }
}

/**
 * Hides the username input modal.
 */
function hideUsernameModal() {
    if (domElements.username_modal) {
        domElements.username_modal.classList.remove('active');
    }
}

/**
 * Validates the username input field in real-time.
 * Enables/disables the submit button and shows error messages.
 */
function handleUsernameInput() {
    if (!domElements.username_input || !domElements.username_error || !domElements.username_submit) return;
    const name = domElements.username_input.value; // Don't trim here, allow spaces during typing? Trim on submit.
    const validation = isValidUsername(name.trim()); // Validate the trimmed version

    domElements.username_error.textContent = validation.valid ? '' : validation.message;
    domElements.username_submit.disabled = !validation.valid;

    // Visual feedback for invalid input (optional)
    domElements.username_input.classList.toggle('invalid', !validation.valid && name.length > 0);
}

/**
 * Handles the submission of the username form.
 * Validates the final username, saves it, and proceeds to game setup.
 * @param {Event} event - The form submission event.
 */
function handleUsernameSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    if (!domElements.username_input || !domElements.username_error) return;

    const name = domElements.username_input.value.trim(); // Use trimmed name
    const validation = isValidUsername(name);

    if (validation.valid) {
        console.log("Username accepted:", name);
        // Set initial user data for a new user
        userData.username = name;
        userData.coins = 0; // Start fresh
        userData.purchasedCubes = ['3x3'];
        userData.currentCubeSize = 3;
        saveUserData(); // Save the new user data

        hideUsernameModal();
        document.body.classList.add('user-set'); // Show the main application UI
        updateUserUI(); // Update header with new name/coins
        safelySetupGame(); // Setup the 3D game environment

    } else {
        console.log("Username rejected:", validation.message);
        domElements.username_error.textContent = validation.message;
        domElements.username_input.focus();
        // Maybe select the text for easy correction: try/catch for browser compatibility
        try { domElements.username_input.select(); } catch (e) { /* ignore */ }
        if (domElements.username_submit) domElements.username_submit.disabled = true; // Ensure button is disabled
    }
}

/**
 * Checks if a given username string is valid according to defined rules.
 * @param {string} name - The username string to validate.
 * @returns {{valid: boolean, message: string}} - Object indicating validity and error message.
 */
function isValidUsername(name) {
    if (!name) return { valid: false, message: 'Username cannot be empty.' };
    if (name.length < 3) return { valid: false, message: 'Username too short (min 3 chars).' };
    if (name.length > 16) return { valid: false, message: 'Username too long (max 16 chars).' };
    // Regex: Allows letters (a-z, A-Z), numbers (0-9), and underscore (_). No spaces.
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        return { valid: false, message: 'Use only letters, numbers, and underscores (_).' };
    }
    // Check against banned words (case-insensitive)
    const lowerCaseName = name.toLowerCase();
    if (BANNED_WORDS.some(bannedWord => lowerCaseName.includes(bannedWord))) {
        return { valid: false, message: 'Username contains restricted words.' };
    }
    return { valid: true, message: '' }; // Username is valid
}

// --- Settings ---

/**
 * Loads settings (animation speed, theme, vibration) from localStorage.
 * Applies defaults if no saved settings are found.
 */
function loadSettings() {
    // Animation Speed
    const savedSpeed = localStorage.getItem('rubiksAnimationSpeed');
    MOVE_DURATION = savedSpeed ? Math.max(50, Math.min(1000, parseInt(savedSpeed, 10))) : 200;
    if (domElements.animation_speed_slider) domElements.animation_speed_slider.value = MOVE_DURATION;
    if (domElements.speed_value_display) domElements.speed_value_display.textContent = `${MOVE_DURATION}ms`;

    // Theme
    const savedTheme = localStorage.getItem('rubiksTheme') || 'light';
    applyTheme(savedTheme);
    if (domElements.themeRadios) {
        domElements.themeRadios.forEach(radio => {
            radio.checked = radio.value === savedTheme;
        });
    }

    // Vibration
    const savedVibration = localStorage.getItem('rubiksVibrationEnabled');
    vibrationEnabled = (savedVibration === null) ? true : (savedVibration === 'true'); // Default true
    if (domElements.vibration_toggle) domElements.vibration_toggle.checked = vibrationEnabled;
}

/** Handles changes to the animation speed slider. */
function handleSpeedChange(event) {
    MOVE_DURATION = parseInt(event.target.value, 10);
    if (domElements.speed_value_display) domElements.speed_value_display.textContent = `${MOVE_DURATION}ms`;
    localStorage.setItem('rubiksAnimationSpeed', MOVE_DURATION);
}

/** Handles changes to the theme radio buttons. */
function handleThemeChange(event) {
    const newTheme = event.target.value;
    applyTheme(newTheme);
    localStorage.setItem('rubiksTheme', newTheme);
}

/** Toggles the 'dark-theme' class on the body element. */
function applyTheme(themeName) {
    document.body.classList.toggle('dark-theme', themeName === 'dark');
}

/** Toggles the visibility of the settings panel. */
function toggleSettingsPanel() {
    if (domElements.settings_panel) domElements.settings_panel.classList.toggle('active');
}

/** Handles changes to the vibration toggle switch. */
function handleVibrationChange(event) {
    vibrationEnabled = event.target.checked;
    localStorage.setItem('rubiksVibrationEnabled', vibrationEnabled);
    if (vibrationEnabled) vibrate(VIBRATION_DURATION / 2); // Vibrate on enable
}

/** Triggers device vibration if enabled and supported. */
function vibrate(duration) {
    if (vibrationEnabled && navigator.vibrate) {
        try { navigator.vibrate(duration); } catch (e) { /* Ignore errors */ }
    }
}

// --- Cube Creation ---

/**
 * Creates the 3D cube mesh with the specified size (N x N x N).
 * @param {number} N - The dimension of the cube (e.g., 2 for 2x2, 3 for 3x3).
 */
function createCube(N) {
    if (!scene || !camera || !controls) {
        console.error("Cannot create cube: Scene components not ready.");
        return;
    }
    console.log(`Creating ${N}x${N}x${N} cube mesh...`);
    currentN = N; // Update global size tracker

    // --- Cleanup previous cube ---
    if (cubeGroup) {
        scene.remove(cubeGroup);
        // Dispose of old geometries and materials to free memory
        cubies.forEach(cubie => {
            if (cubie.geometry) cubie.geometry.dispose();
            if (cubie.material) {
                if (Array.isArray(cubie.material)) {
                    cubie.material.forEach(mat => mat.dispose());
                } else {
                    cubie.material.dispose();
                }
            }
        });
        console.log("Previous cube resources disposed.");
    }
    cubies = []; // Reset the array
    cubeGroup = new THREE.Group(); // Create a new group for the pieces

    // --- Create new cubies ---
    const offset = (N - 1) / 2.0; // Center offset (e.g., N=3 -> offset=1)
    // Create a single reusable geometry instance
    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            for (let z = 0; z < N; z++) {
                // Skip inner, non-visible pieces for N > 2
                if (N > 2 && (x > 0 && x < N - 1 && y > 0 && y < N - 1 && z > 0 && z < N - 1)) {
                    continue;
                }

                // Define materials for each face of *this* specific piece
                // Index map: 0:+X(R), 1:-X(L), 2:+Y(U), 3:-Y(D), 4:+Z(F), 5:-Z(B)
                const materials = [
                    new THREE.MeshStandardMaterial({ color: x === N - 1 ? COLORS.orange : COLORS.black, roughness: 0.7, metalness: 0.1 }), // Right
                    new THREE.MeshStandardMaterial({ color: x === 0     ? COLORS.red    : COLORS.black, roughness: 0.7, metalness: 0.1 }), // Left
                    new THREE.MeshStandardMaterial({ color: y === N - 1 ? COLORS.yellow : COLORS.black, roughness: 0.7, metalness: 0.1 }), // Up
                    new THREE.MeshStandardMaterial({ color: y === 0     ? COLORS.white  : COLORS.black, roughness: 0.7, metalness: 0.1 }), // Down
                    new THREE.MeshStandardMaterial({ color: z === N - 1 ? COLORS.blue   : COLORS.black, roughness: 0.7, metalness: 0.1 }), // Front
                    new THREE.MeshStandardMaterial({ color: z === 0     ? COLORS.green  : COLORS.black, roughness: 0.7, metalness: 0.1 })  // Back
                ];

                const cubie = new THREE.Mesh(geometry, materials); // Use the shared geometry
                // Calculate visual position based on logical coordinates
                cubie.position.set(
                    (x - offset) * (CUBE_SIZE + SPACING),
                    (y - offset) * (CUBE_SIZE + SPACING),
                    (z - offset) * (CUBE_SIZE + SPACING)
                );
                // Store logical position (0 to N-1) for rotation logic
                cubie.userData.logicalPosition = new THREE.Vector3(x, y, z);
                cubeGroup.add(cubie); // Add piece to the main cube group
                cubies.push(cubie);
            }
        }
    }
    scene.add(cubeGroup); // Add the completed group to the scene

    // --- Reset state & update UI/Controls ---
    wasShuffledSinceLastSolve = false;
    lastScrambleSequence = [];
    updateDescription(); // Update text to show the new size

    // Adjust camera distance and control limits for the new size
    if (controls) {
        const cameraDistance = 3 + N * 1.5;
        // Instantly reposition camera for now (smooth transition could be added)
        camera.position.set(cameraDistance, cameraDistance, cameraDistance * 1.2);
        camera.lookAt(0, 0, 0);
        controls.minDistance = 2 + N;
        controls.maxDistance = 10 + N * 3;
        controls.target.set(0, 0, 0); // Reset orbit target
        controls.update(); // Apply changes immediately
    }
    console.log(`Created ${N}x${N}x${N} cube with ${cubies.length} visible pieces.`);
}

// --- Cube Interaction ---

/**
 * Uses Raycasting to find the first visible cube face intersected by a pointer event.
 * @param {PointerEvent|TouchEvent} event - The pointer or touch event.
 * @returns {THREE.Intersection|null} The intersection object or null if no valid face hit.
 */
function getIntersect(event) {
    if (!renderer || !raycaster || !camera || cubies.length === 0 || !renderer.domElement) return null;
    const domElement = renderer.domElement;
    const bounds = domElement.getBoundingClientRect();

    // Use clientX/Y directly from the event object passed in
    mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cubies); // Only check cubie objects

    for (let i = 0; i < intersects.length; i++) {
        const intersection = intersects[i];
        // Check if the hit face is valid (has material, index exists, and is not black)
        if (intersection.object.material && intersection.face &&
            intersection.face.materialIndex !== undefined && // Ensure index exists
            intersection.object.material[intersection.face.materialIndex] &&
            intersection.object.material[intersection.face.materialIndex].color.getHex() !== COLORS.black)
        {
            return intersection; // Return the first valid, colored face hit
        }
    }
    return null; // No valid face hit
}

/** Handles the 'pointerdown' event on the canvas. Initiates a drag. */
function onPointerDown(event) {
    if (isAnimating || isSequenceAnimating) return; // Ignore clicks during animations

    // Use the primary pointer (works for mouse and first touch)
    const pointer = event;
    const intersection = getIntersect(pointer);

    if (intersection) {
        event.preventDefault(); // Prevent potential text selection or other defaults
        isDragging = true;
        if (controls) controls.enabled = false; // Disable camera control

        intersectedObject = intersection.object;
        startPoint = intersection.point.clone(); // World coordinates of the click
        dragNormal = intersection.face.normal.clone(); // Face normal in local space
        // Transform face normal to world space and align with axes
        dragNormal.transformDirection(intersectedObject.matrixWorld).round();

        if (renderer?.domElement) renderer.domElement.style.cursor = 'grabbing';
    } else {
        isDragging = false;
        if (renderer?.domElement) renderer.domElement.style.cursor = 'grab';
    }
}

/** Handles the 'pointermove' event. Updates cursor and potentially drag visualization. */
function onPointerMove(event) {
    const pointer = event;

    // Update mouse screen coordinates (used for cursor updates and potentially other logic)
     if (renderer?.domElement) {
        const bounds = renderer.domElement.getBoundingClientRect();
        mouse.x = ((pointer.clientX - bounds.left) / bounds.width) * 2 - 1;
        mouse.y = -((pointer.clientY - bounds.top) / bounds.height) * 2 + 1;
     }

    if (isDragging) {
        event.preventDefault(); // Prevent scrolling while dragging on the cube
        // Drag logic happens in onPointerUp
    } else if (renderer?.domElement && !isAnimating && !isSequenceAnimating) {
        // Update cursor based on hover when NOT dragging
        const hoverIntersection = getIntersect(pointer);
        renderer.domElement.style.cursor = hoverIntersection ? 'grab' : 'default';
    }
}

/** Handles the 'pointerup' event. Completes a drag action and initiates rotation. */
function onPointerUp(event) {
    const pointer = event; // Use the event directly

    // Determine cursor state after pointer up
    const currentIntersect = getIntersect(pointer);
    if (renderer?.domElement) {
        renderer.domElement.style.cursor = currentIntersect ? 'grab' : 'default';
    }

    // Check if a valid drag sequence just ended
    if (!isDragging || !startPoint || isAnimating || isSequenceAnimating) {
        if (isDragging && controls) controls.enabled = true; // Re-enable controls if drag started but ended invalidly
        resetDragState(); // Ensure state is reset
        return;
    }

    const isManualMove = true; // This move comes from direct user interaction

    // Calculate drag vector in screen space (Normalized Device Coords)
    const bounds = renderer.domElement.getBoundingClientRect();
    const endMouse = new THREE.Vector2(
        ((pointer.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((pointer.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    // Project the 3D start point onto the 2D screen
    const startScreen = startPoint.clone().project(camera);
    const dragVector = endMouse.clone().sub(startScreen); // Vector from start to end click on screen

    // Check if drag distance is significant enough to register as a move
    const dragThresholdSq = 0.002; // Square of the threshold for efficiency
    if (dragVector.lengthSq() < dragThresholdSq) {
        console.log("Drag too short, ignored.");
        if (controls) controls.enabled = true;
        resetDragState();
        return;
    }

    // Determine the rotation axis, layer, and angle based on the drag
    const rotation = determineRotation(dragNormal, dragVector);

    if (rotation) {
        // Initiate the layer rotation animation
        rotateLayer(rotation.axis, rotation.layer, rotation.angle, isManualMove)
            .catch(err => { // Catch errors (like stopping)
                 if (err !== "Stopped") console.warn("Manual rotation failed:", err);
            })
            .finally(() => {
                // Crucially, re-enable controls *after* the rotation attempt finishes
                if (controls) controls.enabled = true;
            });
    } else {
        // If no valid rotation determined, re-enable controls immediately
        if (controls) controls.enabled = true;
    }

    // Reset dragging state variables AFTER processing the drag
    resetDragState();
}

/** Resets variables related to the drag interaction state. */
function resetDragState() {
    intersectedObject = null;
    startPoint = null;
    dragNormal = null;
    isDragging = false; // Explicitly set to false
    // Controls are re-enabled within onPointerUp or onPointerDown(invalid)
}

/** Handles window resize events to adjust camera and renderer. */
function onWindowResize() {
    if (!camera || !renderer || !domElements.cubeContainer) return;
    const containerWidth = domElements.cubeContainer.clientWidth;
    const containerHeight = domElements.cubeContainer.clientHeight;

    if (containerWidth > 0 && containerHeight > 0) {
        camera.aspect = containerWidth / containerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(containerWidth, containerHeight);
    } else {
        console.warn("Window resize ignored: Invalid container dimensions.");
    }
}

/**
 * Determines the intended rotation axis, layer index, and angle based on
 * the face normal clicked and the 2D drag vector on the screen.
 * @param {THREE.Vector3} faceNormal - The world-space normal of the clicked face.
 * @param {THREE.Vector2} dragVectorScreen - The drag vector in normalized device coordinates.
 * @returns {{axis: THREE.Vector3, layer: number, angle: number}|null} Rotation details or null.
 */
function determineRotation(faceNormal, dragVectorScreen) {
    if (!camera || !intersectedObject || !startPoint || !faceNormal || !dragVectorScreen) return null;

    // 1. Define basis vectors on the plane of the clicked face, relative to camera view
    camera.up.normalize();
    const worldFaceNormal = faceNormal.clone(); // Assumed to be already world-space and rounded

    // Calculate screen-projected directions for "right" and "up" on the cube face
    let viewDirection = new THREE.Vector3(); camera.getWorldDirection(viewDirection);
    let cameraUp = camera.up.clone();
    // Handle gimbal lock case (looking straight at top/bottom)
    if (Math.abs(cameraUp.dot(worldFaceNormal)) > 0.99) {
        let cameraRight = new THREE.Vector3().crossVectors(viewDirection, cameraUp).normalize();
        cameraUp = new THREE.Vector3().crossVectors(worldFaceNormal, cameraRight).normalize();
    }
    let rightDir = new THREE.Vector3().crossVectors(cameraUp, worldFaceNormal).normalize();
    let upDir = new THREE.Vector3().crossVectors(worldFaceNormal, rightDir).normalize();

    // 2. Project these world directions onto the screen
    const startPointWorld = startPoint.clone();
    const rightPointWorld = startPointWorld.clone().add(rightDir);
    const upPointWorld = startPointWorld.clone().add(upDir);
    const startPointScreen = startPointWorld.clone().project(camera);
    const rightPointScreen = rightPointWorld.clone().project(camera);
    const upPointScreen = upPointWorld.clone().project(camera);
    const rightScreenVec = new THREE.Vector2().subVectors(rightPointScreen, startPointScreen).normalize();
    const upScreenVec = new THREE.Vector2().subVectors(upPointScreen, startPointScreen).normalize();

    // 3. Determine dominant drag direction relative to face orientation on screen
    const dotRight = dragVectorScreen.dot(rightScreenVec);
    const dotUp = dragVectorScreen.dot(upScreenVec);

    let rotationAxis = new THREE.Vector3();
    let rotationSign = 1;

    if (Math.abs(dotRight) > Math.abs(dotUp)) { // More horizontal drag
        rotationAxis.copy(upDir); // Rotate around face's Up direction
        rotationSign = Math.sign(dotRight); // Right drag = positive rotation
    } else { // More vertical drag
        rotationAxis.copy(rightDir); // Rotate around face's Right direction
        rotationSign = -Math.sign(dotUp); // Up drag = negative rotation
    }

    // 4. Snap the calculated rotation axis to the nearest world axis (X, Y, Z)
    let maxComponent = Math.max(Math.abs(rotationAxis.x), Math.abs(rotationAxis.y), Math.abs(rotationAxis.z));
    if (maxComponent < 0.1) return null; // Avoid near-zero axis
    rotationAxis.x = (Math.abs(rotationAxis.x) / maxComponent > 0.5) ? Math.sign(rotationAxis.x) : 0;
    rotationAxis.y = (Math.abs(rotationAxis.y) / maxComponent > 0.5) ? Math.sign(rotationAxis.y) : 0;
    rotationAxis.z = (Math.abs(rotationAxis.z) / maxComponent > 0.5) ? Math.sign(rotationAxis.z) : 0;
    rotationAxis.normalize(); // Ensure unit vector
    if (rotationAxis.lengthSq() < 0.5) return null; // Invalid axis after snapping

    // 5. Determine the layer index based on clicked cubie and snapped axis
    const logicalPos = intersectedObject.userData.logicalPosition;
    if (!logicalPos) return null; // Should not happen
    let layerIndex = 0;
    if (Math.abs(rotationAxis.x) > 0.5) layerIndex = Math.round(logicalPos.x);
    else if (Math.abs(rotationAxis.y) > 0.5) layerIndex = Math.round(logicalPos.y);
    else if (Math.abs(rotationAxis.z) > 0.5) layerIndex = Math.round(logicalPos.z);

    // 6. Calculate final angle (always 90 degrees)
    const angle = rotationSign * Math.PI / 2;

    return { axis: rotationAxis, layer: layerIndex, angle: angle };
}

// --- Cube Rotation & State Update ---

/**
 * Animates the rotation of a specific layer of the cube.
 * Updates the logical positions of the affected cubies.
 * Handles manual move detection for solve reward logic.
 * @param {THREE.Vector3} axis - The world-space axis of rotation (normalized).
 * @param {number} layerIndex - The index (0 to N-1) of the layer to rotate.
 * @param {number} angle - The angle of rotation in radians (+/- PI/2).
 * @param {boolean} [isManualMove=false] - True if the rotation was initiated by user drag.
 * @returns {Promise<void>} A promise that resolves when the animation completes or rejects if stopped.
 */
function rotateLayer(axis, layerIndex, angle, isManualMove = false) {
    // console.log(`Rotate Request: Axis=${axis.toArray().map(n=>n.toFixed(1))}, Layer=${layerIndex}, Angle=${(angle * 180 / Math.PI).toFixed(0)}deg, Manual=${isManualMove}`);

    // Handle side effects of manual moves
    if (isManualMove) {
        if (lastScrambleSequence.length > 0) {
            console.log("Manual move detected: Clearing scramble history.");
            lastScrambleSequence = []; // Invalidate reverse-solve
        }
        // Mark that the cube might be eligible for a solve reward now
        wasShuffledSinceLastSolve = true;
    }

    return new Promise((resolve, reject) => {
        if (isAnimating) return reject("Animation already in progress");
        isAnimating = true;

        const pivot = new THREE.Group();
        scene.add(pivot);
        const layerCubies = [];
        const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), angle);
        const offset = (currentN - 1) / 2.0;

        // Identify and attach cubies to the pivot
        cubies.forEach(cubie => {
            if (!cubie.userData.logicalPosition) return;
            const pos = cubie.userData.logicalPosition;
            let belongs = false;
            if (Math.abs(axis.x) > 0.5 && Math.round(pos.x) === layerIndex) belongs = true;
            else if (Math.abs(axis.y) > 0.5 && Math.round(pos.y) === layerIndex) belongs = true;
            else if (Math.abs(axis.z) > 0.5 && Math.round(pos.z) === layerIndex) belongs = true;

            if (belongs) {
                pivot.attach(cubie); // Move from cubeGroup to pivot
                layerCubies.push(cubie);
            }
        });

        if (layerCubies.length === 0) {
            console.warn(`No cubies found for rotation on layer ${layerIndex}`);
            scene.remove(pivot);
            isAnimating = false;
            return resolve(); // Nothing to animate
        }

        // --- Animation ---
        const startQuaternion = pivot.quaternion.clone();
        const endQuaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(startQuaternion);
        const startTime = performance.now();

        function animateRotationStep() {
            // Check for stop request during sequences
            if (isSequenceAnimating && stopSequenceRequested) {
                layerCubies.forEach(c => cubeGroup.attach(c)); // Reattach before stopping
                scene.remove(pivot);
                isAnimating = false;
                return reject("Stopped"); // Reject the promise for this move
            }

            const elapsedTime = performance.now() - startTime;
            const fraction = Math.min(elapsedTime / MOVE_DURATION, 1);
            const easedFraction = fraction < 0.5 ? 4 * fraction ** 3 : 1 - ((-2 * fraction + 2) ** 3) / 2; // Ease-in-out cubic

            pivot.quaternion.slerpQuaternions(startQuaternion, endQuaternion, easedFraction);

            if (fraction < 1) {
                requestAnimationFrame(animateRotationStep);
            } else {
                // --- Animation End ---
                pivot.quaternion.copy(endQuaternion); // Ensure final state

                // Detach cubies and update logical positions
                layerCubies.forEach(cubie => {
                    cubeGroup.attach(cubie); // Reattach to main group
                    const lp = cubie.userData.logicalPosition;
                    if (lp) {
                        lp.subScalar(offset);          // Center coordinates
                        lp.applyMatrix4(rotationMatrix); // Apply logical rotation
                        lp.round();                    // Snap to grid
                        lp.addScalar(offset);          // Shift back
                        lp.round(); // Round again after offset shift (belt and suspenders)
                    }
                });

                scene.remove(pivot); // Clean up pivot
                isAnimating = false;
                vibrate(VIBRATION_DURATION); // Haptic feedback

                // Check for manual solve completion
                if (isManualMove && !isSequenceAnimating && wasShuffledSinceLastSolve) {
                    if (isCubeSolved()) {
                        console.log("Manual Solve Detected!");
                        awardCoins(COIN_REWARD_ON_SOLVE);
                        wasShuffledSinceLastSolve = false; // Reset reward eligibility
                        lastScrambleSequence = []; // Cube is solved, clear history
                    }
                }
                resolve(); // Signal completion
            }
        }
        animateRotationStep(); // Start the animation
    });
}

// --- Solve Check & Coins ---

/**
 * Checks if the cube is currently in the solved state based on face colors.
 * Handles different logic for N=2 vs N>2.
 * @returns {boolean} True if the cube is solved, false otherwise.
 */
function isCubeSolved() {
    if (cubies.length === 0) return true; // Empty cube is solved

    const N = currentN;
    if (N === 1) return true; // 1x1 cube is always solved

    const faceColors = {}; // Store the target color for each face direction

    try {
        // For N > 2, use center pieces to determine face colors.
        // For N = 2, use a specific corner piece (e.g., 0,0,0) to define face colors.
        if (N > 2) {
            const offset = (N - 1) / 2.0;
            // Material indices: 0:+X(R), 1:-X(L), 2:+Y(U), 3:-Y(D), 4:+Z(F), 5:-Z(B)
            faceColors.x_pos = getColorAtLogicalPosition(N - 1, offset, offset, 0); // Right (+X) Orange
            faceColors.x_neg = getColorAtLogicalPosition(0,     offset, offset, 1); // Left (-X) Red
            faceColors.y_pos = getColorAtLogicalPosition(offset, N - 1, offset, 2); // Up (+Y) Yellow
            faceColors.y_neg = getColorAtLogicalPosition(offset, 0,     offset, 3); // Down (-Y) White
            faceColors.z_pos = getColorAtLogicalPosition(offset, offset, N - 1, 4); // Front (+Z) Blue
            faceColors.z_neg = getColorAtLogicalPosition(offset, offset, 0,     5); // Back (-Z) Green
        } else { // N = 2
            // Use the corner at (0, 0, 0) - Left, Down, Back faces are visible
            const cornerCubie = getCubieAtLogicalPosition(0, 0, 0);
            if (!cornerCubie) throw new Error("Cannot find corner (0,0,0) for N=2 solve check.");
            // Get the colors from this corner to define the solved state for these faces
            faceColors.x_neg = cornerCubie.material[1].color.getHex(); // Left (-X)
            faceColors.y_neg = cornerCubie.material[3].color.getHex(); // Down (-Y)
            faceColors.z_neg = cornerCubie.material[5].color.getHex(); // Back (-Z)

            // Find the opposite corner (1, 1, 1) - Right, Up, Front faces are visible
            const oppositeCorner = getCubieAtLogicalPosition(1, 1, 1);
            if (!oppositeCorner) throw new Error("Cannot find corner (1,1,1) for N=2 solve check.");
            faceColors.x_pos = oppositeCorner.material[0].color.getHex(); // Right (+X)
            faceColors.y_pos = oppositeCorner.material[2].color.getHex(); // Up (+Y)
            faceColors.z_pos = oppositeCorner.material[4].color.getHex(); // Front (+Z)
        }

        // Basic sanity check: opposite faces shouldn't match (unless error occurred)
        if (faceColors.x_pos === faceColors.x_neg || faceColors.y_pos === faceColors.y_neg || faceColors.z_pos === faceColors.z_neg) {
            console.warn("isCubeSolved: Opposite faces have same target color. Cube state likely corrupt.");
            return false;
        }

    } catch (e) {
        console.error("Error determining target face colors for solve check:", e);
        return false; // Cannot determine state if reference colors are missing
    }

    // Check every visible facelet on every cubie against the target colors
    for (const cubie of cubies) {
        if (!cubie.userData.logicalPosition || !cubie.material) continue; // Skip invalid cubies
        const lp = cubie.userData.logicalPosition;
        const materials = cubie.material; // Array of 6 materials

        // Compare face color only if that face *should* be visible at this position
        if (Math.round(lp.x) === N - 1 && materials[0].color.getHex() !== faceColors.x_pos) return false; // Right face check
        if (Math.round(lp.x) === 0     && materials[1].color.getHex() !== faceColors.x_neg) return false; // Left face check
        if (Math.round(lp.y) === N - 1 && materials[2].color.getHex() !== faceColors.y_pos) return false; // Up face check
        if (Math.round(lp.y) === 0     && materials[3].color.getHex() !== faceColors.y_neg) return false; // Down face check
        if (Math.round(lp.z) === N - 1 && materials[4].color.getHex() !== faceColors.z_pos) return false; // Front face check
        if (Math.round(lp.z) === 0     && materials[5].color.getHex() !== faceColors.z_neg) return false; // Back face check
    }

    // If all checks passed, the cube is solved
    // console.log("isCubeSolved: Confirmed Solved State.");
    return true;
}

/**
 * Finds the cubie mesh at a specific logical position.
 * @param {number} x - Logical X coordinate (0 to N-1).
 * @param {number} y - Logical Y coordinate.
 * @param {number} z - Logical Z coordinate.
 * @returns {THREE.Mesh|null} The cubie mesh or null if not found.
 */
function getCubieAtLogicalPosition(x, y, z) {
    const targetPos = new THREE.Vector3(x, y, z);
    // Use a small tolerance for floating point comparisons
    return cubies.find(cubie =>
        cubie.userData.logicalPosition &&
        cubie.userData.logicalPosition.distanceToSquared(targetPos) < 0.1
    ) || null;
}

/**
 * Gets the color hex value of a specific material index on the cubie at the given logical position.
 * @param {number} x - Logical X coordinate.
 * @param {number} y - Logical Y coordinate.
 * @param {number} z - Logical Z coordinate.
 * @param {number} materialIndex - The index of the face material (0-5).
 * @returns {number} The color hex value.
 * @throws {Error} If the cubie or material is not found.
 */
function getColorAtLogicalPosition(x, y, z, materialIndex) {
    const cubie = getCubieAtLogicalPosition(x, y, z);
    if (cubie && cubie.material && cubie.material[materialIndex]) {
        return cubie.material[materialIndex].color.getHex();
    } else {
        throw new Error(`Cubie or material index ${materialIndex} not found at logical position (${x}, ${y}, ${z})`);
    }
}

/**
 * Adds coins to the user's balance, saves data, updates UI, and shows animation.
 * @param {number} amount - The number of coins to award.
 */
function awardCoins(amount) {
    if (!amount || amount <= 0) return;
    userData.coins += amount;
    saveUserData();
    updateUserUI();
    showCoinAnimation(amount);
    console.log(`Awarded ${amount} coins! New balance: ${userData.coins}`);
}

/**
 * Displays a falling coin animation originating near the cube.
 * @param {number} amount - The amount of coins awarded (to display).
 */
function showCoinAnimation(amount) {
    if (!domElements.coin_animation_container || !domElements.coin_balance_display) return;

    const container = domElements.coin_animation_container;
    const coinDisplay = domElements.coin_balance_display;

    // 1. Briefly highlight the coin balance display
    coinDisplay.style.transition = 'transform 0.1s ease-out, color 0.1s ease-out';
    coinDisplay.style.transform = 'scale(1.15)'; // Slightly bigger pop
    coinDisplay.style.color = `var(--gold-color, #ffc107)`; // Explicitly gold
    setTimeout(() => {
        coinDisplay.style.transform = 'scale(1)';
        coinDisplay.style.color = ''; // Revert to default header text color
    }, 200); // Duration of the pop effect

    // 2. Create and animate the falling coin element
    const coinElement = document.createElement('div');
    coinElement.innerHTML = `<i class="fa-solid fa-coins coin-icon gold"></i> <span>+${amount}</span>`;
    coinElement.classList.add('coin-fall');

    // Calculate start position (approx. center of the cube container)
    const startRect = domElements.cubeContainer?.getBoundingClientRect();
    const startX = startRect ? startRect.left + startRect.width / 2 : window.innerWidth / 2;
    const startY = startRect ? startRect.top + startRect.height / 2 : window.innerHeight / 2;

    coinElement.style.position = 'fixed'; // Use fixed for viewport positioning
    coinElement.style.left = `${startX}px`;
    coinElement.style.top = `${startY}px`;
    // CSS animation handles the rest (translate, scale, rotate, fade)

    container.appendChild(coinElement);

    // Remove the element after animation (match CSS duration)
    setTimeout(() => {
        if (coinElement.parentNode === container) {
             container.removeChild(coinElement);
        }
    }, 1300); // Corresponds to animation duration in style.css
}

// --- Animation Sequences (Shuffle/Solve) ---

/**
 * Executes a sequence of cube moves with animation.
 * Handles disabling controls and the stop button functionality.
 * @param {Array<{axis: THREE.Vector3, layerIndex: number, angle: number}>} moves - Array of move objects.
 * @param {boolean} [shouldCleanup=true] - If true, re-enables buttons and hides stop button on completion.
 * @returns {Promise<void>} Resolves when sequence finishes or is stopped.
 */
async function applyMovesAnimated(moves, shouldCleanup = true) {
    if (isSequenceAnimating) return Promise.reject("Sequence already running");
    if (!moves || moves.length === 0) return Promise.resolve(); // Nothing to do

    isSequenceAnimating = true;
    stopSequenceRequested = false;
    setButtonsEnabled(false); // Disable UI controls

    if (domElements.stopButton) {
        domElements.stopButton.style.display = 'inline-flex'; // Show stop button
        domElements.stopButton.disabled = false;
        domElements.stopButton.title = "Stop Animation";
    }
    if (domElements.settings_panel?.classList.contains('active')) toggleSettingsPanel(); // Close settings

    console.log(`Starting animated sequence of ${moves.length} moves...`);
    try {
        for (const move of moves) {
            if (stopSequenceRequested) {
                 console.log("Move sequence stopped by user request.");
                 break; // Exit loop if stop requested
            }
            // Add a small delay between moves? Improves visual clarity but slows down sequence.
            // await new Promise(res => setTimeout(res, 10));
            await rotateLayer(move.axis, move.layerIndex, move.angle, false); // isManualMove = false
        }
    } catch (error) {
        // Catch rejections from rotateLayer (e.g., if stopped mid-move)
        if (error !== "Stopped") { // Don't log "Stopped" as a full error
             console.error("Error during move sequence:", error);
        } else {
            console.log("Move sequence processing halted due to stop request.");
        }
    } finally {
        // Cleanup runs whether sequence finished, stopped, or errored
        if (shouldCleanup) {
            console.log("Sequence cleanup...");
            isSequenceAnimating = false;
            stopSequenceRequested = false; // Reset flag
            setButtonsEnabled(true); // Re-enable UI controls
            if (domElements.stopButton) domElements.stopButton.style.display = 'none'; // Hide stop button

            // Check final state after sequence completes/stops
            if (isCubeSolved()) {
                wasShuffledSinceLastSolve = false; // Reset reward eligibility
                lastScrambleSequence = []; // Clear history if solved
                 console.log("Cube is solved after sequence.");
            } else {
                 console.log("Cube is not solved after sequence.");
            }
        }
    }
}

/**
 * Enables or disables primary UI buttons and cube interaction.
 * @param {boolean} enabled - True to enable, false to disable.
 */
function setButtonsEnabled(enabled) {
    const buttons = [
        domElements.solve_button, domElements.shuffle_button,
        domElements.settings_button, domElements.store_button,
        domElements.reset_account_button // Include reset button in settings
    ];
    buttons.forEach(button => { if (button) button.disabled = !enabled; });

    // Control interaction with the cube container
    if (domElements.cubeContainer) {
        domElements.cubeContainer.style.pointerEvents = enabled ? 'auto' : 'none';
        // Update cursor based on enabled state
        if (!enabled) {
            domElements.cubeContainer.style.cursor = 'wait'; // Or 'not-allowed'
        } else {
            // Reset cursor based on current hover state when re-enabled
            const currentHover = getIntersect({ clientX: mouse.x * window.innerWidth, clientY: mouse.y * window.innerHeight }); // Approx hover check
            domElements.cubeContainer.style.cursor = currentHover ? 'grab' : 'default';
        }
    }
}

/** Shows the confirmation modal for solving or resetting the cube. */
function showSolveConfirmation() {
    if (isSequenceAnimating || isAnimating || !domElements.solve_confirm_modal) return;

    let title = `Solve ${currentN}x${currentN} Cube?`;
    let text = "";
    let confirmButtonText = "Go!";
    let action = 'solve'; // Default action

    if (isCubeSolved()) {
        title = `Cube Already Solved`;
        text = `The ${currentN}x${currentN}x${currentN} cube is already in the solved state.`;
        confirmButtonText = "OK";
        action = 'ok'; // Just dismiss the modal
    } else if (lastScrambleSequence.length > 0) {
        // Has a valid scramble history and is not solved
        text = "This will animate the cube back to the solved state by reversing the last shuffle.";
        action = 'solve'; // Solve by reversing
    } else {
        // No scramble history, and not solved (manual moves made)
        title = `Reset ${currentN}x${currentN} Cube?`;
        text = "The cube was modified manually or has no shuffle history. Reset to the solved state?";
        confirmButtonText = "Reset";
        action = 'reset'; // Reset the cube
    }

    // Update modal content
    if (domElements.solve_modal_title) domElements.solve_modal_title.textContent = title;
    if (domElements.solve_modal_text) domElements.solve_modal_text.textContent = text;
    if (domElements.modal_confirm_solve) {
        domElements.modal_confirm_solve.textContent = confirmButtonText;
        domElements.modal_confirm_solve.dataset.action = action; // Store action type
    }

    domElements.solve_confirm_modal.classList.add('active');
}

/** Hides the solve/reset confirmation modal. */
function hideSolveConfirmation() {
    if (domElements.solve_confirm_modal) domElements.solve_confirm_modal.classList.remove('active');
}

/** Handles the click on the confirmation button in the solve/reset modal. */
function handleSolveConfirmClick() {
    const action = domElements.modal_confirm_solve?.dataset.action;
    hideSolveConfirmation(); // Hide modal immediately

    switch (action) {
        case 'solve':
            console.log("Executing solve by reversing scramble...");
            solveCubeAnimated(true); // True: use reverse scramble
            break;
        case 'reset':
            console.log("Executing reset to solved state...");
            solveCubeAnimated(false); // False: reset the cube directly
            break;
        case 'ok':
            console.log("Solve confirmation dismissed (OK).");
            // Cube was already solved, do nothing.
            break;
        default:
            console.warn("Unknown action from solve confirm button:", action);
    }
}

/** Sets the flag to request stopping the current animation sequence. */
function requestStopSequence() {
    if (isSequenceAnimating && domElements.stopButton && !stopSequenceRequested) {
        stopSequenceRequested = true;
        domElements.stopButton.disabled = true; // Disable immediately
        domElements.stopButton.title = "Stopping...";
        console.log("Stop sequence requested...");
    }
}

/**
 * Solves the cube either by reversing the last scramble or by resetting it.
 * @param {boolean} useReverseScramble - If true, attempts to reverse `lastScrambleSequence`.
 */
async function solveCubeAnimated(useReverseScramble) {
    if (isAnimating || isSequenceAnimating) return;

    if (useReverseScramble && lastScrambleSequence.length > 0) {
        console.log("Solving by reversing last scramble...");
        const solveSequence = lastScrambleSequence.map(move => ({
            axis: move.axis.clone(),
            layerIndex: move.layerIndex,
            angle: -move.angle // Reverse angle
        })).reverse(); // Reverse order

        lastScrambleSequence = []; // Clear history *before* starting solve
        wasShuffledSinceLastSolve = false; // Solving resets reward eligibility

        await applyMovesAnimated(solveSequence, true);
        console.log("Solve (reverse scramble) complete.");

    } else if (!isCubeSolved()) { // Only reset if not already solved
        console.log("Resetting cube to solved state...");
        // Reset instantly by recreating the cube mesh
        createCube(currentN);
        // Ensure flags/history are clear after reset
        lastScrambleSequence = [];
        wasShuffledSinceLastSolve = false;
        console.log("Cube reset complete.");
    } else {
        console.log("Solve request ignored: Cube already solved.");
    }
}

/** Generates a random sequence of moves and applies them to shuffle the cube. */
function shuffleCubeAnimated() {
    if (isAnimating || isSequenceAnimating) return;
    console.log(`Shuffling ${currentN}x${currentN}x${currentN} Cube...`);

    const moves = [];
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const angles = [Math.PI / 2, -Math.PI / 2]; // 90-degree turns
    let lastAxis = null;
    let lastLayerIndex = -1;

    const numMoves = currentN * SHUFFLE_MOVES_FACTOR; // Scale moves with size
    console.log(`Generating ${numMoves} shuffle moves...`);

    for (let i = 0; i < numMoves; i++) {
        let axis, layerIndex, angle;
        let attempts = 0;
        const MAX_ATTEMPTS = 20; // Prevent potential infinite loops

        // Find a move that isn't identical to the last one
        do {
            axis = axes[Math.floor(Math.random() * axes.length)].clone();
            layerIndex = Math.floor(Math.random() * currentN); // Layer 0 to N-1
            angle = angles[Math.floor(Math.random() * angles.length)];
            attempts++;
        } while (attempts < MAX_ATTEMPTS && lastAxis && axis.equals(lastAxis) && layerIndex === lastLayerIndex);

        moves.push({ axis, layerIndex, angle });
        lastAxis = axis; // Store for next iteration check
        lastLayerIndex = layerIndex;
    }

    lastScrambleSequence = [...moves]; // Store the sequence for potential solve
    wasShuffledSinceLastSolve = true; // Mark cube as shuffled
    console.log(`Stored ${lastScrambleSequence.length} moves for potential solve.`);
    applyMovesAnimated(moves, true); // Execute the shuffle
}

// --- Store Logic ---

/** Shows the cube store modal. */
function showStoreModal() {
    if (isAnimating || isSequenceAnimating) return; // Don't open during animations
    if (domElements.store_modal) {
        renderStore(); // Update contents before showing
        domElements.store_modal.classList.add('active');
    }
}

/** Hides the cube store modal. */
function hideStoreModal() {
    if (domElements.store_modal) {
        domElements.store_modal.classList.remove('active');
        if (domElements.store_feedback) { // Clear feedback on close
            domElements.store_feedback.style.display = 'none';
            domElements.store_feedback.textContent = '';
        }
    }
}

/** Renders the items available in the store modal based on `cubeStoreItems`. */
function renderStore() {
    const container = domElements.store_items_container;
    if (!container) return;
    container.innerHTML = ''; // Clear previous items

    cubeStoreItems.forEach(item => {
        const isOwned = userData.purchasedCubes.includes(item.id);
        const isCurrent = userData.currentCubeSize === item.size;
        const canAfford = userData.coins >= item.price;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'store-item';

        let buttonsHtml = '';
        if (isOwned) {
            buttonsHtml = `
                <p class="purchased-text"><i class="fa-solid fa-check"></i> Purchased</p>
                <button class="use-button full-width" data-cube-id="${item.id}" ${isCurrent ? 'disabled' : ''}>
                    ${isCurrent ? 'Currently Using' : 'Use This Cube'}
                </button>
            `;
        } else {
            buttonsHtml = `
                <button class="purchase-button full-width" data-cube-id="${item.id}" ${!canAfford ? 'disabled' : ''}>
                    Buy for <i class="fa-solid fa-coins coin-icon gold"></i> ${item.price}
                </button>
                ${!canAfford ? '<p class="small-info-text" style="color: var(--feedback-error-color);">Not enough coins</p>' : ''}
            `;
        }

        itemDiv.innerHTML = `
            <div class="store-item-name">${item.name} (${item.id})</div>
            <i class="fa-solid ${item.icon || 'fa-question-circle'} store-item-icon"></i>
            <div class="store-item-price">
                ${isOwned ? '&nbsp;' : `Price: <i class="fa-solid fa-coins coin-icon gold"></i>&nbsp;${item.price}`}
            </div>
            <div class="store-item-buttons">${buttonsHtml}</div>
        `;
        container.appendChild(itemDiv);
    });

    // Add event listeners to the new buttons *after* adding them to the DOM
    container.querySelectorAll('.purchase-button').forEach(button => {
        button.addEventListener('click', () => handlePurchase(button.dataset.cubeId));
    });
    container.querySelectorAll('.use-button').forEach(button => {
        button.addEventListener('click', () => handleUseCube(button.dataset.cubeId));
    });
}

/** Handles the purchase action for a store item. */
function handlePurchase(itemId) {
    const item = cubeStoreItems.find(it => it.id === itemId);
    if (!item) return showStoreFeedback("Error: Invalid item selected.", false);
    if (userData.purchasedCubes.includes(itemId)) return showStoreFeedback("Item already owned.", false);

    if (userData.coins >= item.price) {
        userData.coins -= item.price;
        userData.purchasedCubes.push(itemId);
        saveUserData();
        updateUserUI(); // Update coin display in header
        renderStore(); // Re-render store to reflect purchase
        showStoreFeedback(`Successfully purchased ${item.name}!`, true);
        console.log(`Purchased ${item.name} for ${item.price}. Coins left: ${userData.coins}`);
    } else {
        showStoreFeedback("Not enough coins to purchase this item.", false);
    }
}

/** Handles switching to use a different purchased cube size. */
function handleUseCube(itemId) {
    const item = cubeStoreItems.find(it => it.id === itemId);
    if (!item) return showStoreFeedback("Error: Invalid item selected.", false);
    if (!userData.purchasedCubes.includes(itemId)) return showStoreFeedback("Cannot use an item you don't own.", false);

    if (userData.currentCubeSize !== item.size) {
        console.log(`Switching cube size to ${item.size}x${item.size}...`);
        userData.currentCubeSize = item.size;
        saveUserData();
        // Re-setup the game environment with the new size
        // This will automatically call createCube and update UI/controls
        safelySetupGame();
        hideStoreModal(); // Close store after selection
    } else {
        // Already using this size, just indicate and maybe close modal
        showStoreFeedback(`Already using the ${item.name}.`, true);
        // setTimeout(hideStoreModal, 1500); // Optionally close after feedback
    }
}

/** Displays feedback messages (success/error) within the store modal. */
function showStoreFeedback(message, isSuccess) {
    const feedbackElement = domElements.store_feedback;
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.className = `feedback-message ${isSuccess ? 'success' : 'error'}`;
    feedbackElement.style.display = 'block'; // Make it visible

    // Optional: Auto-hide after a delay
    // clearTimeout(feedbackElement.timer); // Clear previous timer
    // feedbackElement.timer = setTimeout(() => {
    //     feedbackElement.style.display = 'none';
    // }, 3000);
}

// --- Reset Account ---

/** Shows the confirmation modal for resetting all user data. */
function showResetConfirmationModal() {
    if (domElements.reset_confirm_modal) {
        domElements.reset_confirm_modal.classList.add('active');
    }
}

/** Hides the reset account confirmation modal. */
function hideResetConfirmationModal() {
    if (domElements.reset_confirm_modal) {
        domElements.reset_confirm_modal.classList.remove('active');
    }
}

/**
 * Handles the final confirmation to reset user data.
 * Clears localStorage, stops animations, cleans up resources, and reloads the page.
 */
function resetUserData() {
    console.warn("Resetting all user data and application state...");
    hideResetConfirmationModal();
    hideSettingsPanel(); // Ensure settings panel is closed

    try {
        // Stop any running animation loops
        if (animationFrameId) {
             cancelAnimationFrame(animationFrameId);
             animationFrameId = null;
        }
        // Clean up Three.js resources
        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
            try { renderer.domElement.parentNode.removeChild(renderer.domElement); } catch(e){}
        }
        if (renderer) try { renderer.dispose(); } catch(e){}
        scene = null; camera = null; renderer = null; controls = null; cubeGroup = null; cubies = [];
        gameListenersAdded = false; // Reset listener flag

        // Clear all relevant localStorage items
        localStorage.removeItem('rubixUserData');
        localStorage.removeItem('rubiksAnimationSpeed');
        localStorage.removeItem('rubiksTheme');
        localStorage.removeItem('rubiksVibrationEnabled');
        console.log("Local storage cleared.");

        // Force a full page reload to restart the application from scratch
        console.log("Reloading page...");
        location.reload();

    } catch (e) {
        console.error("Error during account reset process:", e);
        // Provide feedback even if reload fails somehow
        alert("An error occurred while resetting data. Please try manually clearing your browser's Local Storage for this site.");
    }
}

/** Helper function to ensure the settings panel is closed. */
function hideSettingsPanel() {
    if (domElements.settings_panel?.classList.contains('active')) {
        toggleSettingsPanel();
    }
}

// --- Event Listeners Setup ---

/** Adds event listeners for core UI elements (modals, buttons, settings). */
function addCoreEventListeners() {
    console.log("Adding core UI event listeners...");
    const safeAddListener = (element, event, handler, options) => {
        if (element) {
            element.addEventListener(event, handler, options);
        } else {
            // Find the key associated with the null element for better logging
            const elementId = Object.keys(domElements).find(key => domElements[key] === element);
            console.warn(`Cannot add listener for "${event}": Element '${elementId || '<unknown>'}' not found in cache.`);
        }
    };

    // --- Modals ---
    safeAddListener(domElements.username_form, 'submit', handleUsernameSubmit);
    safeAddListener(domElements.username_input, 'input', handleUsernameInput); // Real-time validation
    safeAddListener(domElements.modal_cancel_solve, 'click', hideSolveConfirmation);
    safeAddListener(domElements.modal_confirm_solve, 'click', handleSolveConfirmClick);
    safeAddListener(domElements.close_store_button, 'click', hideStoreModal);
    safeAddListener(domElements.modal_cancel_reset, 'click', hideResetConfirmationModal);
    safeAddListener(domElements.modal_confirm_reset, 'click', resetUserData);

    // --- Header & Control Buttons ---
    safeAddListener(domElements.settings_button, 'click', toggleSettingsPanel);
    safeAddListener(domElements.store_button, 'click', showStoreModal);
    safeAddListener(domElements.solve_button, 'click', showSolveConfirmation);
    safeAddListener(domElements.shuffle_button, 'click', shuffleCubeAnimated);
    safeAddListener(domElements.stop_button, 'click', requestStopSequence);

    // --- Settings Panel ---
    safeAddListener(domElements.close_settings_button, 'click', toggleSettingsPanel);
    safeAddListener(domElements.animation_speed_slider, 'input', handleSpeedChange);
    safeAddListener(domElements.vibration_toggle, 'change', handleVibrationChange);
    safeAddListener(domElements.reset_account_button, 'click', showResetConfirmationModal);
    if (domElements.themeRadios) {
        domElements.themeRadios.forEach(radio => safeAddListener(radio, 'change', handleThemeChange));
    }

    // --- Global Listeners ---
    safeAddListener(window, 'resize', onWindowResize);

    // Click outside modals/panel to close
    safeAddListener(document, 'click', (event) => {
        // Settings Panel
        if (domElements.settings_panel?.classList.contains('active') &&
            !domElements.settings_panel.contains(event.target) && // Clicked outside panel
            event.target !== domElements.settings_button && // Not the button that opens it
            !domElements.settings_button?.contains(event.target)) { // Not inside the button
            toggleSettingsPanel();
        }
        // Store, Solve, Reset Modals (close only if clicking the overlay itself)
        if (domElements.store_modal?.classList.contains('active') && event.target === domElements.store_modal) hideStoreModal();
        if (domElements.solve_confirm_modal?.classList.contains('active') && event.target === domElements.solve_confirm_modal) hideSolveConfirmation();
        if (domElements.reset_confirm_modal?.classList.contains('active') && event.target === domElements.reset_confirm_modal) hideResetConfirmationModal();
        // Username modal intentionally does *not* close on outside click
    });

    // Keyboard shortcuts
    safeAddListener(document, 'keydown', (event) => {
        // Escape key closes active modals/panel (except username)
        if (event.key === 'Escape') {
            if (domElements.solve_confirm_modal?.classList.contains('active')) hideSolveConfirmation();
            else if (domElements.reset_confirm_modal?.classList.contains('active')) hideResetConfirmationModal();
            else if (domElements.store_modal?.classList.contains('active')) hideStoreModal();
            else if (domElements.settings_panel?.classList.contains('active')) toggleSettingsPanel();
        }
        // Enter key confirms actions in certain modals
        else if (event.key === 'Enter') {
            if (domElements.solve_confirm_modal?.classList.contains('active')) domElements.modal_confirm_solve?.click();
            else if (domElements.reset_confirm_modal?.classList.contains('active')) domElements.modal_confirm_reset?.click();
            // Prevent Enter submitting username form if button is disabled (handled by form submit)
            else if (domElements.username_modal?.classList.contains('active')) {
                if (!domElements.username_submit?.disabled) {
                     // Manually trigger submit handler if Enter pressed and button enabled
                     event.preventDefault(); // Prevent default just in case
                     handleUsernameSubmit(new Event('submit')); // Simulate submit event
                 }
            }
        }
    });
    console.log("Core UI event listeners added.");
}

/** Adds event listeners specific to the 3D canvas interaction (pointer/touch). */
function addGameEventListeners() {
    // Prevent adding listeners multiple times
    if (gameListenersAdded || !renderer?.domElement) {
        return;
    }
    console.log("Adding game interaction listeners (pointer events)...");
    const el = renderer.domElement;

    // Use Pointer Events for unified mouse/touch handling
    // Need passive: false where preventDefault() might be called (e.g., move during drag)
    el.addEventListener('pointerdown', onPointerDown, { passive: true }); // Down usually doesn't need preventDefault
    el.addEventListener('pointermove', onPointerMove, { passive: false }); // Move might need preventDefault
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('pointerleave', resetDragState); // Reset if pointer leaves canvas
    el.addEventListener('pointercancel', onPointerUp); // Treat cancel like pointer up

    gameListenersAdded = true;
    console.log("Game interaction listeners added.");
}

// --- Animation Loop ---

/** Main animation loop function, called recursively via requestAnimationFrame. */
function animate() {
    animationFrameId = requestAnimationFrame(animate); // Schedule next frame

    controls?.update(); // Update OrbitControls (needed for damping)

    if (renderer && scene && camera) {
        renderer.render(scene, camera); // Render the scene
    }
}

// --- Start Application ---
// Ensures the script runs after the HTML is parsed and DOM is ready.
document.addEventListener('DOMContentLoaded', initializeApp);