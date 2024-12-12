const puppeteer = require("puppeteer");
const { Solver } = require("2captcha");

const solver = new Solver("0ed306b4166e9c81e9c3c01222af4a1a");
const isHeadless = process.env.HEADLESS === "true";
const timeZoneOffset = 5; // Offset for Pakistan Standard Time (UTC+5)

(async () => {
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  const waitUntilTargetTime = (hour, minute, second) => {
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(hour - timeZoneOffset, minute, second, 0); // Adjust by time zone

    const msToTargetTime = targetTime.getTime() - now.getTime();
    return Math.max(0, msToTargetTime); // Ensure non-negative delay
  };

  async function solveAndSubmitCaptcha() {
    try {
      await page.goto("https://service2.diplo.de/rktermin/extern/appointment_showMonth.do?locationCode=isla&realmId=190&categoryId=3239", { waitUntil: "domcontentloaded" });
      
      // Locate and decode the CAPTCHA
      const captchaDivSelector = 'div[id^="_"]';
      await page.waitForSelector(captchaDivSelector, { timeout: 30000 });
      const captchaDiv = await page.$(captchaDivSelector);
      const style = await page.evaluate(element => element.style.backgroundImage, captchaDiv);
      
      const base64Match = style.match(/url\("data:image\/\w+;base64,([^"]+)"\)/);
      if (!base64Match) throw new Error("CAPTCHA image not found.");

      // Solve the CAPTCHA
      const captchaSolution = await solver.imageCaptcha(base64Match[1]);
      await page.type('input[name="captchaText"]', captchaSolution.data, { delay: 50 });

      // Calculate delay for CAPTCHA submission exactly at 4:00 AM
      const delayForSubmission = waitUntilTargetTime(2, 28, 0); // 4:00 AM exactly
      setTimeout(async () => {
        // Submit CAPTCHA
        const continueButtonSelector = "#appointment_captcha_month_appointment_showMonth";
        await page.click(continueButtonSelector);
        await page.waitForNavigation({ waitUntil: "domcontentloaded" });
        console.log("Captcha submitted at exactly 4:00 AM");

        // Check for appointments and proceed
        if (await checkAppointmentsAvailable()) {
          await fillBookingForm();
        } else {
          console.log("No appointments available.");
          await browser.close();
        }
      }, delayForSubmission);
    } catch (error) {
      console.error("Error processing CAPTCHA and form:", error);
      await browser.close();
    }
  }

  async function checkAppointmentsAvailable() {
    const availableLinkSelector = 'a.arrow';
    const isAvailable = await page.$eval(availableLinkSelector, el => el.textContent.includes("Appointments are available"));
    if (isAvailable) {
      await page.click(availableLinkSelector);
      await page.waitForNavigation({ waitUntil: "domcontentloaded" });
      return true;
    }
    return false;
  }

  async function fillBookingForm() {
    console.log("Filling in the booking form...");
    // Fill in form details as previously detailed
    const submitButtonSelector = "#appointment_newAppointmentForm_appointment_addAppointment";
    await page.click(submitButtonSelector);
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    console.log("Booking form submitted successfully!");
    await browser.close();
  }

  await solveAndSubmitCaptcha();
})();
