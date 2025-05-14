const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
const cron = require("node-cron");
const { fetchFromArxiv, runAllFetchers, fetchAllHistoricalPapers } = require("./dataFetcher");
const { fetchMultipleQueries, fetchHistoricalGoogleScholar } = require("./googleScholarFetcher");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URL || "mongodb://localhost:27017";
const client = new MongoClient(uri);

// Initialize MongoDB connection
async function connectToMongo() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    return client.db("research");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}

async function run() {
  try {
    const db = await connectToMongo();
    const collection = db.collection("papers");

    // Create text index for search
    await collection.createIndex({ 
      abstract: "text", 
      title: "text",
      keywords: "text"
    });

    // Test endpoint to verify MongoDB connection and data
    app.get("/test", async (req, res) => {
      try {
    const count = await collection.countDocuments();
        res.json({ 
          status: "success", 
          message: "MongoDB connection successful", 
          paperCount: count 
        });
      } catch (err) {
        console.error("Error in test endpoint:", err);
        res.status(500).json({ 
          status: "error", 
          message: "MongoDB connection failed", 
          error: err.message 
        });
      }
    });

    // API Endpoint for searching papers
    app.get("/papers", async (req, res) => {
      try {
        const { keyword, category, author, timeline } = req.query;
        let query = {};

        // Build search query based on parameters
        if (keyword) {
          query.$text = { $search: keyword };
        }
        if (category) {
          query.category = category;
        }
        if (author) {
          query.authors = { $regex: author, $options: 'i' };
        }
        if (timeline) {
          try {
            const [startYear, endYear] = timeline.split('-').map(Number);
            if (!isNaN(startYear)) {
              query.published = {
                $gte: new Date(startYear, 0, 1),
                $lte: new Date(endYear || startYear, 11, 31)
              };
            }
          } catch (timelineError) {
            console.error("Error parsing timeline:", timelineError);
            // Continue without timeline filter if parsing fails
          }
        }

        // Execute search with text score
        let papers;
        try {
          if (keyword) {
            // If keyword search is used, sort by text score
            papers = await collection
              .find(query)
              .sort({ score: { $meta: "textScore" } })
              .limit(100)
              .toArray();
          } else {
            // Otherwise, just get the papers without text score sorting
            papers = await collection
              .find(query)
              .limit(100)
              .toArray();
          }
        } catch (dbError) {
          console.error("Database query error:", dbError);
          // Return empty array instead of throwing
          papers = [];
        }

        res.json(papers);
      } catch (err) {
        console.error("Error retrieving papers:", err);
        
        // Return sample data if MongoDB query fails
        console.log("Returning sample data due to MongoDB error");
        const sampleData = [
          {
            title: "Introduction to Machine Learning",
            authors: ["John Smith", "Jane Doe"],
            abstract: "This paper provides an overview of machine learning techniques and applications.",
            link: "https://arxiv.org/pdf/2001.00001",
            published: new Date("2020-01-01"),
            category: "cs.AI",
            journal: "arXiv"
          },
          {
            title: "Deep Learning for Computer Vision",
            authors: ["Alice Johnson", "Bob Williams"],
            abstract: "This paper explores deep learning approaches for computer vision tasks.",
            link: "https://arxiv.org/pdf/2002.00001",
            published: new Date("2020-02-01"),
            category: "cs.CV",
            journal: "arXiv"
          },
          {
            title: "Natural Language Processing Techniques",
            authors: ["Charlie Brown", "Diana Ross"],
            abstract: "This paper discusses various techniques in natural language processing.",
            link: "https://arxiv.org/pdf/2003.00001",
            published: new Date("2020-03-01"),
            category: "cs.CL",
            journal: "arXiv"
          }
        ];
        
        res.json(sampleData);
      }
    });

    // Add endpoint to fetch historical data
    app.post("/fetch-historical", async (req, res) => {
      try {
        console.log("Starting historical data fetch...");
        
        // Start the fetch processes
        const arxivPromise = fetchAllHistoricalPapers();
        const scholarPromise = fetchHistoricalGoogleScholar();
        
        // Wait for both processes to complete
        const [arxivCount, scholarCount] = await Promise.all([arxivPromise, scholarPromise]);
        
        const totalCount = arxivCount + scholarCount;
        console.log(`Historical data fetch completed. Total papers added: ${totalCount}`);
        
        res.json({
          status: "success",
          message: "Historical data fetch completed",
          totalPapersAdded: totalCount,
          arxivPapersAdded: arxivCount,
          scholarPapersAdded: scholarCount
        });
        
      } catch (error) {
        console.error("Error fetching historical data:", error);
        res.status(500).json({
          status: "error",
          message: "Error fetching historical data",
          error: error.message
        });
      }
    });

    // Add endpoint to check database stats
    app.get("/stats", async (req, res) => {
      try {
        const stats = {
          totalPapers: await collection.countDocuments(),
          arxivPapers: await collection.countDocuments({ source: "arXiv" }),
          scholarPapers: await collection.countDocuments({ source: "Google Scholar" }),
          categories: await collection.distinct("category"),
          lastUpdate: await collection.find().sort({ fetchTimestamp: -1 }).limit(1).toArray()
        };
        
        res.json({
          status: "success",
          stats
        });
        
      } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({
          status: "error",
          message: "Error fetching database stats",
          error: error.message
        });
      }
    });

    // Initial fetch of papers
    async function initialFetch() {
      try {
        console.log("Starting initial fetch of papers...");
        
        // Check if we have any papers in the database
        const paperCount = await collection.countDocuments();
        
        if (paperCount === 0) {
          console.log("Database is empty. Starting historical data fetch...");
          
          // Fetch historical data
          const arxivCount = await fetchAllHistoricalPapers();
          const scholarCount = await fetchHistoricalGoogleScholar();
          
          console.log(`Initial historical fetch completed. Added ${arxivCount + scholarCount} papers`);
        } else {
          console.log(`Database already contains ${paperCount} papers. Skipping initial historical fetch.`);
          
          // Just fetch recent papers
          const arxivCount = await runAllFetchers();
          const scholarPapers = await fetchMultipleQueries();
          
          if (scholarPapers.length > 0) {
            const result = await collection.insertMany(scholarPapers);
            console.log(`Added ${result.insertedCount} new papers from Google Scholar`);
          }
        }
        
        console.log("Initial fetch completed successfully");
      } catch (error) {
        console.error("Error during initial fetch:", error);
        // Continue running the server even if initial fetch fails
      }
    }

    // Schedule regular fetches every 6 hours
    const fetchInterval = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    
    // Run initial fetch
    initialFetch();
    
    // Set up the interval for regular fetches
    setInterval(async () => {
      try {
        console.log("Starting scheduled fetch...");
        const now = new Date();
        console.log(`Scheduled fetch started at ${now.toISOString()}`);
        
        // Use runAllFetchers to fetch from arXiv
        const arxivCount = await runAllFetchers();
        console.log(`Added ${arxivCount} new papers from arXiv`);
        
        // Fetch from Google Scholar
        const scholarPapers = await fetchMultipleQueries();
        if (scholarPapers.length > 0) {
          // Check for duplicates before inserting
          const existingIds = await collection.distinct("link", { source: "Google Scholar" });
          const newPapers = scholarPapers.filter(paper => !existingIds.includes(paper.link));
          
          if (newPapers.length > 0) {
            await collection.insertMany(newPapers);
            console.log(`Added ${newPapers.length} new papers from Google Scholar`);
          } else {
            console.log("No new Google Scholar papers to add");
          }
        }
        
        console.log(`Scheduled fetch completed at ${new Date().toISOString()}`);
      } catch (error) {
        console.error("Error during scheduled fetch:", error);
      }
    }, fetchInterval);

    const PORT = process.env.PORT || 8050;
    
    // Check if port is already in use
    const net = require('net');
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please try a different port or close the application using this port.`);
        process.exit(1);
      }
    });
    
    server.once('listening', () => {
      server.close();
      // Start the Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      });
    });
    
    server.listen(PORT);

  } catch (err) {
    console.error("❌ Server Error:", err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    await cleanup(); // Cleanup dataFetcher connection
    await client.close(); // Cleanup server connection
    console.log('All MongoDB connections closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

run();

