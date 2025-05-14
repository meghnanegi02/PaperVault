const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Function to fetch papers from Google Scholar using SerpAPI with pagination
async function fetchFromGoogleScholar(query = "deep learning in medical imaging", startIndex = 0) {
  try {
    console.log(`Fetching papers from Google Scholar for query: ${query}, starting from index ${startIndex}`);
    
    const params = {
      engine: "google_scholar",
      q: query,
      api_key: process.env.SERP_API_KEY,
      start: startIndex,
      num: 20 // Number of results per page
    };

    // Add delay to respect API rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await axios.get("https://serpapi.com/search", { params });
    const results = response.data.organic_results || [];
    
    console.log(`Fetched ${results.length} papers from Google Scholar at index ${startIndex}`);
    
    // Transform the results to match our paper schema
    const papers = results.map(paper => {
      // Extract authors from the snippet if available
      let authors = [];
      if (paper.snippet) {
        // Try to extract authors from the snippet
        const authorMatch = paper.snippet.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:, [A-Z][a-z]+ [A-Z][a-z]+)*)/);
        if (authorMatch) {
          authors = authorMatch[1].split(', ');
        }
      }
      
      // Extract publication year if available
      let published = null;
      const yearMatch = paper.snippet?.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[0]);
        published = new Date(year, 0, 1); // January 1st of the year
      }
      
      return {
        title: paper.title,
        authors: authors,
        abstract: paper.snippet || "",
        link: paper.link,
        published: published || new Date(),
        category: "Google Scholar",
        keywords: [query],
        journal: paper.publication_info?.summary || "Google Scholar",
        source: "Google Scholar",
        fetchTimestamp: new Date(),
        lastUpdated: new Date(),
        citationCount: paper.cited_by?.total || 0
      };
    });
    
    return {
      papers,
      hasNextPage: response.data.serpapi_pagination?.next_page_token !== undefined
    };
  } catch (error) {
    console.error("Error fetching from Google Scholar:", error);
    return { papers: [], hasNextPage: false };
  }
}

// Function to fetch historical papers from multiple queries
async function fetchHistoricalGoogleScholar(queries = [
  "deep learning in medical imaging",
  "machine learning in healthcare",
  "artificial intelligence in medicine",
  "computer vision in healthcare",
  "natural language processing in medicine",
  "deep learning applications",
  "machine learning algorithms",
  "artificial intelligence advances",
  "neural networks research",
  "deep learning architectures"
]) {
  let totalInserted = 0;
  const maxPagesPerQuery = 10; // Limit to 10 pages per query to manage API costs
  
  try {
    // Connect to MongoDB
    const { MongoClient } = require("mongodb");
    const uri = process.env.MONGO_URL || "mongodb://localhost:27017";
    const client = new MongoClient(uri);
    
    await client.connect();
    console.log("Connected to MongoDB for Google Scholar historical data fetching");
    
    const db = client.db("research");
    const collection = db.collection("papers");
    
    // Process each query
    for (const query of queries) {
      let startIndex = 0;
      let pageCount = 0;
      let hasMore = true;
      
      while (hasMore && pageCount < maxPagesPerQuery) {
        try {
          // Fetch a batch of papers
          const { papers, hasNextPage } = await fetchFromGoogleScholar(query, startIndex);
          
          if (papers.length === 0) {
            break;
          }
          
          // Check for duplicates using title and link
          const existingPapers = await collection.find({
            source: "Google Scholar",
            $or: [
              { title: { $in: papers.map(p => p.title) } },
              { link: { $in: papers.map(p => p.link) } }
            ]
          }).toArray();
          
          const existingTitles = new Set(existingPapers.map(p => p.title));
          const existingLinks = new Set(existingPapers.map(p => p.link));
          
          // Filter out duplicates
          const newPapers = papers.filter(paper => 
            !existingTitles.has(paper.title) && !existingLinks.has(paper.link)
          );
          
          if (newPapers.length > 0) {
            // Insert new papers
            const result = await collection.insertMany(newPapers);
            totalInserted += result.insertedCount;
            console.log(`Inserted ${result.insertedCount} papers for query "${query}" at index ${startIndex}`);
          }
          
          // Update progress
          startIndex += papers.length;
          pageCount++;
          hasMore = hasNextPage;
          
          // Add delay to respect API rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Error processing query "${query}" at index ${startIndex}:`, error);
          break;
        }
      }
    }
    
    console.log(`Total Google Scholar papers inserted: ${totalInserted}`);
    return totalInserted;
    
  } catch (error) {
    console.error("Error in fetchHistoricalGoogleScholar:", error);
    return 0;
  }
}

// Function to fetch papers from multiple queries (regular update)
async function fetchMultipleQueries(queries = [
  "deep learning in medical imaging",
  "machine learning in healthcare",
  "artificial intelligence in medicine"
]) {
  let allPapers = [];
  
  for (const query of queries) {
    const { papers } = await fetchFromGoogleScholar(query);
    allPapers = [...allPapers, ...papers];
  }
  
  console.log(`Total papers fetched from Google Scholar: ${allPapers.length}`);
  return allPapers;
}

module.exports = { 
  fetchFromGoogleScholar, 
  fetchMultipleQueries,
  fetchHistoricalGoogleScholar 
}; 