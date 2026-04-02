const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database("database.db");

db.run(`
CREATE TABLE IF NOT EXISTS products (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
description TEXT,
price INTEGER,
image TEXT
)
`);

app.get("/products", (req, res) => {

db.all("SELECT * FROM products", (err, rows) => {
res.json(rows);
});

});

app.post("/add-product", (req, res) => {

const { name, description, price, image } = req.body;

db.run(
"INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)",
[name, description, price, image],
() => {
res.send("Product added");
}
);

});

app.listen(3000, () => {
console.log("Server running on http://localhost:3000");
});