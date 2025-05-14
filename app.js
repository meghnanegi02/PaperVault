const { MongoClient } = require("mongodb");

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("research");
    const collection = db.collection("papers");

    // Optional: clear existing data for a clean slate
    await collection.deleteMany({});

    // --- 1) Insert sample data ---
    const paperDataArray = [
      {
        title: "Learning a Class of Mixed Linear Regressions: Global Convergence under General Data Conditions",
        year: 2025,
        journal: "arXiv",
        author: "Yujing Liu",
        abstract: "Mixed linear regression (MLR) has attracted increasing attention...",
        link: "https://arxiv.org/pdf/2503.18500"
      },
      {
        title: "Deep Learning for Medical Diagnosis",
        year: 2023,
        journal: "IEEE Transactions on Medical Imaging",
        author: "Dr. Arnav Rao",
        abstract: "This paper investigates convolutional neural networks applied to MRI scans...",
        link: "https://example.com/medical-diagnosis"
      },
      {
        title: "Quantum Computing: Theory and Applications",
        year: 2024,
        journal: "Nature Physics",
        author: "Emily Zhang",
        abstract: "An overview of quantum algorithms and future implications in cryptography...",
        link: "https://example.com/quantum-paper"
      },
      {
        title: "Climate Change and AI",
        year: 2022,
        journal: "ACM Environmental Computing",
        author: "Rajiv Sen",
        abstract: "How artificial intelligence can be used to track and model climate data...",
        link: "https://example.com/climate-ai"
      },
      {
        title: "Blockchain in Supply Chain Management",
        year: 2023,
        journal: "IEEE Blockchain Journal",
        author: "Tanvi Sharma",
        abstract: "This paper studies decentralized tracking for logistics using blockchain...",
        link: "https://example.com/supplychain-blockchain"
      },
      {
        title: "Ethical Implications of AGI",
        year: 2024,
        journal: "Journal of AI Ethics",
        author: "Michael Greene",
        abstract: "This paper discusses potential ethical dilemmas posed by artificial general intelligence...",
        link: "https://example.com/agi-ethics"
      },
      {
        title: "Edge Computing in Smart Cities",
        year: 2023,
        journal: "IEEE Internet of Things Journal",
        author: "Sana Patel",
        abstract: "Smart city infrastructure leveraging low-latency edge computing solutions...",
        link: "https://example.com/edge-smartcities"
      },
      {
        title: "Data Privacy in Federated Learning",
        year: 2022,
        journal: "NeurIPS",
        author: "Junaid Khan",
        abstract: "Federated learning models and privacy-preserving optimization methods...",
        link: "https://example.com/federated-privacy"
      },
      {
        title: "Human-Robot Interaction in Industry 5.0",
        year: 2024,
        journal: "Springer Robotics Review",
        author: "Haruka Nishimura",
        abstract: "Collaborative robotic systems and ergonomic interfaces for industrial settings...",
        link: "https://example.com/hri-industry5"
      },
      {
        title: "Zero-Knowledge Proofs in Secure Voting",
        year: 2025,
        journal: "Cryptology ePrint Archive",
        author: "Kavya Ramesh",
        abstract: "Using ZKPs to ensure privacy and verifiability in digital elections...",
        link: "https://example.com/zkp-voting"
      }
    ];

    const result = await collection.insertMany(paperDataArray);
    console.log(`✅ Inserted ${result.insertedCount} documents.`);

    // --- 2) Define search parameters (pretend these came from the UI) ---
    const category = "IEEE Transactions on Medical Imaging"; // or "Nature Physics", etc.
    const keyword = "MRI";                                  // partial match in title or abstract
    const author = "Arnav";                                 // partial match in author
    const timeline = 2023;                                  // exact year match

    // --- 3) Build the query object based on user inputs ---
    const query = {};

    // If "Category" is your journal:
    if (category) {
      query.journal = category;
    }

    // For "Keyword", search in both title and abstract (case-insensitive)
    if (keyword) {
      query.$or = [
        { title:    { $regex: keyword, $options: "i" } },
        { abstract: { $regex: keyword, $options: "i" } }
      ];
    }

    // For "Author", partial match (case-insensitive)
    if (author) {
      query.author = { $regex: author, $options: "i" };
    }

    // For "Timeline", if it is a specific year
    if (timeline) {
      query.year = timeline;
    }

    // --- 4) Perform the search ---
    const searchResults = await collection.find(query).toArray();
    console.log("🔍 Search results:");
    console.log(searchResults);

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
  }
}

run();
