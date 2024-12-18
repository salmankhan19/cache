const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";
const maxCaptchaAttempts = 50; // Limit the number of CAPTCHA retries to prevent infinite loops
const baseURL = "https://service2.diplo.de/rktermin/"; // Base URL for prepending

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
      // await browser.close();
      return false; // Stop the process after too many failed attempts
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
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 1000 });
    } catch (error) {
      console.log("Navigation timeout. Possibly due to slow loading...");
      await page.evaluate(() => window.stop()); // Force stop page loading
    }

    // Check if there is an error message indicating incorrect CAPTCHA
    const errorSelector = "div.global-error p";
    const errorExists = await page.$(errorSelector) !== null;
    if (errorExists) {
      console.error(`CAPTCHA was solved incorrectly on attempt ${attempt}. Retrying...`);
      // await page.reload({ waitUntil: "domcontentloaded" }); // Reload the page to get a new CAPTCHA
      await page.evaluate(() => window.stop()); // Force stop any ongoing loading
      await browser.close();
      setTimeout(startProcess, 1000); // Restart the process after a short pause
      // await solveCaptcha(attempt + 1); // Recursive call to try solving CAPTCHA again
    } else {
      return true; // CAPTCHA solved successfully
    }
  }

  // Step 2: Check for available appointments
  async function checkAppointmentsAvailable() {
    const availableLinkSelector = "a.arrow";
    const isAvailable = await page.evaluate((selector) => {
      const link = document.querySelector(selector);
      return link && link.textContent.includes("Appointments are available");
    }, availableLinkSelector);

    if (isAvailable) {
      console.log("Appointments are available. Clicking the link...");
      const href = await page.evaluate(() => {
        const link = document.querySelector("a.arrow");
        return link ? link.getAttribute("href") : null;
      });
      if (href) {
        const fullUrl = baseURL + href; // Prepend the base URL to the relative href
        console.log(`Navigating to: ${fullUrl}`);
        await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
        // Step 3: Check if slots are available
        return await checkSlotAvailability();
      }
    } else {
      console.log("No appointments available. Restarting the process...");
      await page.evaluate(() => window.stop()); // Force stop any ongoing loading
      await browser.close();
      setTimeout(startProcess, 1000); // Restart the process after a short pause
    }
    return false;
  }

 
  // Step 3: Check if slots are available and redirect to the correct slot if present
  async function checkSlotAvailability() {
    await page.waitForSelector("a.arrow", { timeout: 5000 }); // Ensure the page is fully loaded
    const arrows = await page.$$eval('a.arrow', links => links.map(link => ({
      href: link.getAttribute('href'),
      text: link.textContent.trim(),
    })));

    // Find the arrow with the exact text "Book this appointment"
    const targetArrow = arrows.find(arrow => arrow.text === "Book this appointment");

    if (targetArrow) {
      const fullUrl = baseURL + targetArrow.href; // Prepend the base URL to the relative href
      console.log("Slot available, redirecting to:", fullUrl);
      await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
      // await page.waitForSelector("a.arrow", { timeout: 5000 }); // Ensure that we wait for the next page to fully load
      return true;
    } else {
      console.log("No slots available. Restarting the process...");
      await page.evaluate(() => window.stop()); // Force stop any ongoing loading
      // await browser.close();
      setTimeout(startProcess, 1000); // Restart the process after a short pause
      return false;
    }
  }

  // Step 4: Fill the booking form
  async function fillBookingForm() {
    console.log("Filling in booking form...");

    await page.type("#appointment_newAppointmentForm_lastname", "Doe"); // Example last name
    await page.type("#appointment_newAppointmentForm_firstname", "John"); // Example first name
    await page.type("#appointment_newAppointmentForm_email", "john.doe@example.com"); // Example email
    await page.type("#appointment_newAppointmentForm_emailrepeat", "john.doe@example.com"); // Repeat email
    await page.type("#appointment_newAppointmentForm_fields_0__content", "123456789"); // Passport number
    await page.select("#appointment_newAppointmentForm_fields_1__content", "Für mich / For me"); // For whom?
    await page.select("#appointment_newAppointmentForm_fields_2__content", "1"); // For how many children?
    await page.type("#appointment_newAppointmentForm_fields_3__content", "01.01.1990"); // Example birth date

    const submitButtonSelector = "#appointment_newAppointmentForm_appointment_addAppointment";
    await page.click(submitButtonSelector);
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });

    console.log("Booking form submitted successfully!");
  }

  try {
    // Start the process by visiting the base URL
    await page.goto(
      "https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=kara&realmId=967&categoryId=2801",
      { waitUntil: "domcontentloaded" }
    );

    const captchaSolved = await solveCaptcha();
    if (captchaSolved) {
      const appointmentAvailable = await checkAppointmentsAvailable();
      if (appointmentAvailable) {
        await fillBookingForm(); // If appointment and slot available, fill the form
      }
    }

  } catch (error) {
    console.error(`An error occurred during the booking process: ${error}`);
    // await browser.close();
  }
}

// Start the process
startProcess().catch(console.error);
