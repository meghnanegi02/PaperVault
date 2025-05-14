const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
const axios = require("axios");
const xml2js = require("xml2js");

dotenv.config();

const uri = process.env.MONGO_URL || "mongodb://localhost:27017";
const client = new MongoClient(uri);

// Function to fetch papers from arXiv using the arxiv-api package
async function fetchFromArxiv(category) {
  try {
    console.log(`Fetching papers for category: ${category}`);
    
    // Create a properly formatted search query
    const searchQuery = {
      searchQuery: {
        terms: [category],
        maxResults: 10,
        sortBy: 'submittedDate',
        sortOrder: 'descending'
      }
    };
    
    console.log("Search query:", JSON.stringify(searchQuery));
    
    // Use axios to fetch directly from arXiv API
    const response = await axios.get(`http://export.arxiv.org/api/query?search_query=cat:${category}&max_results=10&sortBy=submittedDate&sortOrder=descending`);
    
    // Parse XML response
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // Extract papers from the response
    const entries = result.feed.entry || [];
    const papers = entries.map(entry => {
      const authors = entry.author ? entry.author.map(author => author.name[0]) : [];
      return {
        title: entry.title[0],
        authors: authors,
        abstract: entry.summary[0],
        link: entry.link.find(link => link.$.title === 'pdf')?.$.href || '',
        published: entry.published[0],
        updated: entry.updated[0],
        arxivId: entry.id[0].split('/').pop(),
        category: category,
        keywords: [],
        journal: 'arXiv'
      };
    });
    
    console.log(`Fetched ${papers.length} papers for category ${category}`);
    return papers;
  } catch (error) {
    console.error(`Error fetching from arXiv for category ${category}:`, error);
    return [];
  }
}

// Function to fetch papers directly from arXiv API (fallback method)
async function fetchFromArxivDirect(category) {
  try {
    console.log(`Fetching papers directly for category: ${category}`);
    
    // Construct the URL for the arXiv API
    const url = `http://export.arxiv.org/api/query?search_query=cat:${category}&max_results=10&sortBy=submittedDate&sortOrder=descending`;
    
    // Fetch the XML response
    const response = await axios.get(url);
    
    // Parse the XML to JSON
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // Extract papers from the response
    const entries = result.feed.entry || [];
    const papers = entries.map(entry => {
      const authors = entry.author ? entry.author.map(author => author.name[0]) : [];
      return {
        title: entry.title[0],
        authors: authors,
        abstract: entry.summary[0],
        link: entry.link.find(link => link.$.title === 'pdf')?.$.href || '',
        published: entry.published[0],
        updated: entry.updated[0],
        arxivId: entry.id[0].split('/').pop(),
        category: category,
        keywords: [],
        journal: 'arXiv'
      };
    });
    
    console.log(`Fetched ${papers.length} papers directly for category ${category}`);
    return papers;
  } catch (error) {
    console.error(`Error fetching directly from arXiv for category ${category}:`, error);
    return [];
  }
}

// Function to add sample data to MongoDB
async function addSampleData(collection) {
  try {
    // Sample paper data
    const samplePapers = [
      {
        title: "Introduction to Machine Learning",
        authors: ["John Smith", "Jane Doe"],
        abstract: "This paper provides an overview of machine learning techniques and applications.",
        link: "https://arxiv.org/pdf/2001.00001",
        published: new Date("2020-01-01"),
        updated: new Date("2020-01-01"),
        arxivId: "2001.00001",
        category: "cs.AI",
        keywords: ["machine learning", "artificial intelligence"],
        journal: "arXiv"
      },
      {
        title: "Deep Learning for Computer Vision",
        authors: ["Alice Johnson", "Bob Williams"],
        abstract: "This paper explores deep learning approaches for computer vision tasks.",
        link: "https://arxiv.org/pdf/2002.00001",
        published: new Date("2020-02-01"),
        updated: new Date("2020-02-01"),
        arxivId: "2002.00001",
        category: "cs.CV",
        keywords: ["deep learning", "computer vision", "neural networks"],
        journal: "arXiv"
      },
      {
        title: "Natural Language Processing Techniques",
        authors: ["Charlie Brown", "Diana Ross"],
        abstract: "This paper discusses various techniques in natural language processing.",
        link: "https://arxiv.org/pdf/2003.00001",
        published: new Date("2020-03-01"),
        updated: new Date("2020-03-01"),
        arxivId: "2003.00001",
        category: "cs.CL",
        keywords: ["natural language processing", "nlp", "text analysis"],
    journal: "arXiv"
      }
    ];
    
    // Insert sample papers
    const result = await collection.insertMany(samplePapers);
    console.log(`Added ${result.insertedCount} sample papers to MongoDB`);
    return result.insertedCount;
  } catch (error) {
    console.error("Error adding sample data:", error);
    return 0;
  }
}

// Main function to run all fetchers
async function runAllFetchers() {
  let insertedCount = 0;
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB for data fetching");
    
    const db = client.db("research");
    const collection = db.collection("papers");
    
    // Define categories to fetch
    const categories = ["cs.AI", "cs.CL", "cs.CV", "cs.LG", "cs.IR", "stat.ML"];
    
    // Fetch papers for each category
    for (const category of categories) {
      try {
        console.log(`Processing category: ${category}`);
        
        // Try to fetch using the arxiv-api package
        let papers = await fetchFromArxiv(category);
        
        // If that fails, try the direct method
        if (papers.length === 0) {
          console.log(`Falling back to direct method for category ${category}`);
          papers = await fetchFromArxivDirect(category);
        }
        
        if (papers.length > 0) {
          // Get existing paper IDs for this category to check for duplicates
          const existingIds = await collection.distinct("arxivId", { category: category });
          
          // Filter out papers that already exist
          const newPapers = papers.filter(paper => !existingIds.includes(paper.arxivId));
          
          if (newPapers.length > 0) {
            // Add source and fetch timestamp to papers
            const papersWithMetadata = newPapers.map(paper => ({
              ...paper,
              source: 'arXiv',
              fetchTimestamp: new Date(),
              lastUpdated: new Date()
            }));
            
            // Insert new papers
            const result = await collection.insertMany(papersWithMetadata);
            insertedCount += result.insertedCount;
            console.log(`Inserted ${result.insertedCount} new papers for category ${category}`);
            
            // Update existing papers if they have been modified
            const bulkOps = papers
              .filter(paper => existingIds.includes(paper.arxivId))
              .map(paper => ({
                updateOne: {
                  filter: { arxivId: paper.arxivId },
                  update: {
                    $set: {
                      title: paper.title,
                      abstract: paper.abstract,
                      authors: paper.authors,
                      link: paper.link,
                      updated: paper.updated,
                      lastUpdated: new Date()
                    }
                  }
                }
              }));
            
            if (bulkOps.length > 0) {
              const updateResult = await collection.bulkWrite(bulkOps);
              console.log(`Updated ${updateResult.modifiedCount} existing papers for category ${category}`);
            }
          } else {
            console.log(`No new papers found for category ${category}`);
          }
        }
      } catch (error) {
        console.error(`Error processing category ${category}:`, error);
      }
    }
    
    // Clean up old papers (optional, uncomment if needed)
    // const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // const deleteResult = await collection.deleteMany({
    //   source: 'arXiv',
    //   lastUpdated: { $lt: thirtyDaysAgo }
    // });
    // console.log(`Removed ${deleteResult.deletedCount} outdated papers`);
    
    return insertedCount;
  } catch (error) {
    console.error("Error in runAllFetchers:", error);
    return 0;
  } finally {
    // Close the MongoDB connection
    await client.close();
    console.log("Closed MongoDB connection after data fetching");
  }
}

// Function to fetch historical papers from arXiv with pagination
async function fetchHistoricalPapers(category, startIndex = 0, maxResults = 1000) {
  try {
    console.log(`Fetching historical papers for category ${category}, starting from index ${startIndex}`);
    
    // Construct the URL for the arXiv API with pagination
    const url = `http://export.arxiv.org/api/query?search_query=cat:${category}&start=${startIndex}&max_results=100&sortBy=lastUpdatedDate&sortOrder=descending`;
    
    // Add delay to respect arXiv API rate limits (3 seconds between requests)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Fetch the XML response
    const response = await axios.get(url);
    
    // Parse the XML to JSON
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // Extract papers from the response
    const entries = result.feed.entry || [];
    const papers = entries.map(entry => {
      const authors = entry.author ? entry.author.map(author => author.name[0]) : [];
      return {
        title: entry.title[0],
        authors: authors,
        abstract: entry.summary[0],
        link: entry.link.find(link => link.$.title === 'pdf')?.$.href || '',
        published: entry.published[0],
        updated: entry.updated[0],
        arxivId: entry.id[0].split('/').pop(),
        category: category,
        keywords: [],
        journal: 'arXiv',
        source: 'arXiv',
        fetchTimestamp: new Date(),
        lastUpdated: new Date()
      };
    });
    
    console.log(`Fetched ${papers.length} historical papers for category ${category} at index ${startIndex}`);
    return papers;
  } catch (error) {
    console.error(`Error fetching historical papers for category ${category}:`, error);
    return [];
  }
}

// Function to fetch all historical papers
async function fetchAllHistoricalPapers() {
  let totalInserted = 0;
  
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB for historical data fetching");
    
    const db = client.db("research");
    const collection = db.collection("papers");
    
    // Define categories to fetch
    const categories = ["cs.AI", "cs.CL", "cs.CV", "cs.LG", "cs.IR", "stat.ML"];
    
    // Fetch papers for each category with pagination
    for (const category of categories) {
      let startIndex = 0;
      let hasMore = true;
      
      while (hasMore) {
        try {
          // Fetch a batch of papers
          const papers = await fetchHistoricalPapers(category, startIndex);
          
          if (papers.length === 0) {
            hasMore = false;
            continue;
          }
          
          // Check for duplicates
          const existingIds = await collection.distinct("arxivId", { 
            category: category,
            arxivId: { $in: papers.map(p => p.arxivId) }
          });
          
          // Filter out duplicates
          const newPapers = papers.filter(paper => !existingIds.includes(paper.arxivId));
          
          if (newPapers.length > 0) {
            // Insert new papers
            const result = await collection.insertMany(newPapers);
            totalInserted += result.insertedCount;
            console.log(`Inserted ${result.insertedCount} historical papers for category ${category} at index ${startIndex}`);
          }
          
          // Update progress
          startIndex += papers.length;
          
          // If we got fewer papers than requested, we've reached the end
          if (papers.length < 100) {
            hasMore = false;
          }
          
          // Add delay to respect arXiv API rate limits
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (error) {
          console.error(`Error processing category ${category} at index ${startIndex}:`, error);
          hasMore = false;
        }
      }
    }
    
    console.log(`Total historical papers inserted: ${totalInserted}`);
    return totalInserted;
    
  } catch (error) {
    console.error("Error in fetchAllHistoricalPapers:", error);
    return 0;
  } finally {
    await client.close();
    console.log("Closed MongoDB connection after historical data fetching");
  }
}

// Export the functions
module.exports = { 
  runAllFetchers, 
  fetchFromArxiv, 
  fetchFromArxivDirect,
  fetchAllHistoricalPapers 
}; 