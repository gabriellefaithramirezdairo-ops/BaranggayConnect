CREATE DATABASE IF NOT EXISTS barangay_db;
USE barangay_db;
 
-- users who registered on the website
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
 
-- list of services the barangay offers
CREATE TABLE IF NOT EXISTS services (
  code VARCHAR(30) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255)
);
 
-- requests submitted by residents
CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(30) NOT NULL UNIQUE,
  service_code VARCHAR(30) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  contact VARCHAR(30) NOT NULL,
  details VARCHAR(500),
  status VARCHAR(30) DEFAULT 'Received',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_code) REFERENCES services(code)
);
 
INSERT IGNORE INTO services (code, name, description) VALUES
  ('clearance', 'Barangay Clearance', 'Proof of good standing in the barangay'),
  ('residency', 'Certificate of Residency', 'Proof that you live in the barangay'),
  ('business', 'Business Permit', 'Barangay permit for operating a business'),
  ('indigency', 'Indigency Certificate', 'Certificate for assistance and fee waivers'),
  ('blotter', 'Complaint Blotter', 'File an incident or complaint report');
 