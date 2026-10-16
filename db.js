const Database=require('better-sqlite3');const path=require('path');
const DB_PATH=process.env.DB_PATH||path.join(__dirname,'data','app.db');require('fs').mkdirSync(path.dirname(DB_PATH),{recursive:true});const db=new Database(DB_PATH);db.pragma('journal_mode=WAL');
db.exec(`CREATE TABLE IF NOT EXISTS bars(id TEXT PRIMARY KEY,name TEXT,address TEXT);
CREATE TABLE IF NOT EXISTS bands(id TEXT PRIMARY KEY,name TEXT);
CREATE TABLE IF NOT EXISTS sets(id TEXT PRIMARY KEY,bar_id TEXT,band_id TEXT,date TEXT,set_start TEXT,set_end TEXT,set_window_id TEXT);
CREATE TABLE IF NOT EXISTS ratings(id INTEGER PRIMARY KEY AUTOINCREMENT,bar_id TEXT,band_id TEXT,set_id TEXT,set_window_id TEXT,rating INTEGER CHECK(rating BETWEEN 1 AND 5),device_id TEXT,ip_hash TEXT,check_in INTEGER DEFAULT 0,created_at INTEGER,hidden INTEGER DEFAULT 0,UNIQUE(device_id,bar_id,band_id,set_window_id));
CREATE TABLE IF NOT EXISTS daily_top5(day TEXT,bar_id TEXT,PRIMARY KEY(day,bar_id));
CREATE TABLE IF NOT EXISTS review_queue(id INTEGER PRIMARY KEY AUTOINCREMENT,bar_id TEXT,reason TEXT,created_at INTEGER);
CREATE TABLE IF NOT EXISTS sponsors(bar_id TEXT,day TEXT,tier TEXT,PRIMARY KEY(bar_id,day));`);
try{db.exec('ALTER TABLE ratings ADD COLUMN vibe TEXT');}catch(e){/* already exists */}
db.exec(`CREATE TABLE IF NOT EXISTS owner_tokens(token TEXT PRIMARY KEY,bar_id TEXT NOT NULL,created_at INTEGER,last_used_at INTEGER);
CREATE TABLE IF NOT EXISTS owner_contacts(bar_id TEXT PRIMARY KEY,email TEXT,phone TEXT,updated_at INTEGER);`);
module.exports=db;
