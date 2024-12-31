const express = require("express");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const WebSocket = require("ws"); // Import the ws module
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Database connection
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "root",
  database: "auction_db",
});

// Setup WebSocket server
const server = app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("New WebSocket connection");
});

// Helper function to broadcast messages to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Routes

/** AUCTION APIs */

// Fetch all auctions
app.get("/api/auctions", async (req, res) => {
  try {
    const [auctions] = await db.query("SELECT * FROM auctions");
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/uploads/:filename", async (req, res) => {
  console.log("hi");
  const { filename } = req.params;

  // Path to the requested image in the uploads folder
  const imagePath = path.join(__dirname, "uploads", filename);

  // Send the image if it exists
  res.sendFile(imagePath, (err) => {
    if (err) {
      res.status(404).send("Image not found");
    }
  });
});
// Fetch a specific auction by ID
app.get("/api/auction/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [auction] = await db.query("SELECT * FROM auctions WHERE id = ?", [
      id,
    ]);
    res.json(auction[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new auction
app.post("/api/auction", async (req, res) => {
  const { name, description, status, bid_increment } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO auctions (name, description, status, bid_increment) VALUES (?, ?, ?, ?)",
      [name, description, status, bid_increment]
    );
    res.json({
      message: "Auction created successfully",
      auctionId: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update an existing auction
app.put("/api/auction/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, status, bid_increment } = req.body;
  try {
    await db.query(
      "UPDATE auctions SET name = ?, description = ?, status = ?, bid_increment = ? WHERE id = ?",
      [name, description, status, bid_increment, id]
    );
    res.json({ message: "Auction updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/auctions/:auctionId/teamstat", async (req, res) => {
  const { auctionId } = req.params;

  const query = `
    SELECT t.id AS team_id, t.name AS team_name, t.logo, t.purse,
           p.id AS player_id, p.name AS player_name, p.position, 
           p.base_price, p.current_bid, p.photo_path
    FROM teams t
    LEFT JOIN players p ON p.team_id = t.id
    WHERE t.auction_id = ?
    ORDER BY t.id, p.name
  `;

  try {
    const [results] = await db.query(query, [auctionId]);
    const teams = {};

    results.forEach((row) => {
      if (!teams[row.team_id]) {
        teams[row.team_id] = {
          id: row.team_id,
          name: row.team_name,
          logo: row.logo,
          purse: parseFloat(row.purse), // Use the purse directly from the DB
          players: [],
        };
      }

      if (
        row.player_id &&
        !teams[row.team_id].players.some((p) => p.id === row.player_id)
      ) {
        teams[row.team_id].players.push({
          id: row.player_id,
          name: row.player_name,
          position: row.position,
          base_price: parseFloat(row.base_price),
          current_bid: row.current_bid ? parseFloat(row.current_bid) : 0.0,
          photo_path: row.photo_path,
        });
      }
    });

    const teamsArray = Object.values(teams);
    res.json(teamsArray);
  } catch (err) {
    console.error("Error fetching team data: ", err);
    res.status(500).json({ error: "Database error", message: err.message });
  }
});

// Delete an auction
app.delete("/api/auction/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM auctions WHERE id = ?", [id]);
    res.json({ message: "Auction deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PLAYER APIs */

// Fetch all players
app.get("/api/players", async (req, res) => {
  try {
    const [players] = await db.query("SELECT * FROM players");
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch a specific player by ID
app.get("/api/player/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [player] = await db.query("SELECT * FROM players WHERE id = ?", [id]);
    res.json(player[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch all players for a specific auction
app.get("/api/auction/:id/players", async (req, res) => {
  const { id } = req.params;
  try {
    const [players] = await db.query(
      "SELECT * FROM players WHERE auction_id = ?",
      [id]
    );
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new player to an auction
app.post("/api/auctions/:id/players", async (req, res) => {
  const { name, position, price, photo_path } = req.body;
  const auction_id = req.params.id;
  try {
    const [result] = await db.query(
      "INSERT INTO players (name, position, base_price, photo_path, auction_id) VALUES (?, ?, ?, ?, ?)",
      [name, position, price, photo_path, auction_id]
    );
    res.json({
      success: true,
      message: "Player added successfully",
      playerId: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ message: err.messaged });
  }
});

// Update an existing player
app.put("/api/auctions/:auctionid/players/:id", async (req, res) => {
  const { id } = req.params;
  const { name, position, base_price, photo_path } = req.body;
  try {
    await db.query(
      "UPDATE players SET name = ?, position = ?, base_price = ?, photo_path = ? WHERE id = ?",
      [name, position, base_price, photo_path, id]
    );
    res.json({ message: "Player updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a player
app.delete("/api/player/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM players WHERE id = ?", [id]);
    res.json({ message: "Player deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** TEAM APIs */

// Fetch all teams
app.get("/api/teams", async (req, res) => {
  try {
    const [teams] = await db.query("SELECT * FROM teams");
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch a specific team by ID
app.get("/api/team/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [team] = await db.query("SELECT * FROM teams WHERE id = ?", [id]);
    res.json(team[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/auctions/:id/teams/:teamid", async (req, res) => {
  const { id, teamid } = req.params;
  try {
    const [team] = await db.query(
      "SELECT * FROM teams WHERE auction_id = ? and id = ?",
      [id, teamid]
    );
    res.json(team[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch all teams for a specific auction
app.get("/api/auctions/:id/teams", async (req, res) => {
  const { id } = req.params;
  try {
    const [teams] = await db.query("SELECT * FROM teams WHERE auction_id = ?", [
      id,
    ]);
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new team to an auction
app.post("/api/auctions/:id/teams", async (req, res) => {
  const { name, budget, photo_path } = req.body;
  const auction_id = req.params.id;
  try {
    const [result] = await db.query(
      "INSERT INTO teams (name, purse, photo_path, auction_id) VALUES (?, ?, ?, ?)",
      [name, budget, photo_path, auction_id]
    );
    res.json({
      success: true,
      message: "Team added successfully",
      teamId: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update an existing team
app.put("/api/team/:id", async (req, res) => {
  const { id } = req.params;
  const { name, purse, photo_path } = req.body;
  try {
    await db.query(
      "UPDATE teams SET name = ?, purse = ?, photo_path = ? WHERE id = ?",
      [name, purse, photo_path, id]
    );
    res.json({ message: "Team updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.put("/api/auctions/:id/teams/:teamid", async (req, res) => {
  const { teamid } = req.params;
  const { name, budget, logo_path } = req.body;
  try {
    await db.query(
      "UPDATE teams SET name = ?, purse = ?, logo = ? WHERE id = ?",
      [name, budget, logo_path, teamid]
    );
    res.json({ message: "Team updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Delete a team
app.delete("/api/team/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM teams WHERE id = ?", [id]);
    res.json({ message: "Team deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

app.post("/api/upload", upload.single("file"), (req, res) => {
  res.send({ filePath: `/uploads/${req.file.filename}` });
});
const path = require("path"); // Add this line to define the path module
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/auction/:auctionId/players", async (req, res) => {
  const { auctionId } = req.params;
  try {
    const players = await db.query(
      "SELECT * FROM players WHERE auction_id = ? ORDER BY id ASC",
      [auctionId]
    );
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/auction/:auctionId/search", async (req, res) => {
  const { auctionId } = req.params;
  const { query } = req.query; // e.g., name or number
  try {
    const players = await db.query(
      `SELECT * FROM players WHERE auction_id = ? AND (name LIKE ? OR id LIKE ?)`,
      [auctionId, `%${query}%`, `%${query}%`]
    );
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/auction/:auctionId/players/status", async (req, res) => {
  const { auctionId } = req.params;
  const { status } = req.query; // e.g., "sold" or "unsold"
  try {
    const players = await db.query(
      "SELECT * FROM players WHERE auction_id = ? AND status = ?",
      [auctionId, status]
    );
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/auction/:auctionId/rankings", async (req, res) => {
  const { auctionId } = req.params;
  try {
    const rankings = await db.query(
      `SELECT teams.id, teams.name, SUM(bids.bid_amount) AS total_bid
       FROM teams
       LEFT JOIN bids ON teams.id = bids.team_id
       WHERE bids.auction_id = ?
       GROUP BY teams.id
       ORDER BY total_bid DESC`,
      [auctionId]
    );
    res.json(rankings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get("/api/leaderboard/:auctionId/", async (req, res) => {
  const { auctionId } = req.params;
  try {
    const rankings = await db.query(
      `SELECT players.name as name , current_bid,players.photo_path,logo,teams.name as team
    FROM players,teams
    WHERE players.team_id=teams.id and status = 'sold' AND players.auction_id = ?
    ORDER BY current_bid DESC;`,
      [auctionId]
    );
    res.json(rankings[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.post("/api/ws/:playerId", async (req, res) => {
  const { playerId } = req.params;
  try {
    const playerQuery = "SELECT * FROM players WHERE id = ?";
    // Await player and team data
    const [player] = await db.query(playerQuery, [playerId]);
    broadcast({
      type: "VIEW",
      playerId,
      base_price: player[0].base_price,
      player_name: player[0].name,
      player_image: player[0].photo_path, // Assuming player image path is stored in player.image_path

      // Assuming team logo path is stored in team.logo_path
    });

    res.json("success");
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Final Status API (Broadcast the updates when a player's status is changed or bid placed)
// Player status update with image paths
app.post("/api/finalstatus/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const { team_id, bid_amount, status, auction_id } = req.body;

  try {
    // Query player and team information based on playerId and team_id
    const playerQuery = "SELECT * FROM players WHERE id = ?";
    const teamQuery = "SELECT * FROM teams WHERE id = ?";

    if (status === "unsold") {
      await db.query("UPDATE players SET status = ? WHERE id = ?", [
        status,
        playerId,
      ]);

      // Await player and team data
      const [player] = await db.query(playerQuery, [playerId]);
      const [team] = await db.query(teamQuery, [team_id]);

      // Broadcasting player status update along with player image and team logo
      broadcast({
        type: "PLAYER_STATUS_UPDATED",
        playerId,
        status,
        player_image: player[0].photo_path, // Assuming player image path is stored in player.image_path
        team_name: team[0].name,
        team_logo: team[0].logo,
        // Assuming team logo path is stored in team.logo_path
      });

      res.json({ message: "Player status updated to unsold" });
    } else {
      // Updating player status and team_id
      await db.query(
        "UPDATE players SET status = ?, team_id = ? WHERE id = ?",
        [status, team_id, playerId]
      );

      // Insert bid into bids table
      await db.query(
        "INSERT INTO bids (player_id, team_id, bid_amount, auction_id) VALUES (?, ?, ?, ?)",
        [playerId, team_id, bid_amount, auction_id]
      );

      // Await player and team data
      const [player] = await db.query(playerQuery, [playerId]);
      const [team] = await db.query(teamQuery, [team_id]);

      // Broadcasting player sold event with bid details, player image, and team logo
      broadcast({
        type: "PLAYER_SOLD",
        playerId,
        team_id,
        bid_amount,
        player_image: player[0].photo_path,
        player_name: player[0].name, // Assuming player image path is stored in player.image_path
        team_name: team[0].name,
        team_logo: team[0].logo,
        // Assuming team logo path is stored in team.logo_path
      });

      res.json({ message: "Player sold and bid recorded successfully" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// Bid update with image paths
// Bid API (Broadcast the bid updates)
app.post("/api/bids/:auctionId", async (req, res) => {
  const { auctionId } = req.params;
  const { player_id, bid_value, team_id } = req.body;

  try {
    // Check for required fields
    if (!player_id || !bid_value || !team_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Query to get player and team information
    const playerQuery = "SELECT * FROM players WHERE id = ?";
    const teamQuery = "SELECT * FROM teams WHERE id = ?";

    // Insert the bid into the bids table
    await db.query(
      "INSERT INTO bids (auction_id, player_id, team_id, bid_amount) VALUES (?, ?, ?, ?)",
      [auctionId, player_id, team_id, bid_value]
    );

    // Update the current bid in the players table
    await db.query(
      "UPDATE players SET current_bid = ? WHERE id = ? AND auction_id = ?",
      [bid_value, player_id, auctionId]
    );

    // Await player and team data
    const [player] = await db.query(playerQuery, [player_id]);
    const [team] = await db.query(teamQuery, [team_id]);
    //console.log(player, team);

    // Broadcasting the new bid with player image and team logo
    broadcast({
      type: "NEW_BID",
      auctionId,
      player_id,
      bid_value,
      team_id,
      player_image: player[0].photo_path, // Assuming player image path is stored in player.image_path
      team_name: team[0].name,
      team_logo: team[0].logo, // Assuming team logo path is stored in team.logo_path
    });

    res.status(201).json({ message: "Bid recorded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});
