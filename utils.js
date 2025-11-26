const scrollDown = async (page, scrollCount) => {

    console.log('Scrolling to bottom...');

    let previousHeight = 0;
    for (let i = 0; i < scrollCount; i++) {
      const currentHeight = await page.evaluate('document.body.scrollHeight');
      if (currentHeight === previousHeight) break;
      previousHeight = currentHeight;

      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(1000);
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    scrollDown,
    sleep
}