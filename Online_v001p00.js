



// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, push, update, remove, onDisconnect, query, limitToFirst, orderByChild, runTransaction, child } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";

// Your Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyD-wIuod1HspD7ffLzqsJGlsBMoi1iujZ8",
    authDomain: "tic-tac-toe-2-44691.firebaseapp.com",
    projectId: "tic-tac-toe-2-44691",
    storageBucket: "tic-tac-toe-2-44691.firebasestorage.app",
    messagingSenderId: "947987116391",
    appId: "1:947987116391:web:c2c64bc30fd0f810627fc2",
    measurementId: "G-WDR5ZXGXQ7",
    databaseURL: "https://tic-tac-toe-2-44691-default-rtdb.europe-west1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Firebase References
const usernameComponentsRef = ref(database, 'username_components');
const onlineUsersRef = ref(database, 'online_users');
const invitesRef = ref(database, 'invites');
const waitingRoomsRef = ref(database, 'waiting_rooms'); // NEW Firebase Ref

// DOM Elements
const usernameDisplay = document.getElementById('usernameDisplay');
const generateBtn = document.getElementById('generateBtn');
const errorMessage = document.getElementById('errorMessage');
const inviteMessage = document.getElementById('inviteMessage');
const sendInviteMessage = document.getElementById('sendInviteMessage');
const darkModeToggle = document.getElementById('darkModeToggle');
const onlineUsersCountDisplay = document.getElementById('onlineUsersCount');
const copyBtn = document.getElementById('copyBtn');

const inviteInput = document.getElementById('inviteInput');
const sendInviteBtn = document.getElementById('sendInviteBtn');
const sentInvitesList = document.getElementById('sentInvitesList');
const receivedInvitesList = document.getElementById('receivedInvitesList');

// NEW DOM elements for matchmaking
const findRandomGameBtn = document.getElementById('findRandomGameBtn');
const matchStatusDisplay = document.getElementById('matchStatus');

let currentUsername = null;
const localStorageKey = 'userGeneratedUsername';

const inviteOnDisconnectRefs = {};
let currentRoomRef = null; // NEW: To keep track of the room the current user is in
let playerNumber = null; // NEW: To store if the user is player1 or player2

const gameDiv = document.getElementById('game');
const name1Span = document.getElementById('name1');
const name2Span = document.getElementById('name2');
const bigBoardDiv = document.getElementById('bigBoard');
const winmessage = document.getElementById('winMessageh1');
const winmessageDIV = document.getElementById('winMessage');
const OnlineMenu = document.getElementById('onlineMainMenu');

let players = [];
let currentPlayer = 0; // 0 or 1
let nextSubgrid = null; // [row, col] or null if any
let bigBoardState = Array(3).fill(0).map(() => Array(3).fill(null)); // null / 'X' / 'O'
let subBoardStates = Array(3).fill(0).map(() => Array(3).fill(0).map(() =>
    Array(3).fill(0).map(() => Array(3).fill(null))
));

// --- Helper Functions for UI Messages ---
function hideMessage(element) {
    element.classList.add('hidden');
    element.textContent = '';
    element.classList.remove('error-message', 'success-message', 'match-loading', 'match-found', 'match-error');
}

function showMessage(element, message, type = 'error') {
    element.textContent = message;
    element.classList.remove('hidden');
    element.classList.add(
        type === 'success' ? 'success-message' :
            type === 'loading' ? 'match-loading' :
                type === 'found' ? 'match-found' :
                    'error-message'
    );
    // Hide after a few seconds, unless it's a 'loading' or 'found' message
    if (type !== 'loading' && type !== 'found') {
        setTimeout(() => hideMessage(element), 5000);
    }
}

function hideGeneralError() { hideMessage(errorMessage); }
function showGeneralError(message) { showMessage(errorMessage, message, 'error'); }

function hideInviteMessage() { hideMessage(inviteMessage); }
function showInviteMessage(message, type = 'error') { showMessage(inviteMessage, message, type); }

function hideSendInviteMessage() { hideMessage(sendInviteMessage); }
function showSendInviteMessage(message, type = 'error') { showMessage(sendInviteMessage, message, type); }

function hideMatchStatus() { hideMessage(matchStatusDisplay); }
function showMatchStatus(message, type = 'error') { showMessage(matchStatusDisplay, message, type); }


async function setOnlineStatus(username, oldUsername = null) {
    if (!username) return;

    // Remove old username's online status if it exists and is different
    if (oldUsername && oldUsername !== username) {
        const oldUserRef = ref(database, `online_users/${oldUsername.replace(/\s/g, '_')}`);
        await set(oldUserRef, null).catch(error => console.error("Error removing old username's online status:", error));
        console.log(`User ${oldUsername} is now offline.`);
    }

    const userRef = ref(database, `online_users/${username.replace(/\s/g, '_')}`);
    try {
        await set(userRef, true);
        // Set up onDisconnect to remove this user from online_users
        onDisconnect(userRef).remove();
        console.log(`User ${username} is now online.`);
    } catch (error) {
        console.error("Error setting online status:", error);
        showGeneralError(`Failed to set online status: ${error.message}`);
    }
}


async function generateOrLoadUsername(forceNew = false) {
    usernameDisplay.textContent = 'Loading username...';
    usernameDisplay.classList.add('loading-text');
    hideGeneralError();
    hideInviteMessage();
    hideSendInviteMessage();
    hideMatchStatus(); // Clear match status on username change

    let usernameFromLocalStorage = localStorage.getItem(localStorageKey);
    let newUsername = null;

    // Handle existing username cleanup for the *old* currentUsername, if any
    if (currentUsername) {
        // Cancel all onDisconnect operations for invites previously sent by this user
        for (const inviteId in inviteOnDisconnectRefs) {
            if (inviteOnDisconnectRefs.hasOwnProperty(inviteId)) {
                await inviteOnDisconnectRefs[inviteId].cancel()
                    .catch(err => console.error(`Error canceling onDisconnect for invite ${inviteId}:`, err));
            }
        }
        inviteOnDisconnectRefs = {}; // Clear the map

        // Stop listening for all invites (the onValue listener)
        // You'll need to store and manage the off() function if you want to stop listeners.
        // For now, onValue listeners will be re-applied with the new username.
        // You might need to add `off(ref(database, 'invites'))` here to be more explicit.
        // off(invitesRef);
        // Clear existing invites from UI for old user
        sentInvitesList.innerHTML = '<li class="loading-text">No sent invites.</li>';
        receivedInvitesList.innerHTML = '<li class="loading-text">No pending challenges.</li>';

        // --- NEW: Handle cleanup for matchmaking if the user was in a room ---
        if (currentRoomRef) {
            console.log("Leaving previous room on username change.");
            // We use remove() on the entire room to reset it completely if the user leaves
            // If the other player is still in the room, this will trigger the room reset logic.
            await remove(currentRoomRef).catch(err => console.error("Error leaving previous room:", err));
            currentRoomRef = null;
            playerNumber = null;
        }
    }


    if (!forceNew && usernameFromLocalStorage) {
        newUsername = usernameFromLocalStorage;
        usernameDisplay.textContent = newUsername;
        usernameDisplay.classList.remove('loading-text');
        console.log("Loaded username from localStorage:", newUsername);
    } else {
        try {
            const snapshot = await get(usernameComponentsRef);

            if (snapshot.exists()) {
                const components = snapshot.val();

                const emotions = components.emotions ? Object.keys(components.emotions) : [];
                const colors = components.colours ? Object.keys(components.colours) : [];
                const animals = components.animal ? Object.keys(components.animal) : [];

                if (emotions.length > 0 && colors.length > 0 && animals.length > 0) {
                    const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];

                    newUsername = `${randomEmotion} ${randomColor} ${randomAnimal}`;
                    usernameDisplay.textContent = newUsername;
                    usernameDisplay.classList.remove('loading-text');
                    localStorage.setItem(localStorageKey, newUsername); // Save to localStorage
                    console.log("Generated and saved new username:", newUsername);

                } else {
                    showGeneralError("Username components are incomplete or empty in Firebase. Please check your database structure.");
                    newUsername = "FallbackUser";
                    usernameDisplay.textContent = newUsername;
                    usernameDisplay.classList.remove('loading-text');
                    localStorage.setItem(localStorageKey, newUsername); // Save fallback
                }
            } else {
                showGeneralError("No username components found in Firebase. Please ensure 'username_components' exists and contains data.");
                newUsername = "NoDataUser";
                usernameDisplay.textContent = newUsername;
                usernameDisplay.classList.remove('loading-text');
                localStorage.setItem(localStorageKey, newUsername); // Save fallback
            }
        } catch (error) {
            console.error("Error fetching username components from Firebase:", error);
            showGeneralError(`Failed to fetch username components: ${error.message}`);
            newUsername = "ErrorUser";
            usernameDisplay.textContent = newUsername;
            usernameDisplay.classList.remove('loading-text');
            localStorage.setItem(localStorageKey, newUsername); // Save error fallback
        }
    }

    // Set online status and start listeners for the new or loaded username
    if (newUsername) {
        // Pass oldUsername to setOnlineStatus for explicit removal
        setOnlineStatus(newUsername, currentUsername);
        currentUsername = newUsername; // Update global currentUsername
        listenForInvites(currentUsername);
    }
}


// --- NEW: Matchmaking Logic Functions ---

/**
    * Finds and joins a waiting room for a random game.
    * This function uses a transaction to ensure no race conditions.
    */
async function findAndJoinRoom() {
    if (!currentUsername) {
        showMatchStatus('Please generate a username first.', 'error');
        return;
    }

    findRandomGameBtn.disabled = true;
    showMatchStatus('Searching for a match...', 'loading');

    let roomFound = false;

    for (let i = 1; i <= 10; i++) {
        const roomRef = child(waitingRoomsRef, `room${i}`);

        try {
            const { committed, snapshot } = await runTransaction(roomRef, (currentData) => {
                // If the room is empty, claim it as player1
                if (currentData === null) {
                    return { player1: currentUsername };
                }

                // If there's a player1 but no player2, claim it as player2
                if (currentData.player1 && !currentData.player2) {
                    // Check if the current user is not already in the room
                    if (currentData.player1 !== currentUsername) {
                        currentData.player2 = currentUsername;
                        return currentData;
                    }
                }
                // If both slots are taken, don't update this room and continue the loop
                return undefined;
            });

            if (committed) {
                roomFound = true;
                const roomData = snapshot.val();
                currentRoomRef = roomRef;

                // Determine player number based on the committed data
                playerNumber = (roomData.player1 === currentUsername) ? 1 : 2;

                // Set up onDisconnect to remove the player from the room on disconnect
                onDisconnect(child(roomRef, `player${playerNumber}`)).remove();

                // -------------------------------------------------------------
                // CORRECT PLACEMENT: Attach the onValue listener here,
                // after a room has been successfully joined and committed.
                // -------------------------------------------------------------
                onValue(currentRoomRef, (roomSnapshot) => {
                    const roomState = roomSnapshot.val();

                    if (!roomState || !roomState.player1 || !roomState.player2) {
                        // The room is no longer full or was deleted. This means a player left.
                        showMatchStatus('Opponent disconnected. Room reset. Please find a new match.', 'error');
                        findRandomGameBtn.disabled = false;
                        currentRoomRef = null;
                        playerNumber = null;
                        return;
                    }

                    // A match is found, hide the menu and start the game UI.
                    showMatchStatus('Match was made! The game can now begin.', 'found');
                    findRandomGameBtn.disabled = true;
                    OnlineMenu.classList.add('hidden');
                    gameDiv.classList.remove('hidden');

                    // Initialize the game state based on the room data
                    players = [roomState.player1, roomState.player2];

                    // You need to decide who goes first. Let's make it consistent across both clients.
                    // For example, based on the `currentTurn` field in the database.
                    if (!roomState.currentTurn) {
                        // If no turn is set, randomly pick one and update the database
                        const startingPlayerIndex = Math.floor(Math.random() * 2);
                        update(currentRoomRef, { currentTurn: players[startingPlayerIndex] });
                    }

                    // Update local state and UI
                    name1Span.textContent = players[0];
                    name2Span.textContent = players[1];

                    if (!roomState.board) {
                        // Initialize board state in the database if it doesn't exist
                        const initialBoardState = {
                            bigBoardState: Array(3).fill(null).map(() => Array(3).fill(null)),
                            subBoardStates: Array(3).fill(0).map(() => Array(3).fill(0).map(() =>
                                Array(3).fill(0).map(() => Array(3).fill(null))
                            )),
                            nextSubgrid: null
                        };
                        update(currentRoomRef, { board: initialBoardState });
                    }

                    // Now, listen for changes to the board state specifically
                    // This can be done with a nested onValue listener or by handling
                    // the board state changes within the main listener.
                    // Let's handle it in this listener for simplicity.
                    if (roomState.board) {
                        bigBoardState = roomState.board.bigBoardState;
                        subBoardStates = roomState.board.subBoardStates;
                        nextSubgrid = roomState.board.nextSubgrid;
                        currentPlayer = (roomState.currentTurn === players[0]) ? 0 : 1;

                        // Render the board and names
                        createBoard(); // or a function to update the existing board
                        renderNames();
                        highlightNextSubgrid();
                    }
                });

                break; // Exit the loop after finding a room
            }

        } catch (error) {
            console.error(`Error joining room ${i}:`, error);
        }
    }

    if (!roomFound) {
        showMatchStatus('All rooms are full. Please try again in a moment.', 'error');
        findRandomGameBtn.disabled = false;
    }
}

function renderNames() {
    name1Span.textContent = players[0];
    name2Span.textContent = players[1];
    if (currentPlayer === 0) {
        name1Span.classList.add('highlight');
        name2Span.classList.remove('highlight');
    } else {
        name2Span.classList.add('highlight');
        name1Span.classList.remove('highlight');
    }
}



function createBoard() {
    bigBoardDiv.innerHTML = '';
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            for (let sr = 0; sr < 3; sr++) {
                for (let sc = 0; sc < 3; sc++) {
                    const subcell = document.createElement('div');
                    subcell.classList.add('subcell');
                    subcell.dataset.bigRow = r;
                    subcell.dataset.bigCol = c;
                    subcell.dataset.subRow = sr;
                    subcell.dataset.subCol = sc;
                    subcell.addEventListener('click', handleMove);
                    cell.appendChild(subcell);
                }
            }
            bigBoardDiv.appendChild(cell);
        }
    }
}


function handleMove(e) {
    // A. Read the current game state from the database.
    // This is already handled by the onValue listener.
    // The local variables `bigBoardState`, `subBoardStates`, `currentPlayer`, etc.
    // are kept in sync by the listener.

    const el = e.currentTarget;
    const br = +el.dataset.bigRow, bc = +el.dataset.bigCol;
    const sr = +el.dataset.subRow, sc = +el.dataset.subCol;
    const playerMark = playerNumber === 1 ? 'X' : 'O';

    // B. Check if it is this player's turn
    if (players[currentPlayer] !== currentUsername) {
        // You can add a message here to inform the user it's not their turn
        return;
    }

    // C. Re-run the local checks for valid moves
    if (bigBoardState[br][bc]) return; // already won
    if (subBoardStates[br][bc][sr][sc]) return; // already filled
    if (nextSubgrid && (nextSubgrid[0] !== br || nextSubgrid[1] !== bc)) return; // wrong grid

    // D. Update local state before pushing to Firebase
    // This is a temporary local update
    const newSubBoardStates = JSON.parse(JSON.stringify(subBoardStates));
    newSubBoardStates[br][bc][sr][sc] = playerMark;

    const newBigBoardState = JSON.parse(JSON.stringify(bigBoardState));
    let newNextSubgrid = null;

    // Check if subgrid is won
    if (checkWin(newSubBoardStates[br][bc], playerMark)) {
        newBigBoardState[br][bc] = playerMark;
    }
    // Check for subgrid draw
    else if (isFullSubgrid(newSubBoardStates[br][bc])) {
        newBigBoardState[br][bc] = 'draw';
    }

    // Determine the next subgrid
    if (!newBigBoardState[sr][sc]) {
        newNextSubgrid = [sr, sc];
    }

    // E. Create the update object for Firebase
    const updates = {
        'boardState/bigBoardState': newBigBoardState,
        'boardState/subBoardStates': newSubBoardStates,
        'nextSubgrid': newNextSubgrid,
        'currentPlayer': 1 - currentPlayer, // Switch turns
    };

    // F. Push the update to Firebase
    update(currentRoomRef, updates)
        .then(() => {
            console.log("Move successfully written to database.");
            // The onValue listener will handle updating the UI.
        })
        .catch((error) => {
            console.error("Error writing move to database:", error);
            // Show an error message to the user if the update fails
        });
}

    

function findCell(r, c) {
    return [...bigBoardDiv.children].find(el => +el.dataset.row === r && +el.dataset.col === c);
}

function highlightNextSubgrid() {
    [...bigBoardDiv.children].forEach(cell => {
        const r = +cell.dataset.row, c = +cell.dataset.col;
        cell.classList.remove('active-subgrid');
        if (!bigBoardState[r][c] &&
            (!nextSubgrid || (nextSubgrid[0] === r && nextSubgrid[1] === c))) {
            cell.classList.add('active-subgrid');
        }
    });
}

function checkWin(board, mark) {
    for (let i = 0; i < 3; i++) {
        if (board[i][0] === mark && board[i][1] === mark && board[i][2] === mark) return true;
        if (board[0][i] === mark && board[1][i] === mark && board[2][i] === mark) return true;
    }
    if (board[0][0] === mark && board[1][1] === mark && board[2][2] === mark) return true;
    if (board[0][2] === mark && board[1][1] === mark && board[2][0] === mark) return true;
    return false;
}

function isFullSubgrid(subgrid) {
    return subgrid.every(row => row.every(cell => cell !== null));
}


/**
    * Listens for changes in the online_users node and updates the UI to show the count.
    */
function listenForOnlineUsers() {
    onValue(onlineUsersRef, (snapshot) => {
        const users = snapshot.val();
        let count = 0;
        if (users) {
            count = Object.keys(users).length;
        }
        onlineUsersCountDisplay.textContent = count;
        onlineUsersCountDisplay.classList.remove('loading-text');
    }, (error) => {
        console.error("Error listening for online users:", error);
        onlineUsersCountDisplay.textContent = 'Error';
        onlineUsersCountDisplay.classList.remove('loading-text');
        onlineUsersCountDisplay.classList.add('error-message');
    });
}

/**
    * Checks if a username exists in the online_users list.
    * @param {string} username - The username to check.
    * @returns {Promise<boolean>} True if online, false otherwise.
    */
async function isUserOnline(username) {
    const userKey = username.replace(/\s/g, '_');
    try {
        const snapshot = await get(ref(database, `online_users/${userKey}`));
        return snapshot.exists() && snapshot.val() === true;
    } catch (error) {
        console.error("Error checking online status:", error);
        return false;
    }
}

/**
    * Sends an invite to another user.
    */
sendInviteBtn.addEventListener('click', async () => {
    if (!currentUsername) {
        showSendInviteMessage("Please generate your username first.", 'error');
        return;
    }

    const recipientUsername = inviteInput.value.trim();
    if (!recipientUsername) {
        showSendInviteMessage("Please enter a username to invite.", 'error');
        return;
    }

    if (recipientUsername === currentUsername) {
        showSendInviteMessage("You cannot invite yourself.", 'error');
        return;
    }

    // Prevent sending invite if user is in matchmaking
    if (currentRoomRef) {
        showSendInviteMessage("You are currently looking for a random game. Please cancel to send an invite.", 'error');
        return;
    }


    hideSendInviteMessage();

    const online = await isUserOnline(recipientUsername);
    if (!online) {
        showSendInviteMessage(`"${recipientUsername}" is not online or spelled incorrectly.`, 'error');
        return;
    }

    const newInvite = {
        sender: currentUsername,
        recipient: recipientUsername,
        status: 'pending',
        timestamp: Date.now()
    };

    try {
        const newInviteRef = push(invitesRef);
        const inviteId = newInviteRef.key;

        await set(newInviteRef, newInvite);
        showSendInviteMessage(`Invite sent to ${recipientUsername}!`, 'success');
        inviteInput.value = '';

        const inviteStatusRef = ref(database, `invites/${inviteId}/status`);
        inviteOnDisconnectRefs[inviteId] = onDisconnect(inviteStatusRef);
        await inviteOnDisconnectRefs[inviteId].set('cancelled')
            .catch(err => console.error(`Failed to set onDisconnect for invite ${inviteId}:`, err));
        console.log(`onDisconnect set for invite ${inviteId}`);

    } catch (error) {
        console.error("Error sending invite:", error);
        showSendInviteMessage(`Failed to send invite: ${error.message}`, 'error');
    }
});


/**
    * Displays a single invite item in the UI.
    * @param {string} inviteId - The unique ID of the invite.
    * @param {object} inviteData - The invite object from Firebase.
    * @param {HTMLElement} listElement - The UL element to append to (sent or received list).
    * @param {boolean} isSenderView - True if rendering for the sender, false for recipient.
    */
function renderInviteItem(inviteId, inviteData, listElement, isSenderView) {
    let listItem = document.getElementById(`invite-${inviteId}`);
    if (listItem) {
        listItem.remove();
    }

    listItem = document.createElement('li');
    listItem.id = `invite-${inviteId}`;
    listItem.classList.add('invite-item');

    let contentHTML = '';
    let actionsHTML = '';

    if (isSenderView) {
        contentHTML = `<span>To: <strong>${inviteData.recipient}</strong> - Status: <span class="invite-status-pending">${inviteData.status.toUpperCase()}</span></span>`;
        if (inviteData.status === 'pending') {
            actionsHTML = `
                        <div class="invite-actions">
                            <button class="cancel-btn" data-invite-id="${inviteId}"><span class="material-symbols-outlined">cancel</span></button>
                        </div>
                    `;
        }
    } else { // Recipient view
        contentHTML = `<span>From: <strong>${inviteData.sender}</strong></span>`;
        if (inviteData.status === 'pending') {
            actionsHTML = `
                        <div class="invite-actions">
                            <button class="accept-btn" data-invite-id="${inviteId}"><span class="material-symbols-outlined">check</span></button>
                            <button class="reject-btn" data-invite-id="${inviteId}"><span class="material-symbols-outlined">close</span></button>
                        </div>
                    `;
        } else {
            contentHTML += ` - Status: ${inviteData.status.toUpperCase()}`;
        }
    }

    listItem.innerHTML = contentHTML + actionsHTML;
    listElement.appendChild(listItem);

    // Add event listeners for buttons
    if (isSenderView && inviteData.status === 'pending') {
        const cancelBtn = listItem.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => handleInviteCancel(inviteId);
        }
    } else if (!isSenderView && inviteData.status === 'pending') {
        const acceptBtn = listItem.querySelector('.accept-btn');
        const rejectBtn = listItem.querySelector('.reject-btn');

        if (acceptBtn) {
            acceptBtn.onclick = () => handleInviteResponse(inviteId, 'accepted');
        }
        if (rejectBtn) {
            rejectBtn.onclick = () => handleInviteResponse(inviteId, 'rejected');
        }
    }
}

/**
    * Handles acceptance or rejection of an invite.
    * @param {string} inviteId - The ID of the invite.
    * @param {string} status - 'accepted' or 'rejected'.
    */
async function handleInviteResponse(inviteId, status) {
    try {
        const inviteRef = ref(database, `invites/${inviteId}`);
        await update(inviteRef, { status: status });
        console.log(`Invite ${inviteId} ${status}.`);
        // If accepted/rejected, cancel onDisconnect for this invite
        if (inviteOnDisconnectRefs[inviteId]) {
            await inviteOnDisconnectRefs[inviteId].cancel();
            delete inviteOnDisconnectRefs[inviteId];
        }
    } catch (error) {
        console.error(`Error ${status} invite ${inviteId}:`, error);
        showInviteMessage(`Failed to ${status} invite: ${error.message}`, 'error');
    }
}

/**
    * Handles cancellation of an invite by the sender.
    * @param {string} inviteId - The ID of the invite to cancel.
    */
async function handleInviteCancel(inviteId) {
    try {
        const inviteRef = ref(database, `invites/${inviteId}`);
        await update(inviteRef, { status: 'cancelled' });
        console.log(`Invite ${inviteId} cancelled by sender.`);
        // If cancelled by sender, cancel onDisconnect for this invite
        if (inviteOnDisconnectRefs[inviteId]) {
            await inviteOnDisconnectRefs[inviteId].cancel();
            delete inviteOnDisconnectRefs[inviteId];
        }
    } catch (error) {
        console.error(`Error canceling invite ${inviteId}:`, error);
        showSendInviteMessage(`Failed to cancel invite: ${error.message}`, 'error');
    }
}


/**
    * Listens for incoming and outgoing invites relevant to the current user.
    * @param {string} username - The current user's generated username.
    */
function listenForInvites(username) {
    if (!username) return;

    sentInvitesList.innerHTML = '<li class="loading-text">No sent invites.</li>';
    receivedInvitesList.innerHTML = '<li class="loading-text">No pending challenges.</li>';

    onValue(invitesRef, (snapshot) => {
        const invites = snapshot.val();

        const tempSentList = document.createElement('ul');
        const tempReceivedList = document.createElement('ul');

        if (invites) {
            Object.entries(invites).forEach(([inviteId, inviteData]) => {
                if (inviteData.sender === username) {
                    if (inviteData.status === 'pending' || inviteData.status === 'accepted') {
                        renderInviteItem(inviteId, inviteData, tempSentList, true);
                    }
                } else if (inviteData.recipient === username) {
                    if (inviteData.status === 'pending') {
                        renderInviteItem(inviteId, inviteData, tempReceivedList, false);
                    }
                }

                // Clean up invites that are no longer relevant (e.g., cancelled, rejected)
                if (inviteData.status === 'cancelled' || inviteData.status === 'rejected') {
                    const itemToRemove = document.getElementById(`invite-${inviteId}`);
                    if (itemToRemove) {
                        itemToRemove.remove();
                    }
                    // Also remove from database for cleanup
                    remove(ref(database, `invites/${inviteId}`))
                        .then(() => console.log(`Invite ${inviteId} (${inviteData.status}) removed from DB.`))
                        .catch(err => console.error(`Error removing ${inviteData.status} invite ${inviteId}:`, err));
                }
            });
        }

        sentInvitesList.innerHTML = '';
        if (tempSentList.children.length > 0) {
            Array.from(tempSentList.children).forEach(child => sentInvitesList.appendChild(child));
        } else {
            sentInvitesList.innerHTML = '<li class="loading-text">No sent invites.</li>';
        }

        receivedInvitesList.innerHTML = '';
        if (tempReceivedList.children.length > 0) {
            Array.from(tempReceivedList.children).forEach(child => receivedInvitesList.appendChild(child));
        } else {
            receivedInvitesList.innerHTML = '<li class="loading-text">No pending challenges.</li>';
        }

    }, (error) => {
        console.error("Error listening for invites:", error);
        showGeneralError(`Error loading invites: ${error.message}`);
        sentInvitesList.innerHTML = `<li class="error-message">Error loading sent invites: ${error.message}</li>`;
        receivedInvitesList.innerHTML = `<li class="error-message">Error loading pending challenges: ${error.message}</li>`;
    });
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    generateOrLoadUsername();
    listenForOnlineUsers();
});

// NEW: Event listener for the matchmaking button
if (findRandomGameBtn) {
    findRandomGameBtn.addEventListener('click', findAndJoinRoom);
}

// Dark mode toggle event listener
if (darkModeToggle) {
    darkModeToggle.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    });
}

// Copy username to clipboard
copyBtn.addEventListener('click', async () => {
    const usernameToCopy = usernameDisplay.textContent;
    if (usernameToCopy && usernameToCopy !== 'Loading username...' && usernameToCopy !== 'ErrorUser' && usernameToCopy !== 'NoDataUser') {
        try {
            await navigator.clipboard.writeText(usernameToCopy);
            console.log('Username copied to clipboard:', usernameToCopy);
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy username:', err);
            showGeneralError('Failed to copy username. Please copy manually.');
        }
    } else {
        showGeneralError('No username to copy.');
    }
});



