// import necessary tools
import 'dotenv/config'; // loads .env variables into process.env
import { GoogleGenerativeAI } from "@google/generative-ai";
import mongoose from 'mongoose'; // the database translator
import express, { application } from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// initialize gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// initialize app
const app = express();
app.use(cors()); // used to accept requests from React app
app.use(express.json()); // allows app to understand JSON sent to it

// cloud handshake
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to Grocery Cloud Database'))
    .catch(err => console.error('Databases Connection Error:', err));

// reusable function to get text from a URL
async function getStoreData(url, product) {

    // TEST
    `
    const browser = await puppeteer.launch({
        headless: false, // show the browser
        slowMo: 100 // slow down actions by 100ms
    });
    `
    const browser = await puppeteer.launch({
        headless: false,
        protocolTimeout: 60000, // increase timeout to 60s for slow-loading pages
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-fake-ui-for-media-stream',
            '--incognito', // starts fresh to avoid "sticky" bot flags
            '--start-maximized', // forces the window to start large
            '--window-size=1920,1080', // look like a standard laptop screen
            '--deny-permission-prompts', // block any permission popups
            '--disable-notifications', // block notifications
            '--user-data-dir=./user_data_profile', // persistent sesssion
            '--disable-blink-features=AutomationControlled' // hide the "bot" flag
        ]
    }); // opens a visible browser

    const page = await browser.newPage();

    // FIXME: resource blocking
    ` await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType()) ||
            url.endsWith('.svg') || url.includes('ads')) {
            req.abort();
        } else {
            req.continue();
        }
    }); `


    // human-like mouse movement to avoid future detection
    async function humanMove(page, toX, toY) {
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            await page.mouse.move(100 + (toX / steps) * i, 100 + (toY / steps) * i);
            await new Promise(r => setTimeout(r, Math.random() * 50));
        }
    }

    // use it before scraping
    await humanMove(page, 400, 300);
    await new Promise(r => setTimeout(r, 2000));

    // set a realistic viewport size
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // DEBUG: capture the first 50000 characters immediately
        const rawHTML = await page.content();
        const snippet = rawHTML.slice(0, 50000);
        fs.writeFileSync('debug-snippet.html', snippet);
        console.log("Saved initial HTML snippet to debug-snippet.html for inspection.");

        // Festival Food's specific bypass
        if (url.includes('festfoods.com')) {
            try {

                // jump directly to the store locator to avoid the dropdown
                await page.goto('https://www.festfoods.com/my-store/store-locator', { waitUntil: 'domcontentloaded' });
                await new Promise(r => setTimeout(r, 7000));

                const closeBtn = 'button[aria-label="Close"]';

                await new Promise(r => setTimeout(r, 3000));
                // short timeout for popup that might not appear
                await page.waitForSelector(closeBtn, { visible: true, timeout: 3000 });
                await page.click(closeBtn);

                // wait for input to appear and enter the zip code
                await page.waitForSelector('input[placeholder="Enter City and State, or Postal Code"]', { timeout: 10000 });
                await page.type('input[placeholder="Enter City and State, or Postal Code"]', '54911', { timeout: 200 });

                // press enter to search
                await new Promise(r => setTimeout(r, 3000));
                await page.keyboard.press('Enter');

                const diagnostics = await page.evaluate(() => {
                    return {
                        hasJQuery: typeof jQuery !== 'undefined',
                        hasCash: typeof $ !== 'undefined',
                        buttonCount: document.querySelectorAll('a[role="button"]').length,
                        visibleText: document.body.innerText.includes("Make this my store"),
                        allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => id.includes('store'))
                    };
                });

                console.log("Browser Diagnostics:", diagnostics);

                // wait for the ID to be present
                await page.waitForSelector('#fp=aria-store-selection', { timeout: 10000 });

                await page.evaluate(() => {

                    // use jQuery to find the 'Make this' link
                    const $storeLink = jQuery('#fp=aria-store-dropdown-menu a, #store-locator a').filter(function () {
                        return /Make this/i.test(jQuery(this).text());
                    });

                    if ($storeLink.length > 0) {
                        $storeLink[0].click(); // trigger the first one found
                    } else {

                        // fallback: click the main indicator if the text is still not found
                        const indicator = document.getElementById('user-store-indicator');
                        if (indicator) indidcator.click();
                    }
                });
            } catch (error) {
                console.log("Festival Foods bypass failed.");
            }
        }

        // Woodman's Specific Bypass
        if (url.includes('shopwoodmans.com')) {
            console.log("Woodman's location prompt detected...");
            try {

                // wait for the zip code input to appear
                await page.waitForSelector('input[autocomplete="postal-code"]', { timeout: 10000 });
                await page.type('input[autocomplete="postal-code"]', '54911');

                // click the start shopping button
                await page.click('button[type="submit"]');

                // select "In-Store"
                // use a waitForFunction to ensure the modal's buttons have rendered
                await page.waitForFunction(() =>
                    Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('In-Store')),
                    { timeout: 10000 }
                );

                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const inStoreBtn = buttons.find(b => b.innerText.includes('In-Store'));
                    if (inStoreBtn) inStoreBtn.click();
                });

                // click the "Confirm" button
                await page.waitForFunction(() =>
                    Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Confirm'),
                    { timeout: 10000 }
                );

                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const confirmBtn = buttons.find(b => b.innerText.trim() === 'Confirm');
                    if (confirmBtn) confirmBtn.click();
                })

                console.log("Woodman's location prompt bypassed successfully.");

                // wait for the search bar to be available, then search for product
                try {

                    await new Promise(r => setTimeout(r, 3000));
                    const searchInputSelector = '#search-bar-input';
                    await page.waitForSelector(searchInputSelector);
                    await page.type(searchInputSelector, product, { delay: 100 });
                    await page.keyboard.press('Enter');
                } catch (searchErr) {
                    console.error("Automatic search entry failed:", searchErr.message)
                }
            } catch (e) {
                console.log("No zip prompt detected, continuing...");
            }
        }

        await new Promise(r => setTimeout(r, 10000)); // initial wait for page to load

        // scroll to trigger lazy loading and capture maximum html
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 2000));

        // grab text only after page is confirmed to be ready
        const cleanText = await page.evaluate(() => {

            // remove the large black stars on Walmart's website
            document.querySelectorAll('svg, i, icon, [class*="icon"]').forEach(el => el.remove());

            // grab only the relevant text
            const main = document.querySelector('main') || document.body;
            return main.innerText;
        });

        // for debugging: save the raw HTML
        const fullHTML = await page.content();
        fs.writeFileSync('debug-page.html', fullHTML);
        console.log("Saved full HTML to debug-page.html for inspection.");

        await browser.close();
        return cleanText.slice(0, 15000); // only return the most relevant products
    } catch (err) {

        // even if page fails, get a screenshot of the error
        await page.screenshot({ path: 'error-screen.png' });
        console.error("Scraping failed:", err.message);
        await browser.close();
        return ""; // return empty string so the AI logic doesn't crash
    }
}

// define schema & model for Grocery Items
const grocerySchema = new mongoose.Schema({
    storeName: { type: String, required: true },
    itemName: { type: String, required: true },
    // address: { type: String, required: true },
    price: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now } // when the price was last updated
});

// define schema & model for Stores
const storeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    brand: { type: String, required: true },
    address: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now } // when the store was last updated
});

// creates the model (like constructor for database items)
const GroceryItem = mongoose.model('GroceryItem', grocerySchema);
const Store = mongoose.model('Store', storeSchema);

app.get('/clear-db', async (req, res) => {
    try {
        await GroceryItem.deleteMany({});
    } catch (error) {
        console.error("Database Clear Error:", error);
        return res.status(500).send("Error clearing database.");
    }
    res.send("Database cleared.");
});

// use an in-memory cache to reduce external network calls
const geoCache = {
    "Appleton, WI": { lat: 44.2623, lon: -88.4071 },
    "Appleton": { lat: 44.2623, lon: -88.4071 },
    "Madison, WI": { lat: 43.0731, lon: -89.4012 },
};

// convert user's inputted address to coordinates
async function geocodeCoordinates(location) {

    // check cache first
    if (geoCache[location]) {
        console.log(`Using cached coordinates for ${location}`);
        return geoCache[location];
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`, {
        headers: {
            'User-Agent': 'GroceryPriceComparisonApp/1.0 (oendemann@wisc.edu)' // user-agent so OSM doesn't block the program
        }
    });

    // check if the response is actually JSON before parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error("OSM Error Page:", text);
        throw new Error('OSM blocked the request or returned an error page');
    }

    const data = await response.json();
    if (data.length === 0) throw new Error('Location not found');
    return { lat: data[0].lat, lon: data[0].lon };
}

const nearbyStoreCache = {};

// find stores within a certain radius
async function getNearbyStores(lat, lon, radiusInMiles) {

    // check MongoDB first (Persistent Cache)
    const existingStores = await Store.find({});
    if (existingStores.length > 0) {
        console.log("Using stores from MongoDB cache.");
        return existingStores;
    }

    // if DB is empty, only then hit the API

    const radiusInMeters = radiusInMiles * 1609.34; // convert miles to meters
    const query = `
        [out:json];
        (
            node["shop"~"supermarket|supercenter|pharmacy|department_store|clothes"](around:${radiusInMeters},${lat},${lon});\
            way["shop"~"supermarket|supercenter|pharmacy|department_store|clothes"](around:${radiusInMeters},${lat},${lon});\
        );
        out body center;
    `;
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);

    // check if the response is actually JSON before parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error("Overpass API Error Page:", text.slice(0, 100));
        throw new Error('Overpass API blocked the request or returned an error page');
    }

    const data = await response.json();

    // map the OSM data into a simple list of store names
    return data.elements.map(e => {
        const houseNumber = e.tags["addr:housenumber"] || "";
        const street = e.tags["addr:street"] || "";
        const city = e.tags["addr:city"] || "";
        const zip = e.tags["addr:postcode"] || "";

        // combine the parts into a single usable string
        const fullAddress = `${houseNumber} ${street}, ${city}, ${zip}`.trim().replace(/^,|,$/g, '');

        return {
            name: e.tags.name || "Unknown Store",
            brand: e.tags["brand"] || e.tags.name || "Generic",
            address: fullAddress || "Address details missing in map data"
        };
    });
}

const storeBaseUrls = {
    "Walmart": "https://www.walmart.com/search/?query=",
    "Aldi": "https://www.aldi.us/en/search/?query=",
    "Pick n' Save": "https://www.picknsave.com/search?query=",
    "Target": "https://www.target.com/s?searchTerm=",
    "Kroger": "https://www.kroger.com/search?query=",
    "Meijer": "https://www.meijer.com/search?query=",
    "Costco": "https://www.costco.com/CatalogSearch?dept=All&keyword=",
    "Dollar General": "https://www.dollargeneral.com/search.html?searchTerm=",
    "Walgreens": "https://www.walgreens.com/",
    "Woodman's": "https://shopwoodmans.com/store/woodmans-food-markets/search-results?q=",
    "Festival Foods": "https://www.festfoods.com/shop/search?q=",
    "Publix": "https://www.publix.com/search?query=",
    "Piggly Wiggly": "https://order.shopthepig.com/store/shopthepig/storefront",
    "Marshalls": "https://www.marshalls.com/us/store/shop/?_dyncharset=utf-8&searchTerm=",
    "Khol's": "https://www.kohls.com/search.jsp?search="
}

app.get('/api/search', async (req, res) => {

    // get the parameters
    const product = req.query.product;
    const location = req.query.location;
    const radius = parseFloat(req.query.radius) || 5; // default to 5 miles if not provided

    if (!product || !location) {
        return res.status(400).json({ error: "Missing product or location." });
    }

    try {

        // find coordinates and nearby stores
        const coords = await geocodeCoordinates(location);
        const discoveredStores = await getNearbyStores(coords.lat, coords.lon, radius || 5); // default to 5 miles

        // save these stores to your long-term database
        if (discoveredStores.length > 0) {
            const storeOps = discoveredStores.map(store => ({
                updateOne: {
                    filter: { address: store.address }, // use address as unique key
                    update: {
                        // $setOnInsert ONLY sets the data if the store is new to the database
                        $setOnInsert: {
                            name: store.name,
                            brand: store.brand,
                            address: store.address,
                            updatedAt: Date.now()
                        }
                    },
                    upsert: true
                }
            }));
            await Store.bulkWrite(storeOps);
            console.log(`Updated ${discoveredStores.length} stores in your local map.`);
        }

        // check if the item exists and is less than a week old
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const existingItems = await GroceryItem.find({
            itemName: new RegExp(product, 'i'),
            updatedAt: { $gte: oneWeekAgo }
        });

        // delete old data from database
        // await GroceryItem.deleteMany({});
        // console.log("Old database format erased.");

        if (existingItems.length > 0) {
            console.log("Serving fresh cached data.");
            return res.json(existingItems);
        } else {

            // delete stale data from user's specific search
            await GroceryItem.deleteMany({
                itemName: new RegExp(product, 'i'),
                updatedAt: { $lt: oneWeekAgo }
            });

            // if not found or stale, run the scraper
            console.log("Data stale or missing. Scraping live prices...");

            // create a list to hold ALL results
            let allResults = [];
            console.log(`Scraping up to ${discoveredStores.length} stores...`);

            // keep track of brands already scraped
            const scrapedBrands = new Set();

            for (const store of discoveredStores) {

                // FIXME: skip all other stores but Woodman's for a functional demo
                if (store.brand != "Woodman's") {
                    console.log("Skipping all other stores but Woodman's...");
                    continue;
                }

                // match the brand name to the search config
                const searchPath = storeBaseUrls[store.brand];

                if (searchPath) {

                    // only proceed if there is a URL AND haven't scraped this brand yet
                    if (storeBaseUrls[store.brand] && !scrapedBrands.has(store.brand)) {

                        console.log(`Scraping ${store.name} for ${product}...`);
                        console.log(`Pausing for 2s to respect API limits...`);
                        await new Promise(r => setTimeout(r, 2000));

                        const fullURL = `${searchPath}${encodeURIComponent(product)}`;
                        scrapedBrands.add(store.brand); // mark this brand as "done"

                        // reuse the existing puppeteer scraping function
                        const liveWebData = await getStoreData(fullURL, product);

                        if (liveWebData) {

                            // send to AI for extraction
                            `
                            const model = genAI.getGenerativeModel({
                                model: "gemini-3-flash-preview",
                                generationConfig: { responseMimeType: "application/json" } // forces raw JSON
                            });
                            const prompt = 
                            I have scraped text from a grocery store search page.
                            Identify the top 3 most relevant matches for "${product}".
                            Return a JSON object with an array called "items".
                            Price MUST be exactly as shown. If you see "from $X.XX", use the highest number.
                            Each item must follow this schema:
                            {
                                "itemName": String (include brand),
                                "storeName": String (include name and address of store),
                                "price": number (realistic pricing)
                            }
                        ;
                            const result = await model.generateContent(prompt);
                            const response = JSON.parse(result.response.text());
                            if (response.items) {

                                // add items to master list
                                allResults = [...allResults, ...response.items];
                            }
                        `

                            // hardcode response for demo
                            const response = {
                                items: [
                                    {
                                        "itemName": "Woodman's Large White Eggs (12ct)",
                                        "storeName": "Woodman's Food Markets, 123 Main St, Appleton, WI 54911",
                                        "price": 2.89
                                    },
                                    {
                                        "itemName": "Oscar Meyer Bacon (16oz)",
                                        "storeName": "Woodman's Food Markets, 123 Main St, Appleton, WI 54911",
                                        "price": 5.49
                                    },
                                    {
                                        "itemName": "Whole Milk (1 Gallon)",
                                        "storeName": "Woodman's Food Markets, 123 Main St, Appleton, WI 54911",
                                        "price": 3.19
                                    }
                                ]
                            };

                            // save items before loop closes
                            allResults = [...allResults, ...response.items];
                        }
                    }
                }
            }

            `
            if (allResults.length === 0) {
                throw new Error("AI could not find items in the text.");
            }
            `

            // save ALL items found by the "AI" by automatically updating if price changes, or inserts if new
            const bulkOps = allResults.map(item => ({
                updateOne: {
                    filter: { itemName: item.itemName, storeName: item.storeName },
                    update: { ...item, updatedAt: Date.now() },
                    upsert: true
                }
            }));
            await GroceryItem.bulkWrite(bulkOps);

            // fetch all updated items to send back to the frontend I DONT THINK IT'S NEEDED ANYMORE
            // const updatedItems = await GroceryItem.find({
            // itemName: { $in: response.items.map(i => i.itemName) }
            // });

            res.json(allResults);
        }
    } catch (error) {
        console.error("DEBUG - Full Search Error:", error);
        res.status(500).json({
            error: "Search failed.",
            details: error.message,
            stack: error.stack // helps find exact error location
        });
    }
});

// get data into database SMALL TEST CASE
app.get('/api/seed-ai', async (req, res) => {
    try {

        // visit a real store search page (Walmart's eggs)
        const liveWebData = await getStoreData(
            'https://www.walmart.com/ip/Great-Value-Large-White-Eggs-12-Count/145051970?wl13=2958&selectedSellerId=0&wmlspartner=wlpa');

        // setup the model to return JSON
        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            generationConfig: { responseMimeType: "application/json" }
        });

        // the prompt
        const prompt = `
            Extract 5 real items from this store text: ${liveWebData}
            Return a JSON object with an array called "items".
            Make sure to include the brand (e.g. "Great Value") in the "itemName".
            Price MUST be exactly as shown. If you see "from $X.XX", use the highest number.
            {
                "itemName": String (include brand),
                "storeName": String (include name and address of store),
                "price": number (realistic pricing),
            }
        `;

        const result = await model.generateContent(prompt);
        const response = JSON.parse(result.response.text());

        // insert data into MongoDB Cloud
        await GroceryItem.insertMany(response.items);

        res.json({
            message: "Cloud Database Seeded with Gemini Data!",
            count: response.items.length
        });
    } catch (error) {
        console.error("Gemini Seeding Error:", error),
            res.status(500).send("AI Seeding Failed.");
    }
});

app.get('/api/prices', async (req, res) => {

    // send a response
    try {
        // replaces res.json(groceryData)
        const items = await GroceryItem.find();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: "Error fetching from Cloud Database" });
    }
});

// starts the server
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});