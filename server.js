const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database("database.db");

/* =====================================================================
   SCHEMA
===================================================================== */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT,
    display_name TEXT,
    category     TEXT,
    subcategory  TEXT,
    vehicle      TEXT,
    price        INTEGER,
    description  TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    qty        INTEGER DEFAULT 1,
    sold_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT UNIQUE,
    name          TEXT,
    address       TEXT,
    delivery_pref TEXT,
    email         TEXT,
    profile_photo TEXT,
    password      TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT,
    items      TEXT,
    total      INTEGER,
    delivery   TEXT,
    address    TEXT,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  /* ── ALWAYS reseed so changes take effect ── */
  db.run(`DELETE FROM products`, () => {

    const products = [
      // ── ALTERNATOR (DYNAMO) → STATOR
      { display_name:"Mico Sumo Stator",              category:"Alternator (Dynamo)", subcategory:"Stator",              vehicle:"Mico Sumo",           price:700  },
      { display_name:"Indigo Stator",                 category:"Alternator (Dynamo)", subcategory:"Stator",              vehicle:"Indigo",               price:925  },
      { display_name:"Indica Stator",                 category:"Alternator (Dynamo)", subcategory:"Stator",              vehicle:"Indica",               price:925  },
      { display_name:"Hino Stator",                   category:"Alternator (Dynamo)", subcategory:"Stator",              vehicle:"Hino",                 price:950  },
      { display_name:"Scorpio Stator",                category:"Alternator (Dynamo)", subcategory:"Stator",              vehicle:"Scorpio",              price:950  },

      // ── ALTERNATOR (DYNAMO) → ROTOR
      { display_name:"Indica Rotor",                  category:"Alternator (Dynamo)", subcategory:"Rotor",               vehicle:"Indica",               price:1150 },
      { display_name:"Indigo Rotor",                  category:"Alternator (Dynamo)", subcategory:"Rotor",               vehicle:"Indigo",               price:1150 },
      { display_name:"Mico Sumo Rotor",               category:"Alternator (Dynamo)", subcategory:"Rotor",               vehicle:"Mico Sumo",            price:1000 },

      // ── ALTERNATOR (DYNAMO) → PLATE
      { display_name:"Ashok Leyland Lay Plate",       category:"Alternator (Dynamo)", subcategory:"Plate",               vehicle:"Ashok Leyland",        price:725  },
      { display_name:"Tata 407 Plate",                category:"Alternator (Dynamo)", subcategory:"Plate",               vehicle:"Tata 407",             price:525  },
      { display_name:"SG 124 Plate",                  category:"Alternator (Dynamo)", subcategory:"Plate",               vehicle:"SG 124",               price:575  },
      { display_name:"Hino SE 118 Plate",             category:"Alternator (Dynamo)", subcategory:"Plate",               vehicle:"Hino",                 price:650  },

      // ── ALTERNATOR (DYNAMO) → CUT OUT (REGULATOR)
      { display_name:"TR 15 Tata 407 Cut Out",        category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Tata 407",             price:180  },
      { display_name:"SR 30 Maruti Cut Out",          category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Maruti",               price:180  },
      { display_name:"TC N/M Tata Ace Cut Out",       category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Tata Ace",             price:250  },
      { display_name:"Mico 12V Cut Out",              category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Mico",                 price:260  },
      { display_name:"SR 60 12V Cut Out",             category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"SR 60",                price:260  },
      { display_name:"Tata Gold Cut Out",             category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Tata Gold",            price:650  },
      { display_name:"Dost Cut Out",                  category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Dost",                 price:325  },
      { display_name:"Maruti N/M 3 Pin Cut Out",      category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Maruti",               price:325  },
      { display_name:"MIC 24V Cut Out",               category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"MIC",                  price:260  },
      { display_name:"JCB Cut Out",                   category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"JCB",                  price:850  },
      { display_name:"SR 60 24V Cut Out",             category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"SR 60",                price:260  },
      { display_name:"SR 40 Ashok Leyland 24V Cut Out", category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Ashok Leyland",     price:180  },
      { display_name:"Hino 24V Ashok Leyland Cut Out",category:"Alternator (Dynamo)", subcategory:"Cut Out (Regulator)", vehicle:"Hino",                 price:350  },

      // ── ALTERNATOR (DYNAMO) → DYAD
      { display_name:"Tata 407 Pick Up Dyad",         category:"Alternator (Dynamo)", subcategory:"Dyad",                vehicle:"Tata 407",             price:800  },
      { display_name:"Mico Sumo Dyad",                category:"Alternator (Dynamo)", subcategory:"Dyad",                vehicle:"Mico Sumo",            price:425  },
      { display_name:"Mico Scorpio Dyad",             category:"Alternator (Dynamo)", subcategory:"Dyad",                vehicle:"Scorpio",              price:480  },
      { display_name:"Tata Ace Dyad",                 category:"Alternator (Dynamo)", subcategory:"Dyad",                vehicle:"Tata Ace",             price:325  },
      { display_name:"Tata 407 Dyad",                 category:"Alternator (Dynamo)", subcategory:"Dyad",                vehicle:"Tata 407",             price:200  },

      // ── ALTERNATOR (DYNAMO) → FAN
      { display_name:"Ashok Leyland Fan",             category:"Alternator (Dynamo)", subcategory:"Fan",                 vehicle:"Ashok Leyland",        price:75   },
      { display_name:"Tata 407 Fan",                  category:"Alternator (Dynamo)", subcategory:"Fan",                 vehicle:"Tata 407",             price:75   },
      { display_name:"Hino Fan",                      category:"Alternator (Dynamo)", subcategory:"Fan",                 vehicle:"Hino",                 price:75   },

      // ── ALTERNATOR (DYNAMO) → PULLEY
      { display_name:"Hino TC Pulley",                category:"Alternator (Dynamo)", subcategory:"Pulley",              vehicle:"Hino",                 price:375  },
      { display_name:"Tata 407 Big Pulley",           category:"Alternator (Dynamo)", subcategory:"Pulley",              vehicle:"Tata 407",             price:380  },
      { display_name:"Tata 307 Pulley",               category:"Alternator (Dynamo)", subcategory:"Pulley",              vehicle:"Tata 307",             price:350  },

      // ── ALTERNATOR (DYNAMO) → BRUSH
      { display_name:"Tata 407 Dynamo Brush",         category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"Tata 407",             price:50   },
      { display_name:"340 Dynamo Brush",              category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"340",                  price:50   },
      { display_name:"SR 60 Sumo Dynamo Brush",       category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"Mico Sumo",            price:45   },
      { display_name:"Tata AS Dynamo Brush",          category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"Tata",                 price:75   },
      { display_name:"Mico 407 Dynamo Brush",         category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"Tata 407",             price:50   },
      { display_name:"Maruti Dynamo Brush",           category:"Alternator (Dynamo)", subcategory:"Brush",               vehicle:"Maruti",               price:50   },

      // ── ALTERNATOR (DYNAMO) → BRUSH HOLDER
      { display_name:"Ashok Leyland Brush Holder",    category:"Alternator (Dynamo)", subcategory:"Brush Holder",        vehicle:"Ashok Leyland",        price:60   },
      { display_name:"Maruti Brush Holder",           category:"Alternator (Dynamo)", subcategory:"Brush Holder",        vehicle:"Maruti",               price:60   },
      { display_name:"Tata 407 Brush Holder",         category:"Alternator (Dynamo)", subcategory:"Brush Holder",        vehicle:"Tata 407",             price:60   },

      // ── ALTERNATOR (DYNAMO) → OIL SEAL
      { display_name:"TVS Oil Seal",                  category:"Alternator (Dynamo)", subcategory:"Oil Seal",            vehicle:"TVS",                  price:null },
      { display_name:"Mico Oil Seal (OE)",            category:"Alternator (Dynamo)", subcategory:"Oil Seal",            vehicle:"Mico",                 price:100  },

      // ── ALTERNATOR (DYNAMO) → HOUSING
      { display_name:"Ashok Leyland Housing",         category:"Alternator (Dynamo)", subcategory:"Housing",             vehicle:"Ashok Leyland",        price:570  },
      { display_name:"Ashok Leyland Hino SG 227 Housing", category:"Alternator (Dynamo)", subcategory:"Housing",         vehicle:"Hino",                 price:725  },

      // ── SELF MOTOR → BUSH
      { display_name:"Self Motor Bush 6219",          category:"Self Motor",          subcategory:"Bush",                vehicle:"Mico",                 price:25   },
      { display_name:"Self Motor Bush 6220 Tata Ace", category:"Self Motor",          subcategory:"Bush",                vehicle:"Tata Ace",             price:25   },
      { display_name:"Self Motor Bush 1208 Ape",      category:"Self Motor",          subcategory:"Bush",                vehicle:"Ape",                  price:30   },
      { display_name:"Self Motor Bush 031",           category:"Self Motor",          subcategory:"Bush",                vehicle:"Various",              price:35   },
      { display_name:"Self Motor Bush 430",           category:"Self Motor",          subcategory:"Bush",                vehicle:"Various",              price:25   },
      { display_name:"Self Motor Bush 237 Tractor",   category:"Self Motor",          subcategory:"Bush",                vehicle:"Tractor",              price:35   },
      { display_name:"Self Motor Bush 470",           category:"Self Motor",          subcategory:"Bush",                vehicle:"Various",              price:35   },
      { display_name:"Self Motor Bush 471",           category:"Self Motor",          subcategory:"Bush",                vehicle:"Various",              price:35   },
      { display_name:"Self Motor Bush 472 Tata 407",  category:"Self Motor",          subcategory:"Bush",                vehicle:"Tata 407",             price:35   },

      // ── SELF MOTOR → BEN DEX
      { display_name:"Self Ben Dex 8562",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 1170",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3620",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 9482",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 7341",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3397",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3082",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 7141",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 7140",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 2761",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3399",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3936",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 3078",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 0606 Dost", category:"Self Motor", subcategory:"Ben Dex", vehicle:"Dost", price:310 },
      { display_name:"Self Ben Dex 8286",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 5671",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 517",    category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 349",    category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 724",    category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 780",    category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 6575",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 036 Ascot", category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:310 },
      { display_name:"Self Ben Dex 4192",   category:"Self Motor", subcategory:"Ben Dex", vehicle:"Various", price:370 },

      // ── SELF MOTOR → FORK AND BOLT
      { display_name:"Inter Fork and Bolt",        category:"Self Motor", subcategory:"Fork and Bolt", vehicle:"Inter",    price:90 },
      { display_name:"Tata 407 Fork and Bolt",     category:"Self Motor", subcategory:"Fork and Bolt", vehicle:"Tata 407", price:90 },
      { display_name:"Ape Fork and Bolt",          category:"Self Motor", subcategory:"Fork and Bolt", vehicle:"Ape",      price:90 },
      { display_name:"Ape T4 Fork and Bolt",       category:"Self Motor", subcategory:"Fork and Bolt", vehicle:"Ape T4",   price:90 },
      { display_name:"Ape T5 Fork and Bolt",       category:"Self Motor", subcategory:"Fork and Bolt", vehicle:"Ape T5",   price:90 },

      // ── SELF MOTOR → CENTER PLATE
      { display_name:"Inter Center Plate",         category:"Self Motor", subcategory:"Center Plate", vehicle:"Inter",    price:160 },
      { display_name:"Tata 407 Center Plate",      category:"Self Motor", subcategory:"Center Plate", vehicle:"Tata 407", price:160 },
      { display_name:"608 Center Plate",           category:"Self Motor", subcategory:"Center Plate", vehicle:"608",      price:220 },
      { display_name:"Auto Lek Center Plate",      category:"Self Motor", subcategory:"Center Plate", vehicle:"Auto Lek", price:160 },

      // ── SELF MOTOR → COIL
      { display_name:"Self Coil 1005",             category:"Self Motor", subcategory:"Coil", vehicle:"Various",  price:1400 },
      { display_name:"Self Coil 1003",             category:"Self Motor", subcategory:"Coil", vehicle:"Various",  price:1000 },
      { display_name:"Self Coil 1012",             category:"Self Motor", subcategory:"Coil", vehicle:"Various",  price:1000 },
      { display_name:"Inter Self Coil",            category:"Self Motor", subcategory:"Coil", vehicle:"Inter",    price:900  },
      { display_name:"Tata 407 Self Coil",         category:"Self Motor", subcategory:"Coil", vehicle:"Tata 407", price:900  },
      { display_name:"Hino Field Coil",            category:"Self Motor", subcategory:"Coil", vehicle:"Hino",     price:1100 },

      // ── SELF MOTOR → SELF BRUSH
      { display_name:"1321 Tractor Self Brush",    category:"Self Motor", subcategory:"Self Brush", vehicle:"Tractor",        price:155 },
      { display_name:"Inter N/M Self Brush",       category:"Self Motor", subcategory:"Self Brush", vehicle:"Inter",          price:225 },
      { display_name:"Turbo Self Brush",           category:"Self Motor", subcategory:"Self Brush", vehicle:"Turbo",          price:245 },
      { display_name:"TC 24V Self Brush",          category:"Self Motor", subcategory:"Self Brush", vehicle:"TC 24V",         price:250 },
      { display_name:"644 Ashok Leyland Self Brush", category:"Self Motor", subcategory:"Self Brush", vehicle:"Ashok Leyland", price:210 },
      { display_name:"Tata Ace Self Brush",        category:"Self Motor", subcategory:"Self Brush", vehicle:"Tata Ace",       price:85  },
      { display_name:"Mico Inter Self Brush",      category:"Self Motor", subcategory:"Self Brush", vehicle:"Inter",          price:225 },

      // ── SELF MOTOR → WIPER BRUSH ROCKER
      { display_name:"Tata Ace Wiper Brush",       category:"Self Motor", subcategory:"Wiper Brush Rocker", vehicle:"Tata Ace", price:100 },
      { display_name:"Maruti Wiper Brush",         category:"Self Motor", subcategory:"Wiper Brush Rocker", vehicle:"Maruti",   price:100 },
      { display_name:"3 Pin Wiper Brush",          category:"Self Motor", subcategory:"Wiper Brush Rocker", vehicle:"Various",  price:100 },

      // ── SELF MOTOR → ARMATURE
      { display_name:"Mico Bolero Self Armature",     category:"Self Motor", subcategory:"Armature", vehicle:"Bolero",          price:1200 },
      { display_name:"Indigo V2 Self Armature",       category:"Self Motor", subcategory:"Armature", vehicle:"Indigo",          price:1000 },
      { display_name:"Indica Self Armature",          category:"Self Motor", subcategory:"Armature", vehicle:"Indica",          price:1000 },
      { display_name:"Dost Self Armature",            category:"Self Motor", subcategory:"Armature", vehicle:"Dost",            price:1000 },
      { display_name:"783 Self Armature",             category:"Self Motor", subcategory:"Armature", vehicle:"783",             price:1000 },
      { display_name:"Mico Scorpio Self Armature",    category:"Self Motor", subcategory:"Armature", vehicle:"Scorpio",         price:1250 },
      { display_name:"Tata Ace Self Armature",        category:"Self Motor", subcategory:"Armature", vehicle:"Tata Ace",        price:1000 },
      { display_name:"Mahindra Glorio Self Armature", category:"Self Motor", subcategory:"Armature", vehicle:"Mahindra Glorio", price:1100 },

      // ── SELF MOTOR → KATARO
      { display_name:"Tractor Kataro",   category:"Self Motor", subcategory:"Kataro", vehicle:"Tractor",  price:190 },
      { display_name:"Auto Lek Kataro",  category:"Self Motor", subcategory:"Kataro", vehicle:"Auto Lek", price:190 },
      { display_name:"608 Kataro",       category:"Self Motor", subcategory:"Kataro", vehicle:"608",      price:260 },
      { display_name:"Tata 407 Kataro",  category:"Self Motor", subcategory:"Kataro", vehicle:"Tata 407", price:260 },

      // ── SELF MOTOR → SPINDLE
      { display_name:"Tractor Spindle",  category:"Self Motor", subcategory:"Spindle", vehicle:"Tractor",  price:75 },
      { display_name:"Tata 407 Spindle", category:"Self Motor", subcategory:"Spindle", vehicle:"Tata 407", price:75 },
      { display_name:"608 Spindle",      category:"Self Motor", subcategory:"Spindle", vehicle:"608",      price:90 },

      // ── SELF MOTOR → SOLENOID SWITCH
      { display_name:"Tractor Solenoid Switch",            category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Tractor",       price:680 },
      { display_name:"608 Solenoid Switch",                category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"608",           price:700 },
      { display_name:"Mico Tractor Solenoid Switch",       category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Tractor",       price:700 },
      { display_name:"TC 24V Solenoid Switch",             category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"TC 24V",        price:700 },
      { display_name:"Mico 24 Solenoid Switch",            category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Mico",          price:700 },
      { display_name:"Tata 407 Solenoid Switch",           category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Tata 407",      price:650 },
      { display_name:"Tata 407 Auto Lek Solenoid Switch",  category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Tata 407",      price:690 },
      { display_name:"Indica Solenoid Switch",             category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Indica",        price:590 },
      { display_name:"Ape Solenoid Switch",                category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Ape",           price:590 },
      { display_name:"Ape LD Solenoid Switch",             category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Ape",           price:590 },
      { display_name:"Sonalika Solenoid Switch",           category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Sonalika",      price:850 },
      { display_name:"Canter Solenoid Switch",             category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Canter",        price:980 },
      { display_name:"Ashok Leyland 24V Solenoid Switch",  category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Ashok Leyland", price:700 },
      { display_name:"Indigo V2 Solenoid Switch",          category:"Self Motor", subcategory:"Solenoid Switch", vehicle:"Indigo",        price:600 },

      // ── SELF MOTOR → COPPER BOLT
      { display_name:"Solenoid Switch Copper Bolt",                category:"Self Motor", subcategory:"Copper Bolt", vehicle:"Various",       price:null },
      { display_name:"Ashok Leyland Main and Earth Copper Bolt",   category:"Self Motor", subcategory:"Copper Bolt", vehicle:"Ashok Leyland", price:null },
    ];

    const stmt = db.prepare(
      `INSERT INTO products (name, display_name, category, subcategory, vehicle, price, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    products.forEach(p => {
      const name = p.display_name.toLowerCase();
      const desc = `${p.subcategory} for ${p.vehicle}. Category: ${p.category}.`;
      stmt.run(name, p.display_name, p.category, p.subcategory, p.vehicle, p.price || null, desc);
    });

    stmt.finalize(() => {
      console.log(`✅ Seeded ${products.length} products.`);
    });
  });
});

/* =====================================================================
   IMAGE FINDER — checks images/ folder for any extension
===================================================================== */
const IMG_EXTS = ["jpeg", "jpg", "png", "webp", "gif"];

function findImage(displayName, category, subcategory, vehicle) {
  const candidates = [
    displayName.toLowerCase(),
    `${vehicle} ${subcategory}`.toLowerCase(),
    subcategory.toLowerCase(),
  ];

  const catFolder = category.toLowerCase().replace(/[()]/g, "").trim().replace(/\s+/g, " ");
  const subFolder = subcategory.toLowerCase();

  for (const candidate of candidates) {
    for (const ext of IMG_EXTS) {
      const paths = [
        path.join(__dirname, "images", `${candidate}.${ext}`),
        path.join(__dirname, "images", catFolder, `${candidate}.${ext}`),
        path.join(__dirname, "images", catFolder, subFolder, `${candidate}.${ext}`),
        path.join(__dirname, "images", "alternator dynamo", `${candidate}.${ext}`),
        path.join(__dirname, "images", "starter motor", `${candidate}.${ext}`),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          return p.replace(__dirname + path.sep, "").replace(/\\/g, "/");
        }
      }
    }
  }
  return null;
}

function attachImages(rows) {
  return rows.map(r => ({
    ...r,
    image: findImage(r.display_name, r.category, r.subcategory, r.vehicle)
  }));
}

/* =====================================================================
   FUZZY SEARCH HELPER
===================================================================== */
function fuzzyMatch(text, query) {
  text  = text.toLowerCase();
  query = query.toLowerCase().trim();

  // Direct includes
  if (text.includes(query)) return true;

  // All words present
  const words = query.split(/\s+/);
  if (words.every(w => text.includes(w))) return true;

  // Common aliases
  const aliases = {
    "ley": "ashok leyland", "leyland": "ashok leyland",
    "maruthi": "maruti",    "maruti": "maruthi",
    "bolero": "bolero",     "armature": "armature",
    "starter": "self motor","dynamo": "alternator",
    "alternator": "alternator", "self": "self motor",
    "bendex": "ben dex",    "bendix": "ben dex",
    "solenoid": "solenoid switch", "coil": "coil",
    "bush": "bush",         "rotor": "rotor",
    "stator": "stator",     "brush": "brush",
    "pulley": "pulley",     "fan": "fan",
    "housing": "housing",   "plate": "plate",
    "regulator": "cut out", "cutout": "cut out",
    "diode": "dyad",        "dyad": "dyad",
    "spindle": "spindle",   "kataro": "kataro",
    "407": "407",           "ace": "ace",
    "indica": "indica",     "indigo": "indigo",
    "scorpio": "scorpio",   "hino": "hino",
    "inter": "inter",       "tractor": "tractor",
  };

  for (const [alias, expansion] of Object.entries(aliases)) {
    if (query.includes(alias) && text.includes(expansion)) return true;
    if (query.includes(expansion) && text.includes(alias)) return true;
  }

  return false;
}

/* =====================================================================
   API — PRODUCTS
===================================================================== */
app.get("/products", (req, res) => {
  const { category, subcategory, vehicle, search } = req.query;

  let sql    = "SELECT * FROM products WHERE 1=1";
  const params = [];

  if (category)    { sql += " AND category=?";    params.push(category); }
  if (subcategory) { sql += " AND subcategory=?"; params.push(subcategory); }
  if (vehicle)     { sql += " AND vehicle=?";     params.push(vehicle); }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Fuzzy search in JS after SQL filter
    if (search && search.trim()) {
      const q = search.trim();
      rows = rows.filter(r =>
        fuzzyMatch(r.display_name, q) ||
        fuzzyMatch(r.vehicle,       q) ||
        fuzzyMatch(r.subcategory,   q) ||
        fuzzyMatch(r.category,      q) ||
        fuzzyMatch(r.description||"", q)
      );
    }

    res.json(attachImages(rows));
  });
});

app.get("/products/categories", (req, res) => {
  db.all("SELECT DISTINCT category FROM products ORDER BY category", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.category));
  });
});

app.get("/products/subcategories", (req, res) => {
  const { category } = req.query;
  let sql = "SELECT DISTINCT subcategory FROM products";
  const params = [];
  if (category) { sql += " WHERE category=?"; params.push(category); }
  sql += " ORDER BY subcategory";
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.subcategory));
  });
});

app.get("/products/vehicles", (req, res) => {
  const { category, subcategory } = req.query;
  let sql = "SELECT DISTINCT vehicle FROM products WHERE 1=1";
  const params = [];
  if (category)    { sql += " AND category=?";    params.push(category); }
  if (subcategory) { sql += " AND subcategory=?"; params.push(subcategory); }
  sql += " ORDER BY vehicle";
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.vehicle));
  });
});

app.get("/products/top-selling", (req, res) => {
  // Curated top sellers until real sales accumulate
  const TOP_IDS = [1, 6, 13, 26, 31, 86, 99, 107, 110, 115];
  db.all(
    `SELECT p.*, COALESCE(SUM(s.qty),0) as total_sold
     FROM products p LEFT JOIN sales s ON s.product_id = p.id
     GROUP BY p.id ORDER BY total_sold DESC, p.id ASC LIMIT 10`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // If no real sales yet, use curated list
      const hasRealSales = rows.some(r => r.total_sold > 0);
      if (hasRealSales) return res.json(attachImages(rows));

      db.all(
        `SELECT * FROM products WHERE id IN (${TOP_IDS.join(",")}) LIMIT 10`,
        (err2, r2) => {
          if (err2 || !r2.length) return res.json(attachImages(rows.slice(0, 10)));
          res.json(attachImages(r2));
        }
      );
    }
  );
});

app.post("/products", (req, res) => {
  const { display_name, category, subcategory, vehicle, price, description } = req.body;
  db.run(
    `INSERT INTO products (name,display_name,category,subcategory,vehicle,price,description)
     VALUES (?,?,?,?,?,?,?)`,
    [(display_name||"").toLowerCase(), display_name, category||"", subcategory||"", vehicle||"", price||null, description||""],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

/* =====================================================================
   API — SALES
===================================================================== */
app.post("/sales", (req, res) => {
  const { product_id, qty } = req.body;
  db.run("INSERT INTO sales (product_id, qty) VALUES (?,?)", [product_id, qty||1], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

/* =====================================================================
   API — AUTH
===================================================================== */
app.post("/auth/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  if (phone === "9344898473") {
    if (password !== "12345678") return res.status(401).json({ error: "Wrong password" });
    db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
      if (user) return res.json({ user, isAdmin: true });
      db.run("INSERT INTO users (phone, name) VALUES (?,?)", [phone, "Admin"], function() {
        db.get("SELECT * FROM users WHERE phone=?", [phone], (e, u) => res.json({ user: u, isAdmin: true }));
      });
    });
    return;
  }

  db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
    if (user) return res.json({ user, isAdmin: false });
    db.run("INSERT INTO users (phone) VALUES (?)", [phone], function() {
      db.get("SELECT * FROM users WHERE phone=?", [phone], (e, u) => res.json({ user: u, isAdmin: false }));
    });
  });
});

app.put("/users/:phone", (req, res) => {
  const { name, address, delivery_pref, email } = req.body;
  db.run(
    "UPDATE users SET name=?, address=?, delivery_pref=?, email=? WHERE phone=?",
    [name, address, delivery_pref, email, req.params.phone],
    err => { if (err) return res.status(500).json({ error: err.message }); res.json({ ok: true }); }
  );
});

app.get("/users/:phone", (req, res) => {
  db.get("SELECT * FROM users WHERE phone=?", [req.params.phone], (err, user) => {
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json(user);
  });
});

/* =====================================================================
   API — ORDERS
===================================================================== */
app.post("/orders", (req, res) => {
  const { phone, items, total, delivery, address } = req.body;
  db.run(
    "INSERT INTO orders (phone,items,total,delivery,address) VALUES (?,?,?,?,?)",
    [phone, JSON.stringify(items), total, delivery, address],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      (items||[]).forEach(item => {
        db.run("INSERT INTO sales (product_id,qty) VALUES (?,?)", [item.id, item.qty||1]);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.get("/orders/:phone", (req, res) => {
  db.all("SELECT * FROM orders WHERE phone=? ORDER BY ordered_at DESC", [req.params.phone], (err, rows) => {
    res.json(rows || []);
  });
});

/* =====================================================================
   START
===================================================================== */
app.listen(3000, () => {
  console.log("✅ AAMM server running → http://localhost:3000");
});