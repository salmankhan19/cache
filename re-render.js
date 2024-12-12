const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";
const maxCaptchaAttempts = 50; // Limit the number of CAPTCHA retries to prevent infinite loops

async function startProcess() {
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  async function solveCaptcha(attempt = 1) {
    if (attempt > maxCaptchaAttempts) {
      console.error("Exceeded maximum CAPTCHA retry attempts.");
      await browser.close();
      return; // Stop the process after too many failed attempts
    }

    const captchaDivSelector = 'div[id^="_"]';
    await page.waitForSelector(captchaDivSelector, { timeout: 30000 });

    const captchaDiv = await page.$(captchaDivSelector);
    const style = await page.evaluate((element) => {
      return window.getComputedStyle(element).backgroundImage;
    }, captchaDiv);

    const base64Match = style.match(
      /url\(['"]?(data:image\/(?:jpg|jpeg|png|gif|bmp|webp|svg\+xml);base64,[^'"]+)['"]?\)/
    );
    if (!base64Match) {
      throw new Error("Could not find base64 image in background style");
    }

    const base64Image = base64Match[1].split(",")[1];
    const captchaSolution = await solver.imageCaptcha(base64Image);

    const captchaInputSelector = 'input[name="captchaText"]';
    await page.type(captchaInputSelector, captchaSolution.data, {delay: 100});

    const continueButtonSelector = "#appointment_captcha_month_appointment_showMonth";
    await page.click(continueButtonSelector);
    try {
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 });
    } catch (error) {
      console.log("Navigation timeout. Possibly due to slow loading...");
      await page.evaluate(() => window.stop()); // Force stop page loading
    }

    // Check if there is an error message indicating incorrect CAPTCHA
    const errorSelector = "div.global-error p";
    const errorExists = await page.$(errorSelector) !== null;
    if (errorExists) {
      console.error(`CAPTCHA was solved incorrectly on attempt ${attempt}. Retrying...`);
      await page.reload({ waitUntil: "domcontentloaded" }); // Reload the page to get a new CAPTCHA
      await solveCaptcha(attempt + 1); // Recursive call to try solving CAPTCHA again
    }
  }

  async function checkAppointmentsAvailable() {
    const availableLinkSelector = "a.arrow";
    const availabilityCheck = await page.$(availableLinkSelector);
    if (availabilityCheck) {
      console.log("Appointments are available. Proceeding with the booking...");
      return true;
    } else {
      console.log("No appointments available. Restarting the process...");
      await page.evaluate(() => window.stop()); // Force stop any ongoing loading
      await browser.close();
      setTimeout(startProcess, 1000); // Restart the process after a short pause
      return false;
    }
  }

  try {
    await page.goto("https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=kara&realmId=967&categoryId=2801", { waitUntil: "domcontentloaded" });
    await solveCaptcha();

    if (!await checkAppointmentsAvailable()) {
      // The script will automatically restart if appointments aren't available.
    }
  } catch (error) {
    console.error(`An error occurred during the booking process: ${error}`);
    await browser.close(); // Ensure the browser is closed on error
  }
}

startProcess().catch(console.error);
