const moment = require('moment-timezone');

function checkTimeAndRun() {
    // Function that checks the time
    const checkTime = () => {
        // Get the current time in Virginia
        const now = moment().tz("America/New_York");
        // Check if the current time is exactly 6:00 PM
        if (now.hour() === 11 && now.minute() === 26 && now.second() === 0) {
            // Perform the action you want to run at 6 PM
            console.log(`Action: It's exactly 6 PM in Virginia: ${now.format('YYYY-MM-DD HH:mm:ss')}`);
            // Optionally clear the interval if you don't need to keep checking after 6 PM
             clearInterval(intervalId);
        } else {
            // Print the current time every second until it's 6 PM
            console.log(`Current time in Virginia: ${now.format('YYYY-MM-DD HH:mm:ss')}`);
        }
    };

    // Set interval to check every second
    const intervalId = setInterval(checkTime, 1000);
}

// Call the function
checkTimeAndRun();
