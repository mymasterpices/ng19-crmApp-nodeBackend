// utils/getTodayDate.js
function getTodayDateISO() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight
    return today.toISOString();
}

module.exports = getTodayDateISO;
