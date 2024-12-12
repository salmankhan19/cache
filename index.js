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

  try {
    // Navigate to the appointment page
    await page.goto(
      "https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=kara&realmId=967&categoryId=2801",
      { waitUntil: "domcontentloaded" }
    );

    // Wait for and solve the first CAPTCHA
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
    await page.waitForSelector(captchaInputSelector, { timeout: 5000 });
    await page.type(captchaInputSelector, captchaSolution.data);

    // Submit CAPTCHA form and wait for the page to load
    const continueButtonSelector =
      "#appointment_captcha_month_appointment_showMonth";
    await page.waitForSelector(continueButtonSelector, { timeout: 5000 });
    await page.click(continueButtonSelector);
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 });

    // Check if appointments are available and click the link
    const availableLinkSelector = 'a.arrow';
    const isAvailable = await page.evaluate((selector) => {
      const link = document.querySelector(selector);
      return link && link.textContent.includes("Appointments are available");
    }, availableLinkSelector);

    if (isAvailable) {
      console.log("Appointments are available. Clicking the link...");
      await page.click(availableLinkSelector);

      // Wait for the booking form to load
      // await page.waitForSelector('#appointment_newAppointmentForm', { timeout: 10000 });
      // Check for available booking slots
      // const slots = await page.evaluate(() => {
      //   const slotDivs = Array.from(document.querySelectorAll('div[style="width: 100%;"]'));
      //   return slotDivs.map((slot) => {
      //     const timeRange = slot.querySelector("h4")?.innerText?.trim() || null;
      //     const noAppointmentsText = slot.querySelector("h5")?.innerText?.trim() || null;
      //     const bookingLink = slot.querySelector('a.arrow')?.href || null;

      //     return { timeRange, noAppointmentsText, bookingLink };
      //   });
      // });

      // const availableSlot = slots.find((slot) => slot.bookingLink);
      await page.goto(' https://service2.diplo.de/rktermin/extern/appointment_showForm.do?locationCode=kara&realmId=967&categoryId=2801&dateStr=09.01.2025&openingPeriodId=6849', { waitUntil: "domcontentloaded" });

      // if (availableSlot) {
      //   console.log(`Slot available at ${availableSlot.timeRange}. Booking now...`);
      //   console.log("Redirected to the booking form.");
      // } else {
      //   console.log("No available slots for booking.");
      // }

      // Fill in the booking form fields
      await page.type("#appointment_newAppointmentForm_lastname", "Ahmed khan"); // Example last name
      await page.type("#appointment_newAppointmentForm_firstname", "Salman"); // Example first name
      await page.type(
        "#appointment_newAppointmentForm_email",
        "salmankhan199264@gmail.com"
      ); // Example email
      await page.type(
        "#appointment_newAppointmentForm_emailrepeat",
        "salmankhan199264@gmail.com"
      ); // Repeat email
      await page.type(
        "#appointment_newAppointmentForm_fields_0__content",
        "DJ4141072"
      ); // Passport number
      await page.select(
        "#appointment_newAppointmentForm_fields_1__content",
        "sindh"
      ); // For whom do you want to apply?
      await page.select(
        "#appointment_newAppointmentForm_fields_2__content",
        "Pakistan"
      ); // For how many children?
  
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

      const formCaptchaInputSelector = '#appointment_newAppointmentForm_captchaText';
      await page.waitForSelector(formCaptchaInputSelector, { timeout: 5000 });
      await page.type(formCaptchaInputSelector, formCaptchaSolution.data);

      // Submit the booking form
      const submitButtonSelector =
        "#appointment_newAppointmentForm_appointment_addAppointment";
      await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
      // await page.click(submitButtonSelector);

      // Wait for the booking confirmation or error message
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 });
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
