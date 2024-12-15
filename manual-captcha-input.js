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

  // Step 1: Skip CAPTCHA solving and wait for manual CAPTCHA solution
  async function waitForContinueButton() {
    console.log(
      "Please solve the CAPTCHA manually and click the 'Continue' button."
    );

    // Wait for the page to load after CAPTCHA and the continue button to appear
    await page.waitForSelector(
      "#appointment_captcha_month_appointment_showMonth",
      { timeout: 0 }
    );

    // Now, wait for the redirection after the CAPTCHA is solved manually
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });

    console.log("CAPTCHA solved manually, continuing the process...");
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
      setTimeout(startProcess, 1000); // Restart the process after a short pause
    }
    return false;
  }

  // Step 3: Check if slots are available and redirect to the correct slot if present
  async function checkSlotAvailability() {
    await page.waitForSelector("a.arrow", { timeout: 5000 }); // Ensure the page is fully loaded
    const arrows = await page.$$eval("a.arrow", (links) =>
      links.map((link) => ({
        href: link.getAttribute("href"),
        text: link.textContent.trim(),
      }))
    );

    // Find the arrow with the exact text "Book this appointment"
    const targetArrow = arrows.find(
      (arrow) => arrow.text === "Book this appointment"
    );

    if (targetArrow) {
      const fullUrl = baseURL + targetArrow.href; // Prepend the base URL to the relative href
      console.log("Slot available, redirecting to:", fullUrl);
      await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
      return true;
    } else {
      console.log("No slots available. Restarting the process...");
      await page.evaluate(() => window.stop()); // Force stop any ongoing loading
      setTimeout(startProcess, 1000); // Restart the process after a short pause
      return false;
    }
  }

  // Step 4: Fill the booking form
  // async function fillBookingForm() {
  //   console.log("Filling in booking form...");

  //   await page.type("#appointment_newAppointmentForm_lastname", "Doe"); // Example last name
  //   await page.type("#appointment_newAppointmentForm_firstname", "John"); // Example first name
  //   await page.type("#appointment_newAppointmentForm_email", "john.doe@example.com"); // Example email
  //   await page.type("#appointment_newAppointmentForm_emailrepeat", "john.doe@example.com"); // Repeat email
  //   await page.type("#appointment_newAppointmentForm_fields_0__content", "123456789"); // Passport number
  //   await page.select("#appointment_newAppointmentForm_fields_1__content", "Für mich / For me"); // For whom?
  //   await page.select("#appointment_newAppointmentForm_fields_2__content", "1"); // For how many children?
  //   await page.type("#appointment_newAppointmentForm_fields_3__content", "01.01.1990"); // Example birth date

  //   const submitButtonSelector = "#appointment_newAppointmentForm_appointment_addAppointment";
  //   await page.click(submitButtonSelector);
  //   await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  //   console.log("Booking form submitted successfully!");
  // }
  async function fillBookingForm() {
    console.log("Filling in booking form...");

    // Fill form fields
    await page.type("#appointment_newAppointmentForm_lastname", "Doe"); // Example last name
    await page.type("#appointment_newAppointmentForm_firstname", "John"); // Example first name
    await page.type(
      "#appointment_newAppointmentForm_email",
      "john.doe@example.com"
    ); // Example email
    await page.type(
      "#appointment_newAppointmentForm_emailrepeat",
      "john.doe@example.com"
    ); // Repeat email
    await page.type(
      "#appointment_newAppointmentForm_fields_0__content",
      "123456789"
    ); // Passport number
    // await page.select(
    //   "#appointment_newAppointmentForm_fields_1__content",
    //   "sindh"
    // ); // For whom?
    // await page.select("#appointment_newAppointmentForm_fields_2__content", "pakistan"); // For how many children?

    // await page.select(
    //   "#appointment_newAppointmentForm_fields_1__content",
    //   "Für mich / For me"
    // ); // For whom?
    // await page.select("#appointment_newAppointmentForm_fields_2__content", "1"); // For how many children?
    // await page.type(
    //   "#appointment_newAppointmentForm_fields_3__content",
    //   "01.01.1990"
    // ); // Example birth date

    // Solve the CAPTCHA
    console.log("Solving CAPTCHA on the booking form...");
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

    // Submit the form
    console.log("Submitting the form...");
    const submitButtonSelector =
      "#appointment_newAppointmentForm_appointment_addAppointment";
    // await page.click(submitButtonSelector);
    console.log("submit ");

    try {
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      console.log("Booking form submitted successfully!");
    } catch (error) {
      console.log(
        "Navigation timeout after form submission. Check if CAPTCHA was solved successfully."
      );
    }
  }

  try {
    // Start the process by visiting the base URL
    await page.goto(
      "https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=isla&realmId=534&categoryId=3232",
      { waitUntil: "domcontentloaded" }
    );

    // Wait for the manual CAPTCHA solution and click continue
    await waitForContinueButton();

    // Now continue with the automated steps
    const appointmentAvailable = await checkAppointmentsAvailable();
    if (appointmentAvailable) {
      await fillBookingForm(); // If appointment and slot available, fill the form
    }
  } catch (error) {
    console.error(`An error occurred during the booking process: ${error}`);
  }
}

// Start the process
startProcess().catch(console.error);
