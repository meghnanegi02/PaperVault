require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 8050;

// MongoDB Schema
const paperSchema = new mongoose.Schema({
  title: String,
  link: String,
});

const Paper = mongoose.model("ScholarPaper", paperSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

// Fetch from SerpAPI
async function fetchScholarResults(query = "deep learning in medical imaging") {
  const params = {
    engine: "google_scholar",
    q: query,
    api_key: process.env.SERP_API_KEY,
  };

  try {
    const response = await axios.get("https://serpapi.com/search", { params });
    const results = response.data.organic_results || [];

    for (const paper of results) {
      await Paper.findOneAndUpdate(
        { link: paper.link },
        {
          title: paper.title,
          link: paper.link,
        },
        { upsert: true }
      );
    }

    console.log("Scholar papers saved to MongoDB.");
  } catch (err) {
    console.error("Error fetching data from SerpAPI:", err.message);
  }
}

fetchScholarResults();

// API route to get stored papers
app.get("/papers", async (req, res) => {
  const papers = await Paper.find();
  res.json(papers);
});

// Simple frontend
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>Scholar Search Results</title></head>
      <body>
        <h1>Google Scholar Papers</h1>
        <ul id="papers"></ul>
        <script>
          fetch('/papers')
            .then(res => res.json())
            .then(data => {
              const ul = document.getElementById('papers');
              data.forEach(p => {
                const li = document.createElement('li');
                li.innerHTML = '<a href="' + p.link + '" target="_blank">' + p.title + '</a>';
                ul.appendChild(li);
              });
            });
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
