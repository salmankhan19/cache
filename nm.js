const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";

async function startProcess() {
    const browser = await puppeteer.launch({
        headless: isHeadless,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Function to handle the CAPTCHA solving and submission
    async function solveCaptcha() {
        const captchaDivSelector = 'div[id^="_"]';
        await page.waitForSelector(captchaDivSelector, { timeout: 30000 });

        const captchaDiv = await page.$(captchaDivSelector);
        const style = await page.evaluate(element => window.getComputedStyle(element).backgroundImage, captchaDiv);
        const base64Match = style.match(/url\(["']?(data:image\/(?:jpg|jpeg|png|gif|bmp|webp|svg+xml);base64,[^"']+)["']?\)/);
        
        if (!base64Match) {
            throw new Error("CAPTCHA image not found.");
        }

        const base64Image = base64Match[1].split(",")[1];
        const captchaSolution = await solver.imageCaptcha(base64Image);

        const captchaInputSelector = 'input[name="captchaText"]';
        await page.waitForSelector(captchaInputSelector, { timeout: 5000 });
        await page.type(captchaInputSelector, captchaSolution.data);

        const continueButtonSelector = "#appointment_captcha_month_appointment_showMonth";
        await page.waitForSelector(continueButtonSelector, { timeout: 5000 });
        await page.click(continueButtonSelector);
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 });
    }

    // Function to check for appointment availability
    async function checkAppointmentsAvailable() {
        const noAppointmentsText = "Unfortunately, there are no appointments available at this time.";
        const availabilityText = await page.evaluate(() => document.body.innerText);
        return !availabilityText.includes(noAppointmentsText);
    }

    // Main logic to navigate and book appointments
    try {
        await page.goto("https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=kara&realmId=967&categoryId=2801", { waitUntil: "domcontentloaded" });
        await solveCaptcha();

        if (await checkAppointmentsAvailable()) {
            console.log("Appointments are available. Proceeding with the booking...");
            // Insert logic to handle booking details here.
            // Example: await page.click('#appointment_booking_button');
            // Wait for the next page, fill the form, etc.
        } else {
            console.log("No appointments available. Restarting the process...");
            setTimeout(() => {
                page.close().then(startProcess);
            }, 5000); // Wait 5 seconds before retrying
        }
    } catch (error) {
        console.error(`An error occurred: ${error}`);
        // await browser.close();
    }
}

startProcess().catch(console.error);
