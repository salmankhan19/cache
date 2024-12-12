const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";

(async () => {
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  async function solveCaptcha() {
    const captchaDivSelector = 'div[id^="_"]';
    await page.waitForSelector(captchaDivSelector, { timeout: 30000 });

    const captchaDiv = await page.$(captchaDivSelector);
    const style = await page.evaluate((element) => {
      return window.getComputedStyle(element).backgroundImage;
    }, captchaDiv);

    const base64Match = style.match(
      /url\(['"]?(data:image\/(?:jpg|jpeg|png|gif|bmp|webp;svg\+xml);base64,[^'"]+)['"]?\)/
    );
    if (!base64Match) {
      throw new Error("Could not find base64 image in background style");
    }

    const base64Image = base64Match[1].split(",")[1];
    const captchaSolution = await solver.imageCaptcha(base64Image);

    const captchaInputSelector = 'input[name="captchaText"]';
    await page.waitForSelector(captchaInputSelector, { timeout: 5000 });
    await page.type(captchaInputSelector, captchaSolution.data);

    const continueButtonSelector =
      "#appointment_captcha_month_appointment_showMonth";
    await page.waitForSelector(continueButtonSelector, { timeout: 5000 });
    await page.click(continueButtonSelector);
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    // Check if the error message is present
    const errorSelector = "div.global-error p";
    const errorExists = (await page.$(errorSelector)) !== null;
    if (errorExists) {
      console.error("CAPTCHA was solved incorrectly. Retrying...");
      return false; // Return false to indicate a failure
    }
    return true; // Return true to indicate success
  }

  try {
    // Navigate to the appointment page
    await page.goto(
      "https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=kara&realmId=967&categoryId=2801",
      { waitUntil: "domcontentloaded" }
    );

    let captchaSolved = await solveCaptcha();
    if (!captchaSolved) {
      // If the first attempt fails, try solving the captcha again
      console.log("Reloading the page to get a new CAPTCHA...");
      await page.reload();
      captchaSolved = await solveCaptcha();
      if (!captchaSolved) {
        throw new Error("Failed to solve CAPTCHA after multiple attempts.");
      }
    }

    // Continue with booking process if CAPTCHA is solved
    console.log("CAPTCHA solved successfully. Proceeding with the booking...");
    // Check if appointments are available and click the link
    const availableLinkSelector = "a.arrow";
    const isAvailable = await page.evaluate((selector) => {
      const link = document.querySelector(selector);
      return link && link.textContent.includes("Appointments are available");
    }, availableLinkSelector);

    if (isAvailable) {
      console.log("Appointments are available. Clicking the link...");
      await page.click(availableLinkSelector);
      await page.goto(
        "https://service2.diplo.de/rktermin/extern/appointment_showForm.do?locationCode=isla&realmId=190&categoryId=3239&dateStr=07.01.2025&openingPeriodId=78379",
        { waitUntil: "domcontentloaded" }
      );

      // if (availableSlot) {
      //   console.log(`Slot available at ${availableSlot.timeRange}. Booking now...`);
      //   console.log("Redirected to the booking form.");
      // } else {
      //   console.log("No available slots for booking.");
      // }

      // Fill in the booking form fields
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
      await page.select(
        "#appointment_newAppointmentForm_fields_1__content",
        "Für mich / For me"
      ); // For whom do you want to apply?
      await page.select(
        "#appointment_newAppointmentForm_fields_2__content",
        "1"
      ); // For how many children?
      await page.type("#fields3content", "01.01.1990"); // Example birth date

      // Wait for and solve the second CAPTCHA on the booking form
      const formCaptchaDivSelector = 'div[id^="_"]';
      await page.waitForSelector(formCaptchaDivSelector, { timeout: 30000 });

      const formCaptchaDiv = await page.$(formCaptchaDivSelector);
      const formStyle = await page.evaluate((element) => {
        return window.getComputedStyle(element).backgroundImage;
      }, formCaptchaDiv);

      const formBase64Match = formStyle.match(
        /url\(['"]?(data:image\/(?:jpg|jpeg|png|gif|bmp|webp|svg\+xml);base64,[^'"]+)['"]?\)/
      );
      if (!formBase64Match) {
        throw new Error("Could not find base64 image in background style");
      }

      const formBase64Image = formBase64Match[1].split(",")[1];
      const formCaptchaSolution = await solver.imageCaptcha(formBase64Image);

      const formCaptchaInputSelector =
        "#appointment_newAppointmentForm_captchaText";
      await page.waitForSelector(formCaptchaInputSelector, { timeout: 5000 });
      await page.type(formCaptchaInputSelector, formCaptchaSolution.data);

      // Submit the booking form
      const submitButtonSelector =
        "#appointment_newAppointmentForm_appointment_addAppointment";
      await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
      await page.click(submitButtonSelector);

      // Wait for the booking confirmation or error message
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      console.log("Booking form submitted successfully!");
    } else {
      console.log("No appointments available.");
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    console.log("Browser closed.");
    // await browser.close();
  }
})();
