# Grocery Comparison Demo - AI-Driven Grocery Price Automation

## Overview
This project is currently in the development phase, with the primary goal of enabling users to conduct real-time price comparisons among local retailers. By utilizing automated data scraping techniques, the platform aims to deliver accurate pricing information while also being scalable.
  ## Current Status
  At this stage, the system can automatically scrape data from Woodman's Food Market within a specified zip code and features a prototype frontend to demonstrate the comparison capabilities.

## Current Functionalities
* Targeted Data Extraction: Employs Puppeteer to systematically navigate and extract raw HTML from Woodman's online store.
* AI-Driven Data Structuring: Utilizes Gemini-AI to transform unstructured HTML data into organized JSON schemas for reliable storage.
* Proof-of-Concept Frontend: A React/Vite-based interface that is currently hardcoded to display specific products, illustrating the user experience and data processing flow.

## Tech Stack
* Automation: Puppeteer
* AI: Google Gemini API
* Backend: Node.js & Express
* Geocoding: Nominatim & Overpass API
* Database: MongoDB
* Frontend: React/Vite

## Planned Features
* Multi-Store Support: Expand Puppeteer scripts to include additional retailers such as Festival Foods, Target, and others.
* Dynamic Frontend: Move beyond hardcoded products to incorporate dynamically sourced product data from various retail websites.
* Price Tracking: Create historical data visualization to illustrate price trends over time.

## Setup & Installation
1. Clone the repo: `git clone [your-repo-link]`
2. Install backend dependencies in root directory: `npm install`
3. Navigate to client folder and install frontend dependencies: `npm install
4. Create a `.env` file with your `GEMINI_API_KEY` and `MONGODB_URI`
5. Run the app:
   * **Backend** `npm start` (Runs on port 5000)
   * **Frontend** `npm run dev` (Runs on Vite default port)
