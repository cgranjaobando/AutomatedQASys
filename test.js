// Import required modules
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Initialize Express app and port
const app = express();
const port = 3000;

// Middleware for parsing JSON payloads
app.use(express.json());

// Function to extract features from a web page
const extractFeatures = async (page, brandName) => {
  // Evaluate JavaScript on the page to collect features
  return await page.evaluate((brandName) => {
    const features = [];
    const allElements = document.querySelectorAll('body *');
    let brandNameOccurrences = 0;
    const brandNamePositions = [];

    // Loop through all DOM elements to extract tags, attributes, and text
    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase();
      const attrs = Array.from(element.attributes).map(attr => `${attr.name}=${attr.value}`).join(';');
      const text = element.textContent ? element.textContent.trim().toLowerCase() : '';

      features.push({ tagName, attrs, text });

      // Count occurrences and positions of the brand name
      if (text.includes(brandName.toLowerCase())) {
        brandNameOccurrences++;
        brandNamePositions.push(index);
      }
    });

    return { features, brandNameOccurrences, brandNamePositions };
  }, brandName);
};

// Function to calculate similarity between two lists
const similarity = (listA, listB) => {
  // Count occurrences of each unique item in both lists
  const counter = arr => arr.reduce((acc, val) => ({ ...acc, [val]: (acc[val] || 0) + 1 }), {});
  const counterA = counter(listA);
  const counterB = counter(listB);

  // Calculate the commonality score
  const commonScore = Object.keys(counterA).reduce((acc, key) => acc + Math.min(counterA[key], counterB[key] || 0), 0);
  const totalScore = listA.length + listB.length;

  // Calculate similarity based on commonality
  return Math.min(1, 2 * commonScore / totalScore);
};

// Function to validate URLs
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// POST endpoint to analyze URLs
app.post('/analyze', async (req, res) => {
  // Validation checks for incoming payload
  const payload = req.body;
  if (typeof payload !== 'object' || !Array.isArray(payload.urls)) {
    return res.status(400).json({ error: "Invalid input format. Expected an object with a 'urls' array." });
  }
  
  // More validation checks (e.g., URL validity)
  for (const [url, brandName] of payload.urls) {
    if (typeof url !== 'string' || typeof brandName !== 'string') {
      return res.status(400).json({ error: "Invalid data types. Both URL and brand name should be strings." });
    }
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: `Invalid URL: ${url}` });
    }
  }

  // Implement the main logic for analyzing URLs
  try {
    // Initialize Playwright browser and page
    const browser = await chromium.launch();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537'
    });
    const page = await context.newPage();

    // Navigate to the main URL and extract features
    const [mainUrl, mainBrandName] = payload.urls[0];
    await page.goto(mainUrl, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(5000);
    const { features: mainFeatures, brandNameOccurrences: mainBrandNameOccurrences, brandNamePositions: mainBrandNamePositions } = await extractFeatures(page, mainBrandName);

    // Loop through all URLs to compare and analyze
    const results = [];
    for (const [url, brandName] of payload.urls) {
      await page.goto(url);
      await page.waitForTimeout(5000);

      // Extract features and calculate similarity
      const { features, brandNameOccurrences, brandNamePositions } = await extractFeatures(page, brandName);
      const structuralSim = (similarity(mainFeatures.map(f => `${f.tagName},${f.attrs},${f.text}`), features.map(f => `${f.tagName},${f.attrs},${f.text}`)) * 100).toFixed(2);
      const contentSim = (similarity(mainFeatures.map(f => f.text), features.map(f => f.text)) * 100).toFixed(2);

      // Check for brand name match/mismatch
      let brandNameMatchLabel = 'MATCH';
      if (mainBrandNameOccurrences !== brandNameOccurrences) {
        brandNameMatchLabel = 'Count Mismatch';
      } else if (JSON.stringify(mainBrandNamePositions) !== JSON.stringify(brandNamePositions)) {
        brandNameMatchLabel = 'Position Mismatch';
      }

      results.push({ url, structuralSim, contentSim, brandNameMatch: brandNameMatchLabel });
    }

    await browser.close();

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET endpoint to check if the server is running
app.get('/', (req, res) => {
  res.send('Server is running. Use POST /analyze to analyze URLs.');
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});