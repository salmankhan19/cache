const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");
const moment = require("moment"); // Import moment for time handling

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";
const maxCaptchaAttempts = 50;
const baseURL = "https://service2.diplo.de/rktermin/"; // Base URL for prepending

// Utility function to wait until the exact target time
async function waitUntilTime(targetTime) {
  let currentTime = moment();
  let targetMoment = moment(targetTime, "HH:mm:ss");

  // If the target time is already passed for today, wait for tomorrow
  if (currentTime.isAfter(targetMoment)) {
    targetMoment.add(1, "days"); // Add 1 day if the target time has already passed
  }

  const waitDuration = targetMoment.diff(currentTime); // Calculate the difference in milliseconds
  console.log(`Waiting until ${targetMoment.format("HH:mm:ss")}...`);
  return new Promise((resolve) => setTimeout(resolve, waitDuration)); // Wait until the target time
}

async function startProcess() {
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Step 1: Solve the CAPTCHA
  async function solveCaptcha(attempt = 1) {
    if (attempt > maxCaptchaAttempts) {
      console.error("Exceeded maximum CAPTCHA retry attempts.");
      await browser.close();
      return false;
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
    await page.type(captchaInputSelector, captchaSolution.data, { delay: 100 });

    // Wait until 3:59:00 before reloading the page
    await waitUntilTime("03:59:00");

    console.log("Reloading the page at 3:59:00...");
    await page.reload({ waitUntil: "domcontentloaded" }); // Reload page

    // Solve CAPTCHA again after reloading
    await page.waitForSelector(captchaDivSelector, { timeout: 30000 });
    await page.type(captchaInputSelector, captchaSolution.data, { delay: 100 });

    // Wait until exactly 4:00:00 to click the continue button
    await waitUntilTime("04:00:00");

    const continueButtonSelector =
      "#appointment_captcha_month_appointment_showMonth";
    await page.click(continueButtonSelector);
    try {
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 1000,
      });
    } catch (error) {
      console.log("Navigation timeout. Possibly due to slow loading...");
      await page.evaluate(() => window.stop()); // Force stop page loading
    }

    // Check if there is an error message indicating incorrect CAPTCHA
    const errorSelector = "div.global-error p";
    const errorExists = (await page.$(errorSelector)) !== null;
    if (errorExists) {
      console.error(
        `CAPTCHA was solved incorrectly on attempt ${attempt}. Retrying...`
      );
      await solveCaptcha(attempt + 1); // Recursive call to try solving CAPTCHA again
    } else {
      console.log("CAPTCHA solved successfully!");
      return true; // CAPTCHA solved successfully
    }
  }
  try {
    // Start the process by visiting the base URL
    await page.goto(
      "https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=isla&realmId=534&categoryId=3232",
      { waitUntil: "domcontentloaded" }
    );
    await solveCaptcha();

    // const captchaSolved = await solveCaptcha();
    //     if (captchaSolved) {
    //       const appointmentAvailable = await checkAppointmentsAvailable();
    //       if (appointmentAvailable) {
    //         await fillBookingForm(); // If appointment and slot available, fill the form
    //       }
    //     }
  } catch (error) {
    console.error(`An error occurred during the booking process: ${error}`);
    // await browser.close();
  }
}

// Start the CAPTCHA solving process

startProcess();
