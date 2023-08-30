const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const extractFeatures = async (page, brandName) => {
  return await page.evaluate((brandName) => {
    const features = [];
    const allElements = document.querySelectorAll('body *');
    let brandNameOccurrences = 0;
    const brandNamePositions = [];

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase();
      const attrs = Array.from(element.attributes).map(attr => `${attr.name}=${attr.value}`).join(';');
      const text = element.textContent ? element.textContent.trim().toLowerCase() : '';

      features.push({ tagName, attrs, text });

      if (text.includes(brandName.toLowerCase())) {
        brandNameOccurrences++;
        brandNamePositions.push(index);
      }
    });

    return { features, brandNameOccurrences, brandNamePositions };
  }, brandName);
};

const similarity = (listA, listB) => {
  const counter = arr => arr.reduce((acc, val) => ({ ...acc, [val]: (acc[val] || 0) + 1 }), {});
  const counterA = counter(listA);
  const counterB = counter(listB);

  const commonScore = Object.keys(counterA).reduce((acc, key) => acc + Math.min(counterA[key], counterB[key] || 0), 0);
  const totalScore = listA.length + listB.length;

  return Math.min(1, 2 * commonScore / totalScore);
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const filePath = path.join(__dirname, 'ListURLs.txt');
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).map(line => {
    const [url, brandName] = line.split('\t');
    return [url, brandName.trim()];
  });

  const [mainUrl, mainBrandName] = lines[0];
  await page.goto(mainUrl);
  await page.waitForTimeout(5000);

  const { features: mainFeatures, brandNameOccurrences: mainBrandNameOccurrences, brandNamePositions: mainBrandNamePositions } = await extractFeatures(page, mainBrandName);

  console.log(`Comparing against template: ${mainUrl}`);
  console.log("----------------------------------------------------------");
  console.log("| URL | Structural Similarity | Content Similarity | Brand Name Match |");
  console.log("----------------------------------------------------------");

  for (const [url, brandName] of lines) {
    await page.goto(url);
    await page.waitForTimeout(5000);

    const { features, brandNameOccurrences, brandNamePositions } = await extractFeatures(page, brandName);

    const structuralSim = similarity(mainFeatures.map(f => `${f.tagName},${f.attrs},${f.text}`), features.map(f => `${f.tagName},${f.attrs},${f.text}`)) * 100;
    const contentSim = similarity(mainFeatures.map(f => f.text), features.map(f => f.text)) * 100;

    let brandNameMatchLabel = 'MATCH';
    if (mainBrandNameOccurrences !== brandNameOccurrences) {
      brandNameMatchLabel = 'Count Mismatch';
    } else if (JSON.stringify(mainBrandNamePositions) !== JSON.stringify(brandNamePositions)) {
      brandNameMatchLabel = 'Position Mismatch';
    }

    console.log(`| ${url} | ${structuralSim.toFixed(2)}% | ${contentSim.toFixed(2)}% | ${brandNameMatchLabel} |`);
    console.log("----------------------------------------------------------");
  }

  await browser.close();
};

main().catch(console.error);